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
const IN_TRIGGERS = "./src/data/n8n-trigger-runmap.json";
const OUT = "./src/data/n8n-executable.json";

const map = JSON.parse(fs.readFileSync(IN, "utf8"));
const keys = [];
const complete = [];
const counts = {};
const relative = [];
const skipped = {};

/** A captured request whose URL is a path, not a URL, is missing its API root. */
const isRelativeRequest = (request) => !/^https?:\/\//i.test(((request ?? {}).path ?? "").trim());

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
  // The node runs, but every request it captured is a *path*
  // (`{{$credentials…}}/services/data/…`), so the palette tells the user it
  // still needs an API root instead of letting the first run discover it.
  if (usable.every((c) => isRelativeRequest(c.requests[0]))) relative.push(key);
}

keys.sort();
complete.sort();
relative.sort();

// Polling triggers are captured into their own artifact: their code path is
// `poll()`, not `execute()`. `pollable` is what the palette gates them on, so it
// comes from that file alone — reading the action map here would mark every
// single-flow action node as a trigger.
const triggerMap = JSON.parse(fs.readFileSync(IN_TRIGGERS, "utf8"));
const pollable = {};
for (const [key, node] of Object.entries(triggerMap.nodes ?? {})) {
  const caseWithRequest = (node.cases ?? []).find((c) => (c.requests ?? []).length > 0);
  if (caseWithRequest) pollable[key] = true;
}

const payload = {
  generatedBy: "scripts/n8n-runmap-report.mjs",
  source: map.source ?? null,
  keys,
  complete,
  counts,
  relative,
  pollable,
  skipped,
};
fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 1)}\n`);

const partial = keys.length - complete.length;
console.log("--------------------------------------------------");
console.log(`nodos en el mapa        : ${Object.keys(map.nodes ?? {}).length}`);
console.log(`  ejecutables           : ${keys.length}`);
console.log(`  completos (todas ops) : ${complete.length}`);
console.log(`  parciales             : ${partial}`);
console.log(`  sin URL base propia   : ${relative.length}`);
console.log(`  pollables             : ${Object.keys(pollable).length}`);
console.log(`  saltados              : ${Object.keys(skipped).length}`);
console.log(`salida                  : ${OUT}`);
