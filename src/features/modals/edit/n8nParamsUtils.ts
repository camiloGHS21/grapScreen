export interface N8nProperty {
  displayName: string;
  name: string;
  type?: string;
  default?: unknown;
  description?: string;
  placeholder?: string;
  required?: boolean;
  displayOptions?: { show?: Record<string, unknown[]>; hide?: Record<string, unknown[]> };
  typeOptions?: Record<string, unknown> & { password?: boolean; rows?: number };
  options?: unknown[];
  hint?: string;
  noDataExpression?: boolean;
  modes?: unknown[];
  loadOptionsMethod?: string;
}

export interface N8nParamsPayload {
  key: string;
  displayName: string;
  description?: string;
  version?: number;
  properties: N8nProperty[];
  webhooks?: { name: string; httpMethod: string; path: string }[];
}

export type N8nConfig = Record<string, unknown>;

/** One choice of an `options` / `multiOptions` field. */
export interface N8nOption {
  /** The label n8n shows. Missing when the label is built with a helper this environment cannot run — see `optionLabel`. */
  name?: string;
  value: unknown;
  description?: string;
}

/**
 * Is this something the form can render as a field?
 *
 * The extracted payloads are data files fetched at runtime, and an entry can be
 * `null`: the extractor used to serialise an import it could not resolve with
 * `JSON.stringify`, which turns a function into `null`. `Agent.json` shipped
 * `properties[10].options[6]` and `[8]` that way, and the collection renderer
 * died on `null.type` — taking the whole node panel down with it.
 *
 * The extractor no longer writes those entries, but the guard stays: the files
 * are generated artefacts that a stale build or a hand-edit can reintroduce, and
 * a missing field is a cosmetic problem while a thrown render is not.
 */
export function isN8nProperty(value: unknown): value is N8nProperty {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const name = (value as Partial<N8nProperty>).name;
  return typeof name === "string" && name.length > 0;
}

/**
 * The choices of an `options` / `multiOptions` field, skipping anything unusable.
 *
 * A choice needs either a label or a value to be worth showing:
 *   · a `null` entry has neither, and reading `o.value` off it used to throw;
 *   · an entry with a value but no label is kept — the value is the thing a
 *     workflow stores and the only thing the request needs, and the extractor
 *     only loses the label when the node builds it with a helper it cannot run
 *     (`LemlistTrigger` and `Notion` label their choices with `capitalCase` from
 *     `change-case`, which is not part of the n8n source tree). Dropping those
 *     choices would leave the field with an empty dropdown.
 */
export function optionChoices(prop: N8nProperty): N8nOption[] {
  if (!Array.isArray(prop.options)) return [];
  return prop.options.filter((o): o is N8nOption => {
    if (o === null || typeof o !== "object") return false;
    const candidate = o as N8nOption;
    return (
      (typeof candidate.name === "string" && candidate.name.length > 0) ||
      candidate.value !== undefined
    );
  });
}

/**
 * The label to print for a choice.
 *
 * Falls back to the raw value when n8n's label could not be derived, which is a
 * cosmetic loss (`equals` instead of `Equals`): the value shown is the node's
 * own, never an invented one.
 */
export function optionLabel(option: N8nOption): string {
  if (typeof option.name === "string" && option.name.length > 0) return option.name;
  return String(option.value ?? "");
}

/**
 * The fields a `collection` or `fixedCollection` offers, flattened.
 *
 * A `collection` lists them in `options`; a `fixedCollection` lists *groups*
 * there and each group holds its fields in `values`. Both levels are filtered,
 * because a `null` at either one used to reach the renderer.
 *
 * This is also what the verification script walks, so "the form renders every
 * field this returns" is a claim that can be checked without a browser.
 */
export function collectionFields(prop: N8nProperty): N8nProperty[] {
  if (!Array.isArray(prop.options)) return [];
  if (prop.type !== "fixedCollection") return prop.options.filter(isN8nProperty);
  const fields: N8nProperty[] = [];
  for (const group of prop.options) {
    if (group === null || typeof group !== "object") continue;
    const values = (group as { values?: unknown }).values;
    if (Array.isArray(values)) fields.push(...values.filter(isN8nProperty));
  }
  return fields;
}

