import React from "react";
import Flowchart from "../../Flowchart";
import { FloatingBot } from "../ai/FloatingBot";
import { AiAssistantDrawer } from "../ai/AiAssistantDrawer";
import { ExecutionHistoryPanel } from "./ExecutionHistoryPanel";
import { NodeEditModal } from "../modals/NodeEditModal";
import { EditorTopBar, type EditorTab } from "../flowchart/components/EditorTopBar";
import { ExecutionsView } from "./ExecutionsView";
import { EvaluationsView } from "./EvaluationsView";
import { TriggersView } from "./TriggersView";
import { ExportAutomationModal } from "../modals/ExportAutomationModal";
import { formatDuration } from "../../utils/format";
import { invoke } from "@tauri-apps/api/core";
interface AutomationStageViewProps {
  projs: any;
  auts: any;
  exec: any;
  rec: any;
  flow: any;
  ai: any;
  menu: any;
  setMenu: any;
  setView: any;
  botPos: any;
  setBotPos: any;
  notify: (msg: string) => void;
  creds?: any;
}

export function AutomationStageView({
  projs,
  auts,
  exec,
  rec,
  flow,
  ai,
  menu,
  setMenu,
  setView,
  botPos,
  setBotPos,
  notify,
  creds,
}: AutomationStageViewProps) {
  /** n8n "Execute previous nodes": run the flow stopping after this node. */
  const handleExecuteUntil = (nodeId: string) => {
    if (!projs.selectedProject || !auts.selectedAutomation) return;
    invoke("execute_automation_until", {
      projectName: projs.selectedProject.name,
      id: auts.selectedAutomation.id,
      nodeId,
    }).then(() => {
      notify("Ejecutando hasta el nodo seleccionado…");
    }).catch((e) => notify(String(e)));
  };

  const handleRunSingleNode = (nodeId: string) => {
    const pName = projs.selectedProject?.name;
    const aId = auts.selectedAutomation?.id;
    if (!pName || !aId) return;
    invoke("run_single_node", {
      projectName: pName,
      automationId: aId,
      nodeId,
    }).then(() => {
      notify("Ejecutando hasta el nodo seleccionado…");
    }).catch((e) => notify(String(e)));
  };

  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [tab, setTab] = React.useState<EditorTab>("editor");
  const [published, setPublished] = React.useState(false);
  const [publishBusy, setPublishBusy] = React.useState(false);
  // n8n "Active" switch: this automation fires on its own triggers.
  const [triggerActive, setTriggerActive] = React.useState(false);
  const [triggerBusy, setTriggerBusy] = React.useState(false);

  React.useEffect(() => {
    setTab("editor");
  }, [auts.selectedAutomation?.id]);

  React.useEffect(() => {
    if (!auts.selectedAutomation?.id) return;
    invoke<boolean>("get_trigger_status", { id: auts.selectedAutomation.id })
      .then(setTriggerActive)
      .catch(() => setTriggerActive(false));
  }, [auts.selectedAutomation?.id]);

  /** n8n "Active" switch: arm/disarm this automation's own triggers. */
  const toggleTrigger = async () => {
    if (triggerBusy || !projs.selectedProject || !auts.selectedAutomation) return;
    setTriggerBusy(true);
    try {
      if (triggerActive) {
        await invoke("stop_automation_trigger", { id: auts.selectedAutomation.id });
        setTriggerActive(false);
        notify("Triggers desactivados — la automatización ya no se ejecuta sola");
      } else {
        const desc = await invoke<string>("start_automation_trigger", {
          projectName: projs.selectedProject.name,
          id: auts.selectedAutomation.id,
        });
        setTriggerActive(true);
        notify(`⚡ Activa: ${desc}`);
      }
    } catch (e) {
      notify(String(e));
    } finally {
      setTriggerBusy(false);
    }
  };

  const togglePublish = async () => {
    if (!projs.selectedProject || !auts.selectedAutomation || publishBusy) return;
    setPublishBusy(true);
    try {
      if (published) {
        await invoke("stop_automation_trigger", { id: auts.selectedAutomation.id });
        setPublished(false);
        notify("Disparadores desactivados");
      } else {
        const desc = await invoke<string>("start_automation_trigger", {
          projectName: projs.selectedProject.name,
          id: auts.selectedAutomation.id,
        });
        setPublished(true);
        notify(`⚡ Publicado: ${desc}`);
      }
    } catch (e) {
      notify(String(e));
    } finally {
      setPublishBusy(false);
    }
  };

  const handleRunFlow = () => {
    if (!auts.selectedAutomation) return;
    exec.execute(auts.selectedAutomation);
  };

  return (
    <section className="stage aut-stage" style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '0px', background: 'transparent', border: 'none', height: '100%', minHeight: 0 }}>
      <EditorTopBar
        projectName={projs.selectedProject?.name || "Personal"}
        automationName={auts.selectedAutomation?.name || "Flujo"}
        tab={tab}
        setTab={setTab}
        onBack={() => {
          projs.setSelectedProject(null);
          auts.setSelectedAutomation(null);
          setView("library");
        }}
        onRename={() => auts.renameAut?.(auts.selectedAutomation)}
        onSave={() => {
          auts.saveEvents?.(auts.selectedProjectDetail?.events || []);
          notify("Cambios guardados");
        }}
        saved={true}
        published={published}
        publishBusy={publishBusy}
        onPublish={togglePublish}
        durationLabel={formatDuration(auts.selectedAutomation?.duration_ms ?? 0)}
        eventCount={auts.selectedAutomation?.event_count ?? 0}
        hasVideo={!!auts.selectedAutomation?.has_video}
        triggerActive={triggerActive}
        triggerBusy={triggerBusy}
        onToggleTrigger={toggleTrigger}
        historyOpen={historyOpen}
        onToggleHistory={() => setHistoryOpen(v => !v)}
        menuOpen={menu === auts.selectedAutomation?.id}
        onToggleMenu={(e) => {
          e.stopPropagation();
          setMenu(menu === auts.selectedAutomation?.id ? null : auts.selectedAutomation?.id ?? null);
        }}
        onRebuild={() => { setMenu(null); rec.setRecordingNameOpen(true); }}
        onExport={() => { setMenu(null); setExportOpen(true); }}
        onDelete={() => { setMenu(null); auts.removeAut(auts.selectedAutomation); }}
      />

      <div className="aut-flow" style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
        {tab === "editor" && (
          <Flowchart
            events={auts.selectedProjectDetail?.events || []}
            onNodeClick={flow.handleNodeClick}
            activeStep={exec.progressIndex}
            activeNodeId={exec.progressNodeId}
            nodeStatuses={exec.nodeStatuses}
            onAddStep={flow.addStep}
            onAddStepChain={flow.addStepChain}
            onReorder={flow.reorder}
            target_app={auts.selectedProjectDetail?.target_app ?? null}
            onSaveEvents={auts.saveEvents}
            onExecuteUntil={handleExecuteUntil}
            executing={exec.executing}
            onExecute={handleRunFlow}
            onStopExecute={exec.stopExecute}
            bgMode={exec.bgMode}
            onToggleBgMode={() => exec.setBgMode(!exec.bgMode)}
            onOpenHistory={() => setHistoryOpen(true)}
            onDeleteTargetApp={async () => {
              if (!projs.selectedProject || !auts.selectedAutomation) return;
              try {
                await invoke("save_automation_target_app", {
                  projectName: projs.selectedProject.name,
                  id: auts.selectedAutomation.id,
                  targetApp: null
                });
                await auts.loadProjectDetail(projs.selectedProject.name, auts.selectedAutomation.id);
                await projs.refresh();
              } catch (e) {
                console.error(e);
              }
            }}
          />
        )}

        {tab === "executions" && (
          <ExecutionsView automationId={auts.selectedAutomation?.id || ""} notify={notify} />
        )}

        {tab === "evaluations" && (
          <EvaluationsView automationId={auts.selectedAutomation?.id || ""} />
        )}

        {tab === "triggers" && (
          <TriggersView
            notify={notify}
            currentAutomationId={auts.selectedAutomation?.id}
            onTriggerStopped={(id) => {
              if (id === auts.selectedAutomation?.id) {
                setPublished(false);
              }
            }}
          />
        )}

        <ExecutionHistoryPanel
          automationId={auts.selectedAutomation?.id || ""}
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
        />

        <FloatingBot
          botPos={botPos}
          setBotPos={setBotPos}
          setAiChatOpen={ai.setAiChatOpen}
        />

        <AiAssistantDrawer
          aiChatOpen={ai.aiChatOpen}
          setAiChatOpen={ai.setAiChatOpen}
          botPos={botPos}
          aiMessages={ai.aiMessages}
          aiLoading={ai.aiLoading}
          aiPrompt={ai.aiPrompt}
          setAiPrompt={ai.setAiPrompt}
          sendAiMessage={ai.sendAiMessage}
        />

        <NodeEditModal
          editingNode={flow.editingNode}
          setEditingNode={flow.setEditingNode}
          busy={flow.busy}
          deleteNodeStep={flow.deleteNodeStep}
          saveNodeEdit={flow.saveNodeEdit}
          state={flow.state}
        />
      </div>

      <ExportAutomationModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        automationName={auts.selectedAutomation?.name || ""}
        onExport={(targetOs) => {
          setExportOpen(false);
          auts.exportAut?.(auts.selectedAutomation, targetOs);
        }}
        busy={false}
      />
    </section>
  );
}
