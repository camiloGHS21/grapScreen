import type { TemplateCategory } from "./types";

export interface CategoryMeta {
  id: TemplateCategory;
  label: string;
  blurb: string;
  /** Lucide icon name, resolved by the UI so this module stays data-only. */
  icon: string;
}

/**
 * Display order of the marketplace. Ordered by how often the category is the
 * first thing a new user reaches for, not alphabetically.
 */
export const TEMPLATE_CATEGORIES: CategoryMeta[] = [
  { id: "formularios-datos", label: "Formularios y datos", blurb: "Pedir datos y guardarlos donde haga falta", icon: "ClipboardList" },
  { id: "hojas-archivos", label: "Hojas y archivos", blurb: "Excel, CSV, Google Sheets y Docs", icon: "FileSpreadsheet" },
  { id: "notificaciones", label: "Notificaciones", blurb: "Avisar por Telegram, WhatsApp, Slack o correo", icon: "Bell" },
  { id: "ia-texto", label: "IA y texto", blurb: "Clasificar, resumir y extraer con un modelo", icon: "Sparkles" },
  { id: "web-apis", label: "Web y APIs", blurb: "Llamar APIs y recibir webhooks", icon: "Globe" },
  { id: "scraping-parseo", label: "Scraping y parseo", blurb: "Extraer de HTML, XML y RSS", icon: "FileSearch" },
  { id: "archivos-disco", label: "Archivos y disco", blurb: "Leer, escribir y organizar archivos", icon: "FolderOpen" },
  { id: "bases-datos", label: "Bases de datos", blurb: "Guardar y consultar en SQLite", icon: "Database" },
  { id: "escritorio-rpa", label: "Escritorio y RPA", blurb: "Automatizar clics, teclado y aplicaciones", icon: "MousePointer" },
  { id: "control-flujo", label: "Control de flujo", blurb: "Condiciones, bucles, lotes y errores", icon: "GitBranch" },
  { id: "programadas", label: "Programadas", blurb: "Ejecutar cada hora, cada día o al arrancar", icon: "Clock" },
  { id: "productividad", label: "Productividad", blurb: "Informes, seguimiento y tareas del equipo", icon: "ListChecks" },
];

export const CATEGORY_BY_ID: Record<TemplateCategory, CategoryMeta> = Object.fromEntries(
  TEMPLATE_CATEGORIES.map((c) => [c.id, c])
) as Record<TemplateCategory, CategoryMeta>;