/**
 * A stable, unique React key for a field.
 *
 * `name` alone is not unique: a node can declare several variants of the same
 * field under different `displayOptions` — the AI Agent declares `promptType`
 * twice and `text` three times — and every one of them is rendered by the same
 * list, which is what printed "Encountered two children with the same key". The
 * index disambiguates the list without making the key depend on render order
 * beyond what React already requires.
 */
export function fieldKey(prop: N8nProperty, index: number): string {
  return `${prop.name}#${index}`;
}

export function cleanText(text: string): string {
  return text.replace(/<[^>]*>/g, "");
}

/**
 * n8n's marker for "this value is an expression, not text".
 *
 * A stored expression is `"={{ $json.chatInput }}"`; the leading `=` is a
 * storage flag, and the editor shows the field as `{{ $json.chatInput }}`. The
 * panel used to print the flag as part of the value, which is the one visible
 * difference from n8n the screenshots show in the prompt field.
 *
 * Reading strips it, writing puts it back for values that are still an
 * expression, so an untouched field is stored byte-for-byte as before and no
 * saved workflow changes meaning because of a display fix.
 */
const EXPRESSION_MARKER = "=";

/** Does this value hold an n8n expression rather than literal text? */
export function isExpressionValue(v: unknown): boolean {
  return typeof v === "string" && v.includes("{{");
}

/** What the editor shows for a stored value (marker removed). */
export function expressionDisplayValue(v: unknown): string {
  const text = v == null ? "" : String(v);
  if (
    text.startsWith(EXPRESSION_MARKER) &&
    text.slice(EXPRESSION_MARKER.length).includes("{{")
  ) {
    return text.slice(EXPRESSION_MARKER.length);
  }
  return text;
}

/** What to store when the editor reports `shown` as the new value. */
export function expressionStoredValue(shown: string, previous: unknown): string {
  if (!isExpressionValue(shown)) return shown;
  const previousIsMarked =
    typeof previous === "string" &&
    previous.startsWith(EXPRESSION_MARKER) &&
    previous.slice(EXPRESSION_MARKER.length).includes("{{");
  return previousIsMarked && !shown.startsWith(EXPRESSION_MARKER)
    ? EXPRESSION_MARKER + shown
    : shown;
}

export function readPath(config: N8nConfig, path: string): unknown {
  let cur: unknown = config;
  for (const part of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function isVisible(prop: N8nProperty, config: N8nConfig, version: number): boolean {
  const displayOptions = prop?.displayOptions;
  if (displayOptions === null || typeof displayOptions !== "object") return true;
  const { show, hide } = displayOptions;
  const matches = (field: string, allowed: unknown[]): boolean => {
    if (field === "@version") {
      const cond = allowed.find((a) => a && typeof a === "object" && "_cnd" in (a as object)) as
        | { _cnd: Record<string, number> }
        | undefined;
      if (cond) {
        const c = cond._cnd;
        if ("gt" in c && !(version > c.gt)) return false;
        if ("gte" in c && !(version >= c.gte)) return false;
        if ("lt" in c && !(version < c.lt)) return false;
        if ("lte" in c && !(version <= c.lte)) return false;
        return true;
      }
      return allowed.includes(version);
    }
    const actual = readPath(config, field);
    if (Array.isArray(actual)) {
      return actual.some((v) => allowed.includes(v));
    }
    return allowed.includes(actual as never);
  };
  if (show && typeof show === "object") {
    for (const [field, allowed] of Object.entries(show)) {
      if (!Array.isArray(allowed) || !matches(field, allowed)) return false;
    }
  }
  if (hide && typeof hide === "object") {
    for (const [field, banned] of Object.entries(hide)) {
      if (Array.isArray(banned) && matches(field, banned)) return false;
    }
  }
  return true;
}
