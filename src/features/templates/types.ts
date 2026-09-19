import type { FlowNodeType } from "../../types";
import type { CredentialRequirement, RuntimeRequirement } from "./nodeContract";

/** Stable category ids. The display name lives in `categories.ts`. */
export type TemplateCategory =
  | "formularios-datos"
  | "hojas-archivos"
  | "notificaciones"
  | "ia-texto"
  | "web-apis"
  | "bases-datos"
  | "archivos-disco"
  | "escritorio-rpa"
  | "control-flujo"
  | "programadas"
  | "scraping-parseo"
  | "productividad";

/**
 * One step of a template chain.
 *
 * `data` is merged over the seed `buildAddedEvents` produces for `type`. A step
 * without `data` uses the default configuration, which is only correct when the
 * step stands alone — a step that feeds or reads another step almost always
 * needs to name the same variable, path or field.
 */
export interface TemplateStep {
  type: FlowNodeType;
  data?: Record<string, unknown>;
}

/** A template exactly as it is stored in the category JSON files. */
export interface StoredTemplate {
  id: string;
  title: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  /** 0-100. «Más usadas» is derived from this, so it cannot drift from it. */
  popularity: number;
  /** Credentials the user must supply. Environmental needs are derived instead. */
  requires: CredentialRequirement[];
  steps: TemplateStep[];
}

/** A template once the catalog has finished deriving its computed fields. */
export interface FlowTemplate extends StoredTemplate {
  /** The node types in order, for the chain preview and for compatibility. */
  chain: FlowNodeType[];
  /** True for the high-popularity slice shown in the featured row. */
  featured: boolean;
  /** Non-secret dependencies of the chain, computed from its node kinds. */
  runtime: RuntimeRequirement[];
  /** Every kind in the chain that needs no credential, network or desktop. */
  locallyVerifiable: boolean;
}
