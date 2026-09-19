import n8nCatalog from "../../../data/n8n-catalog.json";
import runmapSummary from "../../../data/n8n-executable.json";
import { ALWAYS_KEEP_OWN, NOT_HTTP_KEYS, OWN_DUPLICATES } from "./n8nParityTables";

export { ALWAYS_KEEP_OWN, NOT_HTTP_KEYS, OWN_DUPLICATES };

/**
 * What the execution map captured from n8n's own node code, summarised by
 * `scripts/n8n-runmap-report.mjs`.
 *
 * `keys` are the nodes with at least one operation whose HTTP request was
 * captured; `complete` are those where *every* declared operation was. The
 * palette shows the first and badges the difference, because a node that runs
 * half of its operations is not the same offer as one that runs all of them.
 */
interface RunMapSummary {
  keys: string[];
  complete: string[];
  counts: Record<string, [number, number]>;
}

const RUNMAP = runmapSummary as unknown as RunMapSummary;
const RUNMAP_KEYS: ReadonlySet<string> = new Set(RUNMAP.keys);
const RUNMAP_COMPLETE: ReadonlySet<string> = new Set(RUNMAP.complete);

/** `[operaciones capturadas, operaciones declaradas]`, or undefined. */
export function runmapCoverage(key: string): [number, number] | undefined {
  return RUNMAP.counts[key];
}

/**
 * Parity rules between the hand-written nodes and the generated n8n catalogue.
 *
 * The palette merges both worlds, so the same capability can appear twice: once
 * as a hand-written node that the Rust engine executes natively and once as the
 * generated n8n entry that the declarative runner executes over HTTP. This
 * module decides, capability by capability, which of the two is the honest one
 * to show, and flags whatever is shown but cannot run.
 *
 * The three questions it answers:
 *   1. Is this catalogue entry executable *by this engine*, as it stands?
 *   2. Which hand-written node does it duplicate, and who wins?
 *   3. When something is shown but cannot run, what is the reason?
 *
 * Everything is derived from `src/data/n8n-catalog.json` plus the curated
 * duplicate table below (taken from `n8n-nodes-completo.json`, which maps every
 * hand-written kind onto the n8n node it mirrors). No hand-maintained copy of
 * the catalogue lives here: change the data, the palette follows.
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
 * Whether the declarative runner can execute this entry as it stands.
 *
 * - The agent is the one AI node with a native runner, so it runs.
 * - Every other AI entry is a LangChain sub-node: it configures a chain, it is
 *   not a step, and the engine has no runner for it.
 * - Core nodes transform items in-process (If, Set, Code, Merge…); the generic
 *   HTTP runner cannot do any of that.
 * - App nodes run when the descriptor knows their API root. Without one the
 *   request has nowhere to go, which the palette states instead of hiding.
 * - Triggers run when the daemon can arm them: a webhook it can serve, a
 *   schedule it can time, or a polling node with an API root. `event` triggers
 *   (Kafka, MQTT, IMAP, manual) need a client or an external caller.
 */
export function n8nRunnable(entry: N8nCatalogEntry): boolean {
  // Two entries are executed by a native Rust runner rather than by the HTTP
  // map: the agent (its own model/tool runtime) and Postgres (a real driver).
  if (entry.key === "Agent" || entry.key === "Postgres") return true;
  if (entry.category === "AI") return false;
  if (NOT_HTTP_KEYS.has(entry.key)) return false;
  if (isN8nTrigger(entry)) {
    switch (entry.triggerMode) {
      case "webhook":
        return true;
      case "schedule":
        return true;
      case "polling":
        return Boolean(entry.baseUrl);
      default:
        return false;
    }
  }
  if (entry.category === "Core") return false;
  // An app node runs when the request it builds was captured from n8n's own
  // code. A base URL alone proves nothing: without the path and the body the
  // call goes to the API root, which is how a node that "looked runnable"
  // answered 404.
  return RUNMAP_KEYS.has(entry.key);
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
    // "Runnable" is not enough to replace a hand-written node: a catalogue node
    // that only captured half of its operations would *narrow* the capability.
    // Only a node that runs every operation it declares wins the spot; the rest
    // stay behind the native implementation until the capture covers them.
    const complete = canonical ? RUNMAP_COMPLETE.has(canonical.key) : false;
    return {
      own,
      n8nKey: canonical?.key || keys[0],
      displayName: canonical?.displayName || keys[0],
      runnable,
      keep: runnable && complete && !ALWAYS_KEEP_OWN.has(own) ? ("n8n" as const) : ("own" as const),
    };
  })
  .filter((d) => N8N_BY_KEY.size > 0);

