import React from "react";
import { Plus, Map as MapIcon, Minus, Maximize, Wand2, StickyNote as StickyNoteIcon } from "lucide-react";
import { StickyNoteData } from "../../../types";

interface FlowchartControlsBarProps {
  viewport: { x: number; y: number; k: number };
  setViewport: React.Dispatch<React.SetStateAction<{ x: number; y: number; k: number }>>;
  fitView: () => void;
  autoLayout: () => void;
  notes: StickyNoteData[];
  setNotes: (notes: StickyNoteData[]) => void;
  saveLayoutMetadata: (pos: any, conns: any, notes: any, disabled: any) => void;
  positions: any;
  connections: any;
  disabledNodes: any;
  showMinimap: boolean;
  setShowMinimap: React.Dispatch<React.SetStateAction<boolean>>;
}

export function FlowchartControlsBar({
  viewport,
  setViewport,
  fitView,
  autoLayout,
  notes,
  setNotes,
  saveLayoutMetadata,
  positions,
  connections,
  disabledNodes,
  showMinimap,
  setShowMinimap,
}: FlowchartControlsBarProps) {
  return (
    <div className="n8n-zoom n8n-toolbar">
      <button type="button" title="Alejar" onClick={() => setViewport((v) => ({ ...v, k: Math.max(0.15, v.k - 0.1) }))}>
        <Minus size={13} />
      </button>
      <span>{Math.round(viewport.k * 100)}%</span>
      <button type="button" title="Acercar" onClick={() => setViewport((v) => ({ ...v, k: Math.min(2.5, v.k + 0.1) }))}>
        <Plus size={13} />
      </button>
      <div className="n8n-toolbar-sep" />
      <button type="button" title="Ajustar vista (encajar flujo)" onClick={fitView}>
        <Maximize size={13} />
      </button>
      <button type="button" title="Organizar nodos automáticamente" onClick={autoLayout}>
        <Wand2 size={13} />
      </button>
      <button type="button" title="Restablecer vista" onClick={() => setViewport({ x: 90, y: 80, k: 1 })}>
        ⌂
      </button>
      <div className="n8n-toolbar-sep" />
      <button
        type="button"
        title="Añadir nota adhesiva"
        onClick={() => {
          const colors = ["yellow", "green", "red", "blue"];
          const next = [
            ...notes,
            { id: `note-${Date.now()}`, x: 150, y: 150, w: 220, h: 110, text: "", color: colors[notes.length % colors.length] },
          ];
          setNotes(next);
          saveLayoutMetadata(positions, connections, next, disabledNodes);
        }}
      >
        <StickyNoteIcon size={13} />
      </button>
      <button
        type="button"
        title="Minimapa"
        onClick={() => setShowMinimap((m) => !m)}
        className={showMinimap ? "active" : ""}
      >
        <MapIcon size={13} />
      </button>
    </div>
  );
}
