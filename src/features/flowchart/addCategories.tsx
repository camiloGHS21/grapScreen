import React from "react";
import {
  MousePointer, Keyboard, Move, Command,
  AppWindow, XCircle, ScanEye,
  Clock, GitBranch, Repeat,
  Terminal, Camera, Variable,
  FileSpreadsheet, FileText,
  MessageSquareCode, Send, Sparkles,
  ClipboardList, Globe, Code2, GitMerge,
  Pause, AlertTriangle, StickyNote, Zap, Route,
  Search, Play, FolderOpen, Layers,
  ListFilter, ArrowUpDown, Hash, Sigma, CalendarClock, Braces, ShieldCheck,
  Merge, GitCompare, FileJson, MessageSquare,
  Database, Radio,
  Rss, CodeXml, FileSearch, Mail, Slack, MessageCircle, NotebookPen, Table2,
  OctagonX, CircleSlash, Split, PenLine, Fingerprint, FileInput, FileOutput,
  FileCode,
} from "lucide-react";
import { FlowNodeType } from "../../types";
import { FLOW_TEMPLATE_CATALOG } from "../templates/catalog";
import { categoryIcon } from "../templates/components/templateIcons";

export interface AddCategory {
  title: string;
  items: { type: FlowNodeType; label: string; desc?: string; icon: React.ReactNode }[];
}

