import { FlowNode } from "../../../types";

export interface NdvInputItem {
  nodeId: string;
  nodeLabel: string;
  data: unknown;
  itemsCount: number;
}

export interface NdvDragData {
  path: string;
  expression: string;
  nodeName?: string;
  type: string;
}

export interface ExpressionPreviewResponse {
  result: unknown;
  is_valid: boolean;
  error?: string | null;
}

export interface NodeRunResult {
  node_id: string;
  label: string;
  status: string;
  detail: string | null;
  input_data: unknown | null;
  output_data: unknown | null;
  duration_ms: number | null;
}

export interface NdvModalProps {
  editingNode: {
    node: FlowNode;
    eventIndex: number;
    rangeStart?: number;
    rangeEnd?: number;
  } | null;
  setEditingNode: (node: { node: FlowNode; eventIndex: number; rangeStart?: number; rangeEnd?: number } | null) => void;
  busy: boolean;
  deleteNodeStep: () => void;
  saveNodeEdit: () => void;
  state: Record<string, unknown>;
}
