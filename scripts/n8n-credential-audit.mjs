// Reconciles every node's credential declaration against the n8n source.
//
// Why this exists: the palette data used to attribute a credential to a node by
// scanning its whole directory tree and keeping the newest *declaring* version.
// That is wrong in two ways n8n itself is not:
//
//   1. A node that stopped declaring credentials still inherits them from a
//      deprecated version. `Agent/V1/AgentV1.node.ts` — the old SQL Agent — is
//      the only file under `agents/Agent/` that declares `mySql`/`postgres`, so
//      both the current AI Agent *and* its tool sibling came out as `mySql`.
//      In n8n neither declares a credential; the model's own sub-node owns it.
//   2. A declared credential is not automatically shown. n8n gates each one on
//      `displayOptions.show` evaluated against the node's *default* parameter
//      values, so Gmail resolves to `gmailOAuth2` (default `authentication` is
//      `oAuth2`) and HttpRequest's `httpSslAuth` — which needs
//      `provideSslCertificates: true` — stays hidden out of the box.
//
// Both are answered by the node itself, so this loads each node through
// `n8n-node-loader.mjs`, takes the description of the version n8n defaults to,
// and resolves the credential list the same way the n8n editor does.
//
// Known limit: the resolution is computed once, against the node's *default*
// parameters. n8n recomputes it live, so switching Gmail's `authentication` from
// `oAuth2` to `serviceAccount` swaps the offered credential from `gmailOAuth2` to
// `googleApi`, and switching HttpRequest's `provideSslCertificates` on reveals
// `httpSslAuth`. Here those stay hidden until the catalogue is regenerated. The
// list is stored as `credentialNames` so widening it is a data change.
//
// Usage:
//   node scripts/n8n-credential-audit.mjs           # report only
//   node scripts/n8n-credential-audit.mjs --check   # assert the shipped data
//   node scripts/n8n-credential-audit.mjs --write   # patch src/data/*.json

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createNodeLoader } from "./n8n-node-loader.mjs";

const ROOT = process.cwd();
const CATALOG = path.join(ROOT, "src", "data", "n8n-catalog.json");
const DESCRIPTORS = path.join(ROOT, "src", "data", "n8n-descriptors.json");
const RESOLVED_OUT = path.join(ROOT, ".n8n-cache", "credential-resolution.json");
const LOCAL_SRC = path.join(ROOT, ".n8n-cache", "src");

const WRITE = process.argv.includes("--write");
const CHECK = process.argv.includes("--check");
const log = (...a) => console.log(...a);

/**
 * The properties the editor depends on. `Agent`/`AgentTool` are the regression
 * this script exists for: both used to come out as `mySql`, inherited from the
 * deprecated V1 SQL Agent that shares their directory. The triggers cover the
 * nodes whose selector used to be suppressed by a hard-coded list in the UI
 * instead of by their own declaration.
 */
const EXPECTED = {
  Agent: null,
  AgentTool: null,
  ChatTrigger: null,
  Form: null,
  McpTrigger: null,
  "If": null,
  Set: null,
  Code: null,
  Webhook: null,
  HttpRequest: null,
  MySql: "mySql",
  Slack: "slackApi",
  Gmail: "gmailOAuth2",
  Postgres: "postgres",
};

/**
 * Flattens a node's parameters into the values n8n would use with nothing
 * configured: each top-level `default`, plus the defaults of nested collection
 * options, addressed by their dotted path (`options.provideSslCertificates`).
 *
 * `displayOptions` addresses parameters exactly that way, so the two line up.
 */
function defaultParameterValues(properties = []) {
  const out = {};
  const walk = (props, prefix) => {
    for (const p of props) {
      if (!p || typeof p !== "object" || !p.name) continue;
      const key = prefix ? `${prefix}.${p.name}` : p.name;
      if ("default" in p) out[key] = p.default;
      // `collection` / `fixedCollection` hold their fields under `options`; a
      // `displayOptions` path can point at any of them.
      for (const group of Array.isArray(p.options) ? p.options : []) {
        if (!group || typeof group !== "object") continue;
        if (group.name && Array.isArray(group.values)) {
          const groupKey = `${key}.${group.name}`;
          if ("default" in group) out[groupKey] = group.default;
          for (const v of group.values) {
            if (v && typeof v === "object" && v.name) {
              out[`${groupKey}.${v.name}`] = v.default;
            }
          }
        } else if (group.name && "default" in group) {
          // Plain `options` entry: a selectable choice, not a field group.
          out[`${key}.${group.name}`] = group.default;
        }
      }
    }
  };
  walk(properties, "");
  return out;
}

/** Resolves a dotted parameter path, tolerating `["a.b"]` collection syntax. */
function pathValue(values, rawPath) {
  const segments = String(rawPath).replace(/\[["']([^"']+)["']\]/g, ".$1").split(".");
  let current = values;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return current;
    current = current[segment];
  }
  return current;
}

