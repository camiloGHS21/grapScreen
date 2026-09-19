// Renders the extracted catalogue as a standalone, searchable HTML page.
//
// Purely a reporting step: it reads the descriptors the extraction produced and
// writes one static file, so the coverage of all 565 n8n nodes can be inspected
// without launching the app.
//
// The grouping mirrors what the palette does — the app's four node groups, each
// split into the same sections (`nodeCatalog.ts` → `categorisedN8nItems`) — so
// this page doubles as a check that the catalogue is organised the way n8n
// organises it. The order and the Spanish labels below must therefore be kept in
// sync with `N8N_CATEGORY_ORDER` / `N8N_CATEGORY_LABEL` in
// `src/features/flowchart/utils/nodeCatalog.ts`; they are presentation only, so
// a drift degrades this report's headings and nothing else.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src", "data", "n8n-descriptors.json");
const OUT = path.join(ROOT, "preview", "n8n-catalogo.html");
const ICON_DIR = path.join(ROOT, "public", "n8n-icons");

const descriptors = JSON.parse(await readFile(SRC, "utf8"));

// The logos are inlined as base64 background images rather than linked as
// `../public/n8n-icons/x.svg`. A report is meant to be opened on its own — from
// a preview pane, a chat attachment, another machine — and a relative link
// breaks the moment the file is not sitting next to `public/`. One CSS class per
// distinct logo keeps the payload at ~2 MB instead of repeating it 440 times.
const iconClasses = new Map(); // logo file name -> css class
const iconRules = [];
for (const file of [...new Set(descriptors.map((d) => d.icon).filter(Boolean))].sort()) {
  let bytes;
  try {
    bytes = await readFile(path.join(ICON_DIR, file));
  } catch {
    continue; // missing asset: the row falls back to an empty placeholder
  }
  const cls = `i-${file.replace(/\.svg$/i, "").replace(/[^a-z0-9]+/gi, "_")}`;
  iconClasses.set(file, cls);
  iconRules.push(`.${cls}{background-image:url("data:image/svg+xml;base64,${bytes.toString("base64")}")}`);
}

const GROUPS = [
  { id: "Trigger", title: "Disparadores", accent: "#ff6d5a" },
  { id: "AI", title: "IA", accent: "#a855f7" },
  { id: "App / Integration", title: "Acción en una app", accent: "#0f9d58" },
  { id: "Core", title: "Núcleo", accent: "#06b6d4" },
];

// Same order as the palette: app categories first, then the LangChain families.
const CATEGORY_ORDER = [
  "Productivity",
  "Communication",
  "Marketing",
  "Sales",
  "Finance & Accounting",
  "Data & Storage",
  "Development",
  "Analytics",
  "Utility",
  "Miscellaneous",
  "HITL",
  "Developer Tools",
  "AI",
  "ECM",
  "trigger",
  "agents",
  "chains",
  "llms",
  "memory",
  "tools",
  "vector_store",
  "embeddings",
  "document_loaders",
  "text_splitters",
  "output_parser",
  "retrievers",
  "rerankers",
  "mcp",
  "code",
  "ModelSelector",
  "ToolExecutor",
  "Guardrails",
  "vendors",
];

const CATEGORY_LABEL = {
  Productivity: "Productividad",
  Communication: "Comunicación",
  Marketing: "Marketing",
  Sales: "Ventas",
  "Finance & Accounting": "Finanzas y contabilidad",
  "Data & Storage": "Datos y almacenamiento",
  Development: "Desarrollo",
  Analytics: "Analítica",
  Utility: "Utilidades",
  Miscellaneous: "Varios",
  HITL: "Revisión humana",
  "Developer Tools": "Herramientas de desarrollo",
  AI: "IA",
  ECM: "Gestión documental",
  trigger: "Disparadores",
  agents: "Agentes",
  chains: "Cadenas",
  llms: "Modelos de lenguaje",
  memory: "Memoria",
  tools: "Herramientas",
  vector_store: "Almacenes vectoriales",
  embeddings: "Embeddings",
  document_loaders: "Cargadores de documentos",
  text_splitters: "Divisores de texto",
  output_parser: "Analizadores de salida",
  retrievers: "Recuperadores",
  rerankers: "Reordenadores",
  mcp: "MCP",
  code: "Código",
  ModelSelector: "Selector de modelo",
  ToolExecutor: "Ejecutor de herramientas",
  Guardrails: "Guardrails",
  vendors: "Proveedores",
};

