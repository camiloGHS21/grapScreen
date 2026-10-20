import {
  Sparkles,
  Globe,
  GitBranch,
  Database,
  Code2,
  UserCheck,
  Zap,
  MousePointer,
  type LucideIcon,
} from "lucide-react";
import type { FlowNodeType } from "../../../types";

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
  comingSoon?: boolean;
  comingSoonReason?: string;
  setupNote?: string;
  n8nKey?: string;
  n8nMode?: string | null;
  n8nCategory?: string | null;
  n8nIcon?: string | null;
  n8nInitial?: string;
  accent?: string;
}

export interface CatalogGroup {
  id: NodeGroupId;
  title: string;
  desc: string;
  icon: LucideIcon;
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

export const N8N_GROUP_ACCENT: Record<string, string> = {
  trigger: "#ff6d5a",
  action: "#0f9d58",
  core: "#06b6d4",
  ai: "#a855f7",
};

export const INTEGRATED_SECTION = "Integrados";

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

export const n8nCategoryRank = (slug: string | null | undefined) => {
  const i = N8N_CATEGORY_ORDER.indexOf(slug || "");
  return i < 0 ? N8N_CATEGORY_ORDER.length : i;
};
