import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FlowNode, RecordedEvent, Project, AutomationSummary, AutomationDetail, AddStepExtra } from "../types";
import { buildNodes } from "../features/flowchart/buildNodes";
import { ADVANCED_NODE_TYPES } from "../features/flowchart/utils/nodeCatalog";
import { useFlowchartEditState } from "./useFlowchartEditState";
import { updateEventFromState, deleteEventFromList } from "../features/flowchart/utils/eventModifiers";
import { useDialog } from "../components/DialogProvider";
import { computeAddStepEvents, computeAddStepChainEvents, ChainStep } from "../features/flowchart/utils/stepInsertion";

export function useFlowchartEdit(
  selectedProject: Project | null,
  selectedAutomation: AutomationSummary | null,
  selectedProjectDetail: AutomationDetail | null,
  saveEvents: (updated: RecordedEvent[]) => Promise<void>,
  loadProjectDetail: (p: string, id: string) => Promise<any>,
  refresh: () => Promise<Project[]>,
  notify: (msg: string) => void,
  setBusy: (busy: boolean) => void
) {
  const { confirm } = useDialog();
  const [editingNode, setEditingNode] = useState<{
    node: FlowNode;
    eventIndex: number;
    rangeStart?: number;
    rangeEnd?: number;
  } | null>(null);

  const state = useFlowchartEditState(editingNode, selectedProjectDetail);

  const handleNodeClick = (node: FlowNode) => {
    if (node.type === "start" || node.type === "end" || node.id === "empty") return;
    if (ADVANCED_NODE_TYPES.has(node.type)) {
      setEditingNode({
        node,
        eventIndex: node.eventIndex ?? -1,
        rangeStart: node.rangeStart,
        rangeEnd: node.rangeEnd
      });
    }
  };

  const addStep = async (
    type: FlowNode["type"],
    afterNodeId: string,
    sourcePortId?: string,
    position?: { x: number; y: number },
    extra?: AddStepExtra,
  ) => {
    if (!selectedProjectDetail || !selectedProject || !selectedAutomation) return;
    const { events, newNodeId } = await computeAddStepEvents(
      selectedProjectDetail,
      type,
      afterNodeId,
      sourcePortId,
      position,
      extra,
    );
    await saveEvents(events);
    return newNodeId;
  };
  const addStepChain = async (steps: ChainStep[], initialAfterNodeId: string, sourcePortId?: string) => {
    if (!selectedProjectDetail || !selectedProject || !selectedAutomation || steps.length === 0) return;
    const events = await computeAddStepChainEvents(selectedProjectDetail, steps, initialAfterNodeId, sourcePortId);
    await saveEvents(events);
  };

  const reorder = async (movedId: string, targetId: string) => {
    if (!selectedProjectDetail || !selectedProject || !selectedAutomation) return;
    const ns = buildNodes(selectedProjectDetail.events);
    const mi = ns.findIndex(n => n.id === movedId);
    const ti = ns.findIndex(n => n.id === targetId);
    if (mi < 0 || ti < 0 || mi === ti) return;
    const m = ns[mi];
    const t = ns[ti];
    if (m.start == null || m.end == null || t.start == null || t.end == null) return;
    const evs = [...selectedProjectDetail.events];
    const block = evs.slice(m.start, m.end + 1);
    evs.splice(m.start, block.length);
    let insertAt = t.end + 1;
    if (m.start < insertAt) insertAt -= block.length;
    evs.splice(insertAt, 0, ...block);
    await saveEvents(evs);
  };

  const saveNodeEdit = async () => {
    if (!selectedProjectDetail || !editingNode || !selectedProject || !selectedAutomation) return;

    if (editingNode.node.type === "app") {
      setBusy(true);
      try {
        const targetAppObj = {
          exe: state.editAppExe,
          title: state.editAppTitle,
          class: state.editAppClass,
          name: state.editAppName,
          rect: editingNode.node.app?.rect || [0, 0, 1024, 768] as [number, number, number, number],
          pid: 0
        };
        await invoke("save_automation_target_app", {
          projectName: selectedProject.name,
          id: selectedAutomation.id,
          targetApp: targetAppObj
        });
        notify("Configuración de aplicación guardada");
        setEditingNode(null);
        await loadProjectDetail(selectedProject.name, selectedAutomation.id);
        await refresh();
      } catch (e) {
        notify(String(e));
      } finally {
        setBusy(false);
      }
      return;
    }

    const updatedEvents = updateEventFromState(
      editingNode.node,
      state,
      editingNode.eventIndex,
      editingNode.rangeStart,
      editingNode.rangeEnd,
      selectedProjectDetail.events
    );

    setBusy(true);
    try {
      await saveEvents(updatedEvents);
      notify("Paso guardado");
      setEditingNode(null);
    } catch (e) {
      notify(String(e));
    } finally {
      setBusy(false);
    }
  };

  const deleteNodeStep = async () => {
    if (!selectedProjectDetail || !editingNode || !selectedProject || !selectedAutomation) return;
    const ok = await confirm({
      title: "Eliminar paso",
      message: "¿Eliminar este paso de la automatización?",
      variant: "danger",
      confirmLabel: "Eliminar",
    });
    if (!ok) return;

    if (editingNode.node.type === "app") {
      const ok2 = await confirm({
        title: "Eliminar aplicación objetivo",
        message: "¿Eliminar la aplicación objetivo de esta automatización?",
        variant: "danger",
        confirmLabel: "Eliminar",
      });
      if (!ok2) return;
      setBusy(true);
      try {
        await invoke("save_automation_target_app", {
          projectName: selectedProject.name,
          id: selectedAutomation.id,
          targetApp: null
        });
        notify("Aplicación objetivo eliminada");
        setEditingNode(null);
        await loadProjectDetail(selectedProject.name, selectedAutomation.id);
        await refresh();
      } catch (e) {
        notify(String(e));
      } finally {
        setBusy(false);
      }
      return;
    }

    const updatedEvents = deleteEventFromList(
      editingNode.node,
      editingNode.eventIndex,
      editingNode.rangeStart,
      editingNode.rangeEnd,
      selectedProjectDetail.events
    );

    setBusy(true);
    try {
      await saveEvents(updatedEvents);
      notify("Paso eliminado");
      setEditingNode(null);
    } catch (e) {
      notify(String(e));
    } finally {
      setBusy(false);
    }
  };

  return {
    editingNode, setEditingNode,
    state,
    handleNodeClick,
    addStep,
    addStepChain,
    reorder,
    saveNodeEdit,
    deleteNodeStep
  };
}
export default useFlowchartEdit;
