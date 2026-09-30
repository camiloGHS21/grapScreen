// Classifies every app action the capture did not satisfy.
//
//   node scripts/n8n-runmap-classify.mjs
//
// For each of the 105 non-executable actions it loads the description and says
// which family the node belongs to:
//
//   declarative   no `execute()`, but `routing`/`requestDefaults` describe the
//                 request — n8n's runtime builds it from the description.
//   executable    has `execute()` and still made no request: a branch the mock
//                 answered wrongly, or a helper the mock does not record.
//   load-failed / timeout   the loader could not get a description in time.
//   local         neither: the node does local work (no HTTP), so the engine
//                 needs its own runner, not a map.
import fs from "node:fs";
import { createNodeLoader } from "./n8n-node-loader.mjs";

const map = JSON.parse(fs.readFileSync("./src/data/n8n-runmap.json", "utf8"));
const descriptors = JSON.parse(fs.readFileSync("./src/data/n8n-descriptors.json", "utf8"));
const executable = new Set(JSON.parse(fs.readFileSync("./src/data/n8n-executable.json", "utf8")).keys);

const actions = descriptors.filter((d) => d.category === "App / Integration" && !d.isTrigger);
const pending = actions.filter((d) => !executable.has(d.key));
console.log(`acciones de app sin ejecutar: ${pending.length}`);

const loader = await createNodeLoader("./.n8n-cache/src", { concurrency: 4 });
const groups = { declarative: [], executable: [], "load-failed": [], timeout: [], local: [], skipped: [] };
try {
  for (const d of pending) {
    const prior = map.nodes[d.key];
    if (prior?.status === "skipped") {
      groups.skipped.push(d.key);
      continue;
    }
    if (prior?.status === "timeout") {
      groups.timeout.push(d.key);
      continue;
    }
    if (prior?.status === "load-failed") {
      groups["load-failed"].push(d.key);
      continue;
    }
    const loaded = await loader.load(d.path);
    if (!loaded.ok) {
      groups["load-failed"].push(`${d.key} (${loaded.error?.slice(0, 40)})`);
      continue;
    }
    const description = loaded.description;
    const hasExecute =
      typeof loaded.instance?.execute === "function" ||
      Object.values(loaded.instance?.nodeVersions ?? {}).some((v) => typeof v?.execute === "function");
    const hasRouting = (description.properties ?? []).some(
      (p) => p?.routing || (p?.options ?? []).some((o) => o?.routing),
    );
    const hasDefaults = Boolean(description.requestDefaults);
    if (!hasExecute && (hasRouting || hasDefaults)) groups.declarative.push(d.key);
    else if (hasExecute) groups.executable.push(d.key);
    else groups.local.push(d.key);
  }
} finally {
  await loader.dispose();
}

for (const [family, list] of Object.entries(groups)) {
  if (!list.length) continue;
  console.log(`${family} (${list.length}): ${list.join(", ")}`);
}