const catLabel = (slug) => (slug ? CATEGORY_LABEL[slug] || slug : "Otros");
const catRank = (slug) => {
  const i = CATEGORY_ORDER.indexOf(slug || "");
  return i < 0 ? CATEGORY_ORDER.length : i;
};

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const total = descriptors.length;
const withUrl = descriptors.filter((d) => d.baseUrl).length;
const withCred = descriptors.filter((d) => d.credential).length;
const withIcon = descriptors.filter((d) => d.icon).length;
const withCat = descriptors.filter((d) => d.appCategory).length;
const triggers = descriptors.filter((d) => d.isTrigger).length;

// How a trigger receives its event, detected from the n8n source. The three
// armable modes are the ones the trigger daemon can actually watch; `event`
// needs a client library the app does not ship, so it is shown as unavailable
// rather than silently doing nothing when armed.
const TRIGGER_MODES = [
  { id: "webhook", label: "webhook", ok: true },
  { id: "polling", label: "sondeo", ok: true },
  { id: "schedule", label: "programado", ok: true },
  { id: "event", label: "no armable", ok: false },
];
const modeCounts = Object.fromEntries(
  TRIGGER_MODES.map((m) => [m.id, descriptors.filter((d) => d.triggerMode === m.id).length]),
);
const armable = TRIGGER_MODES.filter((m) => m.ok).reduce((n, m) => n + modeCounts[m.id], 0);

