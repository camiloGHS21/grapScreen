import {
  collectionFields,
  isN8nProperty,
  isVisible,
  N8nConfig,
  N8nProperty,
  optionChoices,
} from "./n8nParamsUtils";
import { isEmptyValue } from "./paramDefaults";

/**
 * The values a node's parameters start with.
 *
 * Split from `n8nParamsUtils` (the shape of the data) because this is the part
 * with behaviour: it reads `displayOptions`, so it has to agree with what the
 * form will render, and that agreement is what the passes below are about.
 */
export function resolveDefaultValue(p: N8nProperty): unknown {
  if (p.type === "multiOptions") {
    if (Array.isArray(p.default) && p.default.length > 0) {
      return p.default;
    }
    const opts = optionChoices(p);
    if (opts.length > 0) {
      const wildcard = opts.find((o) => String(o.value) === "*");
      return wildcard ? ["*"] : [String(opts[0].value)];
    }
    return [];
  }
  if (p.type === "options") {
    if (p.default !== undefined && p.default !== "") {
      return p.default;
    }
    const opts = optionChoices(p);
    return opts.length > 0 && p.required ? String(opts[0].value) : "";
  }
  if (p.type === "boolean") {
    return p.default ?? false;
  }
  return p.default ?? "";
}

/** The defaults of a `collection`'s own sub-fields, which live in their own bag. */
export function collectDefaultsShallow(properties: N8nProperty[] | undefined): N8nConfig {
  const out: N8nConfig = {};
  for (const p of properties || []) {
    if (!isN8nProperty(p)) continue;
    out[p.name] = resolveDefaultValue(p);
  }
  return out;
}

/**
 * The defaults a property list seeds into a node's parameters.
 *
 * Only the *displayable* declaration of a field contributes — the rule the
 * panel was missing. A node may declare one parameter several times under
 * different `displayOptions` (the AI Agent declares `text` three times, once per
 * `promptType`), and taking the first declaration of a name regardless of
 * whether it is on screen seeded `={{ $json.guardrailsInput }}` into a field
 * whose visible variant declares `={{ $json.chatInput }}`.
 *
 * The two halves have to agree, and neither can be computed first:
 *
 *   · `isVisible` reads the collected values, so the defaults decide what is
 *     displayable;
 *   · a default is only collected for a displayable declaration, so what is
 *     displayable decides the defaults.
 *
 * A single forward pass resolves that by guessing, and the guess is wrong in
 * both directions: `Paddle` gates `couponType` on `jsonParameters`, declared
 * further down the list, so a forward-only pass drops the field's default; and
 * `EmailSend` and `ItemLists` put the value every other field depends on in a
 * `hidden` property, so a pass that skips those leaves the node with no
 * controls at all.
 *
 * So the defaults are seeded first (every declaration contributes, first one
 * wins — including `hidden` ones), and then re-derived against that seed until
 * the result stops changing. At that point the values and the display
 * conditions agree, which is the invariant the form relies on. Three passes is
 * one more than any node in the catalogue needs.
 */
export function collectDefaults(
  properties: N8nProperty[] | undefined,
  into: N8nConfig,
  version = 1,
): void {
  let gate: N8nConfig = { ...into };
  assignDefaults(properties, gate, version, null);

  for (let pass = 0; pass < 3; pass += 1) {
    const next: N8nConfig = {};
    assignDefaults(properties, next, version, gate);
    const settled = JSON.stringify(next) === JSON.stringify(gate);
    gate = next;
    if (settled) break;
  }

  Object.assign(into, gate);
}

/**
 * One assignment pass. With `gate` set, a declaration the gate cannot display
 * is skipped; with `gate` null every declaration counts, which is what seeds
 * the first pass.
 */
function assignDefaults(
  properties: N8nProperty[] | undefined,
  into: N8nConfig,
  version: number,
  gate: N8nConfig | null,
): void {
  for (const p of properties || []) {
    if (!isN8nProperty(p)) continue;
    if (p.name === "__version") continue;
    if (gate !== null && !isVisible(p, gate, version)) continue;
    if (p.type === "collection") {
      into[p.name] = collectDefaultsShallow(collectionFields(p));
    } else if (p.type === "fixedCollection") {
      // A fixedCollection's groups hold their fields in `values`, and the group
      // name is not a parameter of its own — n8n writes the fields flat onto the
      // node's parameters, which is what the recursion reproduces.
      for (const group of Array.isArray(p.options) ? p.options : []) {
        const values = group === null || typeof group !== "object" ? undefined : (group as { values?: N8nProperty[] }).values;
        assignDefaults(values, into, version, gate);
      }
    } else if (!(p.name in into) || isEmptyValue(into[p.name])) {
      into[p.name] = resolveDefaultValue(p);
    }
  }
}
