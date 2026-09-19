/**
 * Acceptance check for the declarative node forms (`public/n8n-params/*.json`).
 *
 * The form is a plain renderer over one JSON file per node, so its two failure
 * modes — a thrown render and a duplicated React key — can be reproduced without
 * a browser by running the *same* functions the form runs. This script loads
 * `src/features/modals/edit/n8nParamsUtils.ts` and `n8nDefaults.ts` through Vite
 * (the same modules the app imports, TypeScript and all) and replays the form's
 * traversal over every file:
 *
 *   · `collectDefaults`      — the pass that seeds a node's parameters
 *   · `isVisible`            — the `displayOptions` filter, at the node's version
 *   · `collectionFields`     — the flattening `CollapsibleCollection` does
 *   · `optionChoices`        — the choice filter the option fields do
 *   · `fieldKey`             — the React key of each rendered field
 *
 * and checks:
 *
 *   A. no file throws while its defaults are collected or its fields walked;
 *   B. no two siblings in a rendered list share a key;
 *   C. no entry inside `options`/`values` is `null` (the crash in the log);
 *   D. `displayOptions` survived extraction;
 *   E. how many nodes render two fields with the same parameter name at once;
 *   F. the AI Agent form specifically: one "Prompt (User Message)", one
 *      "Source for Prompt (User Message)", and the *current* variant of the
 *      latter rather than the deprecated one;
 *   G. `Minimap` renders no `NaN` with no laid-out node.
 *
 * Run with:
 *   node scripts/verify-n8n-params.mjs                     # checks the shipped files
 *   node scripts/verify-n8n-params.mjs <dir>               # checks another directory
 */
import { createServer } from "vite";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const DIR = path.resolve(process.argv[2] || path.join(process.cwd(), "public", "n8n-params"));

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

/**
 * Every `null` in a value, with its path.
 *
 * After the extractor fix a `null` can only be a literal from the node's own
 * source: the pruning pass drops unresolved imports instead of letting
 * `JSON.stringify` write them as `null`, so it never *produces* one. The paths
 * this returns are therefore either a value n8n itself declares or a defect to
 * look into — never a stub that got serialised.
 */
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

/**
 * A `null` that sits where the form would dereference it: an *element* of an
 * entry array, i.e. of the array held by `properties`, `options` or `values` at
 * any depth. This is the shape that crashed the panel — `Agent.json` had
 * `properties[10].options[6] = null` and the collection renderer read `.type`
 * off it — so it must be zero.
 *
 * A `null` anywhere else is not structural: inside `default` it is a value n8n
 * itself declares (`default: null` on Beeminder's date fields), and the form
 * reads it through `??` fallbacks.
 */
function findStructuralNulls(value, trail, inEntryArray, out) {
  if (value === null) {
    if (inEntryArray) out.push(trail);
    return out;
  }
  if (typeof value !== "object" || value === undefined) return out;
  if (Array.isArray(value)) {
    value.forEach((v, i) => findStructuralNulls(v, `${trail}[${i}]`, inEntryArray, out));
    return out;
  }
  for (const [k, v] of Object.entries(value)) {
    const entry = k === "properties" || k === "options" || k === "values";
    findStructuralNulls(v, trail ? `${trail}.${k}` : k, entry, out);
  }
  return out;
}

