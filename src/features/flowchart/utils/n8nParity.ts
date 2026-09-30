import n8nCatalog from "../../../data/n8n-catalog.json";
import runmapSummary from "../../../data/n8n-executable.json";
import {
  ALWAYS_KEEP_OWN,
  EVENT_TRIGGER_REASONS,
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
 *
 * `keys` are the nodes with at least one operation whose HTTP request was
 * captured; `complete` are those where *every* declared operation was. The
 * palette shows the first and badges the difference, because a node that runs
 * half of its operations is not the same offer as one that runs all of them.
 *
 * `relative` are the nodes whose captured request is a *path*, not a URL
 * (`{{$credentials.oauthTokenData.instance_url}}/services/data/…`): they run,
 * but only once something supplies the API root.
 */
interface RunMapSummary {
  keys: string[];
  complete: string[];
  counts: Record<string, [number, number]>;
  relative?: string[];
  pollable?: Record<string, boolean>;
}

const RUNMAP = runmapSummary as unknown as RunMapSummary;
const RUNMAP_KEYS: ReadonlySet<string> = new Set(RUNMAP.keys);
const RUNMAP_RELATIVE: ReadonlySet<string> = new Set(RUNMAP.relative ?? []);
const RUNMAP_POLLABLE: ReadonlySet<string> = new Set(Object.keys(RUNMAP.pollable ?? {}));

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
    // A captured request this vault can never complete is not a runnable
    // trigger: the URL would go out with no host.
    if (TRIGGERS_NEEDING_OAUTH_URL.has(entry.key)) return false;
    switch (entry.triggerMode) {
      case "webhook":
        return true;
      case "schedule":
        return true;
      case "polling":
        // A polling trigger must know *what* to fetch. With the `poll()` call
        // captured it polls the endpoint n8n would; without one it would poll
        // the API root, which is a loop that never sees data.
        return RUNMAP_POLLABLE.has(entry.key);
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
  /** Whether the audited table says the n8n entry covers the whole capability. */
  replaces: boolean;
  /** Which side the palette keeps. */
  keep: "own" | "n8n";
}

/**
 * One decision per capability. Deterministic on purpose: the palette, the
 * search and the acceptance evidence all read from this same table.
 *
 * Two conditions, and the second is the one that stops the swap from losing
 * capabilities. `runnable` says the engine can execute the n8n entry at all;
 * `replaces` says an audit found that entry does everything the hand-written
 * node did. Without the second, the 45 duplicates whose n8n side cannot run
 * (Core data nodes, LangChain sub-nodes, broker triggers) would take the slot
 * from a node that works and leave the capability unusable.
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
  .filter((d) => N8N_BY_KEY.size > 0);

/** Hand-written kinds the palette hides because an n8n node replaces them. */
export const OWN_HIDDEN: ReadonlySet<string> = new Set(
  DEDUPE_DECISIONS.filter((d) => d.keep === "n8n").map((d) => d.own),
);

/**
 * n8n catalogue keys the palette still suppresses, even though every other
 * catalogue entry is now shown.
 *
 * The catalogue is shown whole: an entry being a duplicate of a hand-written
 * node is no longer a reason to hide it, because a duplicate that runs is the
 * better node and one that cannot run is shown blocked with its reason. The one
 * exception is where showing it would offer a *worse* node for a capability that
 * already has a working one (`N8N_DUPLICATE_SUPPRESSED`).
 */
export const N8N_DUPLICATE_HIDDEN: ReadonlySet<string> = new Set(
  DEDUPE_DECISIONS.filter((d) => N8N_DUPLICATE_SUPPRESSED.has(d.own)).flatMap(
    (d) => OWN_DUPLICATES[d.own] || [],
  ),
);

/**
 * The AI catalogue is a sub-node catalogue: chat models, memories, tools and
 * output parsers exist to be wired to an agent, which is how n8n's own panel
 * offers them. They are shown in the palette like every other catalogue entry —
 * the user asked for the whole catalogue, and hiding 109 of 565 entries is not
 * "the whole catalogue" — but always blocked, because they are not steps and
 * the engine has no runner for them. The agent's port panels
 * (`aiPortCatalog.ts`) stay the place where they are actually picked, and this
 * set is what tells the two situations apart.
 *
 * The two agent keys are left out: `Agent` is the counterpart of the
 * hand-written agent (`N8N_DUPLICATE_SUPPRESSED`) and `AgentV1` is deprecated,
 * so neither is a sub-node of anything.
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
  /** Shown but disabled: nothing in this engine can run it. */
  comingSoon?: boolean;
  /** Badge shown next to the name when the node runs but needs one more thing. */
  note?: string;
  /** Why it is unavailable, for the tooltip and the description. */
  reason?: string;
}

