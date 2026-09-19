import React from "react";
import { ArrowRight, Plus, Workflow } from "lucide-react";
import { getNodeIcon } from "../../flowchart/buildNodes";
import { ADD_CATEGORIES } from "../../flowchart/addCategories";
import { NODE_COLORS } from "../../../Flowchart";
import type { FlowNodeType } from "../../../types";
import type { FlowTemplate } from "../types";
import { CATEGORY_BY_ID } from "../categories";
import { REQUIREMENT_LABELS, RUNTIME_LABELS } from "../nodeContract";
import { RequirementBadge, categoryIcon } from "./templateIcons";

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  ADD_CATEGORIES.flatMap((c) => c.items.map((it) => [it.type, it.label]))
);

interface TemplateCardProps {
  template: FlowTemplate;
  /** Only offered while a saved flow is open, since it appends to it. */
  onInsert?: (template: FlowTemplate) => void;
  onCreate: (template: FlowTemplate) => void;
  showCategory?: boolean;
}

export function TemplateCard({ template, onInsert, onCreate, showCategory = true }: TemplateCardProps) {
  const category = CATEGORY_BY_ID[template.category];
  return (
    <article className="tpl-card">
      <div className="tpl-card-head">
        <span className="tpl-card-icon">{categoryIcon(category.icon, 16)}</span>
        <div className="tpl-card-title">
          <h3>{template.title}</h3>
          {showCategory && (
            <span className="tpl-card-cat">
              {category.label}
              {template.featured && <span className="tpl-top">más usada</span>}
            </span>
          )}
        </div>
      </div>

      <p className="tpl-card-desc">{template.description}</p>

      <div className="tpl-chain">
        {template.chain.map((step: FlowNodeType, i: number) => (
          <React.Fragment key={`${template.id}-${i}`}>
            {i > 0 && <ArrowRight size={11} className="tpl-chain-arrow" />}
            <span className="tpl-chip" style={{ borderColor: NODE_COLORS[step], color: NODE_COLORS[step] }} title={step}>
              {getNodeIcon(step, 11)}
              <span>{TYPE_LABELS[step] || step}</span>
            </span>
          </React.Fragment>
        ))}
      </div>

      <div className="tpl-tags">
        <RequirementBadge
          credentials={template.requires}
          runtime={template.runtime}
          labels={REQUIREMENT_LABELS}
          runtimeLabels={RUNTIME_LABELS}
        />
        <span className="tpl-tag-pop" title="Popularidad">
          {template.popularity}%
        </span>
      </div>

      <div className="tpl-actions">
        {onInsert && (
          <button type="button" className="tpl-btn ghost" onClick={() => onInsert(template)}>
            <Workflow size={12} /> Añadir al flujo actual
          </button>
        )}
        <button type="button" className="tpl-btn primary" onClick={() => onCreate(template)}>
          <Plus size={12} /> Nueva automatización
        </button>
      </div>
    </article>
  );
}

export default TemplateCard;
