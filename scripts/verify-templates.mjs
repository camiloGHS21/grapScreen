#!/usr/bin/env node
/**
 * Verifies every template in the catalog.
 *
 * The point of this script is that it checks the *real* seeder: it bundles
 * `eventModifiers.ts` and calls `buildAddedEvents`, and it reads the catalog
 * through `catalog/index.ts`, so a template cannot pass by having been checked
 * against a copy of the contract that later drifted. Run it with
 * `npm run verify:templates`; it also regenerates
 * `src/data/template-seeds.json`, the artifact the Rust end-to-end test reads.
 */
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkTemplateChain } from "./lib/template-chain-check.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const relative = (p) => `./${p.split("\\").join("/")}`;

/** Bundles the TypeScript the check needs and loads it as an ES module. */
async function loadSources() {
  const result = await build({
    stdin: {
      contents: [
        `export { buildAddedEvents } from ${JSON.stringify(relative("src/features/flowchart/utils/eventModifiers.ts"))};`,
        `export * as contract from ${JSON.stringify(relative("src/features/templates/nodeContract.ts"))};`,
        `export { STORED_TEMPLATES, FLOW_TEMPLATE_CATALOG, FEATURED_POPULARITY } from ${JSON.stringify(relative("src/features/templates/catalog/index.ts"))};`,
      ].join("\n"),
      resolveDir: ROOT,
      sourcefile: "template-validator-entry.ts",
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "silent",
  });
  const out = join(ROOT, "node_modules", ".cache", `template-validator-${process.pid}.mjs`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, result.outputFiles[0].text);
  return import(pathToFileURL(out).href);
}

/** Metadata the marketplace relies on. */
function checkMetadata(tmpl, seen, contract) {
  const errors = [];
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(tmpl.id)) errors.push(`id «${tmpl.id}» no es kebab-case`);
  if (seen.has(tmpl.id)) errors.push(`id «${tmpl.id}» duplicado`);
  seen.add(tmpl.id);
  if (!tmpl.title?.trim()) errors.push("título vacío");
  if (!tmpl.description?.trim()) errors.push("descripción vacía");
  if (tmpl.description && tmpl.description.length < 12) errors.push("descripción demasiado corta para ser útil");
  if (!Array.isArray(tmpl.tags) || tmpl.tags.length === 0) errors.push("sin etiquetas");
  if (!Number.isInteger(tmpl.popularity) || tmpl.popularity < 0 || tmpl.popularity > 100) {
    errors.push(`popularity «${tmpl.popularity}» fuera de 0-100`);
  }
  if (!Array.isArray(tmpl.steps) || tmpl.steps.length === 0) errors.push("sin pasos");
  if (tmpl.id.length > 2 && tmpl.steps && tmpl.steps.length === 1 && tmpl.steps[0].type === "trigger") {
    errors.push("una plantilla de un solo disparador no hace nada");
  }
  for (const req of tmpl.requires ?? []) {
    if (!contract.CREDENTIAL_REQUIREMENTS.includes(req)) errors.push(`requires contiene «${req}», que no es un requisito conocido`);
  }
  // A template that uses an integration must say so, or the UI would present it
  // as usable without credentials.
  const needed = new Set();
  for (const step of tmpl.steps ?? []) {
    const req = contract.KIND_REQUIREMENTS[step.type];
    if (req) needed.add(req);
  }
  for (const req of needed) {
    if (!(tmpl.requires ?? []).includes(req)) errors.push(`usa ${req} pero no lo declara en requires`);
  }
  for (const req of tmpl.requires ?? []) {
    if (!needed.has(req)) errors.push(`declara requires: ${req} pero ningún paso lo necesita`);
  }
  return errors;
}

const sources = await loadSources();
const { buildAddedEvents, contract, STORED_TEMPLATES, FLOW_TEMPLATE_CATALOG, FEATURED_POPULARITY } = sources;
const nodeKinds = new Set(contract.TEMPLATE_NODE_TYPES);
const deps = { buildAddedEvents, contract, nodeKinds };

