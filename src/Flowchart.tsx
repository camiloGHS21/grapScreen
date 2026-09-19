import { useRef, useMemo, useState, useEffect } from "react";
import { Plus, Sparkles } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { AiAssistantDrawer, type AiAssistantDrawerProps } from "./features/ai/AiAssistantDrawer";
import type { FlowNodeType, FlowNode, RecordedEvent, NodeRunStatus, NodeDetailPayload, AddStepExtra } from "./types";
import { Minimap } from "./features/flowchart/components/Minimap";
import { ContextMenu } from "./features/flowchart/components/ContextMenu";
import { CanvasStatusBar } from "./features/flowchart/components/CanvasStatusBar";
import { NodeInspectorPanel } from "./features/flowchart/NodeInspectorPanel";
import { FlowchartControlsBar } from "./features/flowchart/components/FlowchartControlsBar";
import { FlowchartCanvasWorld } from "./features/flowchart/components/FlowchartCanvasWorld";
import { FlowchartSelectionOverlay } from "./features/flowchart/components/FlowchartSelectionOverlay";
import { FlowSidePanel, type SidePanelMode } from "./features/flowchart/components/FlowSidePanel";
import type { NodeGroupId } from "./features/flowchart/utils/nodeCatalog";
import { CATALOG_ITEMS } from "./features/flowchart/utils/nodeCatalog";
import { AI_PORT_IDS, AI_PORT_OFFSETS } from "./features/flowchart/utils/aiPortCatalog";
import { ExecuteWorkflowButton } from "./features/flowchart/components/ExecuteWorkflowButton";
import { FlowBottomDock } from "./features/flowchart/components/FlowBottomDock";
import { invoke } from "@tauri-apps/api/core";
import { useFlowchartViewport } from "./hooks/useFlowchartViewport";
import { useFlowchartWorkspace } from "./features/flowchart/hooks/useFlowchartWorkspace";
import { useFlowchartLayoutHelpers } from "./features/flowchart/hooks/useFlowchartLayoutHelpers";
import { useFlowLogs } from "./hooks/useFlowLogs";
import { portY as portsPortY } from "./features/flowchart/utils/nodePorts";

// Canvas geometry: the node box, its ports and every wire endpoint derive from
// these. `NODE_W` is ALSO applied as the card's inline `width`, so it must stay
// in sync with the `.n8n-node` rule in styles.css. It was 104 while that rule
// said 240px — the inline value won, leaving ~50px of padding and ~10px for the
// title, so every node rendered as a collapsed square with one visible
// character. 240 is the width the card was designed for.
export const NODE_W = 240;
export const NODE_H = 96;

export const NODE_COLORS: Record<FlowNodeType, string> = {
  start: "#22c55e", app: "#6366f1", end: "#ef4444", click: "#3b82f6", type: "#f59e0b",
  scroll: "#14b8a6", delay: "#eab308", hotkey: "#8b5cf6", condition: "#ec4899", loop: "#f97316",
  open_app: "#06b6d4", close_app: "#dc2626", wait_image: "#0ea5e9", set_var: "#a855f7",
  screenshot: "#10b981", run_cmd: "#64748b", google_sheets: "#0f9d58", google_docs: "#4285f4", excel_local: "#0f9d58",
  whatsapp: "#25d366", telegram: "#0088cc", ai_agent: "#a855f7", form: "#3b82f6",
  trigger: "#ff6d5a", webhook: "#ff6d5a", http_request: "#0f9d58", switch: "#ec4899",
  merge: "#f97316", wait: "#eab308", code: "#64748b", error_handler: "#ef4444", note: "#fbbf24",
  cron: "#ff6d5a", startup: "#ff6d5a", file_change: "#ff6d5a", hotkey_trigger: "#ff6d5a", polling: "#ff6d5a",
  whatsapp_trigger: "#25d366", telegram_trigger: "#0088cc", email_trigger: "#ff6d5a", rss_trigger: "#ff6d5a",
  split_batches: "#f97316", sub_workflow: "#8b5cf6",
  // Data transformation (Phase 3) — teal, matching the catalog's "Transformar".
  filter: "#06b6d4", sort: "#06b6d4", limit: "#06b6d4",
  aggregate: "#06b6d4", edit_fields: "#06b6d4", date_time: "#06b6d4",
  // AI (Phase 3) — purple, matching the rest of the AI family.
  llm_chain: "#a855f7", classifier: "#a855f7",
  // Phase 4 — same families as their Phase 3 counterparts.
  remove_duplicates: "#06b6d4", compare_datasets: "#06b6d4",
  information_extractor: "#a855f7", sentiment_analysis: "#a855f7",
  sqlite_query: "#10b981", sqlite_execute: "#10b981",
  // Phase 11 — parsing nodes join the transform family (teal); the integrations
  // reuse the service/messaging palettes; stop_error is red like the other
  // error paths.
  rss_read: "#06b6d4", xml_parse: "#06b6d4", html_extract: "#06b6d4",
  send_email: "#0f9d58", notion: "#0f9d58", airtable: "#0f9d58",
  slack_webhook: "#25d366", discord_webhook: "#25d366",
  stop_error: "#ef4444", noop: "#64748b",
  // n8n Core — the data nodes join the transform family (teal); the disk nodes
  // use the service palette like the other side-effecting nodes.
  split_out: "#06b6d4", summarize: "#06b6d4", rename_keys: "#06b6d4",
  markdown: "#06b6d4", crypto: "#06b6d4",
  read_file: "#0f9d58", write_file: "#0f9d58",
  // Declarative n8n catalogue — one accent per engine kind; the individual
  // node's colour comes from its own descriptor, not from this map.
  n8n_node: "#0f9d58", n8n_trigger: "#ff6d5a",
};

