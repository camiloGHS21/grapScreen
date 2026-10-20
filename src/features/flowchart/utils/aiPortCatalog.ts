import {
  Sparkles, Database, Wrench, FileJson, type LucideIcon,
} from "lucide-react";
import type { CatalogItem } from "./nodeCatalog";
import { N8N_BY_KEY, type N8nCatalogEntry } from "./n8nParity";

/**
 * Sub-node catalogue for the agent's AI ports.
 *
 * n8n's agent is configured by wiring nodes into its `ai_languageModel`,
 * `ai_memory`, `ai_tool` and `ai_outputParser` connectors, and the palette that
 * opens from each port lists exactly those nodes. Every entry here is a real
 * catalogue node: the label, the description and the logo are read back from
 * `src/data/n8n-catalog.json` by its key.
 */

export interface PortCatalogSection {
  title?: string;
  items: CatalogItem[];
}

export interface PortCatalogConfig {
  portId: string;
  title: string;
  icon: LucideIcon;
  banner: string;
  sections: PortCatalogSection[];
}

/**
 * Providers the Rust agent runner can call (`integration_ai::execute_ai`).
 */
const SUPPORTED_PROVIDERS: Record<string, string> = {
  LmChatOpenAi: "openai",
  LmChatAnthropic: "anthropic",
  LmChatGoogleGemini: "gemini",
  LmChatDeepSeek: "deepseek",
  LmChatGroq: "groq",
  LmChatMistralCloud: "mistral",
  LmChatOllama: "ollama",
  LmChatOpenRouter: "openrouter",
};

/** Accent per family, so a model never looks like a memory. */
const ACCENT: Record<string, string> = {
  model: "#a855f7",
  memory: "#ec4899",
  tool: "#06b6d4",
  outputParser: "#f59e0b",
};

const FALLBACK_ICON: Record<string, LucideIcon> = {
  model: Sparkles,
  memory: Database,
  tool: Wrench,
  outputParser: FileJson,
};

/** First letter of the node's own name, for entries with no logo. */
function initialOf(entry: N8nCatalogEntry): string | undefined {
  return entry.icon ? undefined : entry.displayName.trim().charAt(0).toUpperCase();
}

/**
 * What the agent runner does with each port, as a badge on every entry.
 */
const PORT_RUNNER_NOTE: Record<string, string> = {
  memory: "se guarda con el agente; el ejecutor todavía no la usa",
  tool: "se guarda con el agente; el ejecutor todavía no lo usa",
  outputParser: "se guarda con el agente; el ejecutor todavía no lo usa",
};

/**
 * Builds one palette entry out of a catalogue key. Returns `null` for a key
 * that is not in the catalogue.
 */
export function subNodeItem(key: string, portId: string): CatalogItem | null {
  const entry = N8N_BY_KEY.get(key);
  if (!entry) return null;
  const provider = SUPPORTED_PROVIDERS[key];
  const unsupportedModel = portId === "model" && !provider;
  const desc = unsupportedModel
    ? `${entry.description} · no conectado al ejecutor: el agente soporta OpenAI, Anthropic, Gemini, DeepSeek, Groq, Mistral, Ollama u OpenRouter`
    : entry.description;
  return {
    type: "n8n_node",
    label: entry.displayName,
    desc,
    icon: FALLBACK_ICON[portId] || Sparkles,
    n8nKey: key,
    n8nIcon: entry.icon,
    n8nInitial: initialOf(entry),
    n8nCategory: entry.appCategory,
    setupNote: unsupportedModel ? "no conectado al ejecutor" : PORT_RUNNER_NOTE[portId],
    accent: ACCENT[portId],
  };
}

function items(portId: string, keys: string[]): CatalogItem[] {
  return keys
    .map((key) => subNodeItem(key, portId))
    .filter((item): item is CatalogItem => item !== null);
}

/**
 * Chat models, in n8n's own order.
 */
const MODEL_KEYS = [
  "LmChatOpenAi",
  "LmChatAnthropic",
  "LmChatGoogleGemini",
  "LmChatOllama",
  "LmChatDeepSeek",
  "LmChatGroq",
  "LmChatMistralCloud",
  "LmChatAzureOpenAi",
  "LmChatAwsBedrock",
  "LmChatOpenRouter",
];

const MEMORY_KEYS = ["MemoryBufferWindow"];

const MEMORY_OTHER_KEYS = [
  "MemoryMongoDbChat",
  "MemoryPostgresChat",
  "MemoryRedisChat",
  "MemoryXata",
  "MemoryZep",
  "MemoryMotorhead",
];

const TOOL_KEYS = [
  "AgentTool",
  "ToolWorkflow",
  "ToolCode",
  "ToolHttpRequest",
  "ToolVectorStore",
  "McpClientTool",
];

const PARSER_KEYS = ["OutputParserStructured", "OutputParserItemList", "OutputParserAutofixing"];

export const AI_PORT_CONFIGS: Record<string, PortCatalogConfig> = {
  model: {
    portId: "model",
    title: "Modelos de lenguaje",
    icon: Sparkles,
    banner:
      "El nodo de chat model conectado define el proveedor y el modelo que el agente usa al ejecutarse. Compatible con OpenAI, Anthropic, Gemini, DeepSeek, Groq, Mistral y Ollama local.",
    sections: [{ items: items("model", MODEL_KEYS) }],
  },
  memory: {
    portId: "memory",
    title: "Memoria",
    icon: Database,
    banner:
      "La memoria permite al modelo recordar interacciones anteriores. Se guarda como configuración del agente.",
    sections: [
      { title: "Para empezar", items: items("memory", MEMORY_KEYS) },
      { title: "Otras memorias", items: items("memory", MEMORY_OTHER_KEYS) },
    ],
  },
  tool: {
    portId: "tool",
    title: "Herramientas",
    icon: Wrench,
    banner:
      "Los tools permiten al agente ejecutar acciones o consultar servicios externos. Se conectan al puerto Tool del agente.",
    sections: [{ title: "Herramientas recomendadas", items: items("tool", TOOL_KEYS) }],
  },
  outputParser: {
    portId: "outputParser",
    title: "Analizadores de salida",
    icon: FileJson,
    banner:
      "Un analizador de salida obliga al modelo a devolver una estructura concreta en lugar de texto libre.",
    sections: [{ items: items("outputParser", PARSER_KEYS) }],
  },
};

/** Ports that open the AI sub-node palette instead of the step catalogue. */
export const AI_PORT_IDS = ["model", "memory", "tool", "outputParser"];

/** Where a sub-node lands relative to its agent, per port. */
export const AI_PORT_OFFSETS: Record<string, number> = {
  model: -180,
  memory: -60,
  tool: 60,
  outputParser: 180,
};

/**
 * The provider the agent must be told to use when this model is wired to its
 * model port, or `null` when the runner has no endpoint for it.
 */
export function providerForModelKey(key: string | null | undefined): string | null {
  if (!key) return null;
  return SUPPORTED_PROVIDERS[key] || null;
}