export const ADD_CATEGORIES: AddCategory[] = [
  {
    title: "Trigger",
    items: [
      { type: "trigger", label: "Inicio", desc: "Comienza la ejecución", icon: React.createElement(Zap, { size: 15 }) },
      { type: "webhook", label: "Webhook", desc: "Recibir HTTP", icon: React.createElement(Globe, { size: 15 }) },
      { type: "polling", label: "Polling (API)", desc: "Consultar API periódicamente", icon: React.createElement(Radio, { size: 15 }) },
      { type: "cron", label: "Intervalo / Cron", desc: "Ejecución programada", icon: React.createElement(Clock, { size: 15 }) },
      { type: "startup", label: "Al Iniciar", desc: "Al arrancar aplicación", icon: React.createElement(Play, { size: 15 }) },
      { type: "file_change", label: "Cambio de Archivo", desc: "Monitorear carpeta/archivo", icon: React.createElement(FolderOpen, { size: 15 }) },
      { type: "hotkey_trigger", label: "Atajo de Teclado", desc: "Atajo de teclado global", icon: React.createElement(Command, { size: 15 }) },
    ],
  },
  {
    title: "Interacción",
    items: [
      { type: "click", label: "Clic", desc: "Click del ratón", icon: React.createElement(MousePointer, { size: 15 }) },
      { type: "type", label: "Escribir", desc: "Texto con teclado", icon: React.createElement(Keyboard, { size: 15 }) },
      { type: "scroll", label: "Scroll", desc: "Desplazar pantalla", icon: React.createElement(Move, { size: 15 }) },
      { type: "hotkey", label: "Hotkey", desc: "Atajo de teclado", icon: React.createElement(Command, { size: 15 }) },
      { type: "form", label: "Formulario", desc: "UI interactiva", icon: React.createElement(ClipboardList, { size: 15 }) },
    ],
  },
  {
    title: "Aplicaciones",
    items: [
      { type: "open_app", label: "Abrir App", desc: "Lanzar aplicación", icon: React.createElement(AppWindow, { size: 15 }) },
      { type: "close_app", label: "Cerrar App", desc: "Terminar proceso", icon: React.createElement(XCircle, { size: 15 }) },
      { type: "wait_image", label: "Esperar Imagen", desc: "Detección visual", icon: React.createElement(ScanEye, { size: 15 }) },
    ],
  },
  {
    title: "Lógica",
    items: [
      { type: "delay", label: "Esperar", desc: "Pausa temporal", icon: React.createElement(Clock, { size: 15 }) },
      { type: "condition", label: "Condición", desc: "Si / Entonces", icon: React.createElement(GitBranch, { size: 15 }) },
      { type: "loop", label: "Bucle", desc: "Repetir N veces", icon: React.createElement(Repeat, { size: 15 }) },
      { type: "split_batches", label: "Por cada item", desc: "Bucle sobre array", icon: React.createElement(Layers, { size: 15 }) },
      { type: "switch", label: "Switch", desc: "Enrutar por valor", icon: React.createElement(Route, { size: 15 }) },
      { type: "sub_workflow", label: "Sub-Flujo", desc: "Ejecutar otra automatización", icon: React.createElement(GitMerge, { size: 15 }) },
      { type: "merge", label: "Merge", desc: "Combinar flujos", icon: React.createElement(GitMerge, { size: 15 }) },
      { type: "wait", label: "Wait", desc: "Esperar evento", icon: React.createElement(Pause, { size: 15 }) },
      { type: "error_handler", label: "Error Handler", desc: "Capturar errores", icon: React.createElement(AlertTriangle, { size: 15 }) },
      { type: "stop_error", label: "Detener y fallar", desc: "Abortar el flujo", icon: React.createElement(OctagonX, { size: 15 }) },
      { type: "noop", label: "No hacer nada", desc: "Dejar pasar los items", icon: React.createElement(CircleSlash, { size: 15 }) },
    ],
  },
  {
    title: "Sistema",
    items: [
      { type: "run_cmd", label: "Comando", desc: "Ejecutar en terminal", icon: React.createElement(Terminal, { size: 15 }) },
      { type: "screenshot", label: "Captura", desc: "Guardar pantalla", icon: React.createElement(Camera, { size: 15 }) },
      { type: "set_var", label: "Variable", desc: "Asignar valor", icon: React.createElement(Variable, { size: 15 }) },
      { type: "code", label: "Código", desc: "Script JS/Python", icon: React.createElement(Code2, { size: 15 }) },
    ],
  },
  {
    title: "Servicios",
    items: [
      { type: "google_sheets", label: "G. Sheets", desc: "Leer/escribir celdas", icon: React.createElement(FileSpreadsheet, { size: 15 }) },
      { type: "google_docs", label: "G. Docs", desc: "Documentos", icon: React.createElement(FileText, { size: 15 }) },
      { type: "http_request", label: "HTTP Request", desc: "Llamar API", icon: React.createElement(Globe, { size: 15 }) },
      { type: "excel_local", label: "Excel / CSV", desc: "Guardar en archivo local", icon: React.createElement(FileSpreadsheet, { size: 15 }) },
      { type: "send_email", label: "Enviar email", desc: "Correo por SMTP", icon: React.createElement(Mail, { size: 15 }) },
      { type: "notion", label: "Notion", desc: "Páginas y bases de datos", icon: React.createElement(NotebookPen, { size: 15 }) },
      { type: "airtable", label: "Airtable", desc: "Registros de una tabla", icon: React.createElement(Table2, { size: 15 }) },
      { type: "read_file", label: "Leer archivo", desc: "Leer del disco", icon: React.createElement(FileInput, { size: 15 }) },
      { type: "write_file", label: "Escribir archivo", desc: "Crear o añadir al disco", icon: React.createElement(FileOutput, { size: 15 }) },
    ],
  },
  {
    title: "Transformación",
    items: [
      { type: "filter", label: "Filtrar", desc: "Conservar items que cumplen", icon: React.createElement(ListFilter, { size: 15 }) },
      { type: "sort", label: "Ordenar", desc: "Ordenar por campos", icon: React.createElement(ArrowUpDown, { size: 15 }) },
      { type: "limit", label: "Limitar", desc: "Recortar número de items", icon: React.createElement(Hash, { size: 15 }) },
      { type: "aggregate", label: "Agregar", desc: "Sumar, contar o juntar", icon: React.createElement(Sigma, { size: 15 }) },
      { type: "edit_fields", label: "Editar campos", desc: "Añadir o quitar campos", icon: React.createElement(Variable, { size: 15 }) },
      { type: "date_time", label: "Fecha y hora", desc: "Formatear o calcular fechas", icon: React.createElement(CalendarClock, { size: 15 }) },
      { type: "remove_duplicates", label: "Eliminar duplicados", desc: "Quitar items repetidos", icon: React.createElement(Merge, { size: 15 }) },
      { type: "compare_datasets", label: "Comparar datasets", desc: "Detectar cambios", icon: React.createElement(GitCompare, { size: 15 }) },
      { type: "xml_parse", label: "Parsear XML", desc: "XML a items JSON", icon: React.createElement(CodeXml, { size: 15 }) },
      { type: "html_extract", label: "Extraer de HTML", desc: "Seleccionar con CSS", icon: React.createElement(FileSearch, { size: 15 }) },
      { type: "rss_read", label: "Leer RSS / Atom", desc: "Entradas de un feed", icon: React.createElement(Rss, { size: 15 }) },
      { type: "split_out", label: "Dividir lista", desc: "Lista interna a varios items", icon: React.createElement(Split, { size: 15 }) },
      { type: "summarize", label: "Resumir", desc: "Agrupar y agregar valores", icon: React.createElement(Sigma, { size: 15 }) },
      { type: "rename_keys", label: "Renombrar claves", desc: "Renombrar campos", icon: React.createElement(PenLine, { size: 15 }) },
      { type: "markdown", label: "Markdown", desc: "Markdown ↔ HTML", icon: React.createElement(FileCode, { size: 15 }) },
      { type: "crypto", label: "Criptografía", desc: "Hash, HMAC y aleatorio", icon: React.createElement(Fingerprint, { size: 15 }) },
    ],
  },
  {
    title: "Mensajería e IA",
    items: [
      { type: "whatsapp", label: "WhatsApp", desc: "Enviar mensajes", icon: React.createElement(MessageSquareCode, { size: 15 }) },
      { type: "telegram", label: "Telegram", desc: "Enviar alertas", icon: React.createElement(Send, { size: 15 }) },
      { type: "ai_agent", label: "Agente IA", desc: "Procesar con LLM", icon: React.createElement(Sparkles, { size: 15 }) },
      { type: "llm_chain", label: "Cadena LLM", desc: "Prompt a un modelo", icon: React.createElement(Braces, { size: 15 }) },
      { type: "classifier", label: "Clasificador", desc: "Categorizar texto", icon: React.createElement(ShieldCheck, { size: 15 }) },
      { type: "information_extractor", label: "Extraer información", desc: "Texto a estructura", icon: React.createElement(FileJson, { size: 15 }) },
      { type: "sentiment_analysis", label: "Análisis de sentimiento", desc: "Detectar el tono", icon: React.createElement(MessageSquare, { size: 15 }) },
      { type: "slack_webhook", label: "Slack", desc: "Mensaje a un canal", icon: React.createElement(Slack, { size: 15 }) },
      { type: "discord_webhook", label: "Discord", desc: "Mensaje a un canal", icon: React.createElement(MessageCircle, { size: 15 }) },
    ],
  },
  {
    title: "Base de datos",
    items: [
      { type: "sqlite_query", label: "SQLite: Consulta", desc: "SELECT sobre una base SQLite", icon: React.createElement(Database, { size: 15 }) },
      { type: "sqlite_execute", label: "SQLite: Ejecutar", desc: "INSERT / UPDATE / DELETE / DDL", icon: React.createElement(Database, { size: 15 }) },
    ],
  },
  {
    title: "Utilidad",
    items: [
      { type: "note", label: "Nota", desc: "Nota adhesiva", icon: React.createElement(StickyNote, { size: 15 }) },
    ],
  },
];

/**
 * The template list the add-node menu used to own.
 *
 * It is now a view over the marketplace catalog (`features/templates/catalog`)
 * rather than a second, hand-kept list of five entries: two sources of truth
 * meant a template could be offered in one place and missing from the other.
 * The shape is unchanged so existing callers keep compiling.
 */
export const FLOW_TEMPLATES: {
  id: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  chain: FlowNodeType[];
  steps: { type: FlowNodeType; data?: Record<string, unknown> }[];
}[] = FLOW_TEMPLATE_CATALOG.map((t) => ({
  id: t.id,
  label: t.title,
  desc: t.description,
  icon: categoryIcon(t.category, 15),
  chain: t.chain,
  steps: t.steps,
}));
