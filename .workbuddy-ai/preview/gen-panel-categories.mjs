/**
 * Generates `panel-categories.html` from the REAL sources, so the harness cannot
 * drift from the app:
 *   - category slugs + Spanish labels + ordering  → src/features/flowchart/utils/nodeCatalog.ts
 *   - slug → Lucide glyph + accent                → src/features/flowchart/components/FlowSidePanel.tsx
 *   - the actual SVG child nodes                  → node_modules/lucide-react/dist/esm/icons/
 *   - trigger counts per category                 → src/data/n8n-catalog.json
 *
 * Nothing here is hand-copied: if the app changes, re-run this and the harness
 * changes with it.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/* ── 1. the two maps out of the component ─────────────────────────────── */
const panelSrc = read("src/features/flowchart/components/FlowSidePanel.tsx");

function extractMap(name) {
  const start = panelSrc.indexOf(`const ${name}: Record<string, string> = {`);
  const iconStart = panelSrc.indexOf(`const ${name}: Record<string, LucideIcon> = {`);
  const from = start >= 0 ? start : iconStart;
  if (from < 0) throw new Error(`map ${name} not found`);
  const open = panelSrc.indexOf("{", from);
  const close = panelSrc.indexOf("};", open);
  const body = panelSrc.slice(open + 1, close);
  const out = {};
  for (const line of body.split("\n")) {
    const m = line.match(/^\s*"?([A-Za-z_& ]+)"?\s*:\s*"?([A-Za-z0-9_#]+)"?\s*,?\s*$/);
    if (m) out[m[1].trim()] = m[2];
  }
  return out;
}

const CATEGORY_ICON = extractMap("CATEGORY_ICON");
const CATEGORY_ACCENT = extractMap("CATEGORY_ACCENT");
const INTEGRATED_GLYPH = panelSrc.match(/const INTEGRATED_GLYPH = (\w+)/)?.[1];
const INTEGRATED_ACCENT = panelSrc.match(/const INTEGRATED_ACCENT = "([^"]+)"/)?.[1];
if (!INTEGRATED_GLYPH) throw new Error("INTEGRATED_GLYPH not found");

/* ── 2. real glyph bodies out of lucide ──────────────────────────────── */
const kebab = (n) =>
  n.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Za-z])(\d)/g, "$1-$2").toLowerCase();

function glyphBody(iconName) {
  const dir = path.join(ROOT, "node_modules/lucide-react/dist/esm/icons");
  let file = path.join(dir, kebab(iconName) + ".js");
  // Some names are deprecated aliases that re-export another icon
  // (`Code2` → `code-xml.js`), so follow the re-export chain.
  for (let hop = 0; hop < 4; hop++) {
    if (!fs.existsSync(file)) throw new Error(`no lucide file for ${iconName} (${path.basename(file)})`);
    const src = fs.readFileSync(file, "utf8");
    const re = src.match(/export\s*\{\s*default\s*\}\s*from\s*'\.\/([\w-]+)\.js'/);
    if (re) { file = path.join(dir, re[1] + ".js"); continue; }
    const m = src.match(/createLucideIcon\("[^"]+",\s*(\[[\s\S]*?\])\s*\);/);
    if (!m) throw new Error(`cannot parse children of ${iconName} (${path.basename(file)})`);
    // The literal is plain JS data; eval it in an isolated scope.
    const children = new Function(`return ${m[1]};`)();
    return children
      .map(([tag, attrs]) =>
        "<" + tag + " " +
        Object.entries(attrs)
          .filter(([k]) => k !== "key")
          .map(([k, v]) => `${k}="${String(v).replace(/"/g, "&quot;")}"`)
          .join(" ") + "/>")
      .join("");
  }
  throw new Error(`re-export chain too long for ${iconName}`);
}

function svg(iconName, size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    glyphBody(iconName) + `</svg>`;
}

/* ── 3. labels / order / counts ──────────────────────────────────────── */
const catalogSrc = read("src/features/flowchart/utils/nodeCatalog.ts");

const LABEL = (() => {
  const from = catalogSrc.indexOf("const N8N_CATEGORY_LABEL");
  const open = catalogSrc.indexOf("{", from);
  const close = catalogSrc.indexOf("};", open);
  const out = {};
  for (const line of catalogSrc.slice(open + 1, close).split("\n")) {
    const m = line.match(/^\s*"?([A-Za-z_& ]+)"?\s*:\s*"([^"]+)"/);
    if (m) out[m[1].trim()] = m[2];
  }
  return out;
})();