function portY(index: number, count: number, nodeH?: number): number {
  return portsPortY(index, count, nodeH ?? NODE_H);
}

/**
 * Returns the first spot around `origin` where a new node does not overlap an
 * existing one. The catalogue panel drops nodes straight onto the canvas, so
 * without this every addition would land on top of the previous one.
 */
function findFreeSpot(
  origin: { x: number; y: number },
  occupied: Array<{ x: number; y: number }>,
): { x: number; y: number } {
  const COL_STEP = NODE_W + 70;
  const ROW_STEP = NODE_H + 60;
  const OVERLAP_X = NODE_W + 20;
  const OVERLAP_Y = NODE_H + 20;

  const isFree = (p: { x: number; y: number }) =>
    !occupied.some((o) => Math.abs(o.x - p.x) < OVERLAP_X && Math.abs(o.y - p.y) < OVERLAP_Y);

  if (isFree(origin)) return origin;

  for (let ring = 1; ring <= 6; ring++) {
    for (let row = -ring; row <= ring; row++) {
      for (let col = -ring; col <= ring; col++) {
        // Only the border of the ring — inner cells were checked already.
        if (Math.max(Math.abs(row), Math.abs(col)) !== ring) continue;
        const candidate = { x: origin.x + col * COL_STEP, y: origin.y + row * ROW_STEP };
        if (isFree(candidate)) return candidate;
      }
    }
  }
  return { x: origin.x + 7 * COL_STEP, y: origin.y };
}

export interface FlowchartProps {
  target_app?: any;
  events: RecordedEvent[];
  onNodeClick: (node: FlowNode) => void;
  activeStep: number | null;
  activeNodeId?: string | null;
  nodeStatuses?: Record<string, string>;
  onAddStep?: (
    type: FlowNodeType,
    afterNodeId: string,
    sourcePortId?: string,
    position?: { x: number; y: number },
    /**
     * Extra data the shared engine kinds cannot express through `type`. The
     * declarative n8n nodes use it to record which catalogue entry was picked.
     */
    extra?: AddStepExtra,
  ) => Promise<string | undefined> | void;
  onAddStepChain?: (types: FlowNodeType[], afterNodeId: string, sourcePortId?: string) => Promise<void> | void;
  onReorder?: (movedId: string, targetId: string) => void;
  onSaveEvents?: (updatedEvents: RecordedEvent[]) => void;
  onDeleteTargetApp?: () => void;
  onExecuteUntil?: (nodeId: string) => void;
  /** Execution controls for the central "Ejecutar Flujo" button. */
  executing?: boolean;
  onExecute?: () => void;
  onStopExecute?: () => void;
  /** Playback mode: run the automation without taking over mouse/keyboard. */
  bgMode?: boolean;
  onToggleBgMode?: () => void;
  /** Opens the execution-history drawer from the Logs panel. */
  onOpenHistory?: () => void;
  /** Hide the chrome while another tab (Executions / Evaluations) is shown. */
  showCanvasChrome?: boolean;
  /** AI Assistant props when docked in side panel */
  aiProps?: AiAssistantDrawerProps;
  /** Current active project name for workflow execution */
  projectName?: string;
  /** Current active automation ID */
  automationId?: string;
}