/**
 * Whether a `displayOptions` entry matches the default parameter values.
 *
 * `show` is a map of parameter path to the list of accepted values, and every
 * entry has to match (`hide` is the negative of the same test). A parameter the
 * node does not declare never matches — that is how `httpSslAuth` stays hidden.
 */
function displayOptionsMatch(displayOptions, values) {
  if (!displayOptions || typeof displayOptions !== "object") return true;
  for (const [mode, expectMatch] of [["show", true], ["hide", false]]) {
    const conditions = displayOptions[mode];
    if (!conditions || typeof conditions !== "object") continue;
    for (const [rawPath, accepted] of Object.entries(conditions)) {
      const value = pathValue(values, rawPath);
      const list = Array.isArray(accepted) ? accepted : [accepted];
      const matched = list.some((candidate) => candidate === value);
      if (matched !== expectMatch) return false;
    }
  }
  return true;
}

/**
 * The credentials n8n would offer for a node in its default state, in the order
 * the node declares them. Empty means the node shows no credential selector.
 */
function resolveCredentials(description) {
  const declared = Array.isArray(description.credentials) ? description.credentials : null;
  if (!declared || declared.length === 0) return [];
  const values = defaultParameterValues(description.properties);
  return declared
    .filter((c) => c && typeof c.name === "string" && displayOptionsMatch(c.displayOptions, values))
    .map((c) => ({ name: c.name, required: c.required !== false }));
}

/** Every credential a node declares, ignoring displayOptions. */
function allDeclared(description) {
  const declared = Array.isArray(description.credentials) ? description.credentials : [];
  return [...new Set(declared.filter((c) => c && c.name).map((c) => c.name))];
}

const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

