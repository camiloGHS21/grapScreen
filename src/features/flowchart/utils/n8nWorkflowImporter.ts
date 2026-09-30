import type { FlowConnection, RecordedEvent, StickyNoteData } from "../../../types";
import { withGraphMetadata } from "./layoutMetadata";
import { N8N_ENTRIES, isN8nTrigger, type N8nCatalogEntry } from "./n8nParity";
import {
  type N8nWorkflowNode,
  type N8nWorkflowData,
  type N8nImportResult,
  cleanN8nType,
  resolveSourcePortId,
  resolveTargetPortId,
} from "./n8nImporterTypes";
import { populateCoreNodeData } from "./n8nImporterPayload";

export type { N8nWorkflowNode, N8nConnectionItem, N8nWorkflowData, N8nImportResult } from "./n8nImporterTypes";

const LOWER_CATALOG = new Map<string, N8nCatalogEntry>();
for (const entry of N8N_ENTRIES) {
  LOWER_CATALOG.set(entry.key.toLowerCase(), entry);
}

function resolveCoreNodeKind(typeStem: string): string | null {
  const map: Record<string, string> = {
    if: "condition",
    switch: "switch",
    code: "code",
    merge: "merge",
    wait: "wait",
    splitinbatches: "split_batches",
    stopanderror: "stop_error",
    noop: "noop",
    filter: "filter",
    sort: "sort",
    limit: "limit",
    aggregate: "aggregate",
    set: "edit_fields",
    editfields: "edit_fields",
    datetime: "date_time",
    manualtrigger: "start",
    start: "start",
    scheduletrigger: "cron",
    webhook: "webhook",
    agent: "ai_agent",
    // Native n8n Utility nodes
    executecommand: "run_cmd",
    readwritefile: "read_file",
    readbinaryfile: "read_file",
    readbinaryfiles: "read_file",
    writebinaryfile: "write_file",
    spreadsheetfile: "excel_local",
    // Native n8n Database nodes
    mysql: "mysql",
    redis: "redis",
    mongodb: "mongodb",
    postgres: "postgres",
    httprequest: "http_request",
    // Native n8n Google SDKs
    googledocs: "google_docs",
    googleslides: "google_slides",
    googlechat: "google_chat",
    googledrive: "google_drive",
  };
  return map[typeStem.toLowerCase()] || null;
}

function translateSingleNode(
  node: N8nWorkflowNode,
  idx: number,
  baseTime: number,
): { event: RecordedEvent; canvasNodeId: string } {
  const rawType = node.type || "n8n-nodes-base.noOp";
  const typeStem = cleanN8nType(rawType);
  const coreKind = resolveCoreNodeKind(typeStem);
  const catalogEntry = LOWER_CATALOG.get(typeStem.toLowerCase());
  const params = (node.parameters || {}) as Record<string, unknown>;
  const dataId = node.id ? `n8n_${node.id.replace(/[^a-zA-Z0-9_-]/g, "_")}` : `n8n_gen_${idx}_${Date.now()}`;

  let kind = "n8n_node";
  let eventData: Record<string, unknown> = {
    id: dataId,
    n8n_id: node.id,
    custom_name: node.name,
    n8n_config: params,
    __manual: true,
  };

  if (node.credentials && typeof node.credentials === "object") {
    eventData.credentials = node.credentials;
    const credEntries = Object.entries(node.credentials);
    if (credEntries.length > 0) {
      const [credType, credVal] = credEntries[0];
      const typedCred = credVal as { id?: string; name?: string } | undefined;
      if (typedCred?.id) {
        eventData.credential_id = String(typedCred.id);
      }
      eventData.credential_type = credType;
    }
  }

  if (coreKind) {
    const populated = populateCoreNodeData(coreKind, node.name, params, eventData);
    kind = populated.kind;
    eventData = populated.eventData;
  } else if (catalogEntry) {
    const isTrigger = isN8nTrigger(catalogEntry);
    kind = isTrigger ? "n8n_trigger" : "n8n_node";
    eventData = {
      ...eventData,
      n8n_key: catalogEntry.key,
      n8n_name: node.name || catalogEntry.displayName,
      n8n_base_url: catalogEntry.baseUrl || "",
      n8n_trigger_mode: catalogEntry.triggerMode || "",
    };
  } else {
    const isLikelyTrigger = typeStem.toLowerCase().includes("trigger");
    kind = isLikelyTrigger ? "n8n_trigger" : "n8n_node";
    eventData = {
      ...eventData,
      n8n_key: typeStem,
      n8n_name: node.name || typeStem,
    };
  }

  const canvasNodeId = kind === "start" ? `trigger-${dataId}` : `${kind}-${dataId}`;
  const event: RecordedEvent = {
    at_ms: baseTime + idx * 100,
    kind,
    data: eventData,
  };
  return { event, canvasNodeId };
}

