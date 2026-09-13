import React from "react";
import { Copy, Eye, EyeOff, Trash2, Palette, Pencil, Play, FileJson } from "lucide-react";

import { FlowNode } from "../../../types";

interface ContextMenuProps {
  ctxMenu: { id: string; x: number; y: number; isNote?: boolean } | null;
  nodes: FlowNode[];
  disabledNodes: Set<string>;
  toggleDisabled: (id: string) => void;
  onAddStep?: (type: any, afterNodeId: string) => void;
  onDuplicateNode?: (nodeId: string) => void;
  onRenameNode?: (nodeId: string) => void;
  onExecuteUntil?: (nodeId: string) => void;
  onInspectNode?: (nodeId: string) => void;
  onEditNode?: (node: FlowNode) => void;
  setCtxMenu: (menu: any) => void;
  onDeleteNote?: (id: string) => void;
  onDuplicateNote?: (id: string) => void;
  onCycleNoteColor?: (id: string) => void;
  onDeleteNode?: (id: string) => void;
  /**
   * Cuántos elementos hay seleccionados y si el nodo del menú forma parte de
   * esa selección. Cuando es así, las acciones "de conjunto" (eliminar,
   * duplicar) se ofrecen sobre toda la selección en lugar de un solo nodo.
   */
  selectionCount?: number;
  ctxInSelection?: boolean;
  onDeleteSelection?: () => void;
}


export function ContextMenu({
  ctxMenu,
  nodes,
  disabledNodes,
  toggleDisabled,
  onAddStep,
  onDuplicateNode,
  onRenameNode,
  onExecuteUntil,
  onInspectNode,
  onEditNode,
  setCtxMenu,
  onDeleteNote,
  onDuplicateNote,
  onCycleNoteColor,
  onDeleteNode,
  selectionCount = 0,
  ctxInSelection = false,
  onDeleteSelection,
}: ContextMenuProps) {
  if (!ctxMenu) return null;

  if (ctxMenu.isNote) {
    return (
      <div
        className="n8n-ctx"
        style={{ left: ctxMenu.x, top: ctxMenu.y }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={() => { onDuplicateNote?.(ctxMenu.id); setCtxMenu(null); }}>
          <Copy size={13} /> Duplicar Nota
        </button>
        <button onClick={() => { onCycleNoteColor?.(ctxMenu.id); setCtxMenu(null); }}>
          <Palette size={13} /> Cambiar Color
        </button>
        <button className="danger" onClick={() => { onDeleteNote?.(ctxMenu.id); setCtxMenu(null); }}>
          <Trash2 size={13} /> Eliminar Nota
        </button>
      </div>
    );
  }

  const node = nodes.find(n => n.id === ctxMenu.id);
  const isDisabled = disabledNodes.has(ctxMenu.id);
  const isSystemNode = node && (node.type === "end" || node.id === "empty");
  // El menú se abrió sobre un nodo que forma parte de una selección múltiple:
  // el usuario está pensando en el conjunto, no en ese nodo suelto.
  const multiSelection = ctxInSelection && selectionCount > 1;

  return (
    <div
      className="n8n-ctx"
      style={{ left: ctxMenu.x, top: ctxMenu.y }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {multiSelection && (
        <>
          <div className="n8n-ctx-head">{selectionCount} elementos seleccionados</div>
          <button className="danger" onClick={() => { onDeleteSelection?.(); setCtxMenu(null); }}>
            <Trash2 size={13} /> Eliminar selección ({selectionCount})
          </button>
          <div className="n8n-ctx-sep" />
        </>
      )}
      {node && !isSystemNode && onEditNode && (
        <button onClick={() => { onEditNode(node); setCtxMenu(null); }}>
          <Pencil size={13} /> Configurar Parámetros
        </button>
      )}
      {onInspectNode && node && (
        <button onClick={() => { onInspectNode(node.id); setCtxMenu(null); }}>
          <FileJson size={13} /> Inspeccionar (Data / Pin)
        </button>
      )}
      {onExecuteUntil && !isSystemNode && (
        <button onClick={() => { onExecuteUntil(ctxMenu.id); setCtxMenu(null); }}>
          <Play size={13} /> Ejecutar hasta aquí
        </button>
      )}

      {!isSystemNode && onRenameNode && (
        <button onClick={() => { onRenameNode(ctxMenu.id); setCtxMenu(null); }}>
          <Pencil size={13} /> Renombrar
        </button>
      )}
      {!isSystemNode && (
        <button onClick={() => {
          if (onDuplicateNode) {
            onDuplicateNode(ctxMenu.id);
          } else if (node) {
            onAddStep?.(node.type, ctxMenu.id);
          }
          setCtxMenu(null);
        }}>
          <Copy size={13} /> Duplicar
        </button>
      )}
      <button onClick={() => toggleDisabled(ctxMenu.id)}>
        {isDisabled ? <Eye size={13} /> : <EyeOff size={13} />}
        {isDisabled ? "Habilitar" : "Deshabilitar"}
      </button>
      {!isSystemNode && (
        <button className="danger" onClick={() => { onDeleteNode?.(ctxMenu.id); setCtxMenu(null); }}>
          <Trash2 size={13} /> Eliminar
        </button>
      )}
    </div>
  );
}
export default ContextMenu;
