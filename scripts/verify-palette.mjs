/**
 * Acceptance check for the node palette.
 *
 * Loads the real modules through Vite (so TypeScript and the JSON catalogue are
 * resolved exactly as the app resolves them) and answers the questions the
 * palette redesign has to satisfy:
 *
 *   1. exactly one agent node, and no deprecated AgentV1;
 *   2. the desktop nodes, the manual trigger and the app's own runners are
 *      still there;
 *   3. every sub-node key in `aiPortCatalog.ts` exists in the n8n catalogue;
 *   4. how many entries the palette shows, and which duplicates were hidden.
 *
 * Run with: node scripts/verify-palette.mjs
 */
import { createServer } from "vite";
import { readFileSync } from "node:fs";

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

try {
  const catalog = await server.ssrLoadModule("/src/features/flowchart/utils/nodeCatalog.ts");
  const ports = await server.ssrLoadModule("/src/features/flowchart/utils/aiPortCatalog.ts");
  const parity = await server.ssrLoadModule("/src/features/flowchart/utils/n8nParity.ts");
  const n8nEntries = JSON.parse(readFileSync("src/data/n8n-catalog.json", "utf8"));
  const n8nKeys = new Set(n8nEntries.map((e) => e.key));

  const all = catalog.ALL_CATALOG_ITEMS;
  const items = Object.entries(catalog.CATALOG_ITEMS);

  console.log("== Paleta ==");
  for (const [group, list] of items) {
    const own = list.filter((i) => !i.n8nKey).length;
    const blocked = list.filter((i) => i.comingSoon).length;
    console.log(
      `  ${group.padEnd(10)} ${String(list.length).padStart(3)} entradas` +
        `  (propias ${own}, n8n ${list.length - own}, bloqueadas ${blocked})`,
    );
  }
  console.log(`  TOTAL      ${String(all.length).padStart(3)} entradas`);

  console.log("\n== Agente ==");
  const agents = all.filter((i) => i.type === "ai_agent");
  check("una sola entrada de agente", agents.length === 1, agents.map((a) => `${a.label} (${a.type}/${a.n8nKey})`).join(", "));
  check("AgentV1 fuera de la paleta", !all.some((i) => i.n8nKey === "AgentV1"));

  console.log("\n== Nodos propios que no se pueden perder ==");
  const desktop = catalog.CATALOG_ITEMS.desktop.map((i) => i.type);
  const expectedDesktop = ["click", "type", "scroll", "hotkey", "wait_image", "screenshot"];
  check("Escritorio completo", expectedDesktop.every((t) => desktop.includes(t)), desktop.join(", "));
  const triggerTypes = catalog.CATALOG_ITEMS.trigger.map((i) => i.type);
  check("Manual presente", triggerTypes.includes("trigger"));
  check("hotkey_trigger presente", triggerTypes.includes("hotkey_trigger"));
  check("open_app / close_app presentes", catalog.CATALOG_ITEMS.action.some((i) => i.type === "open_app") && catalog.CATALOG_ITEMS.action.some((i) => i.type === "close_app"));

  console.log("\n== Sub-nodos IA ==");
  const portItems = Object.values(ports.AI_PORT_CONFIGS).flatMap((c) => c.sections.flatMap((s) => s.items));
  const missing = portItems.filter((i) => !n8nKeys.has(i.n8nKey));
  check("todos los n8nKey existen en el catálogo", missing.length === 0, missing.map((m) => m.n8nKey).join(", "));
  console.log(`  ${portItems.length} sub-nodos en ${Object.keys(ports.AI_PORT_CONFIGS).length} puertos`);
  for (const [portId, config] of Object.entries(ports.AI_PORT_CONFIGS)) {
    console.log(`  ${portId.padEnd(13)} ${config.sections.flatMap((s) => s.items).map((i) => i.n8nKey).join(", ")}`);
  }

  console.log("\n== Dedupe (regla: si el nodo n8n corre, gana el n8n) ==");
  const flat = Object.values(catalog.CATALOG_ITEMS).flat();
  // A hand-written entry is identified by its own type with no catalogue key;
  // the agent is the one entry that is both (n8n's Agent running on the
  // `ai_agent` engine kind).
  const ownVisible = (type) => flat.some((i) => i.type === type && !i.n8nKey);
  const hiddenOwn = [];
  for (const d of parity.DEDUPE_DECISIONS) {
    const n8nVisible = all.some((i) => i.n8nKey === d.n8nKey);
    const ownShown = ownVisible(d.own);
    const ok = d.keep === "n8n" ? n8nVisible && !ownShown : ownShown && !n8nVisible;
    if (!ownShown) hiddenOwn.push(d.own);
    check(
      `${d.own} ↔ ${d.n8nKey} (${d.displayName})`,
      ok,
      `n8n ejecutable: ${d.runnable ? "sí" : "no"} → se conserva ${d.keep}`,
    );
  }
  console.log(`\n  Entradas propias ocultas (${hiddenOwn.length}): ${hiddenOwn.join(", ")}`);
  console.log(`  Entradas n8n ocultas por duplicar una propia (${parity.N8N_DUPLICATE_HIDDEN.size}): ${[...parity.N8N_DUPLICATE_HIDDEN].join(", ")}`);
  console.log(`  Sub-nodos IA fuera del panel de pasos (${parity.AI_SUBNODE_HIDDEN.size}): ${[...parity.AI_SUBNODE_HIDDEN].join(", ")}`);

  console.log("\n== Avisos honestos ==");
  const soon = all.filter((i) => i.comingSoon);
  const notes = all.filter((i) => !i.comingSoon && i.setupNote);
  console.log(`  ${soon.length} entradas bloqueadas con motivo`);
  console.log(`  ${notes.length} entradas con aviso ("${notes[0]?.setupNote || "-"}")`);
  check("cada entrada bloqueada explica el motivo", soon.every((i) => i.comingSoonReason));

  console.log(`\n${failures === 0 ? "TODO OK" : `${failures} COMPROBACIONES FALLIDAS`}`);
} finally {
  await server.close();
}

process.exit(failures === 0 ? 0 : 1);