export function importN8nWorkflow(input: string | Record<string, unknown>): N8nImportResult {
  const data: N8nWorkflowData = typeof input === "string" ? JSON.parse(input) : input;
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  const connectionsMap = data.connections || {};
  const workflowName = (data.name || "Flujo importado de n8n").trim();

  const nodeMapByName = new Map<string, { canvasId: string; kind: string }>();
  const nodeMapById = new Map<string, { canvasId: string; kind: string }>();
  const positions: Record<string, { x: number; y: number }> = {};
  const notes: StickyNoteData[] = [];
  const disabledNodeIds: string[] = [];
  const events: RecordedEvent[] = [];

  let noteIdx = 0;
  nodes.forEach((node, idx) => {
    if (cleanN8nType(node.type || "").toLowerCase() === "stickynote") {
      const p = node.parameters || {};
      notes.push({
        id: `note_${Date.now()}_${noteIdx++}`,
        x: node.position ? node.position[0] : 100 + noteIdx * 40,
        y: node.position ? node.position[1] : 100 + noteIdx * 40,
        w: Number(p.width) || 240,
        h: Number(p.height) || 160,
        text: String(p.content || node.name || "Nota"),
      });
      return;
    }

    const { event, canvasNodeId } = translateSingleNode(node, idx, 1000);
    events.push(event);
    nodeMapByName.set(node.name, { canvasId: canvasNodeId, kind: event.kind });
    if (node.id) nodeMapById.set(node.id, { canvasId: canvasNodeId, kind: event.kind });

    positions[canvasNodeId] = {
      x: node.position ? node.position[0] : 200 + idx * 280,
      y: node.position ? node.position[1] : 240,
    };
    if (node.disabled) disabledNodeIds.push(canvasNodeId);
  });

  const connections: FlowConnection[] = [];
  const seenConns = new Set<string>();

  Object.entries(connectionsMap).forEach(([srcKey, categories]) => {
    const srcInfo = nodeMapByName.get(srcKey) || nodeMapById.get(srcKey);
    if (!srcInfo || !categories || typeof categories !== "object") return;

    Object.entries(categories).forEach(([category, outputGroups]) => {
      if (!Array.isArray(outputGroups)) return;
      outputGroups.forEach((targetList, outIdx) => {
        if (!Array.isArray(targetList)) return;
        const sourcePortId = resolveSourcePortId(srcInfo.kind, outIdx);

        targetList.forEach((targetItem) => {
          if (!targetItem || typeof targetItem !== "object") return;
          const tgtInfo = nodeMapByName.get(targetItem.node) || nodeMapById.get(targetItem.node);
          if (!tgtInfo) return;

          const targetPortId = resolveTargetPortId(tgtInfo.kind, category, targetItem.index || 0);
          const connKey = `${srcInfo.canvasId}:${sourcePortId}->${tgtInfo.canvasId}:${targetPortId}`;
          if (seenConns.has(connKey)) return;
          seenConns.add(connKey);

          connections.push({
            id: `c_${srcInfo.canvasId}_${sourcePortId}_${tgtInfo.canvasId}_${targetPortId}`,
            sourceNodeId: srcInfo.canvasId,
            sourcePortId,
            targetNodeId: tgtInfo.canvasId,
            targetPortId,
          });
        });
      });
    });
  });

  const layoutMeta: RecordedEvent = {
    kind: "layout_metadata",
    at_ms: 99999999,
    data: {
      positions,
      connections,
      notes,
      disabledNodeIds,
      graphNodes: [],
    },
  };

  const finalEvents = withGraphMetadata([...events, layoutMeta], null);

  return {
    events: finalEvents,
    summary: {
      name: workflowName,
      nodeCount: events.length,
      connectionCount: connections.length,
      notesCount: notes.length,
    },
  };
}
