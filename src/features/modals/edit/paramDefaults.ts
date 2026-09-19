import APP_PARAM_DEFAULTS from "../../../data/n8n-param-defaults.json";

/**
 * grapScreen's own defaults for n8n node parameters.
 *
 * Kept in a plain (React-free) module on purpose so the merge semantics can be
 * exercised without rendering anything.
 *
 * Why this exists: some n8n nodes declare a *required* field with an empty
 * default and expect the user to always choose. The WhatsApp Trigger is the
 * canonical case — `updates` ("Trigger On") is `multiOptions` + `required` with
 * `default: []`, confirmed against n8n's own source (nodes-base
 * WhatsAppTrigger.node.ts) and its public docs. n8n leaves it blank and forces
 * a choice, which is faithful but leaves the node inert until you notice.
 *
 * grapScreen deliberately diverges and pre-selects the value n8n's own WhatsApp
 * templates ship with. This is OUR default, not n8n's, and it is only applied
 * where the effective value is still empty — anything the user picked, or saved
 * earlier, always wins.
 *
 * Adding another override is one line in `src/data/n8n-param-defaults.json`.
 */
const PARAM_DEFAULTS = APP_PARAM_DEFAULTS as Record<string, Record<string, unknown>>;

/** Node parameter bag: field name → value. */
export type ParamBag = Record<string, unknown>;

/** "Nothing chosen yet": undefined, null, "", [], {}. */
export function isEmptyValue(v: unknown): boolean {
  return (
    v === undefined ||
    v === null ||
    v === "" ||
    (Array.isArray(v) && v.length === 0) ||
    (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0)
  );
}

/**
 * Fills in grapScreen's defaults for a node, but only for fields the user has
 * not filled in. Non-empty values are never touched, so this can never clobber
 * a saved choice.
 *
 * Call it LAST — after n8n's own defaults have been collected and after the
 * stored value has been merged in.
 */
export function applyAppDefaults(nodeKey: string, config: ParamBag): ParamBag {
  const overrides = PARAM_DEFAULTS[nodeKey];
  if (!overrides) return config;
  const out: ParamBag = { ...config };
  for (const [field, fallback] of Object.entries(overrides)) {
    if (!isEmptyValue(out[field])) continue;
    // Clone arrays so two nodes never share one mutable default array.
    out[field] = Array.isArray(fallback) ? [...fallback] : fallback;
  }
  return out;
}
