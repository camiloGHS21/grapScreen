import type { RecordedEvent, FlowConnection } from "../../../types";
import type { N8nWorkflowData, N8nWorkflowNode } from "./n8nImporterTypes";

/**
 * Maps a grapScreen core node kind to an n8n canonical node type identifier.
 */
function mapKindToN8nType(kind: string, n8nKey?: string): { type: string; version: number } {
  if (n8nKey) {
    const key = n8nKey.trim();
    if (key.startsWith("@") || key.includes(".")) {
      return { type: key, version: 1 };
    }
    const lower = key.toLowerCase();
    if (lower === "agent") return { type: "@n8n/n8n-nodes-langchain.agent", version: 1.7 };
    return { type: `n8n-nodes-base.${key.charAt(0).toLowerCase() + key.slice(1)}`, version: 1 };
  }

  const kindLower = kind.toLowerCase();
  switch (kindLower) {
    case "condition":
    case "if":
      return { type: "n8n-nodes-base.if", version: 2.2 };
    case "switch":
      return { type: "n8n-nodes-base.switch", version: 3.2 };
    case "http_request":
      return { type: "n8n-nodes-base.httpRequest", version: 4.2 };
    case "cron":
    case "scheduletrigger":
      return { type: "n8n-nodes-base.scheduleTrigger", version: 1.2 };
    case "webhook":
      return { type: "n8n-nodes-base.webhook", version: 2 };
    case "ai_agent":
      return { type: "@n8n/n8n-nodes-langchain.agent", version: 1.7 };
    case "code":
      return { type: "n8n-nodes-base.code", version: 2 };
    case "run_cmd":
    case "executecommand":
      return { type: "n8n-nodes-base.executeCommand", version: 1 };
    case "read_file":
    case "write_file":
    case "readwritefile":
      return { type: "n8n-nodes-base.readWriteFile", version: 1 };
    case "mysql":
      return { type: "n8n-nodes-base.mySql", version: 2.4 };
    case "redis":
      return { type: "n8n-nodes-base.redis", version: 1 };
    case "mongodb":
      return { type: "n8n-nodes-base.mongoDb", version: 1.1 };
    case "postgres":
      return { type: "n8n-nodes-base.postgres", version: 2.5 };
    case "google_docs":
      return { type: "n8n-nodes-base.googleDocs", version: 2 };
    case "google_slides":
      return { type: "n8n-nodes-base.googleSlides", version: 1 };
    case "google_chat":
      return { type: "n8n-nodes-base.googleChat", version: 1 };
    case "google_drive":
      return { type: "n8n-nodes-base.googleDrive", version: 3 };
    case "excel_local":
    case "spreadsheetfile":
      return { type: "n8n-nodes-base.spreadsheetFile", version: 2 };
    default:
      return { type: "n8n-nodes-base.noOp", version: 1 };
  }
}

/**
 * Reconstructs parameters for a grapScreen node into n8n parameter schema.
 */
function extractN8nParameters(event: RecordedEvent): Record<string, unknown> {
  const d = event.data || {};
  if (d.n8n_config && typeof d.n8n_config === "object") {
    return { ...(d.n8n_config as Record<string, unknown>) };
  }

  const kind = (event.kind || "").toLowerCase();
  switch (kind) {
    case "http_request":
      return {
        url: d.url || "",
        method: d.method || "GET",
        sendBody: Boolean(d.body),
        body: d.body || "",
      };
    case "condition":
    case "if":
      return {
        conditions: {
          options: { caseSensitive: true },
          conditions: [
            {
              id: "cond-1",
              leftValue: d.condition || "",
              rightValue: "",
              operator: { type: "string", operation: "isNotEmpty" },
            },
          ],
        },
      };
    case "cron":
      return {
        rule: {
          interval: [{ field: "cronExpression", expression: d.cron || d.schedule || "* * * * *" }],
        },
      };
    case "webhook":
      return {
        path: d.path || "webhook",
        httpMethod: d.method || "POST",
        responseMode: "onReceived",
      };
    case "ai_agent":
      return {
        promptType: "define",
        text: d.prompt || d.user_prompt || "",
      };
    case "run_cmd":
      return { command: d.cmd || d.command || "" };
    case "read_file":
      return { operation: "read", fileName: d.file_path || d.path || "" };
    case "write_file":
      return { operation: "write", fileName: d.file_path || d.path || "", dataPropertyName: "data" };
    case "mysql":
    case "postgres":
      return { query: d.query || d.sql || "" };
    case "redis":
      return { operation: d.operation || "get", keyName: d.key || "" };
    case "mongodb":
      return { collection: d.collection || "", query: d.query || "{}" };
    case "code":
      return { jsCode: d.code || "" };
    default:
      return {};
  }
}

