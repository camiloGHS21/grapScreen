/**
 * Renders a node's parameter panel to a standalone HTML file, outside a browser.
 *
 * The panel is a React tree over one JSON file per node, and the properties that
 * are hard to eyeball — a callout whose text is HTML, which of three `text`
 * variants is on screen, whether a control that n8n does not have is still
 * rendered — are exactly the ones a text snapshot can settle. This script loads
 * the *same* modules the app renders through Vite (TypeScript, TSX and the JSON
 * catalogue resolved as in the app) and prints the same component the panel
 * mounts, `N8nParamsFields`, into a file that can be opened and reviewed.
 *
 * The value bag is seeded the way `N8nParamsForm` seeds it: n8n's own defaults,
 * then any stored value that is not empty, then grapScreen's overrides.
 *
 * Run with:
 *   node scripts/snapshot-params.mjs                       # Agent → preview/params-Agent.html
 *   node scripts/snapshot-params.mjs Agent preview/before.html
 *   node scripts/snapshot-params.mjs Agent preview/before.html --legacy
 *
 * `--legacy` is for reproducing the "before" half of a before/after pair, and it
 * only covers the piece the panel used to draw inline: `AgentModelNote` did not
 * exist, the note was a `<div style=…>` inside `DeclarativeN8nForm`, and the
 * note div below reproduces that markup verbatim. The fields themselves come
 * from the current sources, so a true "before" also needs the pre-change
 * `N8nPropertyField`/`n8nFieldUI`/`DroppableInput`/`n8nDefaults`/`styles.css`
 * in place — which is how `preview/params-Agent-before.html` was captured.
 */
import { createServer } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const NODE_KEY = process.argv[2] || "Agent";
const OUT = path.resolve(
  process.argv[3] || path.join("preview", `params-${NODE_KEY}.html`),
);
const LEGACY = process.argv.includes("--legacy");

/**
 * The agent note as `DeclarativeN8nForm` rendered it before the change: an
 * appended box with its own inline styles.
 */
const LEGACY_AGENT_NOTE = `<div style="margin-top:12px;padding:10px 12px;border-radius:8px;border:1px solid var(--line);background:var(--s2);font-size:11px;color:var(--dim);line-height:1.6">El modelo y el proveedor se toman del nodo de chat model conectado al puerto <strong>Chat Model</strong>. La clave de API se lee del almacén de credenciales de la aplicación, igual que en el resto del flujo.</div>`;

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

const count = (haystack, needle) => haystack.split(needle).length - 1;

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

try {
  // React natively, the components through Vite: the module runner evaluates
  // React's CommonJS build as ESM and dies on `module is not defined`.
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");

  const { N8nParamsFields, payloadProperties, payloadVersion } =
    await server.ssrLoadModule("/src/features/modals/edit/N8nParamsFields.tsx");
  const { collectDefaults } = await server.ssrLoadModule(
    "/src/features/modals/edit/n8nDefaults.ts",
  );
  const { applyAppDefaults, isEmptyValue } = await server.ssrLoadModule(
    "/src/features/modals/edit/paramDefaults.ts",
  );
  const { AgentModelNote } = LEGACY
    ? { AgentModelNote: null }
    : await server.ssrLoadModule("/src/features/modals/edit/AgentModelNote.tsx");

  const payload = JSON.parse(
    await readFile(path.join("public", "n8n-params", `${NODE_KEY}.json`), "utf8"),
  );

  // The seed `N8nParamsForm` writes back on load.
  const defaults = {};
  collectDefaults(payloadProperties(payload), defaults, payloadVersion(payload));
  const effective = { ...defaults };
  for (const [k, v] of Object.entries({})) {
    if (!isEmptyValue(v)) effective[k] = v;
  }
  const value = applyAppDefaults(payload.key, effective);

  const fields = renderToStaticMarkup(
    React.createElement(N8nParamsFields, { payload, value, onChange: () => {} }),
  );

  // The panel as the node editor mounts it: the field list plus the app's own
  // note under the agent's model port. `N8nParamsForm` wraps these two, but it
  // loads its payload from a `fetch` in an effect, and effects do not run
  // outside a browser — so the snapshot renders what that wrapper renders,
  // seeded from the same file and the same helpers.
  const note = LEGACY
    ? LEGACY_AGENT_NOTE
    : renderToStaticMarkup(React.createElement(AgentModelNote));
  const panel = `<div class="declarative-n8n-form">${fields}${note}</div>`;

  // The stylesheet is inlined so the file opens and reads correctly on its own,
  // without the repo beside it.
  const css = await readFile(path.join("src", "styles.css"), "utf8");
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Parámetros de ${NODE_KEY}</title>
<style>${css}</style>
<style>
  body { display: block; overflow: auto; height: auto; padding: 24px; }
  .snapshot-frame { width: 420px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); padding: 16px; }
  .snapshot-note { font: 500 11px Manrope, sans-serif; color: var(--dim); margin: 0 0 14px; }
