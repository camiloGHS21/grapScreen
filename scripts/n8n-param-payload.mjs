// The per-node parameter payload, shared by the full extraction pass and the
// repair pass so both write byte-identical files.
//
// Kept out of `n8n-extract-descriptors.mjs` because that script does a whole
// repository sweep (icons, base URLs, triggers) and cannot be imported without
// running it; the repair pass only needs this one piece.
//
// There used to be a *second*, hand-copied `pruneKeys` inside the extractor.
// Two copies of a whitelist is one copy too many: a fix applied to only one of
// them silently diverges the two passes, and the repair pass reintroduces
// whatever the extractor just stopped doing. Both passes now import from here.

import { isLoaderStub } from "./n8n-node-loader.mjs";

/**
 * The property keys the parameter form renders. Everything else a node declares
 * (routing internals, load-options hooks, `codex` bookkeeping…) is dead weight
 * in a JSON the drawer fetches, and a few of them are megabytes.
 */
export const PROP_KEYS = [
  "displayName",
  "name",
  "type",
  "default",
  "description",
  "placeholder",
  "required",
  "displayOptions",
  "typeOptions",
  "options",
  "hint",
  "noDataExpression",
  "modes",
  "limitOptions",
  "displayNameOptions",
  "builderHint",
  "isNodeSetting",
  "loadOptionsMethod",
];

/**
 * Keys kept on a *nested* property object: the entries of a `collection`'s
 * `options`, the `values` of a `fixedCollection` group, and so on.
 *
 * Those entries are ordinary n8n properties, so the whitelist is the same one
 * plus the three keys only option- and group-shaped entries carry. `values` is
 * the one to be careful with: it holds the fields of a `fixedCollection` group,
 * and leaving it out empties every fixedCollection in the catalogue — a group
 * that reaches the form without `values` renders as a field with no inputs.
 * It used to be a shorter hand-written list, which quietly dropped real keys —
 * `loadOptionsMethod` and `builderHint` on every nested field, for instance.
 */
export const NESTED_KEYS = [...new Set([...PROP_KEYS, "value", "values", "action"])];

/**
 * Keys whose value is *opaque configuration data*: copied verbatim instead of
 * being whitelisted, because their keys are user-chosen field names or n8n's
 * own option names, which no fixed list can enumerate.
 *
 *   · `displayOptions` — `{ show: { promptType: ['define'] } }`. Whitelisting
 *     here produced `displayOptions: {}`, i.e. "always visible": every
 *     conditional variant of a field rendered at once, sharing one config key.
 *     That is what printed the "Source for Prompt" dropdown twice and "Prompt
 *     (User Message)" three times in the AI Agent form. Today 9578 properties
 *     in the catalogue carry `displayOptions` and not one of them kept its
 *     content, so this is the single most damaging key to get wrong.
 *   · `typeOptions` — `{ rows: 2 }`, `{ password: true }`: the form reads these
 *     to pick a textarea or a password box, and it decides nothing without them.
 *   · `default` — `{ __rl: true, mode: 'list', value: 'gpt-5.4' }` for a
 *     resource locator, which a whitelist would flatten to `{ value: … }`.
 */
const OPAQUE_KEYS = new Set(["displayOptions", "typeOptions", "default"]);

/** Depth cap for opaque data: a guard against pathological nesting, not a limit we expect to hit. */
const MAX_OPAQUE_DEPTH = 32;

/** Human-readable path of a value inside the node description, e.g. `properties[10].options[8]`. */
const appendPath = (trail, seg) => (trail ? `${trail}.${seg}` : `${seg}`);

/**
 * Copies an object graph keeping only the whitelisted keys, while *dropping*
 * anything that has no serialisable value:
 *
 *   · loader stubs (`isLoaderStub`) — an import the loader could not resolve.
 *     `JSON.stringify` turns them into `null`, which is how `Agent.json` ended
 *     up with `properties[10].options[6]` and `[8]` as `null` entries that
 *     crashed the form with "Cannot read properties of null (reading 'type')".
 *     Dropping the entry states the truth — "this field could not be derived
 *     from the source" — where a `null` states a lie that breaks the renderer.
 *   · plain functions, for the same reason: `JSON.stringify` writes them as
 *     `null` too.
 *
 * Every drop is reported through `omit(path, kind)` so the passes that call
 * this can print what was left out instead of hiding it. Nothing is silently
 * discarded: a value is only dropped when serialising it would produce `null`.
 */
