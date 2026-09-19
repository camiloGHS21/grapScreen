// Throwaway: build the params payload, measure it, and check glyph coverage.
import fs from "node:fs";
import { createNodeLoader } from "./n8n-node-loader.mjs";

const descriptors = JSON.parse(fs.readFileSync("src/data/n8n-descriptors.json", "utf8"));

const PROP_KEYS = [
  "displayName", "name", "type", "default", "description", "placeholder", "required",
  "displayOptions", "typeOptions", "options", "hint", "noDataExpression", "modes",
  "limitOptions", "displayNameOptions", "builderHint", "extractValue", "routing",
  "loadOptionsMethod", "loadOptions", "isNodeSetting",
];
const OPTION_KEYS = [
  "name", "value", "description", "displayName", "displayOptions", "action",
  "type", "default", "options", "values", "placeholder", "typeOptions", "required",
  "noDataExpression", "hint", "modes",
];

const seen = new WeakSet();
function prune(value, keys, depth) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return undefined; // cycles would blow up JSON.stringify
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((v) => prune(v, keys, depth)).filter((v) => v !== undefined);
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (depth === 0 ? !keys.includes(k) : !OPTION_KEYS.includes(k)) continue;
    const p = prune(v, keys, depth + 1);
    if (p !== undefined) out[k] = p;
  }
  return out;
}

const loader = await createNodeLoader(".n8n-cache/src", { concurrency: 8 });
const results = await loader.loadAll(descriptors.map((d) => d.path));
await loader.dispose();

let totalBytes = 0;
let built = 0;
let biggest = { key: "", bytes: 0 };
const failures = [];

for (let i = 0; i < descriptors.length; i++) {
  const r = results[i];
  const d = descriptors[i];
  if (!r.ok) {
    failures.push({ key: d.key, error: r.error });
    continue;
  }
  const desc = r.description;
  const payload = {
    key: d.key,
    displayName: desc.displayName || d.displayName,
    description: desc.description || d.description,
    version: desc.version ?? 1,
    defaults: prune(desc.defaults, ["name", "color"], 1) || {},
    properties: prune(desc.properties, PROP_KEYS, 0) || [],
    webhooks: desc.webhooks || undefined,
    requestDefaults: desc.requestDefaults || undefined,
    subtitle: desc.subtitle || undefined,
  };
  const json = JSON.stringify(payload);
  totalBytes += json.length;
  built++;
  if (json.length > biggest.bytes) biggest = { key: d.key, bytes: json.length };
}

console.log(`params built: ${built}/${descriptors.length}`);
console.log(`total size  : ${(totalBytes / 1048576).toFixed(2)} MB`);
console.log(`average/node: ${Math.round(totalBytes / built / 1024)} KB`);
console.log(`largest     : ${biggest.key} ${Math.round(biggest.bytes / 1024)} KB`);
console.log(`failures    : ${failures.length}`);
for (const f of failures.slice(0, 10)) console.log(`   ${f.key}: ${f.error}`);

// Glyph coverage: how many icon-less descriptors can now get a real SVG?
const glyphDir = ".n8n-cache/src/packages/frontend/@n8n/design-system/src/components/N8nIcon";
const available = new Set([
  ...fs.readdirSync(`${glyphDir}/nodes`).map((f) => `node:${f.replace(/\.svg$/, "")}`),
  ...fs.readdirSync(`${glyphDir}/custom`).map((f) => `custom:${f.replace(/\.svg$/, "")}`),
]);
console.log(`\nglyph svgs available: ${available.size}`);
console.log("(icon-less descriptors are resolved in the main extraction pass)");
