import React from "react";
import type { StickyNoteData } from "../../../types";

interface StickyNoteProps {
  note: StickyNoteData;
  toWorld: (clientX: number, clientY: number) => { x: number; y: number };
  dragNoteRef: React.MutableRefObject<{ id: string; offX: number; offY: number } | null>;
  notes: StickyNoteData[];
  setNotes: React.Dispatch<React.SetStateAction<StickyNoteData[]>>;
  saveLayoutMetadata: (positions: any, connections: any, notes: any, disabledNodes: any) => void;
  positions: any;
  connections: any;
  disabledNodes: any;
  containerRef: React.RefObject<HTMLDivElement>;
  setCtxMenu: React.Dispatch<React.SetStateAction<{ id: string; x: number; y: number; isNote?: boolean } | null>>;
  /** El recuadro de selección también marca notas: sin esto se seleccionaban
   *  por dentro pero no daban ninguna señal visual. */
  isSelected?: boolean;
  selectedNodes?: Set<string>;
  setSelectedNodes?: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export function StickyNote({
  note,
  toWorld,
  dragNoteRef,
  notes,
  setNotes,
  saveLayoutMetadata,
  positions,
  connections,
  disabledNodes,
  containerRef,
  setCtxMenu,
  isSelected = false,
  selectedNodes,
  setSelectedNodes,
}: StickyNoteProps) {
  // Posición donde empezó el botón derecho sobre esta nota, para no abrir el
  // menú contextual cuando el gesto fue un arrastre.
  const rightDownRef = React.useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      className={`n8n-note ${note.color || ""}${isSelected ? " selected" : ""}`}
      style={{ position: "absolute", left: note.x, top: note.y, width: note.w, height: note.h }}
      onMouseDown={(e) => {
        // Igual que los nodos: el derecho/central no debe llegar al lienzo,
        // donde arranca el paneo.
        if (e.button !== 0) {
          e.stopPropagation();
          if (e.button === 2) rightDownRef.current = { x: e.clientX, y: e.clientY };
          return;
        }
        e.stopPropagation();
        // Igual que los nodos: si la nota queda fuera de la selección, pasa a
        // ser la selección (con Shift se añade en vez de reemplazar).
        if (setSelectedNodes && selectedNodes && !selectedNodes.has(note.id)) {
          setSelectedNodes(e.shiftKey ? new Set([...selectedNodes, note.id]) : new Set([note.id]));
        }
        const w = toWorld(e.clientX, e.clientY);
        dragNoteRef.current = { id: note.id, offX: w.x - note.x, offY: w.y - note.y };
      }}
      onMouseUp={(e) => {
        const w = e.currentTarget.clientWidth;
        const h = e.currentTarget.clientHeight;
        if (w !== note.w || h !== note.h) {
          const next = notes.map((n) => (n.id === note.id ? { ...n, w, h } : n));
          setNotes(next);
          saveLayoutMetadata(positions, connections, next, disabledNodes);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        // Tras un arrastre con el derecho (recuadro de selección) no se abre
        // el menú: solo con un clic derecho seco.
        const down = rightDownRef.current;
        rightDownRef.current = null;
        if (down && (Math.abs(e.clientX - down.x) > 3 || Math.abs(e.clientY - down.y) > 3)) return;
        const rect = containerRef.current!.getBoundingClientRect();
        setCtxMenu({ id: note.id, x: e.clientX - rect.left, y: e.clientY - rect.top, isNote: true });
      }}
    >
      <div className="n8n-note-header">📝 Nota</div>
      <div className="n8n-note-body" onMouseDown={(e) => e.stopPropagation()}>
        <textarea
          className="n8n-note-textarea"
          value={note.text}
          onChange={(e) =>
            setNotes(notes.map((n) => (n.id === note.id ? { ...n, text: e.target.value } : n)))
          }
          onBlur={() => saveLayoutMetadata(positions, connections, notes, disabledNodes)}
          placeholder="Escribe una nota..."
        />
      </div>
    </div>
  );
}
export default StickyNote;