const ORDER = (() => {
  const from = catalogSrc.indexOf("export const N8N_CATEGORY_ORDER = [");
  const open = catalogSrc.indexOf("[", from);
  const close = catalogSrc.indexOf("];", open);
  return catalogSrc.slice(open + 1, close)
    .split("\n")
    .map((l) => l.match(/^\s*"([^"]+)"/)?.[1])
    .filter(Boolean);
})();

const entries = JSON.parse(read("src/data/n8n-catalog.json"));
const allTriggers = entries.filter((e) => e.category === "Trigger");
const triggers = allTriggers.filter((e) => e.appCategory);
const counts = {};
for (const t of triggers) counts[t.appCategory] = (counts[t.appCategory] || 0) + 1;
const triggerCats = Object.keys(counts).sort(
  (a, b) => (ORDER.indexOf(a) < 0 ? 999 : ORDER.indexOf(a)) - (ORDER.indexOf(b) < 0 ? 999 : ORDER.indexOf(b)),
);
/** The bucket `categorisedN8nItems` produces for entries with no appCategory. */
const uncategorised = allTriggers.filter((e) => !e.appCategory).length;

/* Coverage: every catalogue trigger must be reachable from exactly one row.
   This is the assertion that catches the `.filter(c => !!c)` bug returning. */
const covered = Object.values(counts).reduce((a, b) => a + b, 0) + uncategorised;
if (covered !== allTriggers.length) {
  throw new Error(`coverage ${covered} != ${allTriggers.length} triggers — a bucket is missing`);
}

/* integrated triggers are the hand-written ones; count them off the group.
   `HAND_WRITTEN.trigger` is an array of one-line object literals, so counting
   `{ type:` at bracket depth 1 inside that array is exact. */
