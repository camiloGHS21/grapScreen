import React from "react";
import { Search, X } from "lucide-react";
import { TEMPLATE_CATEGORIES } from "../categories";
import { categoryIcon } from "./templateIcons";
import type { CategoryFilter } from "../hooks/useTemplateBrowser";

interface TemplateToolbarProps {
  query: string;
  setQuery: (value: string) => void;
  category: CategoryFilter;
  setCategory: (value: CategoryFilter) => void;
  onlyReady: boolean;
  setOnlyReady: (value: boolean) => void;
  countFor: (category: CategoryFilter) => number;
  resultCount: number;
}

export function TemplateToolbar({
  query, setQuery, category, setCategory, onlyReady, setOnlyReady, countFor, resultCount,
}: TemplateToolbarProps) {
  return (
    <div className="tpl-toolbar">
      <div className="tpl-search">
        <Search size={14} />
        <input
          type="search"
          value={query}
          placeholder="Buscar por nombre, etiqueta o categoría…"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar plantillas"
        />
        {query && (
          <button type="button" className="tpl-search-clear" onClick={() => setQuery("")} aria-label="Limpiar búsqueda">
            <X size={13} />
          </button>
        )}
      </div>

      <label className="tpl-toggle">
        <input type="checkbox" checked={onlyReady} onChange={(e) => setOnlyReady(e.target.checked)} />
        Solo las que funcionan sin configurar nada
      </label>

      <div className="tpl-categories">
        <button
          type="button"
          className={`tpl-cat-chip ${category === "todas" ? "active" : ""}`}
          onClick={() => setCategory("todas")}
        >
          Todas <span>{countFor("todas")}</span>
        </button>
        {TEMPLATE_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`tpl-cat-chip ${category === c.id ? "active" : ""}`}
            onClick={() => setCategory(c.id)}
            title={c.blurb}
          >
            {categoryIcon(c.icon, 12)}
            {c.label} <span>{countFor(c.id)}</span>
          </button>
        ))}
      </div>

      <p className="tpl-result-count" aria-live="polite">
        {resultCount === 1 ? "1 plantilla" : `${resultCount} plantillas`}
      </p>
    </div>
  );
}

export default TemplateToolbar;
