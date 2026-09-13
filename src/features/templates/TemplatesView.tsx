import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Workflow, ArrowRight, LayoutTemplate } from "lucide-react";
import { ADD_CATEGORIES, FLOW_TEMPLATES } from "../flowchart/addCategories";
import { buildNodes, getNodeIcon } from "../flowchart/buildNodes";
import { computeAddStepChainEvents } from "../flowchart/utils/stepInsertion";
import { withGraphMetadata } from "../flowchart/utils/layoutMetadata";
import { NODE_COLORS } from "../../Flowchart";
import type { FlowNodeType } from "../../types";

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  ADD_CATEGORIES.flatMap(c => c.items.map(it => [it.type, it.label]))
);

interface TemplatesViewProps {
  projs: any;
  auts: any;
  flow: any;
  setView: (v: any) => void;
  notify: (msg: string) => void;
}

type Template = (typeof FLOW_TEMPLATES)[number];

export function TemplatesView({ projs, auts, flow, setView, notify }: TemplatesViewProps) {
  const hasOpenFlow = !!auts.selectedAutomation && !!auts.selectedProjectDetail;

  /** Insert the chain after the last node of the currently open flow. */
  const insertIntoCurrent = async (tmpl: Template) => {
    const detail = auts.selectedProjectDetail;
    if (!detail) return;
    const nodes = buildNodes(detail.events, detail.target_app);
    const withOut = nodes.filter(n => (n.ports?.outputs?.length ?? 0) > 0);
    const last = withOut[withOut.length - 1];
    try {
      await flow.addStepChain(tmpl.chain, last?.id ?? "start");
      notify(`Plantilla "${tmpl.label}" añadida al flujo`);
      setView("project-details");
    } catch (e) {
      notify(String(e));
    }
  };

  /** Create a brand-new automation wired from the template. */
  const createFromTemplate = async (tmpl: Template) => {
    if (!projs.selectedProject) {
      notify("Selecciona primero un proyecto en la Biblioteca");
      return;
    }
    try {
      const newAut = await invoke<{ id: string }>("create_empty_automation", {
        projectName: projs.selectedProject.name,
        name: tmpl.label,
      });
      const events = await computeAddStepChainEvents({ events: [] } as any, tmpl.chain, "start", undefined);
      await invoke("save_automation", {
        projectName: projs.selectedProject.name,
        id: newAut.id,
        events: withGraphMetadata(events, null),
      });
      const latest = await projs.refresh();
      const proj = latest.find((x: any) => x.name === projs.selectedProject.name);
      const found = proj?.automations?.find((a: any) => a.id === newAut.id);
      if (proj && found) {
        projs.setSelectedProject(proj);
        await auts.selectAutomation(found);
        setView("project-details");
      }
      notify(`Automatización "${tmpl.label}" creada`);
    } catch (e) {
      notify(String(e));
    }
  };

  return (
    <div className="tpl-page">
      <header className="tpl-header">
        <div className="tpl-header-icon">
          <LayoutTemplate size={22} />
        </div>
        <div>
          <h1>Plantillas de flujo</h1>
          <p>
            Flujos listos para usar: insértalos en el canvas abierto o crea una automatización nueva
            {projs.selectedProject ? <> en <b>{projs.selectedProject.name}</b></> : ""}.
          </p>
        </div>
      </header>

      <div className="tpl-grid">
        {FLOW_TEMPLATES.map((tmpl) => (
          <article className="tpl-card" key={tmpl.id}>
            <div className="tpl-card-head">
              <span className="tpl-card-icon">{tmpl.icon}</span>
              <div>
                <h3>{tmpl.label}</h3>
                <p>{tmpl.desc}</p>
              </div>
            </div>

            <div className="tpl-chain">
              {tmpl.chain.map((step: FlowNodeType, i: number) => (
                <React.Fragment key={`${tmpl.id}-${i}`}>
                  {i > 0 && <ArrowRight size={12} className="tpl-chain-arrow" />}
                  <span
                    className="tpl-chip"
                    style={{ borderColor: NODE_COLORS[step], color: NODE_COLORS[step] }}
                    title={step}
                  >
                    {getNodeIcon(step, 12)}
                    <span>{TYPE_LABELS[step] || step}</span>
                  </span>
                </React.Fragment>
              ))}
            </div>

            <div className="tpl-actions">
              {hasOpenFlow && (
                <button type="button" className="tpl-btn ghost" onClick={() => insertIntoCurrent(tmpl)}>
                  <Workflow size={13} /> Añadir al flujo actual
                </button>
              )}
              <button type="button" className="tpl-btn primary" onClick={() => createFromTemplate(tmpl)}>
                <Plus size={13} /> Nueva automatización
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
export default TemplatesView;