</style>
</head>
<body>
<p class="snapshot-note">Instantánea de solo lectura del panel de parámetros de <b>${NODE_KEY}</b>${LEGACY ? " (estado anterior al cambio)" : ""} — los controles no responden.</p>
<div class="snapshot-frame">
${panel}
</div>
</body>
</html>
`;
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, html, "utf8");

  const visible = payloadProperties(payload);

  console.log(`== Instantánea: ${NODE_KEY} → ${path.relative(process.cwd(), OUT)} ==`);
  console.log(`  campos declarados : ${payloadProperties(payload).length}`);
  console.log(`  valor sembrado    : ${JSON.stringify({
    promptType: value.promptType,
    text: value.text,
    hasOutputParser: value.hasOutputParser,
    needsFallback: value.needsFallback,
  })}`);
  console.log(`  bytes de HTML     : ${panel.length}`);
  console.log(`  etiquetas visibles: ${(panel.match(/ndv-n8n-field-label/g) || []).length}`);

  // (a) No raw HTML left as text. A tag the renderer did not understand comes
  // out of React escaped, so the escaped form is what to look for.
  const escapedTags = panel.match(/&lt;\/?[a-zA-Z][a-zA-Z0-9-]*/g) || [];
  console.log("\n(a) HTML crudo visible como texto");
  check("0 etiquetas escapadas en el panel", escapedTags.length === 0, escapedTags.join(", "));

  // (b) The controls n8n does not have.
  console.log("\n(b) Controles retirados (n8n no los tiene)");
  for (const needle of [">Fixed<", ">Expression<", "From list", "ndv-mode-segmented-pill", "ndv-select-prefix"]) {
    check(`"${needle}" ausente`, !panel.includes(needle), `${count(panel, needle)} apariciones`);
  }

  // (c) One field per parameter name, not one per declared variant. Counted on
  // the label span itself: "Source for Prompt (User Message)" also contains the
  // shorter label, so a substring count would double it.
  console.log("\n(c) Una sola variante visible por campo");
  const labelCount = (text) => count(panel, `>${text}</span>`);
  const promptLabel = labelCount("Prompt (User Message)");
  const sourceLabel = labelCount("Source for Prompt (User Message)");
  console.log(`  "Prompt (User Message)"              : ${promptLabel}`);
  console.log(`  "Source for Prompt (User Message)"   : ${sourceLabel}`);
  check("1 campo 'Prompt (User Message)'", promptLabel === 1, `${promptLabel}`);
  check("1 campo 'Source for Prompt (User Message)'", sourceLabel === 1, `${sourceLabel}`);

  // (d) One select, and it is the prompt-type one.
  console.log("\n(d) Un único select para el prompt type");
  const selects = (panel.match(/<select/g) || []).length;
  const choices = (payload.properties || []).find(
    (p) => p.name === "promptType" && (!p.displayOptions || !p.displayOptions.show?.["@version"]?.[0]?._cnd?.lt),
  );
  console.log(`  <select> en el panel : ${selects}`);
  console.log(`  opciones de promptType: ${(choices?.options || []).map((o) => o.value).join(", ")}`);
  check("1 solo select", selects === 1, `${selects}`);
  check(
    "sin pastillas de modo junto al select",
    !panel.includes("ndv-pill-btn"),
    `${count(panel, "ndv-pill-btn")} botones de pastilla`,
  );

  // (e) The default n8n shows for the visible variant: stored as n8n declares
  // it (marker included), shown without the marker.
  console.log("\n(e) Valor por defecto de la variante visible");
  const visibleText = (payload.properties || []).filter(
    (p) => p.name === "text" && (!p.displayOptions?.show?.promptType || p.displayOptions.show.promptType.includes(value.promptType)),
  );
  const declared = visibleText[0]?.default;
  const shown = typeof declared === "string" && declared.startsWith("=") ? declared.slice(1) : declared;
  console.log(`  promptType sembrado  : ${JSON.stringify(value.promptType)}`);
  console.log(`  variante visible     : ${JSON.stringify(declared)}`);
  console.log(`  texto sembrado       : ${JSON.stringify(value.text)}`);
  check("el valor sembrado es el que n8n declara", value.text === declared, JSON.stringify(value.text));
  check("el panel lo muestra sin el marcador `=`", panel.includes(shown) && !panel.includes(`value="${declared}"`), `esperado: ${JSON.stringify(shown)}`);
  check(`${JSON.stringify(shown)} presente en el panel`, panel.includes(shown), "");
  check("$json.guardrailsInput ausente del panel", !panel.includes("guardrailsInput"), "");

  console.log(`\n${failures === 0 ? "TODO OK" : `${failures} COMPROBACIONES FALLIDAS`}`);
} finally {
  await server.close();
}

process.exit(failures === 0 ? 0 : 1);
