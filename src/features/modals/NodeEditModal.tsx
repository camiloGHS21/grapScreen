import React from "react";
import { FlowNode } from "../../types";
import { NodeDetailViewModal } from "../flowchart/ndv/NodeDetailViewModal";

export interface NodeEditModalProps {
  editingNode: {
    node: FlowNode;
    eventIndex: number;
    rangeStart?: number;
    rangeEnd?: number;
  } | null;
  setEditingNode: (node: any) => void;
  busy: boolean;
  deleteNodeStep: () => void;
  saveNodeEdit: () => void;
  state: any;
  onUpdateNodePin?: (nodeId: string, pinEnabled: boolean, pinnedData: any) => void;
}

/**
 * NodeEditModal serves as the entry point for configuring nodes.
 * It delegates directly to the 3-panel n8n-style NodeDetailViewModal (NDV)
 * with full input/output inspection, drag-and-drop mapping, and Rust execution.
 */
export function NodeEditModal({
  editingNode,
  setEditingNode,
  busy,
  deleteNodeStep,
  saveNodeEdit,
  state,
  onUpdateNodePin,
}: NodeEditModalProps) {
  if (!editingNode) return null;

  return (
    <NodeDetailViewModal
      editingNode={editingNode}
      setEditingNode={setEditingNode}
      busy={busy}
      deleteNodeStep={deleteNodeStep}
      saveNodeEdit={saveNodeEdit}
      state={state}
      onUpdateNodePin={onUpdateNodePin}
    />
  );
}

export default NodeEditModal;