/** Why an entry the engine cannot run is unavailable, in its own terms. */
function unavailableReason(entry: N8nCatalogEntry): string {
  if (isN8nTrigger(entry)) {
    const mode = entry.triggerMode || "event";
    if (TRIGGERS_NEEDING_OAUTH_URL.has(entry.key)) {
      return "su URL se arma con la instancia que n8n escribe en la credencial durante su propio intercambio OAuth, y la bóveda de esta app no la tiene";
    }
    if (mode === "polling") {
      return "su sondeo no está capturado: el motor lo sondearía sin saber qué pedir";
    }
    if (mode === "event") {
      return (
        EVENT_TRIGGER_REASONS[entry.key] ||
        `${entry.displayName} no expone ni webhook ni sondeo, y este motor no puede suscribirse a su fuente`
      );
    }
    return `este motor no implementa este disparador (${entry.displayName})`;
  }

  if (entry.category === "Core") {
    return "nodo de datos de n8n: transforma items dentro de n8n, y el motor solo ejecuta su equivalente propio";
  }

  if (entry.category === "AI") {
    return "sub-nodo de agente: se cablea a un nodo de agente, no es un paso";
  }

  if (NOT_HTTP_KEYS.has(entry.key)) {
    return "n8n lo resuelve dentro de su propio proceso (archivos, shell, criptografía) y el motor solo sabe construir una petición HTTP";
  }

  return "su petición no está capturada, así que el motor no sabe qué llamar";
}

/**
 * Whether the entry runs but has no API root to run against.
 *
 * Two different shapes of the same gap: an action node whose captured request is
 * a path instead of a URL (`n8n-runmap.json` says which — Salesforce, Zoho,
 * Zulip and the AWS family build their URL from a root the descriptor does not
 * carry), and a polling trigger, which the daemon only arms when
 * `Descriptor::effective_base_url` resolves to something.
 *
 * This is a badge, never a block: the node runs, and one typed field is what
 * stands between it and working.
 */
export function needsBaseUrl(entry: N8nCatalogEntry): boolean {
  if (entry.baseUrl) return false;
  if (isN8nTrigger(entry)) return entry.triggerMode === "polling";
  // The capture decides from the request itself: `RUNMAP_RELATIVE` lists the
  // mapped nodes whose recorded path is not an absolute URL.
  return RUNMAP_RELATIVE.has(entry.key);
}

/**
 * What the palette must say about an entry it is about to show.
 *
 * Two levels, and the order matters: "cannot run" is a block, "needs one datum"
 * is a badge. A blocked entry stays blocked even when the missing thing looks
 * like a field the user could type — a node with no runner is not fixed by an
 * API root, and letting it be added because one of its problems is fixable is
 * how a flow ends up with a step that never runs.
 */
export function honestFlag(entry: N8nCatalogEntry): HonestFlag {
  if (!n8nRunnable(entry)) {
    return { comingSoon: true, reason: unavailableReason(entry) };
  }

  // From here on the node runs. Everything left is something it still needs.
  const coverage = runmapCoverage(entry.key);
  if (coverage && coverage[0] < coverage[1]) {
    // The partial-coverage badge wins over the root note: it says what the
    // node *cannot* run, which is more informative than what it may be typed.
    return { note: `${coverage[0]} de ${coverage[1]} operaciones` };
  }
  if (needsBaseUrl(entry)) return { note: "requiere URL base" };

  return {};
}