function appendConnection(
  connections: Record<string, Record<string, Array<Array<{ node: string; type: string; index: number }>>>>,
  fromName: string,
  toName: string,
  sourcePortId: string,
) {
  const port = (sourcePortId || "out").toLowerCase();
  let outIndex = 0;
  if (port === "false" || port === "case_1") {
    outIndex = 1;
  } else if (port.startsWith("case_")) {
    outIndex = parseInt(port.replace("case_", ""), 10) || 0;
  }

  if (!connections[fromName]) {
    connections[fromName] = { main: [] };
  }
  while (connections[fromName].main.length <= outIndex) {
    connections[fromName].main.push([]);
  }

  const list = connections[fromName].main[outIndex];
  if (!list.some((item) => item.node === toName)) {
    list.push({ node: toName, type: "main", index: 0 });
  }
}

/**
 * Converts grapScreen RecordedEvents into canonical n8n v1 workflow JSON format.
 */
export function exportN8nWorkflow(workflowName: string, events: RecordedEvent[]): N8nWorkflowData {
  const nodes: N8nWorkflowNode[] = [];
  const connections: Record<string, Record<string, Array<Array<{ node: string; type: string; index: number }>>>> = {};

  const idToNode = new Map<string, { event: RecordedEvent; name: string }>();

  // 1. Convert events to n8n nodes (skipping internal layout_metadata)
  let idx = 0;
  for (const event of events) {
    if (event.kind === "layout_metadata") continue;
    const d = event.data || {};
    const rawId = String(d.id || `node_${idx}`);
    const nodeId = String(d.n8n_id || rawId);
    const name = String(d.custom_name || d.name || `${event.kind}_${idx + 1}`);

    const ref = { event, name };
    idToNode.set(rawId, ref);
    idToNode.set(nodeId, ref);
    idToNode.set(name, ref);
    idToNode.set(`${event.kind}-${rawId}`, ref);
    idToNode.set(`trigger-${rawId}`, ref);
    if (d.custom_name) idToNode.set(String(d.custom_name), ref);
    if (d.name) idToNode.set(String(d.name), ref);

    const pos = (d.position as { x?: number; y?: number }) || {};
    const position: [number, number] = [Number(pos.x ?? idx * 240 + 80), Number(pos.y ?? 200)];

    const { type, version } = mapKindToN8nType(event.kind, d.n8n_key ? String(d.n8n_key) : undefined);
    const parameters = extractN8nParameters(event);

    const node: N8nWorkflowNode = {
      id: nodeId,
      name,
      type,
      typeVersion: version,
      position,
      parameters,
    };

    if (d.credentials && typeof d.credentials === "object") {
      node.credentials = d.credentials as Record<string, unknown>;
    } else if (d.credential_type && d.credential_id) {
      node.credentials = {
        [String(d.credential_type)]: { id: String(d.credential_id), name: String(d.credential_name || d.credential_type) },
      };
    }

    nodes.push(node);
    idx++;
  }

  const resolveRef = (key?: string) => {
    if (!key) return undefined;
    const direct = idToNode.get(key);
    if (direct) return direct;
    const dashIdx = key.indexOf("-");
    if (dashIdx > 0) return idToNode.get(key.slice(dashIdx + 1));
    return undefined;
  };

  // 2. Reconstruct connections from layout_metadata and event attributes
  const metaEvent = events.find((e) => e.kind === "layout_metadata");
  const metaConns = (metaEvent?.data?.connections as FlowConnection[]) || [];
  for (const c of metaConns) {
    if (!c.sourceNodeId || !c.targetNodeId) continue;
    const fromInfo = resolveRef(c.sourceNodeId);
    const toInfo = resolveRef(c.targetNodeId);
    if (!fromInfo || !toInfo) continue;
    appendConnection(connections, fromInfo.name, toInfo.name, c.sourcePortId || "out");
  }

  for (const event of events) {
    if (event.kind === "layout_metadata") continue;
    const d = event.data || {};
    const fromInfo = resolveRef(String(d.id || ""));
    if (!fromInfo) continue;

    const targets: Array<{ targetId: string; port: string }> = [];
    if (Array.isArray(d.__connections)) {
      for (const c of d.__connections) {
        if (c?.targetNodeId) targets.push({ targetId: String(c.targetNodeId), port: String(c.sourcePortId || "out") });
      }
    }
    if (d.next_action_id) targets.push({ targetId: String(d.next_action_id), port: "out" });
    if (d.branch_true_id) targets.push({ targetId: String(d.branch_true_id), port: "true" });
    if (d.branch_false_id) targets.push({ targetId: String(d.branch_false_id), port: "false" });

    for (const t of targets) {
      const toInfo = resolveRef(t.targetId);
      if (!toInfo) continue;
      appendConnection(connections, fromInfo.name, toInfo.name, t.port);
    }
  }

  return {
    name: workflowName || "grapScreen Workflow",
    nodes,
    connections,
    pinData: {},
    settings: {
      executionOrder: "v1",
    },
  };
}

/**
 * Triggers a browser file download of the workflow serialized as n8n JSON.
 */
export function downloadN8nWorkflow(workflowName: string, events: RecordedEvent[]): void {
  const data = exportN8nWorkflow(workflowName, events);
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = (workflowName || "workflow").replace(/[^a-zA-Z0-9_-]/g, "_");
  a.href = url;
  a.download = `${safeName}.n8n.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
