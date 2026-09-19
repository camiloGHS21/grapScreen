import type { FlowConnection, RecordedEvent } from "../../../types";
import { buildNodes } from "../buildNodes";
import { providerForModelKey } from "./aiPortCatalog";

/**
 * Keeps the agent node honest between n8n's shape and this engine's runner.
 *
 * n8n's Agent is configured with `promptType`, `text` and an `options`
 * collection (`systemMessage`, `maxIterations`) and takes its model from the
 * Chat Model wired to its `ai_languageModel` port. The Rust agent runner reads
 * `prompt`, `system_prompt`, `max_iterations`, `provider` and `model` off the
 * event instead, and has no notion of graph connections.
 *
 * This module is the bridge: on every save it translates the first into the
 * second, resolving the wired chat model into the provider the runner knows
 * how to call. It only ever *adds* fields — a flow's own parameters are never
 * removed, so nothing that ran before stops running.
 */

export const AGENT_N8N_KEY = "Agent";

/**
 * n8n's agent parameters → the fields the agent runner reads.
 *
 * `text` is left verbatim: n8n expressions (`={{ $json.chatInput }}`) are the
 * same `{{ … }}` the runner interpolates per item.
 */
export function n8nAgentRunnerFields(config: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!config || typeof config !== "object") return out;
  const cfg = config as Record<string, unknown>;

  const text = cfg.text;
  if (typeof text === "string" && text.trim()) out.prompt = text;

  const options = (cfg.options || {}) as Record<string, unknown>;
  const systemMessage = options.systemMessage;
  if (typeof systemMessage === "string" && systemMessage.trim()) {
    out.system_prompt = systemMessage;
  }
  const maxIterations = options.maxIterations;
  if (typeof maxIterations === "number" && maxIterations > 0) {
    out.max_iterations = maxIterations;
  }
  return out;
}

/**
 * The model name a chat-model node stores, under the parameter name the node
 * actually declares (`model`, or `modelName` for Gemini).
 */
export function chatModelName(config: unknown): string | null {
  if (!config || typeof config !== "object") return null;
  const cfg = config as Record<string, unknown>;
  for (const key of ["model", "modelName"]) {
    const value = cfg[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** True for the event of an agent node, whatever kind it was saved with. */
function isAgentEvent(event: RecordedEvent): boolean {
  if (event.kind === "ai_agent") return true;
  // Flows saved while the palette mapped the catalogue Agent onto `n8n_node`:
  // the engine can only try those as an HTTP call, so they are migrated.
  return event.kind === "n8n_node" && event.data?.n8n_key === AGENT_N8N_KEY;
}

/**
 * Rewrites agent events so the engine runs them as an agent.
 *
 * Returns the same array when there is nothing to do, so the common path stays
 * allocation-free.
 */
export function applyAgentParity(events: RecordedEvent[]): RecordedEvent[] {
  const agents = events.map((e, i) => (isAgentEvent(e) ? i : -1)).filter((i) => i >= 0);
  if (agents.length === 0) return events;

  const layout = events.find((e) => e.kind === "layout_metadata");
  const connections = (layout?.data?.connections || []) as FlowConnection[];
  const nodes = buildNodes(events);

  // Node id → the event that configures it, so a connection can be followed
  // back to the model node's parameters.
  const eventByNodeId = new Map<string, number>();
  for (const node of nodes) {
    if (node.eventIndex != null) eventByNodeId.set(node.id, node.eventIndex);
  }
  const nodeIdByEvent = new Map<number, string>();
  for (const node of nodes) {
    if (node.eventIndex != null) nodeIdByEvent.set(node.eventIndex, node.id);
  }

  const copy = [...events];
  let changed = false;

  for (const index of agents) {
    const event = copy[index];
    const data = { ...(event.data || {}) };
    const before = event.data || {};

    // The kind is what the graph engine dispatches on; the agent runner is the
    // only runner here that can execute an agent.
    const kind = "ai_agent";

    // Which side wins depends on where the node came from. A node created from
    // n8n's catalogue is configured with n8n's parameters, so those are the
    // user's explicit choice and they win over the placeholder defaults it was
    // born with. A flow's own agent is the opposite: its fields are the
    // configuration, and n8n's are only used to fill what is missing.
    const fromCatalogue = data.n8n_key === AGENT_N8N_KEY;
    const fields = n8nAgentRunnerFields(data.n8n_config);
    for (const [key, value] of Object.entries(fields)) {
      if (fromCatalogue || data[key] === undefined || data[key] === "") data[key] = value;
    }

    // The wired chat model decides the provider, as it does in n8n.
    const agentNodeId = nodeIdByEvent.get(index);
    if (agentNodeId) {
      const link = connections.find(
        (c) => c.targetNodeId === agentNodeId && c.targetPortId === "model",
      );
      const modelIndex = link ? eventByNodeId.get(link.sourceNodeId) : undefined;
      const modelData = modelIndex != null ? copy[modelIndex]?.data : undefined;
      const provider = providerForModelKey(modelData?.n8n_key as string | undefined);
      if (provider) {
        data.provider = provider;
        // The model node's own `model` parameter names what to call; without
        // one the provider's default stays in place.
        const modelName = chatModelName(modelData?.n8n_config);
        if (modelName) data.model = modelName;
      }
    }

    if (event.kind === kind && JSON.stringify(before) === JSON.stringify(data)) continue;
    copy[index] = { ...event, kind, data };
    changed = true;
  }

  return changed ? copy : events;
}
