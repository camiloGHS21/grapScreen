// Extracts executable descriptors for every built-in n8n node straight from the
// n8n source repository.
//
// The n8n docs site is JS-rendered and useless for this; the source repo is the
// only authoritative catalogue.
//
// Three things about the n8n source layout drive the design here, and getting
// any of them wrong silently degrades the output to "node exists but cannot
// run":
//
//   1. Most nodes are *version wrappers*: `Slack/Slack.node.ts` only re-exports
//      `SlackV1`/`SlackV2`. The `credentials: [{ name: … }]` declaration and the
//      API base URL live in `Slack/V2/`, so excluding version directories — the
//      obvious way to avoid duplicate catalogue entries — also throws away
//      every credential and half the base URLs.
//   2. `n8n-nodes-completo.json` stores `path` inconsistently: some entries
//      carry the full repository path, most only `App/App.node.ts`. The join
//      has to try several suffixes.
//   3. raw.githubusercontent.com throttles above ~6 concurrent connections and
//      answers 429/503 with an HTML body even for files that exist. Fetching
//      ~1000 files one by one took hours (measured: 8 files in 7 minutes), so a
//      single `codeload` tarball is extracted instead.

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { createNodeLoader } from "./n8n-node-loader.mjs";
import { buildParamPayload } from "./n8n-param-payload.mjs";

const ROOT = process.cwd();
const CACHE = path.join(ROOT, ".n8n-cache");
const OUT = path.join(ROOT, "src", "data", "n8n-descriptors.json");
const CATALOG_OUT = path.join(ROOT, "src", "data", "n8n-catalog.json");
const CATALOG = path.join(ROOT, "n8n-nodes-completo.json");
// Extracted `codeload` tarball. When present it replaces both the GitHub tree
// API and every per-file download.
const LOCAL_SRC = path.join(CACHE, "src");
// Real app logos, copied out of the n8n source. Served as static assets rather
// than bundled: 450 SVGs is ~1.1 MB, and a palette only ever shows a few dozen
// at a time, so bundling them would tax every launch for nothing.
const ICON_OUT = path.join(ROOT, "public", "n8n-icons");
// n8n's own node glyphs. Nodes whose `icon` is `node:<name>` do not point at a
// file beside themselves; the SVG lives in the design system under that name.
// Without these, ~80 built-in nodes have no picture at all.
const GLYPH_DIR = path.join(
  CACHE,
  "src/packages/frontend/@n8n/design-system/src/components/N8nIcon",
);
// The per-node parameter forms, one file each. ~560 files at ~7 KB: fetched only
// when a node's drawer is opened, so they never enter the app bundle.
const PARAMS_OUT = path.join(ROOT, "public", "n8n-params");

const TREE_URL =
  "https://api.github.com/repos/n8n-io/n8n/git/trees/master?recursive=1";
const RAW = "https://raw.githubusercontent.com/n8n-io/n8n/master/";
const WORKERS = 8;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function ensureDirs() {
  for (const d of [CACHE, path.join(CACHE, "files"), path.join(ROOT, "src", "data")]) {
    await mkdir(d, { recursive: true });
  }
  // Both asset directories are regenerated wholesale. Asset names are derived
  // purely from `(basename, content-hash)`, so a stale file can no longer win a
  // naming decision — the final prune deletes anything unreferenced instead.
  // The wipe is therefore best-effort: some sandboxes block bulk deletes, and
  // failing the whole extraction over a directory that the prune will clean
  // anyway is worse than regenerating over it.
  await wipe(ICON_OUT);
  await wipe(PARAMS_OUT);
}

async function wipe(dir) {
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    log(`  note: could not wipe ${path.relative(ROOT, dir)}; relying on the prune`);
  }
  await mkdir(dir, { recursive: true });
}

async function fetchText(url, tries = 8) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { redirect: "follow" });
      if (r.status === 404) return null;
      if (r.status === 429 || r.status === 503 || r.status >= 500) {
        await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
        continue;
      }
      if (!r.ok) return null;
      return await r.text();
    } catch {
      await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
    }
  }
  return undefined; // undefined = "retryable failure", null = "genuinely absent"
}

async function getTree() {
  if (existsSync(LOCAL_SRC)) {
    log("using the locally extracted source tree");
    const blobs = [];
    async function walk(dir) {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === "node_modules" || e.name === ".git") continue;
          await walk(full);
        } else {
          blobs.push(path.relative(LOCAL_SRC, full).split(path.sep).join("/"));
        }
      }
    }
    await walk(LOCAL_SRC);
    return { tree: blobs.map((p) => ({ path: p, type: "blob" })) };
  }

  const f = path.join(CACHE, "tree.json");
  if (existsSync(f)) return JSON.parse(await readFile(f, "utf8"));
  log("downloading repository tree (~11 MB)…");
  const txt = await fetchText(TREE_URL, 5);
  if (!txt) throw new Error("could not download the repository tree");
  await writeFile(f, txt);
  return JSON.parse(txt);
}

async function getSource(repoPath) {
  const local = path.join(LOCAL_SRC, repoPath);
  if (existsSync(local)) return readFile(local, "utf8");

  const safe = repoPath.replace(/[^a-zA-Z0-9._/-]/g, "_");
  const f = path.join(CACHE, "files", safe);
  if (existsSync(f)) {
    const txt = await readFile(f, "utf8");
    return txt === "__MISSING__" ? null : txt;
  }
  const txt = await fetchText(RAW + repoPath.split("/").map(encodeURIComponent).join("/"));
  if (txt === undefined) return undefined;
  await mkdir(path.dirname(f), { recursive: true });
  if (txt === null) {
    await writeFile(f, "__MISSING__");
    return null;
  }
  await writeFile(f, txt);
  return txt;
}

async function mapPool(items, worker, onProgress) {
  const out = new Array(items.length);
  let next = 0;
  let done = 0;
  async function run() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        out[i] = await worker(items[i], i);
      } catch (e) {
        // One unreadable path must not abort a scan of several hundred files.
        out[i] = undefined;
        if (String(e?.code) !== "ENOENT") log("worker error:", items[i], String(e?.message || e));
      }
      done++;
      if (onProgress && done % 50 === 0) onProgress(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(WORKERS, items.length) }, run));
  return out;
}

// ---------------------------------------------------------------- parsing ---

