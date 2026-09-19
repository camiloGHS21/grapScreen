import React from "react";
import {
  Sparkles, Globe, GitBranch, Database, Code2, UserCheck, Zap, Play, Clock,
  FolderOpen, Command, MousePointer, Keyboard, Move, ClipboardList,
  AppWindow, XCircle, ScanEye, Timer, Repeat, Layers, Route, GitMerge,
  Pause, AlertTriangle, Terminal, Camera, Variable, FileSpreadsheet,
  FileText, MessageSquareCode, Send, StickyNote, Braces, Table2, ListFilter,
  ArrowUpDown, Hash, Scissors, Sigma, CalendarClock, FileCode, Merge,
  GitCompare, Bot, MessageSquare, ShieldCheck, RefreshCw, FileJson, Image,
  Radio, Rss, CodeXml, FileSearch, Mail, Slack, MessageCircle, NotebookPen,
  OctagonX, CircleSlash, Split, PenLine, Fingerprint, FileInput, FileOutput,
  Blocks, Webhook,
  type LucideIcon,
} from "lucide-react";
import type { FlowNodeType } from "../../../types";
import {
  N8N_ENTRIES,
  N8N_HIDDEN,
  OWN_HIDDEN,
  honestFlag,
  isN8nTrigger,
  n8nRunnable,
  type N8nCatalogEntry,
} from "./n8nParity";

/**
 * n8n-style node catalog used by the right-hand contextual panel.
 *
 * Grouping follows n8n's own mental model (Triggers / Action in an app / Data
 * transformation / Flow / Core / Human review / AI) and every entry maps onto a
 * FlowNodeType the engine already understands.
 *
 * The complete official n8n catalogue (565 nodes) is generated from the n8n
 * source repository by `scripts/n8n-extract-descriptors.mjs` and merged into
 * those same groups rather than living in a parallel "n8n" section: the point
 * is that a Slack action and a hand-written HTTP action belong in the same
 * place. Those entries do not each get a FlowNodeType — there are far too many
 * — so they share the `n8n_node` / `n8n_trigger` engine kinds and carry their
 * identity in `n8nKey`. The hand-written entries are kept and stay first in
 * their group, under their own heading.
 */

export type NodeGroupId =
  | "trigger"
  | "ai"
  | "action"
  | "transform"
  | "flow"
  | "core"
  | "human"
  | "desktop";

export interface CatalogItem {
  type: FlowNodeType;
  label: string;
  desc: string;
  icon: LucideIcon;
  /** When set, the node is shown but flagged as not yet wired to the engine. */
  comingSoon?: boolean;
  /** Why it cannot run, shown in the tooltip next to "No disponible". */
  comingSoonReason?: string;
  /**
   * Shown for nodes that do run but need one more thing from the user
   * ("requiere URL base"). A badge, not a block: the node stays selectable.
   */
  setupNote?: string;
  /**
   * Which of the 565 n8n catalogue entries this is. Present only on the
   * data-driven entries; the engine stores it as `data.n8n_key` so the generic
   * runner can resolve the right descriptor.
   */
  n8nKey?: string;
  /**
   * For a trigger, how it receives its event (`webhook`, `polling`, `schedule`,
   * `event`). Detected from the n8n source by the extraction script, because the
   * catalogue's own flags only mark a quarter of the triggers. The engine reads
   * the same field from the descriptor; this copy exists so the editor can show
   * the right configuration fields and warn before a node is even placed.
   */
  n8nMode?: string | null;
  /**
   * n8n's own category for the app ("Communication", "Data & Storage", …),
   * read from the node's `.node.json`. The panel uses it to lay the catalogue
   * out the way n8n does instead of as one flat list of 300 integrations.
   */
  n8nCategory?: string | null;
  /**
   * File name of the app's real logo under `public/n8n-icons/`, extracted from
   * the n8n source. Null for the nodes that declare a built-in glyph instead of
   * an image, which fall back to the family icon.
   */
  n8nIcon?: string | null;
  /**
   * When the node has no `n8nIcon`, the side panel shows a coloured initial
   * badge ("S" for Slack) instead of a blank hole. This is the letter.
   */
  n8nInitial?: string;
  /** Per-item accent. Lets the generated entries keep their family colour. */
  accent?: string;
}