/** Hand-written kinds the palette hides because an n8n node replaces them. */
export const OWN_HIDDEN: ReadonlySet<string> = new Set(
  DEDUPE_DECISIONS.filter((d) => d.keep === "n8n").map((d) => d.own),
);

/** n8n catalogue keys the palette hides: duplicates of a kept hand-written node. */
export const N8N_DUPLICATE_HIDDEN: ReadonlySet<string> = new Set(
  DEDUPE_DECISIONS.filter((d) => d.keep === "own").flatMap((d) => OWN_DUPLICATES[d.own] || []),
);

/**
 * The AI catalogue is a sub-node catalogue: chat models, memories, tools and
 * output parsers exist to be wired to an agent, which is how n8n's own panel
 * offers them. They stay out of the step palette (they are not steps and the
 * engine has no runner for them) and live in the agent's port panels instead,
 * where `aiPortCatalog.ts` lists them with their real keys.
 */
export const AI_SUBNODE_HIDDEN: ReadonlySet<string> = new Set(
  N8N_ENTRIES.filter((e) => e.category === "AI" && e.key !== "Agent" && e.appCategory !== "trigger").map(
    (e) => e.key,
  ),
);

/** Every catalogue key the palette must leave out. */
export const N8N_HIDDEN: ReadonlySet<string> = new Set([
  ...N8N_DUPLICATE_HIDDEN,
  ...AI_SUBNODE_HIDDEN,
  // Deprecated in n8n itself: the agent is Agent v3.1, and the palette already
  // shows exactly one agent node.
  "AgentV1",
]);

export interface HonestFlag {
  /** Shown but disabled: nothing in this engine can run it. */
  comingSoon?: boolean;
  /** Badge shown next to the name when the node runs but needs one more thing. */
  note?: string;
  /** Why it is unavailable, for the tooltip and the description. */
  reason?: string;
}

/**
 * What the palette must say about an entry it is about to show.
 *
 * Two levels, because "cannot run" and "cannot run yet" are different:
 * a missing API root is fixable by typing one on the node, an unimplemented
 * runner is not, so the first is a badge and the second disables the entry.
 */
export function honestFlag(entry: N8nCatalogEntry): HonestFlag {
  if (n8nRunnable(entry)) return {};

  if (isN8nTrigger(entry)) {
    const mode = entry.triggerMode || "event";
    if (mode === "event") {
      return {
        comingSoon: true,
        reason: "requiere un cliente externo (Kafka, MQTT, IMAP); este motor no lo arma",
      };
    }
    if (mode === "polling") {
      return { note: "requiere URL base" };
    }
    return { comingSoon: true, reason: "este motor no implementa este disparador" };
  }

  if (entry.category === "Core") {
    return {
      comingSoon: true,
      reason: "nodo de datos de n8n: el motor solo ejecuta su equivalente propio",
    };
  }

  if (entry.category === "AI") {
    return { comingSoon: true, reason: "sub-nodo de agente: se conecta a un nodo de agente" };
  }

  if (!entry.baseUrl) {
    return { note: "requiere URL base" };
  }

  // App nodes are only shown when they run, so reaching this point means the
  // node is runnable but not every operation was captured.
  const coverage = runmapCoverage(entry.key);
  if (coverage && coverage[0] < coverage[1]) {
    return { note: `${coverage[0]} de ${coverage[1]} operaciones` };
  }

  return { comingSoon: true, reason: "el motor no puede ejecutar este nodo" };
}
