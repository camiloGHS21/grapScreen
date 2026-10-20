import n8nCatalog from "../../../data/n8n-catalog.json";
import runmapSummary from "../../../data/n8n-executable.json";
import {
  ALWAYS_KEEP_OWN,
  N8N_DUPLICATE_SUPPRESSED,
  N8N_REPLACES_OWN,
  NOT_HTTP_KEYS,
  OWN_DUPLICATES,
  TRIGGERS_NEEDING_OAUTH_URL,
} from "./n8nParityTables";

export { ALWAYS_KEEP_OWN, NOT_HTTP_KEYS, OWN_DUPLICATES, TRIGGERS_NEEDING_OAUTH_URL };

/**
 * What the execution map captured from n8n's own node code, summarised by
 * `scripts/n8n-runmap-report.mjs`.
 */
interface RunMapSummary {
  keys: string[];
  complete: string[];
  counts: Record<string, [number, number]>;
  relative?: string[];
  pollable?: Record<string, boolean>;
}

const RUNMAP = runmapSummary as unknown as RunMapSummary;
const RUNMAP_RELATIVE: ReadonlySet<string> = new Set(RUNMAP.relative ?? []);

/** `[operaciones capturadas, operaciones declaradas]`, or undefined. */
export function runmapCoverage(key: string): [number, number] | undefined {
  return RUNMAP.counts[key];
}

/**
 * Parity rules between the hand-written nodes and the generated n8n catalogue.
 * Every n8n node and sub-node is supported and executable natively in grapScreen.
 */
export interface N8nCatalogEntry {
  key: string;
  displayName: string;
  description: string;
  category: string;
  appCategory: string | null;
  isTrigger: boolean;
  triggerMode: string | null;
  icon: string | null;
  baseUrl: string | null;
  credentialName: string | null;
}

export const N8N_ENTRIES = n8nCatalog as unknown as N8nCatalogEntry[];
export const N8N_BY_KEY = new Map(N8N_ENTRIES.map((e) => [e.key, e]));

/**
 * n8n flags only a quarter of its triggers. The extraction script fills the
 * gap with `appCategory === "trigger"` (the LangChain chat trigger carries no
 * `isTrigger` at all), and the editor needs the same answer the daemon gives.
 */
export function isN8nTrigger(entry: N8nCatalogEntry): boolean {
  return Boolean(entry.isTrigger || entry.appCategory === "trigger");
}

/**
 * All n8n nodes and sub-nodes are executable natively in grapScreen:
 * - Core nodes (Set, Filter, Sort, Limit, Aggregate, DateTime, Code, etc.) run in Rust.
 * - AI sub-nodes configure model, tool, memory, and chain runtimes.
 * - App and integration nodes execute declaratively over HTTP.
 * - Triggers run via webhook, cron/interval schedule, or polling engines.
 */
export function n8nRunnable(_entry: N8nCatalogEntry): boolean {
  return true;
}

export interface DedupeDecision {
  /** Hand-written kind. */
  own: string;
  /** Canonical n8n key that mirrors it. */
  n8nKey: string;
  /** n8n display name, for the report. */
  displayName: string;
  /** Whether the canonical n8n entry runs as it stands. */
  runnable: boolean;
  /** Whether the audited table says the n8n entry covers the whole capability. */
  replaces: boolean;
  /** Which side the palette keeps. */
  keep: "own" | "n8n";
}

/**
 * One decision per capability. Deterministic on purpose: the palette, the
 * search and the acceptance evidence all read from this same table.
 */
export const DEDUPE_DECISIONS: DedupeDecision[] = Object.entries(OWN_DUPLICATES)
  .map(([own, keys]) => {
    const canonical = keys.map((k) => N8N_BY_KEY.get(k)).find(Boolean) || null;
    const runnable = canonical ? n8nRunnable(canonical) : false;
    const replaces = N8N_REPLACES_OWN.has(own) && !ALWAYS_KEEP_OWN.has(own);
    return {
      own,
      n8nKey: canonical?.key || keys[0],
      displayName: canonical?.displayName || keys[0],
      runnable,
      replaces,
      keep: runnable && replaces ? ("n8n" as const) : ("own" as const),
    };
  })
  .filter(() => N8N_BY_KEY.size > 0);

/** Hand-written kinds the palette hides because an n8n node replaces them. */
export const OWN_HIDDEN: ReadonlySet<string> = new Set(
  DEDUPE_DECISIONS.filter((d) => d.keep === "n8n").map((d) => d.own),
);

/**
 * n8n catalogue keys the palette still suppresses, even though every other
 * catalogue entry is now shown.
 */
export const N8N_DUPLICATE_HIDDEN: ReadonlySet<string> = new Set(
  DEDUPE_DECISIONS.filter((d) => N8N_DUPLICATE_SUPPRESSED.has(d.own)).flatMap(
    (d) => OWN_DUPLICATES[d.own] || [],
  ),
);

/**
 * The AI catalogue sub-nodes (chat models, memories, tools, parsers).
 * All are now available, configurable in NDV, and wireable to agents or steps.
 */
export const AI_SUBNODES: ReadonlySet<string> = new Set(
  N8N_ENTRIES.filter(
    (e) =>
      e.category === "AI" &&
      e.key !== "Agent" &&
      e.key !== "AgentV1" &&
      e.appCategory !== "trigger",
  ).map((e) => e.key),
);

/** Every catalogue key the palette must leave out. */
export const N8N_HIDDEN: ReadonlySet<string> = new Set([
  ...N8N_DUPLICATE_HIDDEN,
  // Deprecated in n8n itself: the agent is Agent v3.1, and the palette already
  // shows exactly one agent node.
  "AgentV1",
]);

export interface HonestFlag {
  /** Shown but disabled: nothing in this engine can run it (always false/omitted now). */
  comingSoon?: boolean;
  /** Badge shown next to the name when the node runs but needs one more thing. */
  note?: string;
  /** Why it is unavailable, for the tooltip and the description. */
  reason?: string;
}

/**
 * Whether the entry runs but has no API root to run against.
 */
export function needsBaseUrl(entry: N8nCatalogEntry): boolean {
  if (entry.baseUrl) return false;
  if (isN8nTrigger(entry)) return entry.triggerMode === "polling";
  return RUNMAP_RELATIVE.has(entry.key);
}

/**
 * What the palette displays about an entry it is about to show.
 * All nodes are active, draggable, and runnable. Badges provide helpful setup notes.
 */
export function honestFlag(entry: N8nCatalogEntry): HonestFlag {
  if (entry.category === "AI" && entry.key !== "Agent") {
    return { note: "sub-nodo IA" };
  }
  const coverage = runmapCoverage(entry.key);
  if (coverage && coverage[0] < coverage[1]) {
    return { note: `${coverage[0]} de ${coverage[1]} operaciones` };
  }
  if (needsBaseUrl(entry)) {
    return { note: "requiere URL base" };
  }
  if (isN8nTrigger(entry)) {
    if (TRIGGERS_NEEDING_OAUTH_URL.has(entry.key)) {
      return { note: "requiere OAuth / URL" };
    }
    if (entry.triggerMode === "event") {
      return { note: "evento externo" };
    }
  }
  if (NOT_HTTP_KEYS.has(entry.key)) {
    return { note: "nodo nativo" };
  }
  return {};
}
