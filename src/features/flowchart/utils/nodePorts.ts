import { FlowNodeType, FlowPort } from "../../../types";
import { NODE_H } from "../../../Flowchart";

export { getNodeIcon } from "./nodeIcons";

const DEFAULT_IN: FlowPort[] = [{ id: "in", label: "Input" }];
const DEFAULT_OUT: FlowPort[] = [{ id: "out", label: "Output" }];

/** Vertical gap between two ports on the same side of a node. */
export const PORT_SPACING = 22;

/**
 * Height of a node box. Grows below the base height once a node has more than
 * two ports on one side (switch, merge, error_handler, ai_agent…).
 */
export function getNodeHeight(node: { type: FlowNodeType; ports?: { inputs: FlowPort[]; outputs: FlowPort[] } }): number {
  const ports = node.ports || getNodePorts(node.type);
  const sideInputs = ports.inputs.filter((p) => p.position !== "bottom");
  const maxPorts = Math.max(sideInputs.length, ports.outputs.length);
  return maxPorts > 2 ? NODE_H + (maxPorts - 2) * PORT_SPACING : NODE_H;
}

/**
 * Vertical offset of a port inside its node box, relative to the box top.
 */
export function portY(index: number, count: number, nodeH: number = NODE_H): number {
  if (count <= 1) return nodeH / 2;
  const totalH = (count - 1) * PORT_SPACING;
  return (nodeH - totalH) / 2 + index * PORT_SPACING;
}

/**
 * Horizontal offset along the node width for bottom ports.
 */
export function portBottomX(index: number, count: number, nodeW: number): number {
  if (count <= 0) return nodeW / 2;
  return (nodeW / (count + 1)) * (index + 1);
}

/**
 * Resolves the index of a port id within `ports`, tolerating legacy alias schemes.
 */
export function resolvePortIndex(ports: FlowPort[] | undefined, portId: string | undefined): number {
  if (!ports || ports.length === 0) return -1;
  if (!portId) return ports.length === 1 ? 0 : -1;

  const exact = ports.findIndex((p) => p.id === portId);
  if (exact >= 0) return exact;

  const ALIASES: Record<string, string[]> = {
    true: ["yes", "output0", "out0", "case0"],
    false: ["no", "output1", "out1"],
    case0: ["output0", "out0", "case_0"],
    case1: ["output1", "out1", "case_1"],
    case2: ["output2", "out2", "case_2"],
    default: ["fallback", "else", "output_default"],
    body: ["loop", "each"],
    done: ["end", "complete"],
  };
  const candidates = ALIASES[portId] || [];
  for (const candidate of candidates) {
    const idx = ports.findIndex((p) => p.id === candidate);
    if (idx >= 0) return idx;
  }

  const numeric = portId.match(/(\d+)$/);
  if (numeric) {
    const idx = Number(numeric[1]);
    if (idx >= 0 && idx < ports.length) return idx;
  }

  return -1;
}

export function getNodePorts(type: FlowNodeType): { inputs: FlowPort[]; outputs: FlowPort[] } {
  switch (type) {
    case "start":
    case "trigger":
    case "webhook":
    case "cron":
    case "startup":
    case "file_change":
    case "hotkey_trigger":
    case "polling":
    case "whatsapp_trigger":
    case "telegram_trigger":
    case "email_trigger":
    case "rss_trigger":
    case "n8n_trigger":
      return { inputs: [], outputs: [{ id: "out", label: "Output" }] };
    case "end":
    case "stop_error":
      return { inputs: [{ id: "in", label: "Input" }], outputs: [] };
    case "condition":
      return {
        inputs: DEFAULT_IN,
        outputs: [
          { id: "true", label: "Verdadero", color: "#22c55e" },
          { id: "false", label: "Falso", color: "#ef4444" },
        ],
      };
    case "loop":
      return {
        inputs: DEFAULT_IN,
        outputs: [
          { id: "body", label: "Cuerpo", color: "#f97316" },
          { id: "done", label: "Fin", color: "#22c55e" },
        ],
      };
    case "split_batches":
      return {
        inputs: DEFAULT_IN,
        outputs: [
          { id: "body", label: "Por item", color: "#f97316" },
          { id: "done", label: "Fin", color: "#22c55e" },
        ],
      };
    case "switch":
      return {
        inputs: DEFAULT_IN,
        outputs: [
          { id: "case0", label: "Caso 1", color: "#3b82f6" },
          { id: "case1", label: "Caso 2", color: "#8b5cf6" },
          { id: "case2", label: "Caso 3", color: "#f59e0b" },
          { id: "default", label: "Default", color: "#64748b" },
        ],
      };
    case "merge":
      return {
        inputs: [
          { id: "in1", label: "Input 1" },
          { id: "in2", label: "Input 2" },
        ],
        outputs: DEFAULT_OUT,
      };
    case "error_handler":
      return {
        inputs: [
          { id: "main", label: "Principal" },
          { id: "error", label: "Error", color: "#ef4444" },
        ],
        outputs: DEFAULT_OUT,
      };
    // The agent's connectors are n8n's own (`Agent/utils.ts`): one required
    // Chat Model plus the optional Memory, Tool and Output Parser. n8n also
    // declares a Fallback Model, but only when the node's `needsFallback`
    // option is on, and this engine has no fallback runner — so the port is
    // left out rather than shown as a connector nothing reads.
    case "ai_agent":
      return {
        inputs: [
          { id: "in", label: "Input", position: "left", shape: "circle" },
          { id: "model", label: "Chat Model*", color: "#a855f7", position: "bottom", shape: "diamond", required: true },
          { id: "memory", label: "Memory", color: "#ec4899", position: "bottom", shape: "diamond" },
          { id: "tool", label: "Tool", color: "#06b6d4", position: "bottom", shape: "diamond" },
          { id: "outputParser", label: "Output Parser", color: "#f59e0b", position: "bottom", shape: "diamond" },
        ],
        outputs: [
          { id: "out", label: "Output", position: "right", shape: "circle" },
        ],
      };
    case "note":
      return { inputs: [], outputs: [] };
    default:
      return { inputs: DEFAULT_IN, outputs: DEFAULT_OUT };
  }
}
