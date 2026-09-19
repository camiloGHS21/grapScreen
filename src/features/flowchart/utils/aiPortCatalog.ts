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
 * `src/data/n8n-catalog.json` by its key, so the list cannot drift from n8n's
 * own names the way a hand-copied one did (it used to name OpenAI models that
 * do not exist in n8n at all, with camelCase keys that matched nothing).
 *
 * The engine's agent runs against an OpenAI-compatible endpoint, so the models
 * whose provider it supports say so in the description and the rest are marked
 * as not wired to the runner instead of silently pretending.
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
 * Everything else would be sent to the OpenAI endpoint and fail there, which is
 * worth saying up front.
 */
const SUPPORTED_PROVIDERS: Record<string, string> = {
  LmChatOpenAi: "openai",
  LmChatDeepSeek: "deepseek",
  LmChatGoogleGemini: "gemini",
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
 * Builds one palette entry out of a catalogue key. Returns `null` for a key
 * that is not in the catalogue: a missing node must not silently become a
 * blank row (the acceptance check greps for exactly this).
 */
export function subNodeItem(key: string, portId: string): CatalogItem | null {
  const entry = N8N_BY_KEY.get(key);
  if (!entry) return null;
  const provider = SUPPORTED_PROVIDERS[key];
  const desc =
    portId === "model" && !provider
      ? `${entry.description} · no conectado al ejecutor: el agente usa OpenAI, DeepSeek, Gemini, Ollama u OpenRouter`
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
    accent: ACCENT[portId],
  };
}

function items(portId: string, keys: string[]): CatalogItem[] {
  return keys
    .map((key) => subNodeItem(key, portId))
    .filter((item): item is CatalogItem => item !== null);
}

/**
 * Chat models, in n8n's own order. Kept to the models this engine can talk to
 * plus the ones n8n ships for the same slot, so the list reads like n8n's
 * without promising a provider that has no runner behind it.
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
      "El nodo de chat model conectado define el proveedor y el modelo que el agente usa al ejecutarse. Los modelos marcados no están conectados al ejecutor: el agente seguirá usando un proveedor compatible con OpenAI.",
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