function row(d) {
  const cred = d.credential;
  const auth = cred
    ? Object.keys(cred.headers || {}).length
      ? Object.entries(cred.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join(" · ")
      : cred.authType || "genérica"
    : "";
  const mode = TRIGGER_MODES.find((m) => m.id === d.triggerMode);
  const badges = [
    d.baseUrl
      ? `<span class="b ok">URL base</span>`
      : `<span class="b miss">sin URL base</span>`,
    cred ? `<span class="b ok">credencial</span>` : `<span class="b miss">sin credencial</span>`,
    mode ? `<span class="b ${mode.ok ? "ok" : "miss"}">${esc(mode.label)}</span>` : "",
  ].join("");

  // The real app logo, inlined from `public/n8n-icons/`. Nodes that declare a
  // built-in glyph instead have no file, so the cell keeps an empty placeholder.
  const logoCls = d.icon ? iconClasses.get(d.icon) : null;
  const logo = logoCls
    ? `<span class="lg ${logoCls}"></span>`
    : `<span class="lg ph"></span>`;

  return `<tr data-s="${esc(
    `${d.displayName} ${d.key} ${d.description} ${d.baseUrl || ""} ${cred?.name || ""} ${
      d.appCategory || ""
    }`.toLowerCase(),
  )}" data-c="${esc(d.category)}" data-cat="${esc(d.appCategory || "")}">
<td class="ic">${logo}</td>
<td><div class="nm">${esc(d.displayName)}</div><div class="ds">${esc(d.description)}</div></td>
<td class="k">${esc(d.key)}</td>
<td class="ct">${d.appCategory ? esc(catLabel(d.appCategory)) : "<em>—</em>"}</td>
<td class="u">${d.baseUrl ? esc(d.baseUrl) : "<em>—</em>"}</td>
<td class="a">${cred ? esc(cred.name || "") + (auth ? `<div class="au">${esc(auth)}</div>` : "") : "<em>—</em>"}</td>
<td class="bd">${badges}</td>
</tr>`;
}

const sections = GROUPS.map((g) => {
  const items = descriptors.filter((d) => d.category === g.id);

  // Same bucketing as `categorisedN8nItems`: by app category, in n8n's order,
  // uncategorised last.
  const buckets = new Map();
  for (const d of items) {
    const k = d.appCategory || "";
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(d);
  }
  const ordered = [...buckets.entries()].sort(([a], [b]) => {
    const r = catRank(a) - catRank(b);
    return r !== 0 ? r : a.localeCompare(b);
  });

  const body = ordered
    .map(([slug, list]) => {
      const sorted = list.slice().sort((a, b) => a.displayName.localeCompare(b.displayName));
      return `<h3 data-sec="${esc(slug)}">${esc(catLabel(slug))} <span class="n">${sorted.length}</span></h3>
<table><tbody>${sorted.map(row).join("")}</tbody></table>`;
    })
    .join("\n");

  return `<section class="grp" data-g="${esc(g.id)}" style="--a:${g.accent}">
<h2>${esc(g.title)} <span class="n">${items.length}</span></h2>
${body}
</section>`;
}).join("\n");

// One button per app category, so a section can be isolated across groups.
const catButtons = [...new Set(descriptors.map((d) => d.appCategory).filter(Boolean))]
  .sort((a, b) => catRank(a) - catRank(b) || a.localeCompare(b))
  .map((c) => `<button data-cat="${esc(c)}">${esc(catLabel(c))}</button>`)
  .join("");

const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Catálogo n8n en grapScreen</title>
<style>
:root{--bg:#fbfaf8;--s1:#fff;--s2:#f3f1ec;--line:#e2ded5;--text:#22201c;--muted:#6b675f;--dim:#96918a;--ok:#0f6e56;--miss:#a33;--accent:#534ab7}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
header{padding:28px 32px 18px;border-bottom:1px solid var(--line);background:var(--s1);position:sticky;top:0;z-index:5}
h1{margin:0 0 4px;font-size:19px;font-weight:500}
.sub{color:var(--muted);font-size:13px}
.kpis{display:flex;gap:26px;margin-top:16px;flex-wrap:wrap}
.kpi{min-width:104px}
.kpi .v{font-size:22px;font-weight:500}
.kpi .l{font-size:12px;color:var(--dim)}
.bar{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;align-items:center}
input[type=search]{flex:1;min-width:240px;padding:9px 12px;border:1px solid var(--line);border-radius:9px;background:var(--s2);font:inherit;color:inherit}
input[type=search]:focus{outline:2px solid var(--accent);outline-offset:1px}
button{padding:8px 13px;border:1px solid var(--line);background:var(--s2);border-radius:9px;font:inherit;color:var(--muted);cursor:pointer}
button.on{background:var(--accent);border-color:var(--accent);color:#fff}
main{padding:8px 32px 60px}
h2{font-size:15px;font-weight:600;margin:34px 0 12px;padding-left:10px;border-left:3px solid var(--a)}
h3{font-size:12px;font-weight:500;margin:18px 0 6px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
h2 .n,h3 .n{color:var(--dim);font-weight:400;font-size:12px}
table{width:100%;border-collapse:collapse;background:var(--s1);border:1px solid var(--line);border-radius:10px;overflow:hidden}
td{padding:7px 12px;border-top:1px solid var(--line);vertical-align:top;font-size:13px}
tr:first-child td{border-top:none}
.ic{width:34px;padding-right:0}
.lg{display:block;width:20px;height:20px;background-size:contain;background-repeat:no-repeat;background-position:center}
.lg.ph{background:var(--s2);border-radius:5px}
${iconRules.join("\n")}
.nm{font-weight:500}
.ds{color:var(--muted);font-size:12px;margin-top:1px}
.k{color:var(--dim);font-family:ui-monospace,Consolas,monospace;font-size:12px;white-space:nowrap}
.ct{color:var(--muted);font-size:12px;white-space:nowrap}
.u{color:var(--muted);font-family:ui-monospace,Consolas,monospace;font-size:12px;word-break:break-all}
.a{color:var(--muted);font-size:12px}
.au{color:var(--dim);font-family:ui-monospace,Consolas,monospace;font-size:11px;margin-top:2px;word-break:break-all}
.bd{white-space:nowrap}
.b{display:inline-block;padding:1px 7px;border-radius:20px;font-size:11px;margin-right:4px;border:1px solid}
.b.ok{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 35%,transparent);background:color-mix(in srgb,var(--ok) 8%,transparent)}
.b.miss{color:var(--miss);border-color:color-mix(in srgb,var(--miss) 30%,transparent);background:color-mix(in srgb,var(--miss) 6%,transparent)}
.empty{padding:40px;text-align:center;color:var(--dim)}
</style>
</head>
<body>
<header>
<h1>Catálogo de n8n dentro de grapScreen</h1>
<div class="sub">Extraído del código fuente oficial de n8n. Cada nodo es un descriptor ejecutable por el runner genérico. Agrupado igual que en el panel de nodos.</div>
<div class="kpis">
<div class="kpi"><div class="v">${total}</div><div class="l">nodos en total</div></div>
<div class="kpi"><div class="v">${triggers}</div><div class="l">disparadores</div></div>
<div class="kpi"><div class="v">${armable}</div><div class="l">disparadores activables</div></div>
${TRIGGER_MODES.map(
  (m) =>
    `<div class="kpi"><div class="v">${modeCounts[m.id]}</div><div class="l">${esc(m.label)}</div></div>`,
).join("")}
<div class="kpi"><div class="v">${withUrl}</div><div class="l">con URL base inferida</div></div>
<div class="kpi"><div class="v">${withCred}</div><div class="l">con credencial</div></div>
<div class="kpi"><div class="v">${withIcon}</div><div class="l">con logo real</div></div>
<div class="kpi"><div class="v">${withCat}</div><div class="l">con categoría de app</div></div>
</div>
<div class="bar">
<input type="search" id="q" placeholder="Buscar por nombre, clave, descripción, categoría o URL…" aria-label="Buscar nodos">
${GROUPS.map((g) => `<button data-f="${esc(g.id)}">${esc(g.title)}</button>`).join("")}
<button data-f="">Todo</button>
</div>
<div class="bar">${catButtons}</div>
</header>
<main id="main">${sections}<div class="empty" id="none" hidden>Sin resultados.</div></main>
<script>
var q=document.getElementById("q"),f="",fc="",btns=[].slice.call(document.querySelectorAll("[data-f]")),cbtns=[].slice.call(document.querySelectorAll("[data-cat]"));
var rows=[].slice.call(document.querySelectorAll("tr[data-s]"));
var grps=[].slice.call(document.querySelectorAll("section.grp"));
function apply(){
  var t=q.value.trim().toLowerCase(),shown=0;
  rows.forEach(function(r){
    var ok=(!t||r.dataset.s.indexOf(t)>=0)&&(!f||r.dataset.c===f)&&(!fc||r.dataset.cat===fc);
    r.hidden=!ok; if(ok)shown++;
  });
  grps.forEach(function(g){
    var vis=[].slice.call(g.querySelectorAll("tr[data-s]")).filter(function(r){return !r.hidden;});
    g.hidden=vis.length===0;
    var h=g.querySelector("h2 .n"); if(h)h.textContent=vis.length;
    [].slice.call(g.querySelectorAll("h3")).forEach(function(sec){
      var n=[].slice.call(g.querySelectorAll('tr[data-cat="'+sec.dataset.sec+'"]')).filter(function(r){return !r.hidden;}).length;
      sec.hidden=n===0;
      var sn=sec.querySelector(".n"); if(sn)sn.textContent=n;
      if(sec.nextElementSibling&&sec.nextElementSibling.tagName==="TABLE")sec.nextElementSibling.hidden=n===0;
    });
  });
  document.getElementById("none").hidden=shown>0;
}
q.addEventListener("input",apply);
btns.forEach(function(b){b.addEventListener("click",function(){
  f=b.dataset.f; btns.forEach(function(o){o.classList.toggle("on",o===b);}); apply();
});});
cbtns.forEach(function(b){b.addEventListener("click",function(){
  fc=(fc===b.dataset.cat)?"":b.dataset.cat;
  cbtns.forEach(function(o){o.classList.toggle("on",o.dataset.cat===fc);}); apply();
});});
document.querySelector('[data-f=""]').classList.add("on");
</script>
</body>
</html>`;

await writeFile(OUT, html);
console.log(`informe escrito: ${path.relative(ROOT, OUT)} (${total} nodos)`);