const INTEGRATED_TRIGGERS = (() => {
  const from = catalogSrc.indexOf("const HAND_WRITTEN:");
  const key = catalogSrc.indexOf("trigger: [", from);
  if (from < 0 || key < 0) throw new Error("HAND_WRITTEN.trigger not found");
  const open = catalogSrc.indexOf("[", key);
  let depth = 0, end = -1;
  for (let i = open; i < catalogSrc.length; i++) {
    if (catalogSrc[i] === "[") depth++;
    else if (catalogSrc[i] === "]") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) throw new Error("unbalanced HAND_WRITTEN.trigger");
  return (catalogSrc.slice(open, end).match(/\{\s*type:/g) || []).length;
})();

/* ── 4. emit ─────────────────────────────────────────────────────────── */
const row = (glyphName, accent, title, desc, isCategory) => `
      <button type="button" class="fsp-row" data-cat="${isCategory ? title : ""}">
        <span class="fsp-row-icon" style="background:color-mix(in srgb, ${accent} 15%, transparent);color:${accent}">
          ${svg(glyphName, 16)}
        </span>
        <span class="fsp-row-text"><span class="fsp-row-title">${title}</span><span class="fsp-row-desc">${desc}</span></span>
        <span class="fsp-row-chevron">${svg("ChevronRight", 16)}</span>
      </button>`;

const rowsHtml =
  row(INTEGRATED_GLYPH, INTEGRATED_ACCENT, "Integrados", `${INTEGRATED_TRIGGERS} disparadores`, false) +
  triggerCats.map((c) =>
    row(CATEGORY_ICON[c] ?? "Boxes", CATEGORY_ACCENT[c] ?? "#8B8FA3", LABEL[c] ?? c, `${counts[c]} disparadores`, true),
  ).join("") +
  // "Otros" — the entries n8n gives no appCategory. It is not an n8n category,
  // so n8n's ordering cannot place it: parked last, like the component does.
  row("Boxes", "#8B8FA3", "Otros", `${uncategorised} disparadores`, true);

const html = `<!DOCTYPE html>
<html lang="es" data-theme="light">
<head>
<meta charset="utf-8">
<title>grapScreen — categorías con icono (datos reales)</title>
<link rel="stylesheet" href="styles.css">
<style>
  html, body { margin: 0; background: var(--bg); font: 400 13px Manrope, sans-serif; }
  .demo { display: flex; gap: 24px; padding: 20px; align-items: flex-start; }
  .col > h3 { font: 700 12px Manrope, sans-serif; margin: 0 0 8px; color: var(--text); }
  .col > p  { font: 400 11px Manrope, sans-serif; margin: 0 0 12px; color: var(--muted); max-width: 330px; line-height: 1.5; }
  .panel { width: 330px; background: var(--s1); border: 1px solid var(--line); border-radius: 16px; padding: 12px 14px; }
  #measure { font: 400 10px monospace; color: var(--dim); white-space: pre-wrap; max-width: 380px; margin: 0; }
  .verdict { font: 700 12px Manrope, sans-serif; padding: 6px 10px; border-radius: 8px; display: inline-block; margin-bottom: 10px; }
  .verdict.ok { background: rgba(34,197,94,.14); color: #16a34a; }
  .verdict.bad { background: rgba(239,68,68,.14); color: #dc2626; }
</style>
</head>
<body>
<div class="demo">
  <div class="col">
    <h3>Lienzo vacío — "Explorar categorías"</h3>
    <p>Datos reales del catálogo (${triggerCats.length} categorías, ${triggers.length} disparadores) y los
       glifos reales de Lucide. Cada fila debe mostrar su icono coloreado.</p>
    <div class="verdict" id="verdict">midiendo…</div>
    <div class="panel">
      <div class="fsp-section">
        <div class="fsp-section-title">Explorar categorías</div>
        ${rowsHtml}
      </div>
    </div>
  </div>
  <div class="col">
    <h3>Medición</h3>
    <pre id="measure"></pre>
  </div>
</div>
<script>
window.addEventListener("load", () => setTimeout(() => {
  const rows = [...document.querySelectorAll(".fsp-row")];
  const probe = rows.map((el, i) => {
    const slot = el.querySelector(".fsp-row-icon");
    const kid = slot && slot.firstElementChild;
    const r = kid ? kid.getBoundingClientRect() : { width: 0, height: 0 };
    const st = slot ? getComputedStyle(slot) : null;
    return {
      row: i + 1,
      title: el.querySelector(".fsp-row-title").textContent,
      glyph: kid ? kid.tagName.toLowerCase() : "none",
      painted: r.width > 4 && r.height > 4,
      color: st ? st.color : "",
      tint: st ? st.backgroundColor : "",
    };
  });
  const bad = probe.filter((p) => !p.painted);
  document.getElementById("measure").textContent =
    JSON.stringify({ filas: probe.length, conIcono: probe.length - bad.length, vacias: bad.length, detalle: probe }, null, 2)
    + "\\n\\n" + (bad.length ? "FAILURES" : "ALL-OK");
  const v = document.getElementById("verdict");
  v.textContent = bad.length
    ? "✗ " + bad.length + " fila(s) sin icono: " + bad.map((b) => b.title).join(", ")
    : "✓ " + probe.length + "/" + probe.length + " filas con icono";
  v.className = "verdict " + (bad.length ? "bad" : "ok");
  document.title = (bad.length ? "HAS-FAILURES" : "ALL-OK") + " — categorías";
}, 500));
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, ".workbuddy-ai/preview/panel-categories.html"), html);
console.log(`panel-categories.html written`);
console.log(`  filas de categoría:         ${triggerCats.length + 1} (+Integrados)`);
console.log(`  categorías n8n:             ${triggerCats.length}  (${triggerCats.join(", ")})`);
console.log(`  disparadores con categoría: ${triggers.length}`);
console.log(`  sin categoría ("Otros"):    ${uncategorised}`);
console.log(`  COBERTURA:                  ${covered}/${allTriggers.length}  OK`);
console.log(`  integrados (a mano):        ${INTEGRATED_TRIGGERS}`);
console.log(`  glifos distintos:           ${new Set([INTEGRATED_GLYPH, "Boxes", ...triggerCats.map((c) => CATEGORY_ICON[c] ?? "Boxes")]).size}`);
