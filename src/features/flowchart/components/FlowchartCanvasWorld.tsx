import React from "react";
import { Plus } from "lucide-react";
import type { FlowNode, FlowConnection, StickyNoteData, RecordedEvent } from "../../../types";
import { FlowchartCanvas } from "../FlowchartCanvas";
import { StickyNote } from "./StickyNote";
import { FlowchartNodeGroup } from "./FlowchartNodeGroup";
import { NODE_W } from "../../../Flowchart";

interface FlowchartCanvasWorldProps {
  viewport: { x: number; y: number; k: number };
  nodes: FlowNode[];
  layout: Record<string, { x: number; y: number }>;
  activeNodeIdx: number;
  tempLine: any;
  disabledNodes: Set<string>;
  connections: FlowConnection[];
  handleWireMouseDown: any;
  selectedWireId: string | null;
  setConnections: React.Dispatch<React.SetStateAction<FlowConnection[]>>;
  saveLayoutMetadata: any;
  positions: any;
  notes: StickyNoteData[];
  toWorld: any;
  dragNoteRef: any;
  setNotes: any;
  containerRef: any;
  setCtxMenu: any;
  nodeStatuses?: Record<string, string>;
  expanded: any;
  setExpanded: any;
  selectedNodes: Set<string>;
  setSelectedNodes: any;
  dragRef: any;
  draggedRef: any;
  connectRef: any;
  setTempLine: any;
  /** Called when the empty-canvas CTA is clicked — opens the right-hand panel. */
  onOpenPanel?: () => void;
  isEditingGroup: boolean;
  setIsEditingGroup: any;
  editEventsList: RecordedEvent[];
  setEditEventsList: any;
  handleSaveGroupedEvents: any;
  events: RecordedEvent[];
  portY: any;
  onNodeClick: (node: FlowNode) => void;
  /** Opens the catalogue panel wired to a specific node output port. */
  onRequestAddFrom?: (sourceNodeId: string, sourcePortId: string) => void;
  /** Fired when any canvas node is clicked — dismisses the catalogue panel. */
  onNodeActivate?: () => void;
}

export function FlowchartCanvasWorld({
  viewport,
  nodes,
  layout,
  activeNodeIdx,
  tempLine,
  disabledNodes,
  connections,
  handleWireMouseDown,
  selectedWireId,
  setConnections,
  saveLayoutMetadata,
  positions,
  notes,
  toWorld,
  dragNoteRef,
  setNotes,
  containerRef,
  setCtxMenu,
  nodeStatuses,
  expanded,
  setExpanded,
  selectedNodes,
  setSelectedNodes,
  dragRef,
  draggedRef,
  connectRef,
  setTempLine,
  onOpenPanel,
  isEditingGroup,
  setIsEditingGroup,
  editEventsList,
  setEditEventsList,
  handleSaveGroupedEvents,
  events,
  portY,
  onNodeClick,
  onRequestAddFrom,
  onNodeActivate,
}: FlowchartCanvasWorldProps) {
  return (
    <div className="n8n-world" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.k})`, transformOrigin: "0 0" }}>
      <FlowchartCanvas
        nodes={nodes}
        layout={layout}
        activeNode={activeNodeIdx}
        tempLine={tempLine}
        disabledNodes={disabledNodes}
        connections={connections}
        onWireMouseDown={handleWireMouseDown}
        selectedWireId={selectedWireId}
        onWireClick={(id) => {
          const next = connections.filter((c) => c.id !== id);
          setConnections(next);
          saveLayoutMetadata(positions, next, notes, disabledNodes);
        }}
      />
      {notes.map((note) => (
        <StickyNote
          key={note.id}
          note={note}
          toWorld={toWorld}
          dragNoteRef={dragNoteRef}
          notes={notes}
          setNotes={setNotes}
          saveLayoutMetadata={saveLayoutMetadata}
          positions={positions}
          connections={connections}
          disabledNodes={disabledNodes}
          containerRef={containerRef}
          setCtxMenu={setCtxMenu}
          isSelected={selectedNodes.has(note.id)}
          selectedNodes={selectedNodes}
          setSelectedNodes={setSelectedNodes}
        />
      ))}
      {nodes.map((node, idx) => (
        <FlowchartNodeGroup
          key={node.id}
          node={node}
          idx={idx}
          activeNodeIdx={activeNodeIdx}
          execStatus={nodeStatuses?.[node.id]}
          expanded={expanded}
          setExpanded={setExpanded}
          disabledNodes={disabledNodes}
          selectedNodes={selectedNodes}
          setSelectedNodes={setSelectedNodes}
          dragRef={dragRef}
          draggedRef={draggedRef}
          toWorld={toWorld}
          connectRef={connectRef}
          setTempLine={setTempLine}
          connections={connections}
          setConnections={setConnections}
          layout={layout}
          positions={positions}
          notes={notes}
          saveLayoutMetadata={saveLayoutMetadata}
          containerRef={containerRef}
          setCtxMenu={setCtxMenu}
          isEditingGroup={isEditingGroup}
          setIsEditingGroup={setIsEditingGroup}
          editEventsList={editEventsList}
          setEditEventsList={setEditEventsList}
          handleSaveGroupedEvents={handleSaveGroupedEvents}
          events={events}
          nodes={nodes}
          portY={portY}
          onEditNode={onNodeClick}
          onRequestAddFrom={onRequestAddFrom}
          onNodeActivate={onNodeActivate}
        />
      ))}
      {nodes.length === 0 && (
        <button
          type="button"
          className="n8n-empty-add"
          style={{ left: (layout["start"]?.x ?? 40) + NODE_W + 90, top: (layout["start"]?.y ?? 60) - 14 }}
          onClick={() => {
            onOpenPanel?.();
          }}
        >
          <Plus size={17} />
          <span>Añade tu primer nodo</span>
          <small>desde el panel o con el botón +</small>
        </button>
      )}
    </div>
  );
}
