import { useMemo, useState } from "react";
import { FLOW_TEMPLATE_CATALOG, FEATURED_TEMPLATES } from "../catalog";
import { CATEGORY_BY_ID } from "../categories";
import type { FlowTemplate, TemplateCategory } from "../types";

export type CategoryFilter = TemplateCategory | "todas";

/**
 * Search and filtering for the marketplace.
 *
 * Kept as a hook rather than inline state so the view stays a rendering
 * component: the filter is the only logic on the page, and it is easier to
 * reason about (and to extend) on its own.
 */
export function useTemplateBrowser() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("todas");
  const [onlyReady, setOnlyReady] = useState(false);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return FLOW_TEMPLATE_CATALOG.filter((t) => {
      if (category !== "todas" && t.category !== category) return false;
      // "Ready" means it runs with nothing to configure, which is the question
      // a user new to the marketplace is actually asking.
      if (onlyReady && t.requires.length > 0) return false;
      if (!needle) return true;
      const haystack = [t.title, t.description, ...t.tags, CATEGORY_BY_ID[t.category].label]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, category, onlyReady]);

  /** Results grouped by category, most popular first inside each group. */
  const groups = useMemo(() => {
    const byCategory = new Map<TemplateCategory, FlowTemplate[]>();
    for (const t of matches) {
      const list = byCategory.get(t.category) ?? [];
      list.push(t);
      byCategory.set(t.category, list);
    }
    return [...byCategory].map(([id, templates]) => ({
      category: CATEGORY_BY_ID[id],
      templates: templates.sort((a, b) => b.popularity - a.popularity || a.title.localeCompare(b.title)),
    }));
  }, [matches]);

  const isBrowsingAll = query.trim() === "" && category === "todas" && !onlyReady;
  const counts = useMemo(() => {
    const perCategory = new Map<TemplateCategory, number>();
    let withCredentials = 0;
    let ready = 0;
    for (const t of FLOW_TEMPLATE_CATALOG) {
      perCategory.set(t.category, (perCategory.get(t.category) ?? 0) + 1);
      if (t.requires.length > 0) withCredentials += 1;
      else ready += 1;
    }
    return { perCategory, withCredentials, ready, total: FLOW_TEMPLATE_CATALOG.length };
  }, []);

  return {
    query, setQuery,
    category, setCategory,
    onlyReady, setOnlyReady,
    matches, groups, counts,
    isBrowsingAll,
    featured: FEATURED_TEMPLATES,
  };
}