const failures = [];
const seeds = [];
const seenIds = new Set();

for (const tmpl of STORED_TEMPLATES) {
  const derived = FLOW_TEMPLATE_CATALOG.find((t) => t.id === tmpl.id);
  const errors = [];
  if (!derived) {
    errors.push("no aparece en FLOW_TEMPLATE_CATALOG");
  } else {
    if (derived.featured !== (tmpl.popularity >= FEATURED_POPULARITY)) errors.push("featured no coincide con popularity");
    if (derived.chain.join(",") !== tmpl.steps.map((s) => s.type).join(",")) errors.push("chain no coincide con steps");
  }
  errors.push(...checkMetadata(tmpl, seenIds, contract));

  const { errors: chainErrors, state } = checkTemplateChain(tmpl, deps);
  errors.push(...chainErrors);

  if (errors.length) {
    failures.push({ id: tmpl.id, errors });
    continue;
  }

  // The effective seed: defaults overlaid with the step's patch, exactly what
  // the canvas writes. The Rust test executes these.
  const events = [];
  tmpl.steps.forEach((step, i) => {
    const seeded = buildAddedEvents(step.type, 100 + i * 10, [], 0, step.data ? { data: step.data } : undefined);
    for (const ev of seeded) {
      events.push({ at_ms: ev.at_ms, kind: ev.kind, data: ev.data, __step: i, __type: step.type });
    }
  });
  seeds.push({
    id: tmpl.id,
    title: tmpl.title,
    category: tmpl.category,
    chain: tmpl.steps.map((s) => s.type),
    requires: tmpl.requires,
    runtime: derived?.runtime ?? [],
    locallyVerifiable: derived?.locallyVerifiable ?? false,
    events,
    __varsAfterRun: [...state.vars],
  });
}

const seedsPath = join(ROOT, "src", "data", "template-seeds.json");
mkdirSync(dirname(seedsPath), { recursive: true });
writeFileSync(seedsPath, `${JSON.stringify({ generatedBy: "npm run verify:templates", templates: seeds }, null, 1)}\n`);

// ---------------------------------------------------------------- report ----
const byCategory = new Map();
for (const t of STORED_TEMPLATES) byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + 1);
const withCreds = STORED_TEMPLATES.filter((t) => (t.requires ?? []).length > 0);
const locally = FLOW_TEMPLATE_CATALOG.filter((t) => t.locallyVerifiable);
const featured = FLOW_TEMPLATE_CATALOG.filter((t) => t.featured);

console.log("\n== Plantillas ==");
console.log(`  total:                  ${STORED_TEMPLATES.length}`);
console.log(`  destacadas (pop>=${FEATURED_POPULARITY}): ${featured.length}`);
console.log(`  requieren credenciales: ${withCreds.length}`);
console.log(`  verificables en local:  ${locally.length}`);
console.log("\n== Por categoría ==");
for (const [cat, count] of [...byCategory].sort((a, b) => b[1] - a[1])) {
  const creds = STORED_TEMPLATES.filter((t) => t.category === cat && (t.requires ?? []).length > 0).length;
  console.log(`  ${cat.padEnd(20)} ${String(count).padStart(3)}  (${creds} con credenciales)`);
}

if (failures.length) {
  console.error(`\n== FALLOS: ${failures.length} plantilla(s) ==`);
  for (const f of failures) {
    console.error(`\n  ✗ ${f.id}`);
    for (const e of f.errors) console.error(`      - ${e}`);
  }
  console.error(`\n${STORED_TEMPLATES.length - failures.length}/${STORED_TEMPLATES.length} plantillas pasan.\n`);
  process.exit(1);
}

console.log(`\n${STORED_TEMPLATES.length}/${STORED_TEMPLATES.length} plantillas pasan. 0 fallos.`);
console.log(`Semillas escritas en src/data/template-seeds.json (${seeds.length} plantillas).\n`);
