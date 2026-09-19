import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { LayoutTemplate, Flame } from "lucide-react";
import { buildNodes } from "../flowchart/buildNodes";
import { computeAddStepChainEvents } from "../flowchart/utils/stepInsertion";
import { withGraphMetadata } from "../flowchart/utils/layoutMetadata";
import type { FlowTemplate } from "./types";
import { useTemplateBrowser } from "./hooks/useTemplateBrowser";
import { TemplateCard } from "./components/TemplateCard";
import { TemplateToolbar } from "./components/TemplateToolbar";
import { categoryIcon } from "./components/templateIcons";
import { CATEGORY_BY_ID } from "./categories";

interface TemplatesViewProps {
  projs: any;
  auts: any;
  flow: any;
  setView: (v: any) => void;
  notify: (msg: string) => void;
}

/**
 * The template marketplace.
 *
 * Grouped by category with a search box and a featured row, but the two actions
 * are unchanged: append the chain to the flow that is open, or create a new
 * automation from it. Both hand over `steps`, not bare node types, so the
 * template's own configuration travels with it.
 */
export function TemplatesView({ projs, auts, flow, setView, notify }: TemplatesViewProps) {
  const hasOpenFlow = !!auts.selectedAutomation && !!auts.selectedProjectDetail;
  const browser = useTemplateBrowser();

  /** Insert the chain after the last node of the currently open flow. */
  const insertIntoCurrent = async (tmpl: FlowTemplate) => {
    const detail = auts.selectedProjectDetail;
    if (!detail) return;
    const nodes = buildNodes(detail.events, detail.target_app);
    const withOut = nodes.filter((n) => (n.ports?.outputs?.length ?? 0) > 0);
    const last = withOut[withOut.length - 1];
    try {
      await flow.addStepChain(tmpl.steps, last?.id ?? "start");
      notify(`Plantilla "${tmpl.title}" añadida al flujo`);
      setView("project-details");
    } catch (e) {
      notify(String(e));
    }
  };

  /** Create a brand-new automation wired from the template. */
  const createFromTemplate = async (tmpl: FlowTemplate) => {
    if (!projs.selectedProject) {
      notify("Selecciona primero un proyecto en la Biblioteca");
      return;
    }
    try {
      const newAut = await invoke<{ id: string }>("create_empty_automation", {
        projectName: projs.selectedProject.name,
        name: tmpl.title,
      });
      const events = await computeAddStepChainEvents({ events: [] } as any, tmpl.steps, "start", undefined);
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
      notify(`Automatización "${tmpl.title}" creada`);
    } catch (e) {
      notify(String(e));
    }
  };

  const cardProps = {
    onCreate: createFromTemplate,
    ...(hasOpenFlow ? { onInsert: insertIntoCurrent } : {}),
  };

  const countFor = (id: any) =>
    id === "todas" ? browser.counts.total : browser.counts.perCategory.get(id) ?? 0;

  return (
    <div className="tpl-page">
      <header className="tpl-header">
        <div className="tpl-header-icon">
          <LayoutTemplate size={22} />
        </div>
        <div className="tpl-header-text">
          <h1>Plantillas de flujo</h1>
          <p>
            {browser.counts.total} flujos listos para usar, agrupados por categoría. Cada plantilla
            viene con sus nodos ya configurados: insértala en el canvas abierto o crea una
            automatización nueva
            {projs.selectedProject ? <> en <b>{projs.selectedProject.name}</b></> : ""}.
          </p>
          <p className="tpl-header-stats">
            <span className="tpl-badge ready">{browser.counts.ready} sin configurar nada</span>
            <span className="tpl-badge needs">
              {browser.counts.withCredentials} piden credenciales de un servicio externo
            </span>
          </p>
        </div>
      </header>

      <TemplateToolbar
        query={browser.query}
        setQuery={browser.setQuery}
        category={browser.category}
        setCategory={browser.setCategory}
        onlyReady={browser.onlyReady}
        setOnlyReady={browser.setOnlyReady}
        countFor={countFor}
        resultCount={browser.matches.length}
      />

      {browser.isBrowsingAll && (
        <section className="tpl-section">
          <h2 className="tpl-section-title">
            <Flame size={15} /> Las más usadas
          </h2>
          <p className="tpl-section-blurb">Las que más gente empieza usando, por popularidad.</p>
          <div className="tpl-grid">
            {browser.featured.map((tmpl) => (
              <TemplateCard key={`top-${tmpl.id}`} template={tmpl} {...cardProps} />
            ))}
          </div>
        </section>
      )}

      {browser.groups.length === 0 && (
        <p className="tpl-empty">
          Ninguna plantilla coincide con «{browser.query}». Prueba otra palabra o quita el filtro.
        </p>
      )}

      {browser.groups.map(({ category, templates }) => (
        <section className="tpl-section" key={category.id}>
          <h2 className="tpl-section-title">
            {categoryIcon(category.icon, 15)} {category.label}
            <span className="tpl-section-count">{templates.length}</span>
          </h2>
          <p className="tpl-section-blurb">{category.blurb}</p>
          <div className="tpl-grid">
            {templates.map((tmpl) => (
              <TemplateCard
                key={tmpl.id}
                template={tmpl}
                {...cardProps}
                showCategory={browser.category !== tmpl.category}
              />
            ))}
          </div>
        </section>
      ))}

      {browser.category !== "todas" && (
        <p className="tpl-empty">
          Categoría activa: <b>{CATEGORY_BY_ID[browser.category].label}</b>. Pulsa «Todas» para ver el
          catálogo completo.
        </p>
      )}
    </div>
  );
}

export default TemplatesView;
