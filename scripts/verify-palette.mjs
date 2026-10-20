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
 *   4. the whole n8n catalogue is on screen, minus the two documented keys;
 *   5. **no capability is left without a node** — the invariant the dedupe rule
 *      exists to protect;
 *   6. blocked and runnable agree: nothing executable is disabled and nothing
 *      unexecutable is offered as a step.
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
  const byKey = new Map(n8nEntries.map((e) => [e.key, e]));

  const all = catalog.ALL_CATALOG_ITEMS;
  const items = Object.entries(catalog.CATALOG_ITEMS);

  console.log("== Paleta ==");
  for (const [group, list] of items) {
    const own = list.filter((i) => !i.n8nKey).length;
    const blocked = list.filter((i) => i.comingSoon).length;
    console.log(
      `  ${group.padEnd(10)} ${String(list.length).padStart(3)} entradas` +
        `  (propias ${own}, n8n ${list.length - own}, bloqueadas ${blocked}, disponibles ${list.length - blocked})`,
    );
  }
  console.log(`  TOTAL      ${String(all.length).padStart(3)} entradas`);

  console.log("\n== Agente ==");
  const agents = all.filter((i) => i.type === "ai_agent");
  check(
    "una sola entrada de agente",
    agents.length === 1,
    agents.map((a) => `${a.label} (${a.type}/${a.n8nKey})`).join(", "),
  );
  check("AgentV1 fuera de la paleta", !all.some((i) => i.n8nKey === "AgentV1"));

  console.log("\n== Nodos propios que no se pueden perder ==");
  const desktop = catalog.CATALOG_ITEMS.desktop.map((i) => i.type);
  const expectedDesktop = ["click", "type", "scroll", "hotkey", "wait_image", "screenshot"];
  check("Escritorio completo", expectedDesktop.every((t) => desktop.includes(t)), desktop.join(", "));
  const triggerTypes = catalog.CATALOG_ITEMS.trigger.map((i) => i.type);
  check("Manual presente", triggerTypes.includes("trigger"));
  check("hotkey_trigger presente", triggerTypes.includes("hotkey_trigger"));
  check(
    "open_app / close_app presentes",
    catalog.CATALOG_ITEMS.action.some((i) => i.type === "open_app") &&
      catalog.CATALOG_ITEMS.action.some((i) => i.type === "close_app"),
  );

  console.log("\n== Sub-nodos IA ==");
  const portItems = Object.values(ports.AI_PORT_CONFIGS).flatMap((c) =>
    c.sections.flatMap((s) => s.items),
  );
  const missing = portItems.filter((i) => !n8nKeys.has(i.n8nKey));
  check("todos los n8nKey existen en el catálogo", missing.length === 0, missing.map((m) => m.n8nKey).join(", "));
  console.log(`  ${portItems.length} sub-nodos en ${Object.keys(ports.AI_PORT_CONFIGS).length} puertos`);
  for (const [portId, config] of Object.entries(ports.AI_PORT_CONFIGS)) {
    console.log(`  ${portId.padEnd(13)} ${config.sections.flatMap((s) => s.items).map((i) => i.n8nKey).join(", ")}`);
  }
  // The port panels say what the runner does with each slot: only the chat model
  // reaches it, so everything else has to say so on the entry itself.
  const PROVIDERS_WITH_A_RUNNER = [
    "LmChatOpenAi",
    "LmChatAnthropic",
    "LmChatGoogleGemini",
    "LmChatOllama",
    "LmChatDeepSeek",
    "LmChatGroq",
    "LmChatMistralCloud",
    "LmChatOpenRouter",
  ];
  const unmarked = portItems.filter((i) => !i.setupNote).map((i) => i.n8nKey);
  check(
    "los únicos sub-nodos sin aviso son los modelos que el ejecutor sí llama",
    unmarked.length === PROVIDERS_WITH_A_RUNNER.length &&
      unmarked.every((k) => PROVIDERS_WITH_A_RUNNER.includes(k)),
    `sin aviso: ${unmarked.join(", ")}`,
  );
  const wrongMark = portItems.filter(
    (i) => PROVIDERS_WITH_A_RUNNER.includes(i.n8nKey) && i.setupNote,
  );
  check(
    "ningún modelo soportado se marca como no conectado",
    wrongMark.length === 0,
    wrongMark.map((m) => `${m.n8nKey}: ${m.setupNote}`).join(", "),
  );

  console.log("\n== Catálogo n8n completo ==");
  const shownKeys = new Set(all.filter((i) => i.n8nKey).map((i) => i.n8nKey));
  const hidden = n8nEntries
    .filter((e) => !shownKeys.has(e.key))
    .map((e) => e.key)
    .sort();
  check(
    "solo AgentV1 y Agent quedan fuera del catálogo",
    hidden.length === 2 && hidden[0] === "Agent" && hidden[1] === "AgentV1",
    hidden.join(", "),
  );
  const aiSubnodes = n8nEntries.filter(
    (e) =>
      e.category === "AI" &&
      e.key !== "Agent" &&
      e.key !== "AgentV1" &&
      e.appCategory !== "trigger",
  );
  check(
    "todo el sub-catálogo de IA está en la paleta",
    aiSubnodes.length === parity.AI_SUBNODES.size &&
      aiSubnodes.every((e) => shownKeys.has(e.key)),
    `${aiSubnodes.length} nodos de la categoría AI`,
  );

  console.log("\n== Invariante: ninguna capacidad sin nodo ==");
  const flat = Object.values(catalog.CATALOG_ITEMS).flat();
  const ownVisible = (type) => flat.some((i) => i.type === type && !i.n8nKey);
  const n8nVisible = (key) => flat.some((i) => i.n8nKey === key);
  const orphans = [];
  for (const d of parity.DEDUPE_DECISIONS) {
    if (!ownVisible(d.own) && !n8nVisible(d.n8nKey)) orphans.push(d.own);
    check(
      `${d.own} ↔ ${d.n8nKey} (${d.displayName})`,
      ownVisible(d.own) || n8nVisible(d.n8nKey),
      `n8n ejecutable: ${d.runnable ? "sí" : "no"}, cobertura auditada: ${
        d.replaces ? "sí" : "no"
      } → se conserva ${d.keep}${n8nVisible(d.n8nKey) ? ", el n8n sigue visible" : ""}`,
    );
  }
  check("ninguna capacidad se quedó sin nodo", orphans.length === 0, orphans.join(", "));

  check(
    "el desempate nunca elige el n8n por un nodo que no corre",
    parity.DEDUPE_DECISIONS.every((d) => d.keep === "own" || d.runnable),
    `${parity.DEDUPE_DECISIONS.filter((d) => d.keep === "own").length} capacidades conservan su nodo propio`,
  );
  check(
    "toda capacidad sustituida estaba auditada",
    parity.DEDUPE_DECISIONS.every((d) => d.keep === "own" || d.replaces),
    `${parity.OWN_HIDDEN.size} nodos propios fuera: ${[...parity.OWN_HIDDEN].join(", ")}`,
  );
  console.log(`  Entradas propias ocultas (${parity.OWN_HIDDEN.size}): ${[...parity.OWN_HIDDEN].join(", ")}`);
  console.log(
    `  Entradas n8n ocultas (${parity.N8N_DUPLICATE_HIDDEN.size} + AgentV1): ${[
      ...parity.N8N_DUPLICATE_HIDDEN,
    ].join(", ")}`,
  );
  console.log(`  Sub-nodos IA en la paleta: ${parity.AI_SUBNODES.size}`);

  console.log("\n== Avisos honestos ==");
  const soon = all.filter((i) => i.comingSoon);
  const notes = all.filter((i) => !i.comingSoon && i.setupNote);
  console.log(`  ${soon.length} entradas bloqueadas con motivo`);
  console.log(`  ${notes.length} entradas disponibles con aviso`);
  check("cada entrada bloqueada explica el motivo", soon.every((i) => i.comingSoonReason));
  check(
    "un bloqueo nunca se anuncia como un simple dato que falta",
    soon.every((i) => !i.setupNote) && notes.every((i) => !i.comingSoon),
  );

  const mismatched = flat.filter((i) => {
    if (!i.n8nKey) return false;
    return Boolean(i.comingSoon) === parity.n8nRunnable(byKey.get(i.n8nKey));
  });
  check(
    "bloqueado ⇔ no ejecutable, en las dos direcciones",
    mismatched.length === 0,
    mismatched.map((m) => m.n8nKey).join(", "),
  );

  const badge = notes.filter((i) => / de .* operaciones/.test(i.setupNote));
  check(
    "el badge de cobertura parcial es alcanzable",
    badge.length > 0,
    `${badge.length} entradas, p.ej. ${badge[0]?.n8nKey} "${badge[0]?.setupNote}"`,
  );

  console.log("\n== Buscador ==");
  const queries = [
    ["kafka", "KafkaTrigger"],
    ["filter", "Filter"],
    ["sort", "Sort"],
    ["imap", "EmailReadImap"],
    ["message an agent", "MessageAnAgent"],
    ["memory", "MemoryBufferWindow"],
    ["wait", "Wait"],
  ];
  const notFound = [];
  for (const [query, key] of queries) {
    const hits = catalog.SEARCHABLE_ITEMS.filter((i) => catalog.matchesCatalogQuery(i, query));
    const hit = hits.find((i) => i.n8nKey === key);
    if (!hit) notFound.push(`${query} → ${key} (${hits.length} resultados)`);
  }
  check("el buscador encuentra los nodos bloqueados", notFound.length === 0, notFound.join("; "));

  const blockedFound = queries
    .map(([, key]) => catalog.SEARCHABLE_ITEMS.find((i) => i.n8nKey === key))
    .filter((i) => i && i.comingSoon);
  check(
    "y los encuentra marcados como bloqueados",
    blockedFound.length === queries.length,
    `${blockedFound.length}/${queries.length}`,
  );

  const blockedSearchable = catalog.SEARCHABLE_ITEMS.filter((i) => i.comingSoon).length;
  check(
    "la búsqueda cubre el mismo catálogo que las categorías",
    blockedSearchable === soon.length,
    `${blockedSearchable} bloqueados buscables de ${soon.length} bloqueados en la paleta`,
  );

  console.log("\n== Presentación del bloqueo ==");
  const css = readFileSync("src/styles.css", "utf8");
  check("existe un estilo para el nodo bloqueado", /\.fsp-item:disabled\s*\{/.test(css));
  check(
    "el nodo bloqueado no reacciona al puntero como uno que funciona",
    /\.fsp-item:disabled:hover\s*\{/.test(css),
  );
  const reasonRule = css.match(/\.fsp-item-reason\s*\{([^}]*)\}/);
  check(
    "el motivo tiene su propia línea y no se trunca",
    Boolean(reasonRule) && !/text-overflow\s*:\s*ellipsis/.test(reasonRule[1]),
    reasonRule ? reasonRule[1].replace(/\s+/g, " ").trim() : "regla ausente",
  );

  const noReason = soon.filter((i) => !i.comingSoonReason || i.comingSoonReason.length < 20);
  check(
    "ningún bloqueo se queda con un motivo vacío o telegráfico",
    noReason.length === 0,
    noReason.map((i) => i.label).join(", "),
  );

  console.log(`\n${failures === 0 ? "TODO OK" : `${failures} COMPROBACIONES FALLIDAS`}`);
} finally {
  await server.close();
}

process.exit(failures === 0 ? 0 : 1);
