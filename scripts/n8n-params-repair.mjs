// Rebuilds the per-node parameter files.
//
// Context. Two defects in `n8n-node-loader.mjs` shaped the shipped files:
//
//   1. The stub for `n8n-workflow` shadowed its own injected `VersionedNodeType`,
//      so every node whose implementation is a version wrapper — `Slack/Slack.node.ts`
//      only re-exports `Slack/V2/` — loaded as an empty description. 60 of the 84
//      empty parameter files are exactly these wrappers.
//   2. The `@utils/…` / `@credentials/…` aliases never resolved (the package root
//      was already absolute and got joined onto the source root a second time), so
//      shared field descriptions arrived as stubs and were pruned away. That is
//      why an already-written file can be complete-looking yet miss most of its
//      fields, and why a few nodes throw while loading (`reading 'tz'`).
//
// So the empty files are not the only wrong ones, and `--all` rebuilds every file.
// Nodes that still fail to load keep their existing file rather than being
// replaced by nothing; they are listed instead.
//
// A third round of defects lived in the payload builder itself (a whitelist that
// emptied every `displayOptions`, stubs serialised as `null`, `version` arrays
// flattened to `1`). That builder is `n8n-param-payload.mjs`, shared with the full
// extraction pass, and `--all` is what rewrites the files it had shaped.
//
// Usage:
//   node scripts/n8n-params-repair.mjs                     # report only
//   node scripts/n8n-params-repair.mjs --verify            # prove byte-equivalence
//   node scripts/n8n-params-repair.mjs --write             # rebuild empty files
//   node scripts/n8n-params-repair.mjs --write --all       # rebuild every file
//   node scripts/n8n-params-repair.mjs --write --all --out=<dir>   # write elsewhere
//
// `--out` exists to make a rebuild comparable: run it twice into two directories
// and diff them to show the output is deterministic, or rebuild into a scratch
// directory to inspect the result before it replaces what the app serves.

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createNodeLoader } from "./n8n-node-loader.mjs";
import { buildParamPayload } from "./n8n-param-payload.mjs";

const ROOT = process.cwd();
const PARAMS_DIR = path.join(ROOT, "public", "n8n-params");
const DESCRIPTORS = path.join(ROOT, "src", "data", "n8n-descriptors.json");
const LOCAL_SRC = path.join(ROOT, ".n8n-cache", "src");

const WRITE = process.argv.includes("--write");
const VERIFY = process.argv.includes("--verify");
/** Rebuild every file, not only the empty ones. See the note on aliases above. */
const ALL = process.argv.includes("--all");
const OUT_ARG = process.argv.find((a) => a.startsWith("--out="));
const OUT_DIR = OUT_ARG ? path.resolve(ROOT, OUT_ARG.slice("--out=".length)) : PARAMS_DIR;
const log = (...a) => console.log(...a);

const hasProperties = (payload) => Array.isArray(payload.properties) && payload.properties.length > 0;

/** Every `null` in a payload, as a path. Used as the post-write self-check. */
function findNulls(value, trail, out) {
  if (value === null) {
    out.push(trail);
    return out;
  }
  if (typeof value !== "object" || value === undefined) return out;
  if (Array.isArray(value)) {
    value.forEach((v, i) => findNulls(v, `${trail}[${i}]`, out));
    return out;
  }
  for (const [k, v] of Object.entries(value)) findNulls(v, trail ? `${trail}.${k}` : k, out);
  return out;
}

