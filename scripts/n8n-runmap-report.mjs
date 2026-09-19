// Summarises the execution map for the editor.
//
// `n8n-runmap.json` is megabytes of captured requests: it belongs to the Rust
// engine, which needs every path and body. The palette only needs to know which
// catalogue entries can run at all, so this writes the small artifact the
// frontend imports (`src/data/n8n-executable.json`) from the big one — one
// source of truth, two views of it.
//
// Run it after `n8n-runmap-capture.mjs`:
//   node scripts/n8n-runmap-report.mjs

import fs from "node:fs";

const IN = "./src/data/n8n-runmap.json";
const OUT = "./src/data/n8n-executable.json";

const map = JSON.parse(fs.readFileSync(IN, "utf8"));
const keys = [];
const complete = [];
const counts = {};
const skipped = {};

for (const [key, node] of Object.entries(map.nodes ?? {})) {
  const cases = node.cases ?? [];
  const usable = cases.filter((c) => (c.requests ?? []).length > 0);
  if (!usable.length) {
    if (node.status === "skipped") skipped[key] = node.error ?? "saltado";
    continue;
  }
  keys.push(key);
  counts[key] = [usable.length, cases.length];
  // Every declared operation captured: the node can replace its hand-written
  // counterpart, not just back it up for the operations that happened to work.
  if (usable.length === cases.length) complete.push(key);
}

keys.sort();
complete.sort();

const payload = {
  generatedBy: "scripts/n8n-runmap-report.mjs",
  source: map.source ?? null,
  keys,
  complete,
  counts,
  skipped,
};
fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 1)}\n`);

const partial = keys.length - complete.length;
console.log("--------------------------------------------------");
console.log(`nodos en el mapa        : ${Object.keys(map.nodes ?? {}).length}`);
console.log(`  ejecutables           : ${keys.length}`);
console.log(`  completos (todas ops) : ${complete.length}`);
console.log(`  parciales             : ${partial}`);
console.log(`  saltados              : ${Object.keys(skipped).length}`);
console.log(`salida                  : ${OUT}`);
