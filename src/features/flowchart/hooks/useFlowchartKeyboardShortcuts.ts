import { useEffect, useRef } from "react";
import type { FlowNode, FlowConnection, StickyNoteData } from "../../../types";

interface KeyboardShortcutsProps {
  nodes: FlowNode[];
  selectedNodes: Set<string>;
  setSelectedNodes: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectedWireId: string | null;
  setSelectedWireId: React.Dispatch<React.SetStateAction<string | null>>;
  connections: FlowConnection[];
  setConnections: React.Dispatch<React.SetStateAction<FlowConnection[]>>;
  notes: StickyNoteData[];
  positions: Record<string, { x: number; y: number }>;
  disabledNodes: Set<string>;
  deleteSelectedElements: () => void;
  saveLayoutMetadata: (positions: any, connections: any, notes: any, disabledNodes: any) => void;
  duplicateNode?: (nodeId: string) => void;
  dragRef: React.MutableRefObject<any>;
}

export function useFlowchartKeyboardShortcuts({
  nodes,
  selectedNodes,
  setSelectedNodes,
  selectedWireId,
  setSelectedWireId,
  connections,
  setConnections,
  notes,
  positions,
  disabledNodes,
  deleteSelectedElements,
  saveLayoutMetadata,
  duplicateNode,
  dragRef,
}: KeyboardShortcutsProps) {
  const clipboardRef = useRef<string[]>([]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      const overlayOpen = document.querySelector(".ub-overlay, .modal-backdrop, .ndp, .ub-gen-overlay, .n8n-addmenu");

      if (e.key === "Escape") {
        if (overlayOpen || isTyping) return;
        setSelectedNodes(new Set());
        setSelectedWireId(null);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        if (isTyping || overlayOpen) return;
        e.preventDefault();
        setSelectedNodes(new Set(nodes.filter((n) => n.type !== "start").map((n) => n.id)));
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        if (isTyping || overlayOpen) return;
        clipboardRef.current = Array.from(selectedNodes);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        if (isTyping || overlayOpen || !duplicateNode) return;
        if (clipboardRef.current.length === 0) return;
        e.preventDefault();
        clipboardRef.current.forEach((id) => duplicateNode(id));
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        if (isTyping || overlayOpen || !duplicateNode) return;
        e.preventDefault();
        selectedNodes.forEach((id) => duplicateNode(id));
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (isTyping) return;
        if (document.querySelector(".ub-overlay, .modal-backdrop, .ndp, .ub-gen-overlay")) return;

        if (selectedWireId) {
          e.preventDefault();
          const next = connections.filter((c) => c.id !== selectedWireId);
          setConnections(next);
          setSelectedWireId(null);
          saveLayoutMetadata(positions, next, notes, disabledNodes);
          return;
        }
        if (dragRef.current) return;
        e.preventDefault();
        deleteSelectedElements();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedNodes, selectedWireId, connections, notes, positions, disabledNodes, nodes]);
}
