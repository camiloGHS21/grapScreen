import React from "react";
import type { UIElement } from "../../../types";
import { TYPE_ICONS } from "./UIBuilderTemplates";

export function TreeNode({ el, sel, onSel, depth }: { el: UIElement; sel: string | null; onSel: (id: string) => void; depth: number }) {
  const isSel = sel === el.id;
  const hasChildren = el.children && el.children.length > 0;
  const label = el.props.text || el.props.placeholder || el.props.outputVar || el.name;
  return (
    <div className="ub-tree-node-wrap">
      <div
        className={`ub-tree-node${isSel ? " selected" : ""}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={(e) => { e.stopPropagation(); onSel(el.id); }}
      >
        <span className="ub-tree-icon">{TYPE_ICONS[el.type] || "❓"}</span>
        <span className="ub-tree-label">{label}</span>
        <span className="ub-tree-type">{el.type}</span>
      </div>
      {hasChildren && el.children!.map(c => <TreeNode key={c.id} el={c} sel={sel} onSel={onSel} depth={depth + 1} />)}
    </div>
  );
}

export function TreeView({ elements, sel, onSel }: { elements: UIElement[]; sel: string | null; onSel: (id: string) => void }) {
  if (elements.length === 0) return <div className="ub-tree-empty">Sin componentes</div>;
  return <div className="ub-tree">{elements.map(el => <TreeNode key={el.id} el={el} sel={sel} onSel={onSel} depth={0} />)}</div>;
}