export function Flowchart({ events, onNodeClick, activeStep, activeNodeId, nodeStatuses, onAddStep, onAddStepChain, onReorder, target_app, onSaveEvents, onDeleteTargetApp, onExecuteUntil, executing: executingProp, onExecute, onStopExecute, bgMode, onToggleBgMode, onOpenHistory, showCanvasChrome = true, aiProps, projectName, automationId }: FlowchartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { viewport, setViewport, toWorld, handlePanMouseDown } = useFlowchartViewport(containerRef);

  const {
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
    selectionBox, handleViewportMouseDown,
    deleteNode, nodes, layout, dragRef, dragNoteRef, connectRef, draggedRef,
    saveLayoutMetadata, deleteNote, duplicateNote, cycleNoteColor,
    handleSaveGroupedEvents, handleWireMouseDown, activeNodeIdx, renameNode,
    deleteSelectedElements,
  } = useFlowchartWorkspace({ events, target_app, onSaveEvents, onDeleteTargetApp, toWorld, activeStep, activeNodeId });

  const [inspectedNodeId, setInspectedNodeId] = useState<string | null>(null);
  const [nodeRunDetails, setNodeRunDetails] = useState<Record<string, NodeRunStatus>>({});

  // ── Right-hand contextual panel (n8n node explorer) ──
  // Hidden by default, exactly like n8n: the canvas gets the whole width until
  // the user opens the panel from the "+" button.
  const [panelOpen, setPanelOpen] = useState(false);
  const [detailHost, setDetailHost] = useState<HTMLDivElement | null>(null);
  const [panelMode, setPanelMode] = useState<SidePanelMode>("empty");
  const [panelGroup, setPanelGroup] = useState<NodeGroupId | null>(null);
  // When the panel was opened from a node's "+", remember where the new node
  // must be plugged in. Cleared as soon as the pick is consumed or the panel
  // closes, so a later pick from the plain "+" is not silently rewired.
  const [panelSource, setPanelSource] = useState<{ nodeId: string; portId: string } | null>(null);

  // El botón derecho (y el central) mueven el lienzo; el izquierdo selecciona.
  // El cursor lo comunica: marco de selección por defecto y "agarrar" al
  // sostener un botón de paneo. Sin esto el gesto hay que adivinarlo.
  const [isPanning, setIsPanning] = useState(false);
  useEffect(() => {
    if (!isPanning) return;
    const stop = () => setIsPanning(false);
    window.addEventListener("mouseup", stop);
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("blur", stop);
    };
  }, [isPanning]);

  // ── Bottom Logs console ──
  const nodeLabels = useMemo(() => {
    const map: Record<string, string> = {};
    nodes.forEach((n) => { map[n.id] = n.label; });
    return map;
  }, [nodes]);
  const { entries: logEntries, append: appendLog, clear: clearLogs } = useFlowLogs(nodeLabels);

  const hasChatTrigger = useMemo(() => {
    return nodes.some(n => {
      const isTrig = n.type === "trigger" || n.type === "n8n_trigger";
      const key = (n.n8nKey || "").toLowerCase();
      const label = (n.label || "").toLowerCase();
      return isTrig && (key.includes("chat") || label.includes("chat"));
    });
  }, [nodes]);

  const handleSendChatMessage = async (message: string): Promise<string> => {
    if (onSaveEvents) {
      onSaveEvents(events);
    }
    if (!projectName || !automationId) {
      return "Guarda la automatización para iniciar la conversación en vivo.";
    }
    const errorNodes = nodes.filter(n => n.hasWarning);
    if (errorNodes.length > 0) {
      const names = errorNodes.map(n => n.label).slice(0, 3).join(", ");
      return `⚠ No se puede ejecutar el chat: hay nodos sin configurar o con errores (${names}).`;
    }
    try {
      return await invoke<string>("test_chat_workflow", {
        projectName,
        automationId,
        message,
      });
    } catch (err: any) {
      return `Error ejecutando el chat: ${err?.message || err || "error desconocido"}`;
    }
  };

  useEffect(() => {
    const un = listen<NodeDetailPayload>("automation-node-detail", (ev) => {
      const payload = ev.payload;
      setNodeRunDetails((prev) => ({
        ...prev,
        [payload.nodeId]: {
          node_id: payload.nodeId,
          label: payload.nodeId,
          status: payload.status,
          input_data: payload.input_data,
          output_data: payload.output_data,
          duration_ms: payload.duration_ms,
        },
      }));
    });
    return () => {
      un.then((fn) => fn());
    };
  }, []);

  const inspectedNode = useMemo(() => {
    return nodes.find((n) => n.id === inspectedNodeId) || null;
  }, [nodes, inspectedNodeId]);

  const handleUpdateNodePin = (nodeId: string, pinEnabled: boolean, pinnedData: any) => {
    const updatedEvents = events.map((ev) => {
      if (ev.kind === "layout_metadata") {
        const gNodes = ev.data.graphNodes || [];
        const newGNodes = gNodes.map((n: any) => {
          if (n.id === nodeId) {
            return { ...n, pinEnabled, pinnedData };
          }
          return n;
        });
        return {
          ...ev,
          data: {
            ...ev.data,
            graphNodes: newGNodes,
          },
        };
      }
      return ev;
    });
    if (onSaveEvents) {
      onSaveEvents(updatedEvents);
    }
  };

  const { autoLayout, fitView } = useFlowchartLayoutHelpers({
    nodes,
    connections,
    layout,
    setPositions,
    saveLayoutMetadata,
    notes,
    disabledNodes,
    containerRef,
    setViewport,
  });

  /**
   * Adds a node chosen in the right-hand catalog panel.
   *
   * The panel already told us the exact type, so there is nothing left to
   * choose: we resolve a free spot on the canvas and place it straight away.
   * Going through the inline "add node" menu here would pop a second picker
   * (a modal) over a decision the user just made — that is what we removed.
   */
  // A declarative n8n trigger is as valid a flow head as a hand-written one.
  const TRIGGER_TYPES = useMemo(
    () => new Set<string>([...CATALOG_ITEMS["trigger"].map((i) => i.type), "n8n_trigger"]),
    [],
  );

  const handlePanelPickNode = (
    type: FlowNodeType,
    label?: string,
    n8n?: { key: string; mode?: string | null },
  ) => {
    const rect = containerRef.current?.getBoundingClientRect();

    // Declarative n8n nodes all share one engine kind, so the specific node is
    // carried through to the created event as `n8n_key`. The trigger mode rides
    // along too: the daemon arms the node differently depending on whether it
    // receives a webhook, polls an API or runs on an interval.
    const extra = n8n
      ? { n8nKey: n8n.key, n8nLabel: label, n8nMode: n8n.mode ?? null }
      : undefined;

    // Choosing a node is the whole point of the panel: it closes right away so
    // the canvas is unobstructed and the new node is visible.
    setPanelOpen(false);

    // Opened from a node's "+": wire the new node to that exact port and park it
    // next to the source instead of dropping it in the middle of the canvas.
    // `computeAddStepEvents` writes the layout entry itself, keyed by the real
    // node id it mints, so there is nothing to patch up here.
    if (panelSource) {
      const srcPos = layout[panelSource.nodeId];
      let pos: { x: number; y: number } | undefined;
      if (srcPos) {
        if (AI_PORT_IDS.includes(panelSource.portId)) {
          pos = {
            x: srcPos.x + (AI_PORT_OFFSETS[panelSource.portId] ?? 0),
            y: srcPos.y + 160,
          };
        } else {
          pos = { x: srcPos.x + 300, y: srcPos.y };
        }
      }
      onAddStep?.(type, panelSource.nodeId, panelSource.portId, pos, extra);
      setPanelSource(null);
      setSelectedNodes(new Set());
      setSelectedWireId(null);
      setInspectedNodeId(null);
      appendLog("info", `Añadido nodo "${label || type}"`);
      return;
    }

    // Empty canvas guard: only triggers can be the first node (n8n behaviour).
    if (nodes.length === 0 && !TRIGGER_TYPES.has(type)) {
      appendLog("warning", `El primer nodo debe ser un disparador. Selecciona uno de la categoría "Disparadores".`);
      return;
    }

    // Plain catalogue add: drop the node in a free spot near the viewport centre.
    const center = toWorld(rect ? rect.width / 2 : 400, rect ? rect.height / 2 : 240);
    const pos = findFreeSpot(center, Object.values(layout));
    onAddStep?.(type, "", undefined, pos, extra);
    setSelectedNodes(new Set());
    setSelectedWireId(null);
    setInspectedNodeId(null);
    appendLog("info", `Añadido nodo "${label || type}"`);
  };

  /** Node "+" → open the catalogue panel already wired to that output port. */
  const handleRequestAddFrom = (sourceNodeId: string, sourcePortId: string) => {
    setPanelSource({ nodeId: sourceNodeId, portId: sourcePortId });
    setPanelMode("catalog");
    setPanelOpen(true);
    setExpanded(null);
  };

  /** Empty canvas CTA → open the catalogue panel so the user picks a trigger. */
  const handleOpenPanelFromEmpty = () => {
    setPanelSource(null);
    setPanelMode("catalog");
    setPanelOpen(true);
    setExpanded(null);
  };

  const handlePanelModeChange = (mode: SidePanelMode, group?: NodeGroupId | null) => {
    setPanelMode(mode);
    if (group) setPanelGroup(group);
  };

  // The panel opens focused on the flow that is actually on screen: an empty
  // canvas gets the "what happens next" guidance, a built flow gets the catalog.
  useEffect(() => {
    if (nodes.length === 0) {
      setPanelMode("empty");
    } else {
      setPanelMode((m) => (m === "empty" ? "catalog" : m));
    }
  }, [nodes.length]);

  return (
    <div className="flow-editor-shell">
      <div className="flow-editor-main">
        <div
          className={`n8n-viewport${isPanning ? " n8n-panning" : ""}`}
          ref={containerRef}
          onMouseDown={(e) => {
            // Izquierdo y central mueven el lienzo; el derecho selecciona.
            const panning = e.button === 0 || e.button === 1;
            if (panning) setIsPanning(true);
            handlePanMouseDown(e);
            handleViewportMouseDown(e);
          }}
          onScroll={(e) => {
            e.currentTarget.scrollLeft = 0;
            e.currentTarget.scrollTop = 0;
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {(() => {
            const statuses = nodeStatuses || {};
            const isRunning = !!activeNodeId || Object.values(statuses).some(s => s === "running");
            if (!isRunning) return null;
            const done = Object.values(statuses).filter(s => s === "ok" || s === "error").length;
            const pct = nodes.length > 1 ? Math.min(95, (done / (nodes.length - 1)) * 100) : 30;
            return (
              <div className="exec-topbar">
                <div className="exec-topbar-fill" style={{ width: `${pct}%` }} />
              </div>
            );
          })()}

          <FlowchartCanvasWorld
            viewport={viewport}
            nodes={nodes}
            layout={layout}
            activeNodeIdx={activeNodeIdx}
            tempLine={tempLine}
            disabledNodes={disabledNodes}
            connections={connections}
            handleWireMouseDown={handleWireMouseDown}
            selectedWireId={selectedWireId}
            setConnections={setConnections}
            saveLayoutMetadata={saveLayoutMetadata}
            positions={positions}
            notes={notes}
            toWorld={toWorld}
            dragNoteRef={dragNoteRef}
            setNotes={setNotes}
            containerRef={containerRef}
            setCtxMenu={setCtxMenu}
            nodeStatuses={nodeStatuses}
            expanded={expanded}
            setExpanded={setExpanded}
            selectedNodes={selectedNodes}
            setSelectedNodes={setSelectedNodes}
            dragRef={dragRef}
            draggedRef={draggedRef}
            connectRef={connectRef}
            setTempLine={setTempLine}
            onOpenPanel={handleOpenPanelFromEmpty}
            isEditingGroup={isEditingGroup}
            setIsEditingGroup={setIsEditingGroup}
            editEventsList={editEventsList}
            setEditEventsList={setEditEventsList}
            handleSaveGroupedEvents={handleSaveGroupedEvents}
            events={events}
            portY={portY}
            onNodeClick={onNodeClick}
            onRequestAddFrom={handleRequestAddFrom}
            onNodeActivate={() => { setPanelOpen(false); setPanelSource(null); }}
          />

          {showCanvasChrome && (
            <>
              {!panelOpen && !aiProps?.aiChatOpen && (
                <div className="n8n-canvas-actions">
                  <button
                    className="n8n-canvas-add"
                    title="Añadir nodo"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      setExpanded(null);
                      aiProps?.setAiChatOpen?.(false);
                      setPanelOpen((open) => {
                        if (!open) setPanelMode("catalog");
                        return !open;
                      });
                    }}
                  >
                    <Plus size={15} />
                  </button>

                  <button
                    className="n8n-canvas-ai"
                    title="Asistente de IA"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      setExpanded(null);
                      setPanelOpen(false);
                      aiProps?.setAiChatOpen?.(true);
                    }}
                  >
                    <Sparkles size={15} />
                  </button>
                </div>
              )}

              <ExecuteWorkflowButton
                executing={!!activeNodeId || Object.values(nodeStatuses || {}).some(s => s === "running") || !!executingProp}
                hasErrors={nodes.some(n => n.hasWarning)}
                onExecute={() => onExecute?.()}
                onStop={() => onStopExecute?.()}
                nodeCount={nodes.length}
                disabled={nodes.length === 0}
                bgMode={bgMode}
                onToggleBgMode={onToggleBgMode}
              />

              <FlowchartControlsBar
                viewport={viewport}
                setViewport={setViewport}
                fitView={fitView}
                autoLayout={autoLayout}
                notes={notes}
                setNotes={setNotes}
                saveLayoutMetadata={saveLayoutMetadata}
                positions={positions}
                connections={connections}
                disabledNodes={disabledNodes}
                showMinimap={showMinimap}
                setShowMinimap={setShowMinimap}
              />

              <Minimap showMinimap={showMinimap} nodes={nodes} layout={layout} viewport={viewport} setViewport={setViewport} containerRef={containerRef} />

              <CanvasStatusBar
                nodeCount={nodes.length}
                connectionCount={connections.length}
                zoom={viewport.k}
                executing={!!activeNodeId || Object.values(nodeStatuses || {}).some(s => s === "running")}
                activeNodeLabel={nodes.find(n => n.id === activeNodeId)?.label}
              />
            </>
          )}

          <ContextMenu
            ctxMenu={ctxMenu}
            nodes={nodes}
            disabledNodes={disabledNodes}
            toggleDisabled={(id) => {
              const next = new Set(disabledNodes); if (next.has(id)) next.delete(id); else next.add(id);
              setDisabledNodes(next); saveLayoutMetadata(positions, connections, notes, next); setCtxMenu(null);
            }}
            onAddStep={onAddStep}
            onDuplicateNode={duplicateNote}
            onRenameNode={renameNode}
            onExecuteUntil={onExecuteUntil}
            onInspectNode={(id) => setInspectedNodeId(id)}
            onEditNode={onNodeClick}
            setCtxMenu={setCtxMenu}
            onDeleteNote={deleteNote}
            onDuplicateNote={duplicateNote}
            onCycleNoteColor={cycleNoteColor}
            onDeleteNode={deleteNode}
            selectionCount={selectedNodes.size}
            ctxInSelection={!!ctxMenu && selectedNodes.has(ctxMenu.id)}
            onDeleteSelection={deleteSelectedElements}
          />

          <FlowchartSelectionOverlay selectionBox={selectionBox} />
        </div>

        <FlowBottomDock
          entries={logEntries}
          onClearLogs={clearLogs}
          onOpenHistory={onOpenHistory}
          executing={!!activeNodeId || Object.values(nodeStatuses || {}).some(s => s === "running")}
          hasChatTrigger={hasChatTrigger}
          onSendChatMessage={handleSendChatMessage}
        />
      </div>

      {/* Details live outside the scaled canvas: fields keep their size and
          scrolling cannot zoom or pan the recorded event editor. */}
      <div ref={setDetailHost} className="flow-node-details" hidden={!expanded} />
      {panelOpen && !expanded && (
        <FlowSidePanel
          mode={panelMode}
          group={panelGroup}
          panelSource={panelSource}
          onClearPort={() => setPanelSource(prev => prev ? { ...prev, portId: "" } : null)}
          onPickNode={(type, label, n8n) => {
            handlePanelPickNode(type, label, n8n);
          }}
          onModeChange={handlePanelModeChange}
          onClose={() => { setPanelOpen(false); setPanelSource(null); }}
          nodeCount={nodes.length}
        />
      )}

      {aiProps?.aiChatOpen && !expanded && (
        <AiAssistantDrawer
          aiChatOpen={aiProps.aiChatOpen}
          setAiChatOpen={aiProps.setAiChatOpen}
          aiMessages={aiProps.aiMessages}
          aiLoading={aiProps.aiLoading}
          aiPrompt={aiProps.aiPrompt}
          setAiPrompt={aiProps.setAiPrompt}
          sendAiMessage={aiProps.sendAiMessage}
        />
      )}

      <NodeInspectorPanel
        node={inspectedNode}
        events={events}
        lastRunStatus={inspectedNodeId ? nodeRunDetails[inspectedNodeId] : null}
        open={!!inspectedNodeId}
        onClose={() => setInspectedNodeId(null)}
        onUpdateNodePin={handleUpdateNodePin}
      />

    </div>
  );
}
export default Flowchart;
