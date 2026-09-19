import { useEffect, useMemo, useRef, useState } from "react";
import type { FlowNode, FlowConnection, StickyNoteData, RecordedEvent } from "../../../types";
import { buildNodes } from "../buildNodes";
import { getNodeHeight } from "../utils/nodePorts";
import { NODE_W } from "../../../Flowchart";
import { useFlowchartEventListeners } from "./useFlowchartEventListeners";
import { useFlowchartDeleteActions } from "./useFlowchartDeleteActions";
import { getConnectedNodeIds } from "../utils/graphUtils";
import { useDialog } from "../../../components/DialogProvider";
import { getDefaultConnections } from "../utils/connectionUtils";
import { extractLayoutMetadata, buildUpdatedMetadataEvents } from "../utils/layoutMetadata";
import { useWorkspaceActions } from "./useWorkspaceActions";
import { useNodeMutationActions } from "./useNodeMutationActions";

interface UseFlowchartWorkspaceProps {
  events: RecordedEvent[];
  target_app?: any;
  onSaveEvents?: (updatedEvents: RecordedEvent[]) => void;
  onDeleteTargetApp?: () => void;
  toWorld: (x: number, y: number) => { x: number; y: number };
  activeStep: number | null;
  activeNodeId?: string | null;
}

export function useFlowchartWorkspace({
  events,
  target_app,
  onSaveEvents,
  onDeleteTargetApp,
  toWorld,
  activeStep,
  activeNodeId,
}: UseFlowchartWorkspaceProps) {
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(() => {
    return extractLayoutMetadata(events).positions;
  });

  const [connections, setConnections] = useState<FlowConnection[]>(() => {
    const meta = extractLayoutMetadata(events);
    return meta.connections.length > 0 ? meta.connections : getDefaultConnections(events, target_app);
  });

  const [notes, setNotes] = useState<StickyNoteData[]>(() => {
    return extractLayoutMetadata(events).notes;
  });

  const [disabledNodes, setDisabledNodes] = useState<Set<string>>(() => {
    return extractLayoutMetadata(events).disabledNodeIds;
  });

  const [expanded, setExpanded] = useState<string | null>(null);
  const [tempLine, setTempLine] = useState<{ x1: number; y1: number; x2: number; y2: number; color?: string } | null>(null);
  const [editEventsList, setEditEventsList] = useState<RecordedEvent[]>([]);
  const [isEditingGroup, setIsEditingGroup] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ id: string; x: number; y: number; isNote?: boolean } | null>(null);
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [showMinimap, setShowMinimap] = useState(true);
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);

  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    active: boolean;
  } | null>(null);

  const { prompt } = useDialog();

  const nodes = useMemo(() => buildNodes(events, target_app), [events, target_app]);

  const connectedNodeIds = useMemo(() => {
    return getConnectedNodeIds(nodes, connections);
  }, [nodes, connections]);

  useEffect(() => {
    const metaEvent = events.find(e => e.kind === "layout_metadata");
    if (metaEvent && metaEvent.data) {
      setConnections(metaEvent.data.connections || []);
      setPositions(metaEvent.data.positions || {});
      setNotes(metaEvent.data.notes || []);
      setDisabledNodes(new Set(metaEvent.data.disabledNodeIds || []));
    } else {
      setPositions({});
      setNotes([]);
      setDisabledNodes(new Set());
      setConnections(getDefaultConnections(events, target_app));
    }
  }, [events, target_app]);

  useEffect(() => { setIsEditingGroup(false); }, [expanded]);

  useEffect(() => {
    if (!expanded) { setEditEventsList([]); return; }
    const node = nodes.find(n => n.id === expanded);
    if (node && node.start != null && node.end != null) {
      setEditEventsList(JSON.parse(JSON.stringify(events.slice(node.start, node.end + 1))));
    }
  }, [expanded, events, nodes]);

  const layout = useMemo(() => {
    const result: Record<string, { x: number; y: number }> = { ...positions };
    nodes.forEach((n, idx) => {
      if (!result[n.id]) {
        const extraH = n.ports && Math.max(n.ports.inputs.length, n.ports.outputs.length) > 2 ? 30 : 0;
        result[n.id] = { x: 40 + idx * (NODE_W + 100), y: 60 + (idx % 2 === 0 ? 0 : 100 + extraH) };
      }
    });
    return result;
  }, [nodes, positions]);

  const dragRef = useRef<{
    id: string;
    offX: number;
    offY: number;
    startX?: number;
    startY?: number;
    initialPositions?: Record<string, { x: number; y: number }>;
  } | null>(null);
  const dragNoteRef = useRef<{ id: string; offX: number; offY: number } | null>(null);
  const connectRef = useRef<{ from: string; portId: string; color: string; type: "input" | "output" } | null>(null);
  const draggedRef = useRef(false);

  const saveLayoutMetadata = (
    pos: any,
    conns: any,
    noteList: any,
    disabled: Set<string>,
    customEvents?: RecordedEvent[]
  ) => {
    const evs = customEvents || events;
    const sorted = buildUpdatedMetadataEvents(evs, target_app, pos, conns, noteList, disabled);
    onSaveEvents?.(sorted);
  };

  const portY = (index: number, count: number, nodeH?: number): number => {
    const h = nodeH ?? 68;
    if (count <= 1) return h / 2;
    const PORT_SPACING = 22;
    const totalH = (count - 1) * PORT_SPACING;
    return (h - totalH) / 2 + index * PORT_SPACING;
  };

  const { deleteSelectedElements, deleteNode } = useFlowchartDeleteActions({
    events,
    connections,
    setConnections,
    notes,
    setNotes,
    positions,
    disabledNodes,
    selectedNodes,
    setSelectedNodes,
    selectedWireId,
    setSelectedWireId,
    nodes,
    saveLayoutMetadata,
    onDeleteTargetApp,
  });

  const {
    deleteNote,
    duplicateNote: dupNoteAction,
    cycleNoteColor,
    handleSaveGroupedEvents,
    handleViewportMouseDown,
    handleWireMouseDown,
  } = useWorkspaceActions({
    events,
    nodes,
    layout,
    positions,
    connections,
    setConnections,
    notes,
    setNotes,
    disabledNodes,
    saveLayoutMetadata,
    setSelectedNodes,
    setSelectedWireId,
    setCtxMenu,
    setSelectionBox,
    expanded,
    setExpanded,
    editEventsList,
    setEditEventsList,
    onSaveEvents,
    toWorld,
    connectRef,
    setTempLine,
    portY,
  });

  const { duplicateNode, renameNode } = useNodeMutationActions({
    nodes,
    events,
    target_app,
    positions,
    setPositions,
    connections,
    notes,
    disabledNodes,
    saveLayoutMetadata,
    prompt,
  });

  const activeNodeIdx = useMemo(() => {
    if (activeNodeId) {
      const byId = nodes.findIndex(n => n.id === activeNodeId);
      if (byId >= 0) return byId;
    }
    if (activeStep == null) return -1;
    return nodes.findIndex(n => n.start != null && n.end != null && activeStep >= n.start && activeStep <= n.end);
  }, [nodes, activeStep, activeNodeId]);

  useFlowchartEventListeners({
    dragRef,
    dragNoteRef,
    connectRef,
    draggedRef,
    tempLine,
    setTempLine,
    toWorld,
    positions,
    setPositions,
    connections,
    setConnections,
    notes,
    setNotes,
    disabledNodes,
    selectedWireId,
    setSelectedWireId,
    selectionBox,
    setSelectionBox,
    nodes,
    layout,
    selectedNodes,
    setSelectedNodes,
    deleteSelectedElements,
    saveLayoutMetadata,
    duplicateNode,
  });

  return {
    positions, setPositions,
    connections, setConnections,
    notes, setNotes,
    disabledNodes, setDisabledNodes,
    expanded, setExpanded,
    tempLine, setTempLine,
    editEventsList, setEditEventsList,
    isEditingGroup, setIsEditingGroup,
    ctxMenu, setCtxMenu,
    selectedNodes, setSelectedNodes,
    showMinimap, setShowMinimap,
    selectedWireId, setSelectedWireId,
    selectionBox, setSelectionBox,
    handleViewportMouseDown,
    deleteSelectedElements,
    deleteNode,
    nodes,
    layout,
    dragRef,
    dragNoteRef,
    connectRef,
    draggedRef,
    saveLayoutMetadata,
    portY,
    deleteNote,
    duplicateNote: dupNoteAction,
    cycleNoteColor,
    handleSaveGroupedEvents,
    handleWireMouseDown,
    activeNodeIdx,
    connectedNodeIds,
    duplicateNode,
    renameNode,
  };
}
