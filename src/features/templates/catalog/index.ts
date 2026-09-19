import type { FlowNodeType } from "../../../types";
import { CATEGORY_BY_ID } from "../categories";
import {
  FORBIDDEN_KINDS,
  RUNTIME_TRAITS,
  TEMPLATE_NODE_TYPES,
  type RuntimeRequirement,
} from "../nodeContract";
import type { FlowTemplate, StoredTemplate, TemplateCategory } from "../types";

import formularios from "./formularios-datos.json";
import hojas from "./hojas-archivos.json";
import notificaciones from "./notificaciones.json";
import iaTexto from "./ia-texto.json";
import webApis from "./web-apis.json";
import basesDatos from "./bases-datos.json";
import archivosDisco from "./archivos-disco.json";
import escritorioRpa from "./escritorio-rpa.json";
import controlFlujo from "./control-flujo.json";
import programadas from "./programadas.json";
import scrapingParseo from "./scraping-parseo.json";
import productividad from "./productividad.json";

/**
 * Every template, as authored. The JSON split is by category so no single file
 * approaches the size limit, and so a category can be reviewed on its own.
 */
export const STORED_TEMPLATES: StoredTemplate[] = [
  ...formularios, ...hojas, ...notificaciones, ...iaTexto, ...webApis,
  ...basesDatos, ...archivosDisco, ...escritorioRpa, ...controlFlujo,
  ...programadas, ...scrapingParseo, ...productividad,
] as StoredTemplate[];

/** Popularity at or above which a template is shown in the featured row. */
export const FEATURED_POPULARITY = 82;

const KNOWN_TYPES = new Set<string>(TEMPLATE_NODE_TYPES);

/**
 * Computes the non-secret dependencies of a chain.
 *
 * Derived rather than declared: a template that adds an `http_request` step
 * would otherwise keep claiming it needs nothing, and no reviewer would catch
 * it. `network`, `desktop`, `node` and `database` come from `RUNTIME_TRAITS`.
 */
export function runtimeRequirementsOf(chain: FlowNodeType[]): RuntimeRequirement[] {
  const found = new Set<RuntimeRequirement>();
  for (const type of chain) {
    for (const trait of RUNTIME_TRAITS[type] ?? []) found.add(trait);
  }
  return [...found].sort();
}

/**
 * True when nothing in the chain reaches outside the machine: no credential, no
 * network call and no synthetic input. These are the templates the Rust
 * end-to-end test can execute for real.
 */
export function isLocallyVerifiable(chain: FlowNodeType[]): boolean {
  if (runtimeRequirementsOf(chain).some((r) => r !== "node" && r !== "database")) return false;
  return chain.every((type) => KNOWN_TYPES.has(type) && !FORBIDDEN_KINDS[type]);
}

/**
 * Fills in everything derivable from a stored template.
 *
 * `featured` is a function of `popularity` on purpose: a hand-written flag is
 * one more thing that can disagree with the ordering the UI actually shows.
 */
function derive(t: StoredTemplate): FlowTemplate {
  const chain = t.steps.map((s) => s.type);
  return {
    ...t,
    category: t.category as TemplateCategory,
    chain,
    featured: t.popularity >= FEATURED_POPULARITY,
    runtime: runtimeRequirementsOf(chain),
    locallyVerifiable: isLocallyVerifiable(chain),
  };
}

export const FLOW_TEMPLATE_CATALOG: FlowTemplate[] = STORED_TEMPLATES.map(derive);

/** The featured slice, most popular first. */
export const FEATURED_TEMPLATES: FlowTemplate[] = FLOW_TEMPLATE_CATALOG
  .filter((t) => t.featured)
  .sort((a, b) => b.popularity - a.popularity || a.title.localeCompare(b.title));

export const TEMPLATES_BY_CATEGORY: { category: (typeof CATEGORY_BY_ID)[TemplateCategory]; templates: FlowTemplate[] }[] =
  Object.values(CATEGORY_BY_ID).map((category) => ({
    category,
    templates: FLOW_TEMPLATE_CATALOG
      .filter((t) => t.category === category.id)
      .sort((a, b) => b.popularity - a.popularity || a.title.localeCompare(b.title)),
  }));

/**
 * The catalog is the only list of templates. The `FLOW_TEMPLATES` facade the
 * add-node menu used to own lives in `features/flowchart/addCategories.tsx` and
 * is derived from `FLOW_TEMPLATE_CATALOG`, so there is one source of truth
 * rather than two lists that can disagree.
 */
export type { StoredTemplate, FlowTemplate };