async function main() {
  const descriptors = JSON.parse(await readFile(DESCRIPTORS, "utf8"));
  const files = new Set(await readdir(PARAMS_DIR));

  const empty = [];
  const good = [];
  for (const d of descriptors) {
    const file = `${d.key}.json`;
    if (!files.has(file)) {
      empty.push(d);
      continue;
    }
    const payload = JSON.parse(await readFile(path.join(PARAMS_DIR, file), "utf8"));
    (hasProperties(payload) ? good : empty).push(d);
  }

  log(`parameter files      : ${files.size}`);
  log(`with properties      : ${good.length}`);
  log(`empty (to rebuild)   : ${empty.length}`);

  const loader = await createNodeLoader(LOCAL_SRC, { concurrency: 8 });
  const targets = ALL ? [...good, ...empty] : empty;

  if (VERIFY) {
    // A rebuild of a file that was already correct must reproduce it exactly.
    // Any difference means this script's payload differs from the extractor's,
    // and repairing the empty ones would write a different shape than the rest.
    // It is only meaningful against files written by *this* builder: right after
    // a change to the payload it reports everything as differing, which is the
    // expected result, not a failure.
    log("");
    log(`verifying ${good.length} existing files rebuild byte-for-byte…`);
    const rebuilt = await loader.loadAll(good.map((d) => d.path));
    let identical = 0;
    const differing = [];
    for (let i = 0; i < good.length; i++) {
      const r = rebuilt[i];
      if (!r.ok) {
        differing.push(`${good[i].key}: load failed (${r.error})`);
        continue;
      }
      const { payload } = buildParamPayload(good[i], r.description);
      if (!payload) {
        differing.push(`${good[i].key}: rebuilt payload has no properties`);
        continue;
      }
      const onDisk = await readFile(path.join(PARAMS_DIR, `${good[i].key}.json`), "utf8");
      if (JSON.stringify(payload) === onDisk) identical++;
      else differing.push(`${good[i].key}: content differs`);
    }
    log(`byte-identical       : ${identical}/${good.length}`);
    log(`differing            : ${differing.length}`);
    for (const d of differing.slice(0, 20)) log(`   ${d}`);
  }

  if (WRITE) {
    if (OUT_DIR !== PARAMS_DIR) await mkdir(OUT_DIR, { recursive: true });
    log("");
    log(`rebuilding ${targets.length} parameter files → ${path.relative(ROOT, OUT_DIR)}…`);
    const results = await loader.loadAll(targets.map((d) => d.path));
    let repaired = 0;
    const stillEmpty = [];
    const failed = [];
    const withNulls = [];
    const omittedTotal = new Map();
    let bytes = 0;
    for (let i = 0; i < targets.length; i++) {
      const r = results[i];
      const d = targets[i];
      if (!r.ok) {
        // The existing file is left alone: a node this environment cannot load
        // would otherwise be replaced by nothing.
        failed.push(`${d.key}: ${r.error}`);
        continue;
      }
      const { payload, omitted } = buildParamPayload(d, r.description);
      if (!payload) {
        stillEmpty.push(`${d.key}: loaded, but declares no renderable parameters`);
        continue;
      }
      for (const o of omitted) {
        omittedTotal.set(o.kind, (omittedTotal.get(o.kind) ?? 0) + 1);
      }
      const nulls = findNulls(payload, "", []);
      // A `null` reaching the file is the failure mode this whole pass exists to
      // remove: the form treats it as an object and throws. `default: null` is a
      // real value in a few nodes, so the check reports instead of failing, but
      // every path it prints has to be traceable to the node's own source.
      if (nulls.length) withNulls.push(`${d.key}: ${nulls.join(", ")}`);
      const json = JSON.stringify(payload);
      bytes += json.length;
      await writeFile(path.join(OUT_DIR, `${d.key}.json`), json);
      repaired++;
    }
    log(`repaired             : ${repaired}`);
    log(`written bytes        : ${(bytes / 1048576).toFixed(2)} MB`);
    log(`loaded but no params : ${stillEmpty.length}`);
    for (const s of stillEmpty) log(`   ${s}`);
    log(`still not loadable   : ${failed.length}`);
    for (const f of failed) log(`   ${f}`);
    if (omittedTotal.size) {
      log(`omitted entries      : ${[...omittedTotal].map(([k, n]) => `${n} ${k}`).join(", ")}`);
    }
    log(`payloads with a null : ${withNulls.length}`);
    for (const w of withNulls.slice(0, 20)) log(`   ${w}`);
  }

  await loader.dispose();
  if (!WRITE) {
    log("");
    log("report only (pass --write to repair, --verify to check the builder)");
  }
}

await main();