export function pruneKeys(value, keys, trail, omit, depth = 0) {
  if (isLoaderStub(value)) {
    omit?.(trail, "stub");
    return undefined;
  }
  if (typeof value === "function") {
    omit?.(trail, "function");
    return undefined;
  }
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const out = [];
    value.forEach((v, i) => {
      const pruned = pruneKeys(v, keys, appendPath(trail, `[${i}]`), omit, depth + 1);
      if (pruned !== undefined) out.push(pruned);
    });
    return out;
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const path = appendPath(trail, k);
    if (OPAQUE_KEYS.has(k)) {
      const copied = copyOpaque(v, path, omit, depth + 1, new Set());
      if (copied !== undefined) out[k] = copied;
      continue;
    }
    if (!keys.includes(k)) continue;
    const pruned = pruneKeys(v, NESTED_KEYS, path, omit, depth + 1);
    if (pruned !== undefined) out[k] = pruned;
  }
  return out;
}

/**
 * Deep copy of opaque configuration data: stubs and functions are dropped (a
 * stub would print as `{}`/`null` and be read back as a real setting), while
 * `null` is kept because in `default` it is a value n8n itself declares —
 * `Beeminder.node.ts` writes `default: null` for its date and number fields.
 *
 * `seen` breaks reference cycles: whitelisted pruning never recursed into these
 * objects, so this is the first code path that could walk a self-referencing
 * `typeOptions`. A cycle is dropped rather than throwing, and reported.
 */
function copyOpaque(value, trail, omit, depth, seen) {
  if (isLoaderStub(value)) {
    omit?.(trail, "stub");
    return undefined;
  }
  if (typeof value === "function") {
    omit?.(trail, "function");
    return undefined;
  }
  if (value === null || typeof value !== "object") return value;
  if (depth > MAX_OPAQUE_DEPTH) {
    omit?.(trail, "too-deep");
    return undefined;
  }
  if (seen.has(value)) {
    omit?.(trail, "cycle");
    return undefined;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    const out = [];
    value.forEach((v, i) => {
      const copied = copyOpaque(v, appendPath(trail, `[${i}]`), omit, depth + 1, seen);
      if (copied !== undefined) out.push(copied);
    });
    seen.delete(value);
    return out;
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const copied = copyOpaque(v, appendPath(trail, k), omit, depth + 1, seen);
    if (copied !== undefined) out[k] = copied;
  }
  seen.delete(value);
  return out;
}

/**
 * The `typeVersion` the form evaluates `displayOptions` against.
 *
 * A node that ships several versions declares `version` as an *array* of the
 * ones it supports — `Agent.node.ts` has `version: [3, 3.1]`. Serialising that
 * array and letting the form fall back to `1` picked the wrong branch: every
 * `@version` condition was evaluated as if the node were version 1, which
 * selected the *deprecated* variant of a field (`lt: 3.1`) instead of the
 * current one and mis-rendered the rest of the form.
 *
 * The value n8n itself stamps on a fresh node is `defaultVersion`, falling back
 * to the newest declared version — the same rule `VersionedNodeType` uses in
 * `n8n-workflow`, and both survive into the loaded description because every
 * version class spreads the base description that carries `defaultVersion`.
 */
export function resolveVersion(description) {
  const asNumber = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const declared = asNumber(description?.defaultVersion);
  if (declared !== null) return declared;
  const version = description?.version;
  const direct = asNumber(version);
  if (direct !== null) return direct;
  if (Array.isArray(version)) {
    const nums = version.map(asNumber).filter((v) => v !== null);
    if (nums.length) return Math.max(...nums);
  }
  return 1;
}

/**
 * Builds the payload written to `public/n8n-params/<Key>.json` from a loaded
 * node description.
 *
 * Returns `{ payload, omitted }`. `payload` is null when the node declares no
 * renderable parameters, which is the signal that the node could not be loaded
 * rather than that it has nothing to configure. `omitted` lists the entries
 * dropped because they had no serialisable value, so a caller can name them.
 */
export function buildParamPayload(descriptor, description) {
  const omitted = [];
  const omit = (trail, kind) => omitted.push({ path: trail, kind });
  const payload = {
    key: descriptor.key,
    displayName: description.displayName || descriptor.displayName,
    description: description.description || descriptor.description,
    version: resolveVersion(description),
    defaults: pruneKeys(description.defaults, ["name", "color"], "defaults", omit) || {},
    properties: pruneKeys(description.properties, PROP_KEYS, "properties", omit) || [],
    // Kept because the webhook trigger form needs the declared methods/paths,
    // and a declarative node's `requestDefaults` is its real API root. Both are
    // copied through the opaque path: they are n8n's own data shapes, and a stub
    // hiding inside one of them would otherwise print as `null`.
    webhooks: copyOpaque(description.webhooks, "webhooks", omit, 0, new Set()),
    requestDefaults: copyOpaque(description.requestDefaults, "requestDefaults", omit, 0, new Set()),
    subtitle: copyOpaque(description.subtitle, "subtitle", omit, 0, new Set()),
  };
  for (const key of ["webhooks", "requestDefaults", "subtitle"]) {
    // `undefined` is what JSON.stringify omits; `null` would be written out.
    if (payload[key] === undefined) delete payload[key];
  }
  if (!payload.properties.length) return { payload: null, omitted };
  return { payload, omitted };
}
