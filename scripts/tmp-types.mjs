// Throwaway: what property types and shapes do the 565 nodes actually use?
import fs from "node:fs";
import { createNodeLoader } from "./n8n-node-loader.mjs";

const descriptors = JSON.parse(fs.readFileSync("src/data/n8n-descriptors.json", "utf8"));
const loader = await createNodeLoader(".n8n-cache/src", { concurrency: 8 });
const results = await loader.loadAll(descriptors.map((d) => d.path));
await loader.dispose();

const ok = results.filter((r) => r.ok);
console.log(`loaded: ${ok.length}/${results.length}`);

const types = {};
const keys = {};
let totalProps = 0;
let withOptions = 0;
let withDisplayOptions = 0;
let collections = 0;
let fixedCollections = 0;
const typeDepth = {};

function walk(props, depth) {
  for (const p of props || []) {
    totalProps++;
    types[p.type] = (types[p.type] || 0) + 1;
    if (Array.isArray(p.options)) withOptions++;
    if (p.displayOptions) withDisplayOptions++;
    if (p.type === "collection") collections++;
    if (p.type === "fixedCollection") {
      fixedCollections++;
      for (const [group, def] of Object.entries(p.options || {})) {
        void group;
        if (def && Array.isArray(def.values)) walk(def.values, depth + 1);
      }
    }
    if (depth > 0) typeDepth[depth] = (typeDepth[depth] || 0) + 1;
  }
}
for (const r of ok) walk(r.description.properties, 0);

console.log(`\ntotal properties: ${totalProps}`);
console.log(`with options list: ${withOptions}`);
console.log(`with displayOptions: ${withDisplayOptions}`);
console.log(`collection: ${collections} | fixedCollection: ${fixedCollections}`);
console.log("\ntypes by frequency:");
for (const [t, n] of Object.entries(types).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${t}`);
}

console.log("\nother description keys worth keeping:");
for (const r of ok.slice(0, 400)) {
  for (const k of Object.keys(r.description)) keys[k] = (keys[k] || 0) + 1;
}
for (const [k, n] of Object.entries(keys).sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  console.log(`  ${String(n).padStart(4)}  ${k}`);
}

const fails = results.filter((r) => !r.ok);
console.log(`\nfailures: ${fails.length}`);
const reasons = {};
for (const f of fails) reasons[f.error] = (reasons[f.error] || 0) + 1;
for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(3)}  ${k}`);
}
console.log("sample:", fails.slice(0, 8).map((f, i) => `${descriptors[results.indexOf(f)].key}`).join(", "));