async function main() {
  const catalog = JSON.parse(await readFile(CATALOG, "utf8"));
  const descriptors = JSON.parse(await readFile(DESCRIPTORS, "utf8"));
  const descByKey = new Map(descriptors.map((d) => [d.key, d]));

  log(`nodes to resolve: ${catalog.length}`);
  const loader = await createNodeLoader(LOCAL_SRC, { concurrency: 8 });
  const results = await loader.loadAll(catalog.map((e) => descByKey.get(e.key)?.path || ""));
  await loader.dispose();

  const resolution = new Map();
  const failures = [];
  const unloadable = [];
  for (let i = 0; i < catalog.length; i++) {
    const entry = catalog[i];
    const r = results[i];
    if (!r.ok) {
      failures.push(`${entry.key}: ${r.error}`);
      continue;
    }
    const eligible = resolveCredentials(r.description);
    if (eligible.length === 0 && allDeclared(r.description).length > 0) {
      // Declared but hidden by default values. Worth listing: these are the
      // nodes whose selector appears only after a parameter is switched.
      unloadable.push(`${entry.key} -> declares ${allDeclared(r.description).join(",")}`);
    }
    resolution.set(entry.key, eligible.map((c) => c.name));
  }
  await writeFile(RESOLVED_OUT, JSON.stringify(Object.fromEntries([...resolution].sort()), null, 1));

  log(`resolved          : ${resolution.size}`);
  log(`load failures     : ${failures.length}`);
  for (const f of failures.slice(0, 12)) log(`   ${f}`);
  log(`credential hidden by default parameters: ${unloadable.length}`);
  for (const u of unloadable.slice(0, 15)) log(`   ${u}`);

  // ── Diff against what is shipped ──────────────────────────────────────────
  const changed = [];
  for (const entry of catalog) {
    const next = resolution.get(entry.key);
    if (next === undefined) continue;
    const current = entry.credentialName ? [entry.credentialName] : [];
    if (!same(current, next)) {
      changed.push({ key: entry.key, displayName: entry.displayName, from: current, to: next });
    }
  }

  if (CHECK) {
    const byKey = new Map(catalog.map((e) => [e.key, e]));
    let failures = 0;
    log("");
    log("acceptance check (shipped src/data/n8n-catalog.json):");
    for (const [key, expected] of Object.entries(EXPECTED)) {
      const entry = byKey.get(key);
      const actual = entry ? entry.credentialName : "<missing entry>";
      const ok = actual === expected;
      if (!ok) failures++;
      log(`  ${ok ? "ok  " : "FAIL"} ${key.padEnd(13)} expected ${String(expected)}  got ${String(actual)}`);
    }
    // A node can only carry a credential its own declaration lists.
    for (const entry of catalog) {
      if (!entry.credentialName) continue;
      const list = entry.credentialNames || [];
      if (list.length && !list.includes(entry.credentialName)) {
        log(`  FAIL ${entry.key}: credentialName "${entry.credentialName}" not in credentialNames [${list.join(", ")}]`);
        failures++;
      }
    }
    const resolvable = catalog.filter((e) => resolution.has(e.key));
    const stillWrong = resolvable.filter((e) => {
      const next = resolution.get(e.key) || [];
      const current = e.credentialName ? [e.credentialName] : [];
      return !same(current, next);
    });
    if (stillWrong.length) {
      log(`  FAIL ${stillWrong.length} resolvable entries still disagree with the n8n source`);
      failures++;
    }
    log(failures ? `\nacceptance check FAILED (${failures} problems)` : "\nacceptance check passed");
    if (failures) process.exitCode = 1;
    return;
  }

  log("");
  log(`catalog entries whose credential changes: ${changed.length}`);
  log("key".padEnd(30) + "before".padEnd(26) + "after");
  for (const c of changed.sort((a, b) => a.key.localeCompare(b.key))) {
    log(
      c.key.padEnd(30) +
        (c.from.join(",") || "-").padEnd(26) +
        (c.to.join(",") || "-"),
    );
  }

  // Nodes whose description could not be loaded keep whatever the shipped data
  // says: guessing a replacement would be worse than leaving a value that may
  // still be right, and the report lists them separately.
  const afterNames = (entry) => {
    const next = resolution.get(entry.key);
    if (next !== undefined) return next;
    return entry.credentialName ? [entry.credentialName] : [];
  };

  const beforeWith = catalog.filter((e) => e.credentialName).length;
  const afterWith = catalog.filter((e) => afterNames(e).length > 0).length;
  log("");
  log(`nodes declaring a credential: ${beforeWith} -> ${afterWith}`);
  log(`nodes without a credential  : ${catalog.length - beforeWith} -> ${catalog.length - afterWith}`);
  log(`unresolved (left untouched) : ${catalog.length - resolution.size}`);

  if (!WRITE) {
    log("");
    log("report only (pass --write to patch src/data/*.json)");
    return;
  }

  // ── Patch ─────────────────────────────────────────────────────────────────
  // `src/data/n8n-credential-types.json` is keyed by credential name and holds
  // the field list. The auth template (`authenticate` headers/query) and the API
  // root are *not* in it — the extractor parses those out of the credential's own
  // source file. For a name that already appears somewhere in the descriptors the
  // existing template is the same one the extractor produced, so it is reused
  // rather than dropped; a brand-new name simply carries no template, exactly
  // like the entries the extractor could not resolve.
  const credentialTypes = JSON.parse(
    await readFile(path.join(ROOT, "src", "data", "n8n-credential-types.json"), "utf8"),
  );
  const fieldNames = new Map(
    Object.values(credentialTypes).map((t) => [t.name, (t.fields || []).map((f) => f.name)]),
  );
  const templateByName = new Map();
  for (const d of descriptors) {
    if (d.credential && !templateByName.has(d.credential.name)) {
      templateByName.set(d.credential.name, d.credential);
    }
  }

  const nextNames = (key, current) => {
    const next = resolution.get(key);
    return next === undefined ? current : next;
  };

  let catalogPatched = 0;
  for (const entry of catalog) {
    const next = nextNames(entry.key, entry.credentialName ? [entry.credentialName] : []);
    const current = entry.credentialName ? [entry.credentialName] : [];
    const primary = next[0] || null;
    if (!same(current, next)) catalogPatched++;
    entry.credentialName = primary;
    entry.credentialNames = next;
    if (!same(current, next)) {
      const template = primary ? templateByName.get(primary) : null;
      entry.authType = template?.authType ?? null;
      entry.credentialFields = primary ? fieldNames.get(primary) ?? [] : [];
    }
  }
  await writeFile(CATALOG, JSON.stringify(catalog, null, 1));

  let descriptorPatched = 0;
  for (const d of descriptors) {
    const next = nextNames(d.key, d.credential?.name ? [d.credential.name] : []);
    const current = d.credential?.name ? [d.credential.name] : [];
    if (!same(current, next)) descriptorPatched++;
    d.credentialNames = next;
    if (!same(current, next)) {
      const primary = next[0] || null;
      const template = primary ? templateByName.get(primary) : null;
      d.credential = primary
        ? {
            name: primary,
            authType: template?.authType ?? null,
            baseUrl: template?.baseUrl ?? null,
            headers: template?.headers ?? {},
            qs: template?.qs ?? {},
            fields: fieldNames.get(primary) ?? [],
          }
        : null;
    }
  }
  await writeFile(DESCRIPTORS, JSON.stringify(descriptors, null, 1));

  log("");
  log(`catalog entries patched    : ${catalogPatched}`);
  log(`descriptor entries patched : ${descriptorPatched}`);
  log(`credentialNames recorded   : ${catalog.filter((e) => Array.isArray(e.credentialNames)).length} catalog, ${descriptors.filter((d) => Array.isArray(d.credentialNames)).length} descriptors`);
}

await main();
