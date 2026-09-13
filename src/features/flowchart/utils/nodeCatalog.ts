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
  type LucideIcon,
} from "lucide-react";
import type { FlowNodeType } from "../../../types";

/**
 * n8n-style node catalog used by the right-hand contextual panel.
 *
 * Grouping follows n8n's own mental model (AI / Action in an app / Data
 * transformation / Flow / Core / Human review / Triggers) while every entry
 * maps onto a FlowNodeType the engine already understands.
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

export const CATALOG_ITEMS: Record<NodeGroupId, CatalogItem[]> = {
  trigger: [
    { type: "trigger", label: "Manual", desc: "Ejecutar a mano", icon: Play },
    { type: "cron", label: "Programado", desc: "Cada día, hora o intervalo", icon: Clock },
    { type: "webhook", label: "Webhook", desc: "Al recibir una petición HTTP", icon: Globe },
    { type: "polling", label: "Polling (API)", desc: "Consultar una API periódicamente", icon: Radio },
    { type: "startup", label: "Al iniciar", desc: "Al arrancar la aplicación", icon: Zap },
    { type: "file_change", label: "Cambio de archivo", desc: "Vigilar carpeta o archivo", icon: FolderOpen },
    { type: "hotkey_trigger", label: "Atajo de teclado", desc: "Atajo global del sistema", icon: Command },
    { type: "form", label: "Formulario", desc: "Al enviar un formulario", icon: ClipboardList },
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
    { type: "run_cmd", label: "Convertir a archivo", desc: "JSON a binario", icon: FileCode, comingSoon: true },
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
    { type: "wait", label: "Esperar aprobación", desc: "Pausar hasta confirmación", icon: UserCheck, comingSoon: true },
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
  "filter", "sort", "limit", "aggregate", "edit_fields", "date_time",
  "llm_chain", "classifier",
  "remove_duplicates", "compare_datasets",
  "information_extractor", "sentiment_analysis",
  "sqlite_query", "sqlite_execute",
  // Phase 11 — parsing, integrations and flow control.
  "xml_parse", "html_extract", "rss_read",
  "send_email", "slack_webhook", "discord_webhook", "notion", "airtable",
  "stop_error",
  // n8n Core nodes — all seven have a configuration form.
  "split_out", "summarize", "rename_keys", "markdown", "crypto",
  "read_file", "write_file",
]);

export function groupOfItem(item: CatalogItem): CatalogGroup | undefined {
  return CATALOG_GROUPS.find((g) => CATALOG_ITEMS[g.id].some((it) => it === item));
}