/**
 * The directory a node belongs to, with version segments removed.
 *
 * `…/nodes/Slack/Slack.node.ts`       → `…/nodes/Slack`
 * `…/nodes/Slack/V2/SlackV2.node.ts`  → `…/nodes/Slack`
 * `…/nodes/Google/Sheet/GenericFunctions.ts` → `…/nodes/Google/Sheet`
 *
 * Two things depend on this. Version directories sit *below* the node, so
 * stripping them lets a wrapper node inherit the credential and base URL that
 * only exist inside its versioned implementation. And stopping at the first
 * segment after `nodes/` is too coarse for the multi-product packages — every
 * Google node would otherwise share one directory and pick up Google Ads' URL.
 */
function nodeRoot(p) {
  const dir = path.posix.dirname(p);
  return dir.replace(/\/(v[0-9]+|V[0-9]+)$/, "");
}

/**
 * How recent a node implementation is. The wrapper file counts as v1 and each
 * `V2/`, `V3/`… directory bumps it, so the newest implementation can be picked
 * on purpose instead of by scan order.
 */
function versionRank(p) {
  const m = p.match(/\/(?:v|V)([0-9]+)\//);
  return m ? Number(m[1]) : 1;
}

const RE_CRED_NAME = /name\s*=\s*['"]([A-Za-z0-9_]+)['"]/;
const RE_AUTH_TYPE = /authenticate\s*:\s*\{[\s\S]{0,400}?type\s*:\s*['"]([A-Za-z0-9_]+)['"]/;
const RE_BASE_URL_TEST = /test\s*:\s*\{[\s\S]{0,600}?baseURL\s*:\s*['"]([^'"]{0,300})['"]/;
const RE_BASE_URL_ANY = /baseURL\s*:\s*['"](https?:\/\/[^'"]{0,300})['"]/;
const RE_BASE_URL_LITERAL = /['"](https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(?:\/[a-z0-9._-]{0,60}){0,6})['"]/i;

const RE_CRED_FIELD = /\$credentials(?:\.([A-Za-z0-9_]+)|\[['"]([A-Za-z0-9_]+)['"]\])/g;
const RE_AUTH_ENTRY = /([A-Za-z0-9_$.-]+)\s*:\s*['"`]([^'"`]*\$\{?[^'"`]*)['"`]/g;

function credentialFields(src) {
  const fields = new Set();
  let m;
  RE_CRED_FIELD.lastIndex = 0;
  while ((m = RE_CRED_FIELD.exec(src))) fields.add(m[1] || m[2]);
  return [...fields];
}

/**
 * Extracts the `authenticate: { … }` block by brace matching.
 *
 * The block almost never starts right after the colon: n8n writes
 * `authenticate: IAuthenticateGeneric = {`, so anchoring on `authenticate\s*:\s*\{`
 * matches nothing and every auth header silently comes out empty. Find the
 * `authenticate` key, then brace-match from the first `{` that follows it.
 */
function authenticateBlock(src) {
  const key = src.search(/authenticate\s*:/);
  if (key < 0) return "";
  const open = src.indexOf("{", key);
  if (open < 0) return "";
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    const c = src[j];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return src.slice(open, j + 1);
    }
  }
  return src.slice(open, open + 2000);
}

function authEntries(block, section) {
  const re = new RegExp(section + "\\s*:\\s*\\{");
  const m = block.match(re);
  if (!m) return {};
  const start = block.indexOf(m[0]) + m[0].length - 1;
  let depth = 0;
  let end = start;
  for (let j = start; j < block.length; j++) {
    if (block[j] === "{") depth++;
    else if (block[j] === "}") {
      depth--;
      if (depth === 0) {
        end = j;
        break;
      }
    }
  }
  const body = block.slice(start + 1, end);
  const out = {};
  let mm;
  RE_AUTH_ENTRY.lastIndex = 0;
  while ((mm = RE_AUTH_ENTRY.exec(body))) {
    const key = mm[1];
    if (key === "type" || key === "properties") continue;
    out[key] = mm[2];
  }
  return out;
}

function parseCredential(src) {
  const name = (src.match(RE_CRED_NAME) || [])[1] || null;
  const authType = (src.match(RE_AUTH_TYPE) || [])[1] || "generic";
  const block = authenticateBlock(src);
  // Only an explicit `baseURL:` counts here. The first bare `https://` in a
  // credential file is usually a documentation link, and the `test.request`
  // endpoint is a probe path rather than the API root, so neither is trusted
  // blindly — the node's own request code wins when it has a URL.
  //
  // A probe that points at a token exchange (`…/oauth/access_token`) is not an
  // API root at all: using it as the node's base URL sends real traffic to an
  // auth endpoint. See TOKEN_ENDPOINT_URL.
  const pick = (...candidates) => {
    for (const c of candidates) {
      const url = (src.match(c) || [])[1] || (block.match(c) || [])[1];
      if (url && !TOKEN_ENDPOINT_URL.test(url)) return url;
    }
    return null;
  };
  const baseUrl = pick(RE_BASE_URL_TEST, RE_BASE_URL_ANY);
  return {
    name,
    authType,
    baseUrl,
    headers: authEntries(block, "headers"),
    qs: authEntries(block, "qs"),
    fields: credentialFields(block),
  };
}

/**
 * Reads `credentials: [ { name: 'slackApi', … } ]` out of a node description.
 *
 * This is the authoritative link between a node and its credential type, and it
 * is far more reliable than hunting for `requestWithAuthentication` calls — the
 * call sits in a sibling `GenericFunctions.ts`, which is not in scope here.
 */
function declaredCredentials(src) {
  const out = new Set();
  const re = /credentials\s*:\s*\[/g;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length - 1;
    let depth = 0;
    let end = start;
    const limit = Math.min(src.length, start + 6000);
    for (let j = start; j < limit; j++) {
      if (src[j] === "[") depth++;
      else if (src[j] === "]") {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    const block = src.slice(start + 1, end);
    const reName = /name\s*:\s*['"]([A-Za-z0-9_]+)['"]/g;
    let mm;
    while ((mm = reName.exec(block))) out.add(mm[1]);
  }
  return [...out];
}

const RE_DESC_OBJ = /description\s*:\s*(?:INodeTypeDescription|INodeTypeBaseDescription)\s*=\s*\{/;
// Bounded quantifiers on purpose: the natural `((?:[^'"`\\]|\\.)*)` form
// backtracks quadratically when the closing quote is absent, which is what
// happens on a LangChain node with no local description object.
const RE_DISPLAY_NAME = /displayName\s*:\s*['"`]([^'"`\n]{0,120})['"`]/;
const RE_DESCRIPTION = /description\s*:\s*['"`]([^'"`\n]{0,300})['"`]/;

/**
 * `displayName` as a sibling of `name`, optionally followed by a description,
 * which is how a node declares itself — and also how every one of its
 * parameters does. The `name` is what tells the two apart.
 */
const RE_NAME_PAIRS =
  /displayName\s*:\s*['"`]([^'"`\n]{0,120})['"`]\s*,\s*name\s*:\s*['"`]([A-Za-z0-9_]+)['"`]\s*,?\s*(?:description\s*:\s*['"`]([^'"`\n]{0,300})['"`])?/g;

/** `vectorStoreChromaDB` / `VectorStoreChromaDB` / `ChainSummarizationV1` → one form. */
const normaliseType = (s) =>
  s.replace(/[^a-z0-9]/gi, "").replace(/v\d+$/i, "").toLowerCase();

/**
 * The node's own metadata.
 *
 * Most nodes declare their description inline, and the first `displayName` of
 * that object is the node's. A good number instead hand theirs to a factory
 * (`createVectorStoreNode({ meta: { displayName: 'Chroma Vector Store', … } })`),
 * and reading the first `displayName` off the top of the file then returns one
 * of the node's *parameters* — which is where names like "Authentication" and
 * "Content Payload Key" came from. Those files are read through the
 * `displayName`/`name` pair whose `name` matches the node's own file name.
 */
function nodeMeta(src, filePath) {
  const anchor = src.search(RE_DESC_OBJ);
  if (anchor >= 0) {
    const scope = src.slice(anchor, anchor + 4096);
    const name = (scope.match(RE_DISPLAY_NAME) || [])[1];
    if (name) {
      const desc = (scope.match(RE_DESCRIPTION) || [])[1];
      return { displayName: name, description: desc || null };
    }
  }

  const wanted = normaliseType(path.posix.basename(filePath || "").replace(/\.node\.ts$/, ""));
  if (!wanted) return { displayName: null, description: null };
  RE_NAME_PAIRS.lastIndex = 0;
  let m;
  while ((m = RE_NAME_PAIRS.exec(src))) {
    if (normaliseType(m[2]) === wanted) {
      return { displayName: m[1], description: m[3] || null };
    }
  }
  return { displayName: null, description: null };
}

// Both carry `g`: `usedCredentials` drives them with `while ((m = re.exec(src)))`
// and without the flag `exec` ignores `lastIndex` and returns the same match
// forever — an infinite loop that looks exactly like a hang with no output.
const RE_USED_CRED = /requestWithAuthentication(?:\.call)?\s*\(\s*this\s*,\s*['"]([A-Za-z0-9_]+)['"]/g;
const RE_USED_CRED2 = /getCredentials\s*\(\s*['"]([A-Za-z0-9_]+)['"]/g;

function usedCredentials(src) {
  const out = new Set();
  for (const re of [RE_USED_CRED, RE_USED_CRED2]) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(src))) out.add(m[1]);
  }
  return [...out];
}

// ── Trigger mode detection ────────────────────────────────────────────────
// The catalogue we join against carries `polling` / `webhook` flags, but they
// are set on fewer than a quarter of the real triggers: `AsanaTrigger` is a
// polling trigger in n8n and is flagged as neither. The only trustworthy
// signal is the node class itself — `async poll()` means the node is polled by
// the engine, a `webhook` / `webhookMethods` member means n8n registers an
// incoming route. Detecting it from source turned 27 usable triggers into 86.
const RE_POLL_METHOD = /\basync\s+poll\s*\(|\bpoll\s*\(\s*\)\s*[:{]/;
const RE_WEBHOOK_METHOD =
  /\bwebhookMethods\b|\basync\s+webhook\s*\(|\bwebhook\s*\(\s*\)\s*[:{]/;

/** Which trigger mechanism a node implementation declares, if any. */
function triggerMethods(src) {
  return {
    poll: RE_POLL_METHOD.test(src),
    webhook: RE_WEBHOOK_METHOD.test(src),
  };
}

/**
 * n8n's own time-based triggers. These have no poll and no webhook because the
 * engine schedules them, so they are armed on an interval instead.
 */
const SCHEDULE_TRIGGER_KEYS = new Set(["ScheduleTrigger", "Cron", "Interval"]);

// ── Icons and app categories ──────────────────────────────────────────────
// Two pieces of n8n metadata that make the palette read like n8n's own instead
// of like a flat list of 300 integrations: the app's real logo, and the app
// category n8n files it under.
//
//   icon: 'file:asana.svg'                                   ← a real logo
//   icon: { light: 'file:kafka.svg', dark: 'file:kafka.dark.svg' }
//   icon: 'node:form-trigger'  /  'fa:clock'                 ← built-in glyphs
//
// The app category lives in the sibling `.node.json` (`"categories": [...]`),
// NOT in the catalogue we join against — that one only knows the coarse
// "App / Integration" bucket.
const RE_ICON_OBJ = /icon\s*:\s*\{[\s\S]{0,400}?light\s*:\s*['"`]([^'"`\n]{1,120})['"`]/;
const RE_ICON_STR = /icon\s*:\s*['"`]([^'"`\n]{1,120})['"`]/;

/**
 * The icon a node declares, preferring the `light` variant because this app
 * ships a light theme. Returns `null` when the node declares none.
 */
function declaredIcon(src) {
  const obj = src.match(RE_ICON_OBJ);
  const raw = obj ? obj[1] : (src.match(RE_ICON_STR) || [])[1];
  if (!raw) return null;
  const idx = raw.indexOf(":");
  if (idx < 0) return null;
  const kind = raw.slice(0, idx).trim();
  const value = raw.slice(idx + 1).trim();
  if (!value) return null;
  // `file:` points at an SVG beside the node; `node:` and `fa:` are glyph names
  // resolved against the design system instead. Both forms are returned so the
  // caller can publish the glyph and keep the name as a fallback.
  return { kind, file: kind === "file" ? value : null, name: value };
}

const RE_NODE_CATEGORIES = /"categories"\s*:\s*\[([^\]]*)\]/;

/**
 * n8n's category for an app, from its `.node.json`.
 *
 * `CoreNodes` is an internal marker rather than a real category. It appears both
 * as `CoreNodes` and as `Core Nodes`, and for ~50 built-in nodes it is the only
 * entry — those already live in this app's own "Núcleo" group, so returning it
 * would add a redundant second heading over the same nodes. Such nodes get
 * `null`, which reads as "no extra section".
 *
 * Values are trimmed *after* the quotes come off: n8n's own sources contain
 * `"Miscellaneous "`, and leaving the space through would split that category in
 * two — one real, one orphan with a single member.
 */
function appCategory(jsonSrc) {
  const m = jsonSrc.match(RE_NODE_CATEGORIES);
  if (!m) return null;
  const cats = m[1]
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, "").trim())
    .filter((c) => c && c.replace(/\s+/g, "") !== "CoreNodes");
  return cats[0] || null;
}

// The LangChain package ships exactly one `.node.json`, so all ~111 AI nodes
// come back with no category and would collapse into a single flat list. n8n
// groups them by the directory they live in (`agents/`, `chains/`, `llms/`…),
// which is the same taxonomy its own panel uses, so read it from the path.
const RE_LC_FAMILY = /^packages\/@n8n\/nodes-langchain\/nodes\/([^/]+)\//;

function langchainFamily(p) {
  const m = p.match(RE_LC_FAMILY);
  return m ? m[1] : null;
}

/**
 * The property whitelists and the payload shape live in `n8n-param-payload.mjs`
 * so this pass and the repair pass cannot drift apart. They used to be a second
 * hand-copied `pruneKeys` here, and a bug fixed in one copy stayed live in the
 * other. See that module for why `displayOptions`/`typeOptions`/`default` are
 * copied verbatim and why unresolved imports are dropped instead of serialised
 * as `null`.
 */

/** Turns an icon file name into a safe, readable asset name. */
function iconAssetName(iconPath, content) {
  const base = path.posix
    .basename(iconPath, ".svg")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .toLowerCase();
  const hash = createHash("sha1").update(content).digest("hex").slice(0, 8);
  return { base, hash };
}

// Template literals included: n8n builds URLs like
// `https://slack.com/api${resource}`, which a quote-only pattern never sees.
const RE_URL_ANY = /['"`](https?:\/\/[^'"`\s]{4,200})['"`]/g;
const RE_URL_BASEURL = /baseURL\s*:\s*['"`](https?:\/\/[^'"`\s]{4,200})['"`]/g;
const RE_URL_REQUEST = /(?:uri|url)\s*:\s*[^'"`\n]{0,60}?['"`](https?:\/\/[^'"`\s]{4,200})['"`]/g;

/**
 * Links and placeholders that are not an API root.
 *
 * The first `https://` literal in a node file is very often either a "see the
 * docs" link or a *field placeholder* — n8n ships sample values like
 * `https://app.slack.com/client/TS9594PZK` and
 * `https://git.internal.company.com/dev-team` as form defaults. Trusting those
 * produced base URLs that look configured and then 404, which is worse than
 * having none.
 */
const DOC_URL =
  /(docs?\.|\/docs|developer\.|\/help|support\.|example\.|github\.com|n8n\.io|wikipedia|youtube\.com|medium\.com|\.md$|\/articles\/|stackoverflow|internal\.|\.test\b|localhost|placeholder|company\.com|acme|[0-9a-f]{24,}|\/client\/[A-Z0-9]{8,})/i;

/**
 * URLs that are a *token exchange* endpoint rather than an API root.
 *
 * A credential's `test.request.baseURL` is where n8n probes the credential, and
 * for OAuth-style credentials n8n points that probe at the token endpoint. Using
 * it as the node's base URL sends real requests to `…/oauth/access_token`,
 * which fails in a way that reads as an outage rather than as a bad config.
 *
 * Only two nodes in the whole catalogue are affected (WhatsApp and its trigger),
 * and both are better off with no base URL — the user then sees the explicit
 * "write one here" prompt instead of a plausible-looking wrong URL.
 */
const TOKEN_ENDPOINT_URL =
  /\/oauth\/(?:access_token|token|authorize)|oauth2\/(?:access_token|token)|(\/|\?|&)(?:grant_type|client_assertion)=/i;

/** Trims a URL back to its API root: drops template holes and trailing noise. */
function cleanUrl(url) {
  let u = url;
  const hole = u.indexOf("${");
  if (hole >= 0) u = u.slice(0, hole);
  u = u.replace(/[.,;:)\]]+$/, "");
  u = u.replace(/\/+$/, "");
  return u.length >= 10 ? u : null;
}

/**
 * Picks the most plausible API root out of a source file.
 *
 * Scoring, best first:
 *   0 — a `baseURL:` key, which is exactly what n8n means by a base URL,
 *   1 — the URL of a `uri:`/`url:` assignment (a real request),
 *   2 — any other literal.
 * Documentation links and form placeholders are discarded at every level.
 */
function bestUrl(src) {
  const found = [];
  const collect = (re, score) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) found.push({ url: m[1], score });
  };
  collect(RE_URL_BASEURL, 0);
  collect(RE_URL_REQUEST, 1);
  collect(RE_URL_ANY, 2);

  const usable = found
    .filter((c) => !DOC_URL.test(c.url))
    .filter((c) => !TOKEN_ENDPOINT_URL.test(c.url))
    .map((c) => ({ url: cleanUrl(c.url), score: c.score }))
    .filter((c) => c.url);
  if (!usable.length) return null;

  usable.sort((a, b) => a.score - b.score);
  return usable[0];
}

// ---------------------------------------------------------------- driver ----

async function main() {
  await ensureDirs();
  const tree = await getTree();
  const blobs = tree.tree.filter((e) => e.type === "blob").map((e) => e.path);

  const catalog = JSON.parse(await readFile(CATALOG, "utf8"));
  log(`catalogue: ${catalog.length} nodes`);

  const inPackages = (p) =>
    p.startsWith("packages/nodes-base/") || p.startsWith("packages/@n8n/nodes-langchain/");
  const isRealSource = (p) =>
    !p.includes("__test__") && !p.includes("/test/") && !p.includes("/template/");

  // ── 1. Credential definitions ────────────────────────────────────────────
  const credPaths = blobs.filter(
    (p) =>
      p.endsWith(".credentials.ts") &&
      inPackages(p) &&
      p.includes("/credentials/") &&
      isRealSource(p)
  );
  log(`credential files: ${credPaths.length}`);

  const credIndex = new Map();
  await mapPool(credPaths, async (p) => {
    const src = await getSource(p);
    if (!src) return;
    const parsed = parseCredential(src);
    if (parsed.name && !credIndex.has(parsed.name)) {
      credIndex.set(parsed.name, { ...parsed, path: p });
    }
  });
  log(`parsed credentials: ${credIndex.size}`);

  // ── 2. Every .node.ts, including version directories ─────────────────────
  // The versioned files are the only place the credential declaration and the
  // API base URL exist for most nodes.
  const allNodeFiles = blobs.filter(
    (p) => p.endsWith(".node.ts") && inPackages(p) && isRealSource(p)
  );
  log(`node implementation files: ${allNodeFiles.length}`);

  // ── 2b. App categories and app logos ────────────────────────────────────
  // `.node.json` holds n8n's own category for the app; the `.svg` beside a node
  // file is its real logo. Both are keyed by node file so the assembly below
  // can find them from the wrapper path.
  const blobSet = new Set(blobs);
  const categoryByNodeFile = new Map(); // "X.node.ts" -> n8n category
  const jsonFiles = blobs.filter(
    (p) => p.endsWith(".node.json") && inPackages(p) && isRealSource(p)
  );
  await mapPool(jsonFiles, async (p) => {
    const src = await getSource(p);
    if (!src) return;
    const cat = appCategory(src);
    if (cat) categoryByNodeFile.set(p.replace(/\.node\.json$/, ".node.ts"), cat);
  });
  log(`app categories: ${new Set(categoryByNodeFile.values()).size} distinct`);

  const credsByRoot = new Map(); // node root -> Set(credential name)
  const urlsByRoot = new Map(); // node root -> { url, priority }
  const metaByPath = new Map(); // node file -> parsed metadata
  const pollRoots = new Set(); // node roots with an `async poll()`
  const webhookRoots = new Set(); // node roots registering a webhook route
  const iconByRoot = new Map(); // node root -> copied asset file name
  const iconSourceByRoot = new Map(); // node root -> source svg path in the blob
  const iconCandidatesByRoot = new Map(); // node root -> [{ file, rel }] declared logos
  const glyphCandidatesByRoot = new Map(); // node root -> [{ file, kind, name }] `node:`/`fa:`
  const iconFailures = [];

  /**
   * Resolves `file:x.svg` against the node file's own directory. n8n resolves
   * these paths relative to the node file, and a few reach up a level
   * (`file:../venafi.svg`), so both are tried.
   *
   * Resolution is kept separate from publishing on purpose. This runs inside a
   * concurrent scan, and the test that picks between `x.svg` and `x-<hash>.svg`
   * depends on what has already been written to disk. Doing both here made asset
   * names depend on whichever task happened to finish first, so the same source
   * produced different file names — and a shared logo got stored twice under two
   * names — across runs.
   */
  function resolveIconSource(nodeFile, rel) {
    const parts = path.posix.dirname(nodeFile).split("/");
    // Walk from the node file's own directory up towards the node root. n8n
    // resolves `file:` against the declaring file, but versioned helpers
    // (`App/V2/actions/App.node.ts`) re-declare the logo their wrapper already
    // owns, and the SVG sits beside the wrapper — one level up is not always
    // enough. Most specific candidate wins, so existing resolutions are
    // unaffected. Depth is bounded so a stray `file:logo.svg` cannot scan the
    // whole tree.
    const candidates = [];
    for (let up = 0; up <= 4 && up < parts.length; up++) {
      const base = parts.slice(0, parts.length - up).join("/");
      candidates.push(path.posix.normalize(path.posix.join(base, rel)));
    }
    const found = candidates.find((c) => blobSet.has(c));
    if (!found) iconFailures.push(`${nodeFile} -> ${rel}`);
    return found || null;
  }

  /**
   * Copies every referenced SVG into `public/n8n-icons/`, serially and in a
   * stable order, so the output is reproducible and no two sources race for the
   * same file name.
   *
   * The asset keeps its original basename so the files stay recognisable. A
   * content hash is appended only when two *different* logos share a basename
   * (`icon.svg` is a common one), and identical content always resolves to the
   * same name, so a logo shared by several nodes is stored exactly once.
   */
  async function publishIcons() {
    const nameBySource = new Map(); // source svg path -> asset file name
    const namesByBase = new Map(); // asset basename -> Map(content hash -> name)
    const sources = [...new Set(iconSourceByRoot.values())].sort();

    for (const source of sources) {
      const svg = await getSource(source);
      if (!svg) {
        iconFailures.push(`${source} (unreadable)`);
        continue;
      }
      const { base, hash } = iconAssetName(source, svg);
      let byHash = namesByBase.get(base);
      if (!byHash) {
        byHash = new Map();
        namesByBase.set(base, byHash);
      }
      let name = byHash.get(hash);
      if (!name) {
        name = byHash.size === 0 ? `${base}.svg` : `${base}-${hash}.svg`;
        byHash.set(hash, name);
      }
      nameBySource.set(source, name);
      await writeFile(path.join(ICON_OUT, name), svg);
    }
    return nameBySource;
  }

  // Lower priority wins. A URL taken from the node's own file beats one from a
  // sibling helper, which in turn beats the credential's probe endpoint.
  const offerUrl = (root, url, basePriority) => {
    if (!url) return;
    const candidate = { url, priority: basePriority };
    const current = urlsByRoot.get(root);
    if (!current || candidate.priority < current.priority) urlsByRoot.set(root, candidate);
  };

  await mapPool(allNodeFiles, async (p) => {
    const src = await getSource(p);
    if (!src) return;
    const root = nodeRoot(p);
    metaByPath.set(p, nodeMeta(src, p));

    const names = declaredCredentials(src);
    if (names.length) {
      // Keyed by version rank, not just collected into a set: a node that grew a
      // `V2/` usually changed credential type along the way (Webflow went from
      // `webflowApi` to `webflowOAuth2Api`, Twitter from OAuth1 to OAuth2), and
      // the descriptor replays the *current* node. A plain set left the winner
      // up to whichever file the scan pool reached first.
      const rank = versionRank(p);
      if (!credsByRoot.has(root)) credsByRoot.set(root, new Map());
      const byRank = credsByRoot.get(root);
      if (!byRank.has(rank)) byRank.set(rank, new Set());
      for (const n of names) byRank.get(rank).add(n);
    }
    const url = bestUrl(src);
    // Only a `baseURL:` key is trusted out of a node file. n8n fills node files
    // with sample field values, so any other literal there is as likely to be a
    // placeholder (`https://app.slack.com/client/TS9594PZK`) as a real endpoint.
    // Request URLs belong in the helpers, and those are scanned next.
    if (url && url.score === 0) offerUrl(root, url.url, 0);

    // Recorded per *root*, not per file: the trigger body lives in `V2/` while
    // the wrapper file that becomes the descriptor holds only the re-export.
    const modes = triggerMethods(src);
    if (modes.poll) pollRoots.add(root);
    if (modes.webhook) webhookRoots.add(root);

    // The logo is declared in the same file that becomes the descriptor, but a
    // root can declare one in both its wrapper and its `V2/` body. Candidates
    // are only collected here: "whichever file the pool reached first" is not a
    // stable tie-break, so the winner is chosen after the scan.
    const icon = declaredIcon(src);
    if (icon?.kind === "file" && icon.file) {
      if (!iconCandidatesByRoot.has(root)) iconCandidatesByRoot.set(root, []);
      iconCandidatesByRoot.get(root).push({ file: p, rel: icon.file });
    } else if (icon?.name) {
      // `node:`/`fa:` glyph instead of a file. Recorded separately so a root that
      // declares a real file anywhere still wins over the glyph.
      if (!glyphCandidatesByRoot.has(root)) glyphCandidatesByRoot.set(root, []);
      glyphCandidatesByRoot.get(root).push({ file: p, kind: icon.kind, name: icon.name });
    }
  });

  // Prefer the wrapper (`App/App.node.ts`) over a versioned body, since the
  // wrapper is what becomes the descriptor. Fewest path segments wins, ties
  // broken alphabetically, so the choice never depends on scan order.
  for (const [root, candidates] of [...iconCandidatesByRoot].sort()) {
    const chosen = candidates
      .slice()
      .sort(
        (a, b) =>
          a.file.split("/").length - b.file.split("/").length ||
          (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)
      )[0];
    const source = resolveIconSource(chosen.file, chosen.rel);
    if (source) iconSourceByRoot.set(root, source);
  }

  const nameBySource = await publishIcons();
  for (const [root, source] of iconSourceByRoot) {
    const name = nameBySource.get(source);
    if (name) iconByRoot.set(root, name);
  }

  // ── 2c. Glyph icons ──────────────────────────────────────────────────────
  // `icon: 'node:ai-agent'` names an SVG in the design system rather than a file
  // beside the node, so publishing those turns ~80 picture-less built-in nodes
  // into ones with a real logo. `fa:` names have no SVG at all — they are
  // FontAwesome glyphs drawn by n8n's icon font — so they keep their name and the
  // frontend maps them to an equivalent vector icon.
  const glyphByRoot = new Map(); // node root -> { kind, name }
  let glyphsPublished = 0;
  if (existsSync(GLYPH_DIR)) {
    for (const [root, candidates] of [...glyphCandidatesByRoot].sort()) {
      const chosen = candidates
        .slice()
        .sort(
          (a, b) =>
            a.file.split("/").length - b.file.split("/").length ||
            (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)
        )[0];
      glyphByRoot.set(root, { kind: chosen.kind, name: chosen.name });
      if (chosen.kind !== "node") continue;
      const glyphFile = path.join(GLYPH_DIR, "nodes", `${chosen.name}.svg`);
      if (!existsSync(glyphFile)) continue;
      const asset = `n8n-${chosen.name}.svg`;
      await writeFile(path.join(ICON_OUT, asset), await readFile(glyphFile));
      glyphsPublished++;
      // A real file logo wins over a glyph, the same precedence n8n's UI uses.
      if (!iconByRoot.has(root)) iconByRoot.set(root, asset);
    }
    log(`node glyphs published: ${glyphsPublished}`);
  } else {
    log(`node glyphs skipped: ${path.relative(ROOT, GLYPH_DIR)} is not extracted`);
  }

  log(
    `node logos published: ${iconByRoot.size} (${new Set(nameBySource.values()).size} files from ${
      nameBySource.size
    } sources)`
  );
  for (const f of iconFailures) log(`  unresolved icon path: ${f}`);
  log(`node roots with a credential: ${credsByRoot.size}`);
  log(`node roots with a base URL: ${urlsByRoot.size}`);

  // ── 3. Request builders supply the base URL when the node file has none ───
  // Restricted to the files that actually build requests. Scanning every .ts
  // file pulled example URLs out of field definitions and made the result worse
  // than scanning nothing at all.
  const helperFiles = blobs.filter(
    (p) =>
      /(GenericFunctions|Transport|transport|Api|Request|request|helpers|Helpers)\.ts$/.test(p) &&
      inPackages(p) &&
      isRealSource(p) &&
      !p.endsWith(".node.ts") &&
      !p.endsWith(".credentials.ts")
  );
  log(`helper files: ${helperFiles.length}`);
  await mapPool(helperFiles, async (p) => {
    const src = await getSource(p);
    if (!src || !/https?:\/\//.test(src)) return;
    const root = nodeRoot(p);
    const url = bestUrl(src);
    if (url) offerUrl(root, url.url, url.score === 0 ? 1 : url.score + 1);
  });
  log(`node roots with a base URL after helpers: ${urlsByRoot.size}`);

  // ── 4. Assemble one descriptor per catalogue node ────────────────────────
  // Wrapper paths only: `App/App.node.ts`, never `App/V2/AppV2.node.ts`, so the
  // palette has one entry per integration rather than one per version.
  const wrapperPaths = allNodeFiles.filter((p) => !/\/(v[0-9]+|V[0-9]+)\//.test(p));
  log(`wrapper node files: ${wrapperPaths.length}`);

  const byPath = new Map(catalog.map((n) => [n.path, n]));
  // `path` is stored inconsistently in the catalogue, so several suffixes are
  // tried. Without this the join silently drops every category and trigger flag.
  const pathCandidates = (p) => {
    const parts = p.split("/");
    return [p, parts.slice(-2).join("/"), parts.slice(-3).join("/")];
  };
  for (const n of catalog) {
    for (const k of pathCandidates(n.path)) if (!byPath.has(k)) byPath.set(k, n);
  }
  const lookupCatalog = (p) => {
    for (const k of pathCandidates(p)) {
      const hit = byPath.get(k);
      if (hit) return hit;
    }
    return undefined;
  };

  const descriptors = [];
  const seen = new Set();

  /**
   * n8n's category for a node, looked up from the wrapper first and then from
   * any version directory under it — the wrapper often has no `.node.json` of
   * its own while `V2/` does.
   */
  const categoryFor = (p) => {
    const direct = categoryByNodeFile.get(p);
    if (direct) return direct;
    // Fall back to any `.node.json` under the node's directory. Sorted by path
    // depth then name, so a directory holding several node files does not hand
    // the category to whichever the scan happened to insert first.
    const prefix = `${path.posix.dirname(p)}/`;
    const nested = [...categoryByNodeFile]
      .filter(([file]) => file.startsWith(prefix))
      .sort(
        ([a], [b]) =>
          a.split("/").length - b.split("/").length || (a < b ? -1 : a > b ? 1 : 0)
      );
    return nested.length ? nested[0][1] : null;
  };

  // n8n's own built-ins are read first so they win a name clash: a LangChain
  // wrapper and a Core node can declare the same name (LangChain's `Code` vs
  // Core's `Code`), and the Core node is what the palette and the engine mean
  // by it. The wrapper keeps its own entry under a package-qualified key
  // instead of silently dropping out of the catalogue.
  const isBasePackage = (p) => /(^|\/)packages\/nodes-base\//.test(p);
  const orderedWrappers = [
    ...wrapperPaths.filter(isBasePackage),
    ...wrapperPaths.filter((p) => !isBasePackage(p)),
  ];

  for (const p of orderedWrappers) {
    const entry = lookupCatalog(p);
    let key = entry?.key || path.posix.basename(p).replace(/\.node\.ts$/, "");
    if (seen.has(key) && langchainFamily(p)) {
      // `@n8n/nodes-langchain.code` → `LangChainCode`.
      const qualified = `LangChain${key}`;
      if (!seen.has(qualified)) key = qualified;
    }
    if (seen.has(key)) continue;
    seen.add(key);

    const root = nodeRoot(p);
    const meta = metaByPath.get(p) || { displayName: null, description: null };

    // Prefer the credential the node itself declares; fall back to anything
    // referenced inside it, then to anything declared anywhere in its tree.
    // Newest implementation first, then alphabetical, so the choice is stable
    // and matches the node version the descriptor actually replays.
    const declared = [...(credsByRoot.get(root) || new Map())]
      .sort((a, b) => b[0] - a[0])
      .flatMap(([, set]) => [...set].sort());
    const used = usedCredentials(await getSource(p) || "");
    const candidates = [...new Set([...declared, ...used])];
    let cred = null;
    for (const c of candidates) {
      if (credIndex.has(c)) {
        cred = credIndex.get(c);
        break;
      }
    }

    // The node's own request code describes the real API root; the credential's
    // `test.request.baseURL` is a probe endpoint and is only a fallback.
    const baseUrl = urlsByRoot.get(root)?.url || (cred && cred.baseUrl) || null;

    const isTrigger = !!entry?.isTrigger;
    const catalogCategory = entry?.category || "App / Integration";
    // How the trigger actually receives its event. `event` is the honest
    // leftover bucket: broker subscribers (Kafka, MQTT, Redis), IMAP watchers
    // and manual/subflow triggers cannot be armed without a client library, and
    // pretending otherwise would silently do nothing.
    const triggerMode = !isTrigger
      ? null
      : webhookRoots.has(root)
        ? "webhook"
        : pollRoots.has(root)
          ? "polling"
          : SCHEDULE_TRIGGER_KEYS.has(key)
            ? "schedule"
            : "event";

    descriptors.push({
      key,
      displayName: meta.displayName || entry?.displayName || key,
      description: meta.description || entry?.description || "",
      category: catalogCategory,
      // n8n's own taxonomy for the app ("Development", "Communication", …).
      // The catalogue only knows the coarse "App / Integration" bucket, so this
      // comes from the node's own `.node.json`.
      //
      // The LangChain package ships no `.node.json`, so its ~111 nodes would all
      // come back uncategorised. Those get their family directory instead
      // (`agents/`, `chains/`, `llms/`…), which is the taxonomy n8n's own panel
      // uses. Gated on the AI category: the package also holds a few nodes the
      // catalogue files under "App / Integration", and giving those an AI family
      // would drop headings like "Proveedores" into the app group, where every
      // other section is an app category.
      appCategory:
        categoryFor(p) || (catalogCategory === "AI" ? langchainFamily(p) : null),
      subcategory: entry?.subcategory || null,
      group: entry?.group || null,
      isTrigger,
      triggerMode,
      polling: triggerMode === "polling",
      webhook: triggerMode === "webhook",
      package: entry?.package || "n8n-nodes-base",
      path: p,
      // Real app logo, published to `public/n8n-icons/`. Null for the nodes that
      // declare a built-in `node:`/`fa:` glyph instead of an image; those carry
      // the glyph in `glyph` so the palette can still show something specific.
      icon: iconByRoot.get(root) || null,
      glyph: glyphByRoot.get(root) || null,
      credential: cred
        ? {
            name: cred.name,
            authType: cred.authType,
            baseUrl: cred.baseUrl,
            headers: cred.headers,
            qs: cred.qs,
            fields: cred.fields,
          }
        : null,
      baseUrl,
      request: { method: "GET", path: "", qs: {}, body: null },
    });
  }

  // Anything the catalogue knows about but the scan missed (LangChain wrappers
  // inherit their description, internal nodes…) still gets a metadata-only
  // descriptor so the palette is complete. There is no *wrapper* file to read
  // here, so the catalogue's own flags are the last resort for the trigger mode.
  // The category and the logo, however, are still reachable: both are keyed by
  // node root, and these entries share a root with a wrapper the scan did visit
  // (a legacy `V1` file next to its current implementation, for instance).
  for (const entry of catalog) {
    if (seen.has(entry.key)) continue;
    const isTrigger = !!entry.isTrigger;
    const triggerMode = !isTrigger
      ? null
      : entry.webhook
        ? "webhook"
        : entry.polling
          ? "polling"
          : SCHEDULE_TRIGGER_KEYS.has(entry.key)
            ? "schedule"
            : "event";
    const entryPath = entry.path || "";
    descriptors.push({
      key: entry.key,
      displayName: entry.displayName,
      description: entry.description,
      category: entry.category,
      appCategory:
        (entryPath && categoryFor(entryPath)) ||
        (entry.category === "AI" ? langchainFamily(entryPath) : null),
      subcategory: entry.subcategory || null,
      group: entry.group || null,
      isTrigger,
      triggerMode,
      polling: triggerMode === "polling",
      webhook: triggerMode === "webhook",
      package: entry.package,
      path: entry.path,
      icon: entryPath ? iconByRoot.get(nodeRoot(entryPath)) || null : null,
      glyph: entryPath ? glyphByRoot.get(nodeRoot(entryPath)) || null : null,
      credential: null,
      baseUrl: null,
      request: { method: "GET", path: "", qs: {}, body: null },
    });
  }

  descriptors.sort((a, b) => a.displayName.localeCompare(b.displayName));

  const withBase = descriptors.filter((d) => d.baseUrl).length;
  const withCred = descriptors.filter((d) => d.credential).length;
  const triggers = descriptors.filter((d) => d.isTrigger).length;
  const withIcon = descriptors.filter((d) => d.icon).length;
  const withAppCategory = descriptors.filter((d) => d.appCategory).length;
  const modeCount = (m) => descriptors.filter((d) => d.triggerMode === m).length;

  await writeFile(OUT, JSON.stringify(descriptors, null, 1));

  // The palette needs display fields only. Shipping the full descriptors to the
  // frontend would pull every auth template into the bundle for no benefit.
  const slim = descriptors.map((d) => ({
    key: d.key,
    displayName: d.displayName,
    description: d.description,
    category: d.category,
    appCategory: d.appCategory,
    subcategory: d.subcategory,
    group: d.group,
    isTrigger: d.isTrigger,
    triggerMode: d.triggerMode,
    polling: d.polling,
    webhook: d.webhook,
    package: d.package,
    icon: d.icon,
    glyph: d.glyph,
    baseUrl: d.baseUrl,
    credentialName: d.credential?.name || null,
    authType: d.credential?.authType || null,
    credentialFields: d.credential?.fields || [],
  }));
  await writeFile(CATALOG_OUT, JSON.stringify(slim, null, 1));

  // ── 5. Per-node parameter forms ──────────────────────────────────────────
  // The parameters n8n shows in its node panel are TypeScript object literals
  // (spreads, imported constants, helper calls), so they are obtained by loading
  // each node and reading its `description` — see `n8n-node-loader.mjs`. One file
  // per node, fetched only when a drawer opens, so the app bundle stays as it is.
  log("extracting node parameters…");
  const loader = await createNodeLoader(LOCAL_SRC, { concurrency: 8 });
  const paramResults = await loader.loadAll(descriptors.map((d) => d.path));
  await loader.dispose();

  let paramsWritten = 0;
  let paramsBytes = 0;
  const paramFailures = [];
  // Entries the node declares but that cannot be derived from its source (an
  // import this environment cannot resolve). They are dropped, never written as
  // `null`, and counted here so the gap is visible in the log instead of only
  // showing up as a missing control in the UI.
  const paramsOmitted = [];
  for (let i = 0; i < descriptors.length; i++) {
    const r = paramResults[i];
    const d = descriptors[i];
    if (!r.ok) {
      paramFailures.push(`${d.key}: ${r.error}`);
      continue;
    }
    const { payload, omitted } = buildParamPayload(d, r.description);
    if (omitted.length) paramsOmitted.push({ key: d.key, omitted });
    if (!payload) {
      paramFailures.push(`${d.key}: no renderable parameters`);
      continue;
    }
    const json = JSON.stringify(payload);
    await writeFile(path.join(PARAMS_OUT, `${d.key}.json`), json);
    paramsWritten++;
    paramsBytes += json.length;
  }
  log(
    `node parameters written: ${paramsWritten} (${(paramsBytes / 1048576).toFixed(2)} MB, ${path.relative(
      ROOT,
      PARAMS_OUT,
    )})`,
  );
  for (const f of paramFailures) log(`  no parameters: ${f}`);
  if (paramsOmitted.length) {
    const total = paramsOmitted.reduce((n, p) => n + p.omitted.length, 0);
    log(`node parameters omitted entries: ${total} in ${paramsOmitted.length} files`);
    for (const { key, omitted } of paramsOmitted.slice(0, 15)) {
      log(`  ${key}: ${omitted.map((o) => `${o.path} (${o.kind})`).join(", ")}`);
    }
    if (paramsOmitted.length > 15) log(`  … ${paramsOmitted.length - 15} more`);
  }

  // ── 6. Drop logos nothing points at ──────────────────────────────────────
  // A node can declare a logo and still not surface one (its root resolved to a
  // built-in glyph, or the catalogue drops the entry). Removing the leftovers
  // keeps `public/n8n-icons/` an exact mirror of what the palette can request,
  // instead of growing a tail of files no descriptor references.
  const referenced = new Set(descriptors.map((d) => d.icon).filter(Boolean));
  const orphans = (await readdir(ICON_OUT)).filter((f) => !referenced.has(f));
  let pruned = 0;
  for (const f of orphans) {
    try {
      await rm(path.join(ICON_OUT, f), { force: true });
      pruned++;
    } catch {
      // A blocked prune is cosmetic; the file is simply unused. Failing the
      // extraction because a sandbox refused one unlink is not worth it.
    }
  }
  if (orphans.length) log(`unreferenced logos pruned: ${pruned}/${orphans.length}`);

  log("--------------------------------------------------");
  log(`descriptors written : ${descriptors.length}`);
  log(`with a base URL     : ${withBase}`);
  log(`with a credential   : ${withCred}`);
  log(`with an app logo    : ${withIcon}`);
  log(`with an app category: ${withAppCategory}`);
  log(`triggers            : ${triggers}`);
  log(
    `  webhook ${modeCount("webhook")} · polling ${modeCount("polling")} · schedule ${modeCount(
      "schedule"
    )} · event ${modeCount("event")}`
  );
  log(`output              : ${path.relative(ROOT, OUT)}`);
  log(`palette catalogue   : ${path.relative(ROOT, CATALOG_OUT)}`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