export interface CatalogGroup {
  id: NodeGroupId;
  title: string;
  desc: string;
  icon: LucideIcon;
  /** Trigger nodes only make sense at the head of a flow. */
  isTrigger?: boolean;
}

export const CATALOG_GROUPS: CatalogGroup[] = [
  {
    id: "trigger",
    title: "Disparadores",
    desc: "Inician el flujo de trabajo",
    icon: Zap,
    isTrigger: true,
  },
  {
    id: "ai",
    title: "IA",
    desc: "Agentes autónomos, resumir o buscar documentos",
    icon: Sparkles,
  },
  {
    id: "action",
    title: "Acción en una app",
    desc: "Hacer algo en una app o servicio",
    icon: Globe,
  },
  {
    id: "transform",
    title: "Transformación de datos",
    desc: "Manipular, filtrar o convertir datos",
    icon: Database,
  },
  {
    id: "flow",
    title: "Flujo",
    desc: "Ramificar, combinar o repetir el flujo",
    icon: GitBranch,
  },
  {
    id: "core",
    title: "Núcleo",
    desc: "Código, peticiones HTTP, variables",
    icon: Code2,
  },
  {
    id: "human",
    title: "Revisión humana",
    desc: "Pedir aprobación antes de continuar",
    icon: UserCheck,
  },
  {
    id: "desktop",
    title: "Escritorio",
    desc: "Control de ratón, teclado y pantalla",
    icon: MousePointer,
  },
];

/**
 * Family accent for the generated entries, per group.
 *
 * Kept in sync with `NODE_COLORS` in Flowchart.tsx, which is what the canvas
 * uses, so a node looks the same in the palette and once placed.
 */
const N8N_GROUP_ACCENT: Record<string, string> = {
  trigger: "#ff6d5a",
  action: "#0f9d58",
  core: "#06b6d4",
  ai: "#a855f7",
};

/**
 * Heading for the hand-written entries inside a merged group.
 *
 * They are deliberately kept and shown first, so the nodes that shipped with
 * the app stay where the user expects them and can be told apart from the
 * generated catalogue at a glance.
 */
export const INTEGRATED_SECTION = "Integrados";

/**
 * n8n's own category order, so the browse list reads the way n8n's does rather
 * than alphabetically. Anything not listed sorts last, alphabetically.
 *
 * The AI families are appended after the app categories. They come from the
 * LangChain node directories (`agents/`, `chains/`, `llms/`…), because that
 * package ships no `.node.json` for the generator to read. The two sets never
 * appear in the same group, so one list is enough — and it keeps a single sort
 * key instead of two parallel ones.
 */