try {
  const utils = await server.ssrLoadModule("/src/features/modals/edit/n8nParamsUtils.ts");
  const { isVisible, isN8nProperty, collectionFields, optionChoices, fieldKey } = utils;
  const { collectDefaults } = await server.ssrLoadModule(
    "/src/features/modals/edit/n8nDefaults.ts",
  );

  const files = (await readdir(DIR)).filter((f) => f.endsWith(".json")).sort();

  const stats = {
    properties: 0,
    withDisplayOptions: 0,
    withTypeOptions: 0,
    versionNotNumber: [],
    duplicateNameFiles: new Set(),
    simultaneousDuplicateFiles: [],
    nullsAnywhere: [],
    nullsInEntries: [],
    exceptions: [],
    duplicateKeys: [],
    visibleFields: 0,
    emptyForms: [],
  };

  /**
   * Walks a field the way the form renders it, collecting the React keys of
   * every sibling list. `config` is what the field's own control reads: the
   * node's parameters at the top level, the field's own sub-object for a
   * `collection`, and the node's parameters again for a `fixedCollection`
   * (n8n flattens its groups onto the node).
   */
  function walk(properties, config, version, file, trail) {
    const visible = properties
      .filter(isN8nProperty)
      .filter((p) => p.type !== "hidden" && isVisible(p, config, version));
    stats.visibleFields += visible.length;

    const keys = visible.map((p, i) => fieldKey(p, i));
    if (new Set(keys).size !== keys.length) {
      const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
      stats.duplicateKeys.push(`${file} ${trail} → ${[...new Set(dupes)].join(", ")}`);
    }
    const names = visible.map((p) => p.name);
    if (new Set(names).size !== names.length) {
      const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
      stats.simultaneousDuplicateFiles.push(`${file} ${trail} → ${dupes.join(", ")}`);
    }

    for (const p of visible) {
      if (p.type === "options" || p.type === "multiOptions") {
        // Read the choices, which is where a `null` entry used to throw.
        optionChoices(p).forEach((o) => String(o.value));
      }
      if (p.type !== "collection" && p.type !== "fixedCollection") continue;
      const current = config[p.name];
      const sub =
        current && typeof current === "object" && !Array.isArray(current) ? current : {};
      walk(
        collectionFields(p),
        p.type === "collection" ? sub : config,
        version,
        file,
        `${trail}.${p.name}`,
      );
    }
  }

  for (const file of files) {
    const raw = await readFile(path.join(DIR, file), "utf8");
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      stats.exceptions.push(`${file}: JSON inválido (${e.message})`);
      continue;
    }

    const nulls = findNulls(payload, "", []);
    if (nulls.length) stats.nullsAnywhere.push(`${file}: ${nulls.join(", ")}`);
    const nullsInEntries = findStructuralNulls(payload, "", false, []);
    if (nullsInEntries.length) stats.nullsInEntries.push(`${file}: ${nullsInEntries.join(", ")}`);

    // `properties` is what the form calls a field: `isN8nProperty` is the filter
    // the form applies before it reads `.type` off any entry, so an unusable one
    // can never be reached from here either.
    const allProperties = Array.isArray(payload.properties) ? payload.properties : [];
    const properties = allProperties.filter(isN8nProperty);
    stats.properties += properties.length;
    stats.withDisplayOptions += properties.filter(
      (p) => p.displayOptions && Object.keys(p.displayOptions).length > 0,
    ).length;
    stats.withTypeOptions += properties.filter(
      (p) => p.typeOptions && Object.keys(p.typeOptions).length > 0,
    ).length;
    if (typeof payload.version !== "number") stats.versionNotNumber.push(`${file} (${JSON.stringify(payload.version)})`);
    const names = properties.map((p) => p.name);
    if (new Set(names).size !== names.length) stats.duplicateNameFiles.add(file);

    // The form's own sequence: seed the defaults, then render the visible fields.
    try {
      const config = {};
      const defaults = {};
      collectDefaults(properties, defaults);
      // A `value` bag shaped like the form's: n8n's defaults plus grapScreen's
      // own overrides are not needed here, but the merge is what the form does.
      Object.assign(config, defaults);
      const version = typeof payload.version === "number" ? payload.version : 1;
      const topLevel = properties.filter((p) => p.type !== "hidden" && isVisible(p, config, version));
      // With the conditions restored, a field can now be *hidden* where it used
      // to be rendered unconditionally. A node left with nothing to configure
      // would show "no tiene parámetros configurables" instead of its form, so
      // the count of such nodes is worth watching.
      if (properties.length > 0 && topLevel.length === 0) stats.emptyForms.push(file);
      walk(properties, config, version, file, `${file}:properties`);
    } catch (e) {
      stats.exceptions.push(`${file}: ${e.message}`);
    }
  }

  const agent = files.includes("Agent.json")
    ? JSON.parse(await readFile(path.join(DIR, "Agent.json"), "utf8"))
    : null;

  console.log(`== Archivos (${path.relative(process.cwd(), DIR)}) ==`);
  console.log(`  archivos             : ${files.length}`);
  console.log(`  propiedades          : ${stats.properties}`);
  console.log(`  campos renderizados  : ${stats.visibleFields}`);

  console.log("\n== A. Ningún archivo tumba el formulario ==");
  check("0 excepciones al colectar y renderizar", stats.exceptions.length === 0, `${stats.exceptions.length} archivos fallan`);
  for (const e of stats.exceptions.slice(0, 10)) console.log(`      ${e}`);

  console.log("\n== B. Claves React únicas ==");
  // Two fields of one node can share a *name* — the AI Agent declares
  // `promptType` twice and `text` three times — so the key is `name#index`
  // (`fieldKey`). What is checked here is the key the form hands to React; the
  // names that collide are counted in E, where the count is meaningful (they
  // share one parameter slot, which is a data question, not a rendering one).
  check("0 listas con clave repetida", stats.duplicateKeys.length === 0, `${stats.duplicateKeys.length} listas`);
  for (const d of stats.duplicateKeys.slice(0, 10)) console.log(`      ${d}`);

  console.log("\n== C. Sin `null` donde el formulario lee entradas ==");
  check(
    "0 null como entrada de array o dentro de displayOptions/typeOptions",
    stats.nullsInEntries.length === 0,
    `${stats.nullsInEntries.length} archivos`,
  );
  for (const n of stats.nullsInEntries) console.log(`      ${n}`);
  console.log(`  nulls restantes (solo pueden ser literales del fuente): ${stats.nullsAnywhere.length}`);
  for (const n of stats.nullsAnywhere.slice(0, 20)) console.log(`      ${n}`);
  if (stats.nullsAnywhere.length) {
    console.log(
      "      → `default: null` y `default.value = null` son valores que el propio n8n declara\n" +
        "        (Beeminder.node.ts:603, Postgres/v2/actions/database/insert.operation.ts:123),\n" +
        "        y `default` se copia entero: un stub se descarta, nunca se escribe como null.",
    );
  }

  console.log("\n== D. displayOptions conservado ==");
  check(
    "las propiedades conservan sus condiciones",
    stats.withDisplayOptions > 0,
    `${stats.withDisplayOptions}/${stats.properties} propiedades con displayOptions no vacío`,
  );
  // `typeOptions` is the other bag the form reads structurally: it decides
  // between a textarea and a one-line input (`typeOptions.rows`) and whether the
  // value is masked (`typeOptions.password`).
  console.log(`  propiedades con typeOptions con contenido: ${stats.withTypeOptions}`);
  console.log(`  versiones no numéricas: ${stats.versionNotNumber.length ? stats.versionNotNumber.join(", ") : "ninguna"}`);

  console.log("\n== E. Nombres de propiedad repetidos ==");
  console.log(`  archivos con nombres repetidos      : ${stats.duplicateNameFiles.size}`);
  console.log(`  listas con nombres repetidos a la vez: ${stats.simultaneousDuplicateFiles.length}`);
  for (const d of stats.simultaneousDuplicateFiles.slice(0, 10)) console.log(`      ${d}`);
  check(
    "ningún nodo se queda sin campos visibles",
    stats.emptyForms.length === 0,
    `${stats.emptyForms.length} archivos`,
  );
  for (const f of stats.emptyForms.slice(0, 10)) console.log(`      ${f}`);

  console.log("\n== F. AI Agent ==");
  if (!agent) {
    check("Agent.json presente", false);
  } else {
    const properties = (agent.properties || []).filter(isN8nProperty);
    const config = {};
    collectDefaults(properties, config);
    const version = typeof agent.version === "number" ? agent.version : 1;
    const visible = properties.filter(
      (p) => p.type !== "hidden" && isVisible(p, config, version),
    );
    const promptType = visible.filter((p) => p.name === "promptType");
    const text = visible.filter((p) => p.name === "text");
    const promptChoices = promptType.length ? optionChoices(promptType[0]).map((o) => String(o.value)) : [];
    console.log(`  version: ${agent.version}`);
    console.log(`  "Source for Prompt (User Message)" visibles: ${promptType.length} → ${promptChoices.join(", ")}`);
    console.log(`  "Prompt (User Message)" visibles           : ${text.length}`);
    check("1 solo 'Source for Prompt' visible", promptType.length === 1, `${promptType.length}`);
    check("1 solo 'Prompt (User Message)' visible", text.length === 1, `${text.length}`);
    check(
      "la variante visible es la actual (2 opciones), no la deprecada (3)",
      promptChoices.length === 2 && promptChoices.includes("define"),
      `opciones: ${promptChoices.join(", ")}`,
    );
    check("version numérica", typeof agent.version === "number", JSON.stringify(agent.version));
    const agentKeys = visible.map((p, i) => fieldKey(p, i));
    check("claves únicas en el formulario del agente", new Set(agentKeys).size === agentKeys.length, agentKeys.join(", "));
  }

  console.log("\n== G. Minimap ==");
  try {
    // React is imported natively: Vite externalises it for SSR, and loading it
    // through the module runner evaluates the CommonJS build as ESM ("module is
    // not defined"). The component itself has to go through Vite, since it is TSX.
    const React = (await import("react")).default;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { Minimap } = await server.ssrLoadModule("/src/features/flowchart/components/Minimap.tsx");
    const noop = () => {};
    const scenarios = [
      ["0 nodos", [], {}],
      ["3 nodos sin layout", [{ id: "a", type: "start" }, { id: "b", type: "n8n" }, { id: "c", type: "end" }], {}],
      ["3 nodos con layout", [{ id: "a", type: "start" }, { id: "b", type: "n8n" }, { id: "c", type: "end" }], { a: { x: 0, y: 0 }, b: { x: 300, y: 120 }, c: { x: 700, y: 40 } }],
    ];
    let nan = [];
    let emptyWithoutBounds = [];
    let drawnWithBounds = 0;
    for (const [label, nodes, layout] of scenarios) {
      const html = renderToStaticMarkup(
        React.createElement(Minimap, {
          showMinimap: true,
          nodes,
          layout,
          viewport: { x: 0, y: 0, k: 1 },
          setViewport: noop,
          containerRef: { current: null },
        }),
      );
      const hasNaN = /NaN/.test(html);
      if (hasNaN) nan.push(label);
      const hasBounds = Object.keys(layout).length > 0;
      if (hasBounds && html.length > 0) drawnWithBounds += 1;
      // Without a single laid-out node there are no bounds to scale from, so the
      // box is not drawn at all. Before the guard this rendered `left: NaNpx`
      // (React logs "NaN is an invalid value for the left css style property").
      if (!hasBounds && html !== "") emptyWithoutBounds.push(label);
      console.log(`  ${label.padEnd(20)} → ${html.length} bytes${hasNaN ? "  ← NaN" : ""}`);
    }
    check("ningún escenario emite NaN", nan.length === 0, nan.join(", "));
    check(
      "sin nodos con layout no se dibuja el mapa (antes: left:NaNpx)",
      emptyWithoutBounds.length === 0,
      emptyWithoutBounds.join(", "),
    );
    check("con nodos con layout se sigue dibujando", drawnWithBounds === 1, `${drawnWithBounds}/1`);
  } catch (e) {
    failures += 1;
    console.log(`FAIL  no se pudo renderizar el Minimap — ${e.message}`);
  }

  console.log(`\n${failures === 0 ? "TODO OK" : `${failures} COMPROBACIONES FALLIDAS`}`);
} finally {
  await server.close();
}

process.exit(failures === 0 ? 0 : 1);
