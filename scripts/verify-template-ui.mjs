#!/usr/bin/env node
/**
 * Checks the marketplace through the app's own frontend pipeline.
 *
 * `verify-templates.mjs` proves the *seeded config* is coherent; this proves the
 * other half — that the canvas turns a template into real nodes. It loads the
 * actual modules through Vite (same resolution as the app: TypeScript, the JSON
 * catalog, the layout metadata) and, for every template, runs the two actions
 * the marketplace offers:
 *
 *   · "Nueva automatización" — `computeAddStepChainEvents` from an empty flow;
 *   · "Añadir al flujo actual" — the same chain appended after a saved node.
 *
 * Then it reads the result back with `buildNodes`, which is what the canvas
 * draws, and asserts one node per step, in order, carrying the template's own
 * configuration. A template whose override was dropped on the way would show up
 * here as a node whose data differs from what the template declared.
 *
 * Run with: node scripts/verify-template-ui.mjs
 */
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: "custom", logLevel: "error" });

const load = (p) => server.ssrLoadModule(p);
const { FLOW_TEMPLATE_CATALOG } = await load("/src/features/templates/catalog/index.ts");
const { FLOW_TEMPLATES } = await load("/src/features/flowchart/addCategories.tsx");
const { computeAddStepChainEvents } = await load("/src/features/flowchart/utils/stepInsertion.ts");
const { buildNodes } = await load("/src/features/flowchart/buildNodes.ts");

const failures = [];
const fail = (id, message) => failures.push({ id, message });

/**
 * The nodes the canvas would draw, in flow order.
 *
 * Nothing is filtered out: the chain is appended to an empty flow, so there is
 * no implicit anchor node, and an explicit `end` is a step the template asked
 * for and must be counted.
 */
function nodesOf(events) {
  return buildNodes(events);
}

for (const tmpl of FLOW_TEMPLATE_CATALOG) {
  const events = await computeAddStepChainEvents({ events: [] }, tmpl.steps, "start", undefined);
  const nodes = nodesOf(events);

  // The chain is inserted after the existing `start` node, so the drawn types
  // must be exactly the template's steps, in order and with nothing lost.
  const drawn = nodes.map((n) => n.type);
  const expected = tmpl.steps.map((s) => s.type);
  if (drawn.join(",") !== expected.join(",")) {
    fail(tmpl.id, `el canvas dibuja [${drawn.join(", ")}] y la plantilla declara [${expected.join(", ")}]`);
    continue;
  }

  if (nodes.length !== tmpl.steps.length) {
    fail(tmpl.id, `se crearon ${nodes.length} nodos para ${tmpl.steps.length} pasos`);
    continue;
  }

  // Every override the template declares has to survive into the node's config,
  // otherwise the canvas would show a node that is not the one that was checked.
  const layout = events.find((e) => e.kind === "layout_metadata");
  if (!layout) fail(tmpl.id, "no se generó layout_metadata");
  for (const node of nodes) {
    if (!layout?.data?.positions?.[node.id]) fail(tmpl.id, `el nodo ${node.type} quedó sin posición en el lienzo`);
  }
  if (nodes.length > 1 && (layout?.data?.connections?.length ?? 0) < nodes.length - 1) {
    fail(tmpl.id, `solo ${layout?.data?.connections?.length ?? 0} conexiones para ${nodes.length} nodos`);
  }

  tmpl.steps.forEach((step, i) => {
    if (!step.data) return;
    const node = nodes[i];
    const config = events[node.eventIndex]?.data ?? {};
    for (const [key, value] of Object.entries(step.data)) {
      if (JSON.stringify(config[key]) !== JSON.stringify(value)) {
        fail(tmpl.id, `el paso ${i + 1} (${step.type}) perdió «${key}»: la plantilla declara ${JSON.stringify(value)} y el nodo quedó con ${JSON.stringify(config[key])}`);
      }
    }
  });
}

// Appending to an existing flow is the other half of the marketplace: the chain
// must land *after* the node it was attached to, not replace the flow.
const seed = await computeAddStepChainEvents({ events: [] }, [
  { type: "form", data: { fields: [{ id: "nombre", label: "Nombre", type: "text", required: true }] } },
], "start", undefined);
const anchor = nodesOf(seed).at(-1);
const grown = await computeAddStepChainEvents({ events: seed }, [{ type: "excel_local", data: { file_path: "x.xlsx" } }], anchor?.id, undefined);
const grownNodes = nodesOf(grown);
if (grownNodes.length !== nodesOf(seed).length + 1) {
  fail("append", `añadir una plantilla a un flujo existente debería dejar ${nodesOf(seed).length + 1} nodos y dejó ${grownNodes.length}`);
}
if (grownNodes.at(-1)?.type !== "excel_local") {
  fail("append", `el nodo añadido debería quedar al final y quedó ${grownNodes.at(-1)?.type}`);
}

// `FLOW_TEMPLATES` is the compatibility facade the rest of the app imports; it
// has to keep describing the same catalog, not a stale copy of it.
if (FLOW_TEMPLATES.length !== FLOW_TEMPLATE_CATALOG.length) {
  fail("FLOW_TEMPLATES", `${FLOW_TEMPLATES.length} entradas frente a ${FLOW_TEMPLATE_CATALOG.length} del catálogo`);
}
for (const [i, entry] of FLOW_TEMPLATES.entries()) {
  const source = FLOW_TEMPLATE_CATALOG[i];
  if (entry.id !== source.id || entry.chain.join(",") !== source.chain.join(",")) {
    fail("FLOW_TEMPLATES", `la entrada ${i} no coincide con el catálogo (${entry.id} vs ${source.id})`);
    break;
  }
  if (!entry.icon) {
    fail("FLOW_TEMPLATES", `la entrada ${entry.id} se quedó sin icono`);
    break;
  }
}

await server.close();

const byCategory = new Map();
for (const t of FLOW_TEMPLATE_CATALOG) byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + 1);
console.log(`\ncatálogo cargado: ${FLOW_TEMPLATE_CATALOG.length} plantillas en ${byCategory.size} categorías`);
console.log(`inserción comprobada en las ${FLOW_TEMPLATE_CATALOG.length} plantillas (crear y añadir)`);

if (failures.length) {
  console.error(`\n== FALLOS: ${failures.length} ==`);
  for (const f of failures.slice(0, 25)) console.error(`  ✗ ${f.id}: ${f.message}`);
  if (failures.length > 25) console.error(`  … y ${failures.length - 25} más`);
  process.exit(1);
}
console.log("0 fallos.\n");