export const N8N_CATEGORY_ORDER = [
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
  // LangChain families, in the order n8n's own panel lists them.
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

/** Human labels for n8n's category slugs. */
const N8N_CATEGORY_LABEL: Record<string, string> = {
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
  // LangChain families.
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

export const n8nCategoryLabel = (slug: string) => N8N_CATEGORY_LABEL[slug] || slug;

/** Sort key that follows `N8N_CATEGORY_ORDER`, with unknown slugs last. */
export const n8nCategoryRank = (slug: string | null | undefined) => {
  const i = N8N_CATEGORY_ORDER.indexOf(slug || "");
  return i < 0 ? N8N_CATEGORY_ORDER.length : i;
};

/**
 * How each trigger mechanism reads to the user in the palette.
 *
 * The `event` wording matters: those nodes (Kafka, MQTT, Redis, IMAP, manual)
 * cannot be armed by the engine without a client library, so the palette says
 * so rather than letting the user build a flow around a trigger that will never
 * fire.
 */
const N8N_TRIGGER_MODE_HINT: Record<string, string> = {
  webhook: "recibe un webhook",
  polling: "sondea la API",
  schedule: "por intervalo",
  event: "requiere un cliente externo",
};

/**
 * Turns the generated catalogue into panel entries for one merged group.
 *
 * The engine kind is chosen by the trigger flag rather than by category: a
 * trigger has no input port and may head a flow, an action has both. Everything
 * else about the node — base URL, auth scheme, name, logo — is read from the
 * descriptor at run time via `n8nKey`.
 */
/**
 * n8n's own node names end in "Trigger" ("Slack Trigger", "Gmail Trigger"…).
 * Inside the trigger group that is redundant — the user already knows they are
 * browsing triggers. Strip it so the label reads like n8n's panel.
 */
function cleanTriggerName(name: string): string {
  return name.replace(/\s+Trigger$/i, "");
}

/**
 * n8n shows a coloured initial badge for nodes that have no app logo. We do the
 * same: the first letter of the app name, tinted with the group's accent, so a
 * missing icon never leaves a blank hole.
 */
function initialBadge(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

function buildN8nItems(entries: N8nCatalogEntry[], groupId: NodeGroupId): CatalogItem[] {
  const seen = new Set<string>();
  return entries
    .filter((e) => !N8N_HIDDEN.has(e.key))
    // Only nodes this engine can actually execute stay in the palette: a step
    // the user adds must run, not sit disabled promising something it cannot
    // deliver. The reason a node is absent lives in `n8nParity.n8nRunnable`.
    .filter((e) => n8nRunnable(e))
    .slice()
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .filter((e) => (seen.has(e.key) ? false : seen.add(e.key)))
    .map((e) => {
      const isTrigger = isN8nTrigger(e);
      // What this entry can and cannot do here, decided once in `n8nParity`:
      // an entry with no runner is disabled with the reason, one that only
      // needs an API root keeps its place and says so.
      const flag = honestFlag(e);
      const modeHint = isTrigger ? N8N_TRIGGER_MODE_HINT[e.triggerMode ?? ""] : undefined;
      const suffix = [modeHint, flag.note, flag.reason]
        .filter(Boolean)
        .join(" · ");
      // The one agent node. It carries the n8n identity — name, logo, ports
      // and the parameter form generated from n8n's own descriptor — but it
      // is created as the `ai_agent` engine kind, which is the runner the Rust
      // side actually has for an agent. Every other AI entry is a LangChain
      // sub-node and stays out of the step palette (see `n8nParity`).
      const isAgent = e.key === "Agent";
      return {
        type: (isAgent ? "ai_agent" : isTrigger ? "n8n_trigger" : "n8n_node") as FlowNodeType,
        // In the trigger group, "Slack Trigger" → "Slack". The category heading
        // already says "Disparadores", so the suffix is noise.
        label: isTrigger ? cleanTriggerName(e.displayName) : e.displayName,
        desc: suffix ? `${e.description} · ${suffix}` : e.description,
        icon: isTrigger ? Webhook : Blocks,
        comingSoon: flag.comingSoon,
        comingSoonReason: flag.reason,
        setupNote: flag.note,
        n8nKey: e.key,
        n8nMode: e.triggerMode,
        // Triggers are organised by their real app category (Comunicación,
        // Productividad, etc.) just like actions — a single "Triggers" bucket
        // would dump 111 nodes into one list, which is what the user sees now.
        n8nCategory: e.appCategory,
        n8nIcon: e.icon,
        // For nodes with no logo, the side panel renders a coloured initial
        // badge using this field.
        n8nInitial: e.icon ? undefined : initialBadge(e.displayName),
        accent: N8N_GROUP_ACCENT[groupId],
      };
    });
}

const n8nBy = (category: string) => N8N_ENTRIES.filter((e) => e.category === category);

/**
 * The nodes that shipped with the app. Kept verbatim and listed first inside
 * each group so nothing the user already had disappears or moves.
 */
const HAND_WRITTEN: Record<NodeGroupId, CatalogItem[]> = {
  trigger: [
    { type: "trigger", label: "Manual", desc: "Ejecutar a mano", icon: Play },
    { type: "cron", label: "Programado", desc: "Cada día, hora o intervalo", icon: Clock },
    { type: "webhook", label: "Webhook", desc: "Al recibir una petición HTTP", icon: Globe },
    { type: "polling", label: "Polling (API)", desc: "Consultar una API periódicamente", icon: Radio },
    { type: "startup", label: "Al iniciar", desc: "Al arrancar la aplicación", icon: Zap },
    { type: "file_change", label: "Cambio de archivo", desc: "Vigilar carpeta o archivo", icon: FolderOpen },
    { type: "hotkey_trigger", label: "Atajo de teclado", desc: "Atajo global del sistema", icon: Command },
    { type: "form", label: "Formulario", desc: "Al enviar un formulario", icon: ClipboardList },
    { type: "whatsapp_trigger", label: "WhatsApp Business", desc: "Al recibir un mensaje de WhatsApp", icon: MessageSquareCode },
    { type: "telegram_trigger", label: "Telegram Bot", desc: "Al recibir un mensaje de Telegram", icon: Send },
    { type: "email_trigger", label: "Email (IMAP)", desc: "Al recibir un correo nuevo", icon: Mail },
    { type: "rss_trigger", label: "RSS Feed", desc: "Al publicarse una nueva entrada", icon: Rss },
  ],
  ai: [
    { type: "ai_agent", label: "Agente IA", desc: "Planifica y ejecuta con un LLM", icon: Sparkles },
    { type: "llm_chain", label: "Cadena LLM", desc: "Prompt a un modelo de lenguaje", icon: Braces },
    { type: "classifier", label: "Clasificador de texto", desc: "Categorizar contenido", icon: ShieldCheck },
    { type: "information_extractor", label: "Extraer información", desc: "Texto a estructura", icon: FileJson },
    { type: "sentiment_analysis", label: "Análisis de sentimiento", desc: "Detectar tono del texto", icon: MessageSquare },
  ],
  action: [
    { type: "http_request", label: "Petición HTTP", desc: "Llamar a cualquier API", icon: Globe },
    { type: "google_sheets", label: "Google Sheets", desc: "Leer o escribir celdas", icon: FileSpreadsheet },
    { type: "google_docs", label: "Google Docs", desc: "Crear o editar documentos", icon: FileText },
    { type: "excel_local", label: "Excel / CSV", desc: "Guardar en archivo local", icon: Table2 },
    { type: "send_email", label: "Enviar email", desc: "Correo por SMTP", icon: Mail },
    { type: "slack_webhook", label: "Slack", desc: "Mensaje a un canal", icon: Slack },
    { type: "discord_webhook", label: "Discord", desc: "Mensaje a un canal", icon: MessageCircle },
    { type: "notion", label: "Notion", desc: "Consultar o crear páginas", icon: NotebookPen },
    { type: "airtable", label: "Airtable", desc: "Listar o editar registros", icon: Table2 },
    { type: "open_app", label: "Abrir aplicación", desc: "Lanzar un programa", icon: AppWindow },
    { type: "close_app", label: "Cerrar aplicación", desc: "Terminar un proceso", icon: XCircle },
    // n8n Core — Read/Write Files from Disk.
    { type: "read_file", label: "Leer archivo", desc: "Leer un archivo del disco", icon: FileInput },
    { type: "write_file", label: "Escribir archivo", desc: "Crear, reemplazar o añadir a un archivo", icon: FileOutput },
  ],
  transform: [
    { type: "edit_fields", label: "Editar campos", desc: "Modificar o añadir campos", icon: Variable },
    { type: "filter", label: "Filtrar", desc: "Conservar items que cumplen", icon: ListFilter },
    { type: "sort", label: "Ordenar", desc: "Ordenar items por campo", icon: ArrowUpDown },
    { type: "limit", label: "Limitar", desc: "Restringir número de items", icon: Hash },
    { type: "aggregate", label: "Agregar", desc: "Sumar, contar o juntar items", icon: Sigma },
    { type: "date_time", label: "Fecha y hora", desc: "Manipular fechas y horas", icon: CalendarClock },
    { type: "split_batches", label: "Dividir en lotes", desc: "Separar items en grupos", icon: Layers },
    { type: "remove_duplicates", label: "Eliminar duplicados", desc: "Quitar items repetidos", icon: Merge },
    { type: "compare_datasets", label: "Comparar datasets", desc: "Detectar cambios", icon: GitCompare },
    { type: "xml_parse", label: "Parsear XML", desc: "XML a items JSON", icon: CodeXml },
    { type: "html_extract", label: "Extraer de HTML", desc: "Seleccionar con CSS", icon: FileSearch },
    { type: "rss_read", label: "Leer RSS / Atom", desc: "Entradas de un feed", icon: Rss },
    { type: "sqlite_query", label: "SQLite: Consulta", desc: "SELECT sobre una base SQLite", icon: Database },
    { type: "sqlite_execute", label: "SQLite: Ejecutar", desc: "INSERT / UPDATE / DELETE / DDL", icon: Database },
    // n8n's "Convert to File" used to sit here reusing the `run_cmd` type,
    // which made two different nodes share one engine kind and one label
    // ("Comando" in Núcleo). The node is a Core data node this engine does not
    // run, so it is offered as the n8n entry, flagged, instead of as a
    // mislabelled duplicate of the shell command node.
    // n8n Core — data shaping.
    { type: "split_out", label: "Dividir lista", desc: "Una lista dentro de un item a varios items", icon: Split },
    { type: "summarize", label: "Resumir", desc: "Agrupar y sumar, contar o promediar", icon: Sigma },
    { type: "rename_keys", label: "Renombrar claves", desc: "Renombrar campos de cada item", icon: PenLine },
    { type: "markdown", label: "Markdown", desc: "Convertir Markdown a HTML y viceversa", icon: FileCode },
    { type: "crypto", label: "Criptografía", desc: "Hash, HMAC y cadenas aleatorias", icon: Fingerprint },
  ],
  flow: [
    { type: "condition", label: "If", desc: "Ramificar verdadero / falso", icon: GitBranch },
    { type: "switch", label: "Switch", desc: "Enrutar según una expresión", icon: Route },
    { type: "loop", label: "Bucle", desc: "Repetir N veces", icon: Repeat },
    { type: "split_batches", label: "Por cada item", desc: "Iterar sobre un array", icon: Layers },
    { type: "merge", label: "Merge", desc: "Combinar varias ramas", icon: GitMerge },
    { type: "wait", label: "Wait", desc: "Esperar un evento", icon: Pause },
    { type: "delay", label: "Esperar tiempo", desc: "Pausa temporal", icon: Timer },
    { type: "sub_workflow", label: "Sub-flujo", desc: "Ejecutar otro flujo", icon: RefreshCw },
    { type: "error_handler", label: "Manejar error", desc: "Capturar y recuperar", icon: AlertTriangle },
    { type: "stop_error", label: "Detener y fallar", desc: "Abortar con un mensaje", icon: OctagonX },
    { type: "noop", label: "No hacer nada", desc: "Marcador que deja pasar los items", icon: CircleSlash },
  ],
  core: [
    { type: "code", label: "Código", desc: "Ejecutar JS o Python", icon: Code2 },
    { type: "http_request", label: "HTTP Request", desc: "Petición y respuesta", icon: Globe },
    { type: "set_var", label: "Variable", desc: "Definir un valor", icon: Variable },
    { type: "run_cmd", label: "Comando", desc: "Ejecutar en terminal", icon: Terminal },
    { type: "note", label: "Nota adhesiva", desc: "Anotación en el lienzo", icon: StickyNote },
  ],
  human: [
    { type: "telegram", label: "Telegram", desc: "Enviar y esperar respuesta", icon: Send },
    { type: "whatsapp", label: "WhatsApp", desc: "Aprobar por WhatsApp", icon: MessageSquareCode },
    { type: "form", label: "Formulario", desc: "Pedir datos a una persona", icon: ClipboardList },
    {
      type: "wait",
      label: "Esperar aprobación",
      desc: "Pausar hasta confirmación",
      icon: UserCheck,
      comingSoon: true,
      comingSoonReason: "el motor no tiene un paso de aprobación humana; usa Esperar tiempo",
    },
  ],
  desktop: [
    { type: "click", label: "Clic", desc: "Clic del ratón", icon: MousePointer },
    { type: "type", label: "Escribir", desc: "Texto por teclado", icon: Keyboard },
    { type: "scroll", label: "Scroll", desc: "Desplazar la pantalla", icon: Move },
    { type: "hotkey", label: "Atajo", desc: "Combinación de teclas", icon: Command },
    { type: "wait_image", label: "Esperar imagen", desc: "Detección visual en pantalla", icon: ScanEye },
    { type: "screenshot", label: "Captura", desc: "Guardar la pantalla", icon: Camera },
  ],
};

/**
 * The hand-written entries a group actually shows.
 *
 * Two filters, both from `n8nParity`: a kind whose capability is now covered by
 * an n8n node that really runs is dropped (the n8n entry is the visible one),
 * and a kind repeated inside one group keeps its first entry only. Nothing is
 * removed from the code or the engine — a saved flow still resolves its
 * `node.type`, it just cannot be added twice from the same list.
 */
function ownItems(group: NodeGroupId): CatalogItem[] {
  const seen = new Set<string>();
  return HAND_WRITTEN[group].filter(
    (item) => !OWN_HIDDEN.has(item.type) && (seen.has(item.type) ? false : seen.add(item.type)),
  );
}

const OWN_ITEMS: Record<NodeGroupId, CatalogItem[]> = {
  trigger: ownItems("trigger"),
  ai: ownItems("ai"),
  action: ownItems("action"),
  transform: ownItems("transform"),
  flow: ownItems("flow"),
  core: ownItems("core"),
  human: ownItems("human"),
  desktop: ownItems("desktop"),
};

/**
 * The panel's groups: the app's own nodes first, then the generated n8n
 * catalogue for the same group.
 *
 * Merging rather than keeping a parallel "n8n" section is the whole point — a
 * Slack action and the hand-written HTTP action are both "action in an app",
 * and n8n's own panel makes no such distinction either.
 */
// The AI catalogue carries both sub-nodes and the odd trigger (n8n's chat
// trigger lives under `AI`): each half belongs in a different group, so they
// are built separately rather than lumped into one list.
const AI_ENTRIES = n8nBy("AI");
const AI_TRIGGER_ITEMS = buildN8nItems(AI_ENTRIES.filter((e) => isN8nTrigger(e)), "trigger");
const AI_STEP_ITEMS = buildN8nItems(AI_ENTRIES.filter((e) => !isN8nTrigger(e)), "ai");

export const CATALOG_ITEMS: Record<NodeGroupId, CatalogItem[]> = {
  trigger: [
    ...OWN_ITEMS.trigger,
    ...AI_TRIGGER_ITEMS,
    ...buildN8nItems(n8nBy("Trigger"), "trigger"),
  ],
  ai: [...OWN_ITEMS.ai, ...AI_STEP_ITEMS],
  action: [
    ...OWN_ITEMS.action,
    ...buildN8nItems(n8nBy("App / Integration"), "action"),
  ],
  transform: OWN_ITEMS.transform,
  flow: OWN_ITEMS.flow,
  core: [...OWN_ITEMS.core, ...buildN8nItems(n8nBy("Core"), "core")],
  human: OWN_ITEMS.human,
  desktop: OWN_ITEMS.desktop,
};

/** The hand-written entries a group opens with, before the generated ones. */
export const INTEGRATED_ITEMS: Record<NodeGroupId, CatalogItem[]> = OWN_ITEMS;

/** How many hand-written entries a group opens with, before the generated ones. */
export const integratedCount = (group: NodeGroupId) => OWN_ITEMS[group].length;

/**
 * Groups the generated entries of a group by n8n's own app category, in n8n's
 * order, so a group with 300 integrations reads as a browsable list instead of
 * one wall of apps. Entries without a category land in a trailing section.
 */
export function categorisedN8nItems(
  group: NodeGroupId,
): { category: string | null; label: string; items: CatalogItem[] }[] {
  const buckets = new Map<string, CatalogItem[]>();
  for (const item of CATALOG_ITEMS[group]) {
    if (!item.n8nKey) continue;
    const key = item.n8nCategory || "";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(item);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => {
      const rank = n8nCategoryRank(a) - n8nCategoryRank(b);
      return rank !== 0 ? rank : a.localeCompare(b);
    })
    .map(([category, items]) => ({
      category: category || null,
      // n8n's built-in nodes carry only the internal `CoreNodes` marker, and the
      // LangChain wrappers carry none at all. Those are already sitting in the
      // right group, so they just need a neutral heading rather than a
      // "missing data" one.
      label: category ? n8nCategoryLabel(category) : "Otros",
      items,
    }));
}

/** Flat list of every catalog entry, used by the search mode. */
export const ALL_CATALOG_ITEMS: CatalogItem[] = CATALOG_GROUPS.flatMap(
  (g) => CATALOG_ITEMS[g.id],
);

/**
 * Node types that own a rich configuration form, so clicking one opens the
 * parameter drawer instead of the inline step editor.
 *
 * Single source of truth on purpose: this list used to be duplicated in
 * `useFlowchartEdit` and `NodeDetailPanel`, and the two drifted apart — the
 * detail panel fell back to the inline editor for every node added after
 * Phase 4. Keep it in sync with the forms rendered by `NodeEditModal`.
 */
export const ADVANCED_NODE_TYPES: ReadonlySet<string> = new Set([
  "sub_workflow", "http_request", "code", "webhook", "switch", "merge",
  "google_sheets", "google_docs", "whatsapp", "telegram", "ai_agent",
  "form", "excel_local", "condition", "loop", "split_batches", "set_var",
  "error_handler", "cron", "startup", "file_change", "hotkey_trigger", "trigger", "polling",
  "whatsapp_trigger", "telegram_trigger", "email_trigger", "rss_trigger",
  "filter", "sort", "limit", "aggregate", "edit_fields", "date_time",
  "llm_chain", "classifier",
  "remove_duplicates", "compare_datasets",
  "information_extractor", "sentiment_analysis",
  "sqlite_query", "sqlite_execute",
  // Phase 11 — parsing, integrations and flow control.
  "xml_parse", "html_extract", "rss_read",
  "send_email", "slack_webhook", "discord_webhook", "notion", "airtable",
  "wait", "scroll", "noop", "stop_error",
  // Desktop & system actions
  "click", "type", "delay", "hotkey", "open_app", "close_app", "wait_image", "screenshot", "run_cmd",
  // n8n Core nodes — all seven have a configuration form.
  "split_out", "summarize", "rename_keys", "markdown", "crypto",
  "read_file", "write_file",
  // Declarative n8n catalogue — both engine kinds open the generated form.
  "n8n_node", "n8n_trigger",
]);

export function groupOfItem(item: CatalogItem): CatalogGroup | undefined {
  return CATALOG_GROUPS.find((g) => CATALOG_ITEMS[g.id].some((it) => it === item));
}
