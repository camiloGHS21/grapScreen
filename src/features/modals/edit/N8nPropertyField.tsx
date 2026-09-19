import React from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import {
  expressionDisplayValue,
  expressionStoredValue,
  isExpressionValue,
  isN8nProperty,
  N8nConfig,
  N8nProperty,
  optionChoices,
  optionLabel,
} from "./n8nParamsUtils";
import { hint, inputStyle, label, notice } from "./n8nFieldUI";
import { CollapsibleCollection } from "./N8nCollapsibleCollection";
import { DroppableInput } from "../../flowchart/ndv/components/DroppableInput";
import { N8nMultiOptionsField } from "./N8nMultiOptionsField";
import { N8nCallout } from "./N8nCallout";

export { label, hint, notice, inputStyle };

/**
 * A text-like field's value as the editor reads and writes it.
 *
 * Reading drops n8n's expression marker (`={{ … }}` → `{{ … }}`) so the field
 * shows what n8n shows; writing puts it back when the value is still an
 * expression, so an untouched field is saved exactly as it was. Keeping the two
 * halves together is what stops a display fix from becoming a data change.
 */
function valueBinding(current: unknown, onSet: (v: unknown) => void) {
  return {
    value: expressionDisplayValue(current),
    onChange: (v: string) => onSet(expressionStoredValue(v, current)),
  };
}

export function PropertyField({
  prop,
  config,
  version = 1,
  onSet,
  onSetSub,
}: {
  prop: N8nProperty;
  config: N8nConfig;
  /** The `@version` a collection's nested fields are evaluated against. */
  version?: number;
  onSet: (v: unknown) => void;
  onSetSub: (name: string, v: unknown) => void;
}) {
  // The same guard the lists apply, repeated for the callers that render a field
  // on its own. A field without a name has no key to store a value under, so
  // there is nothing useful to draw.
  if (!isN8nProperty(prop)) return null;
  const type = prop.type || "string";
  const current = config[prop.name];
  const sub = (current && typeof current === "object" && !Array.isArray(current) ? current : {}) as N8nConfig;
  const title = prop.displayName + (prop.required ? " *" : "");

  // A callout holds no value at all: it is the node's own tip box, dismissed
  // rather than edited, so it never reaches `config`.
  if (type === "callout") return <N8nCallout key={prop.name} prop={prop} />;

  if (type === "notice") return notice(prop.displayName);

  if (type === "boolean") {
    return (
      <div className="ndv-toggle-row" key={prop.name}>
        <div className="ndv-toggle ndv-toggle-end">
          <input
            id={`n8np-${prop.name}`}
            type="checkbox"
            checked={!!current}
            onChange={(e) => onSet(e.target.checked)}
          />
          <label htmlFor={`n8np-${prop.name}`}>{prop.displayName}</label>
        </div>
        {prop.description ? hint(prop.description) : null}
      </div>
    );
  }

  if (type === "options") {
    // Choices are filtered through the shared helper: an entry without a name is
    // not selectable and an entry that is `null` used to throw on `o.value`.
    const opts = optionChoices(prop);
    const empty = String(current ?? "") === "";
    const isExpr = isExpressionValue(current);
    const missing = !!prop.required && empty;

    return (
      <div className="ndv-field-block" key={prop.name}>
        {label(title)}
        {isExpr ? (
          // An options field holding an expression is not a fixed choice any
          // more; n8n swaps the dropdown for the expression input, and so do we
          // — with no way back except clearing the field, which restores it.
          <DroppableInput {...valueBinding(current, onSet)} />
        ) : (
          <div className={`ndv-n8n-select-wrap ${missing ? "has-warning" : ""}`}>
            <select
              className="ndv-n8n-select"
              value={String(current ?? "")}
              onChange={(e) => onSet(e.target.value)}
            >
              <option value="">{prop.placeholder || "Select a table / value…"}</option>
              {opts.map((o) => (
                <option key={String(o.value)} value={String(o.value)}>
                  {optionLabel(o)}
                </option>
              ))}
            </select>
            <ChevronDown size={13} className="ndv-select-chevron" />
            {missing && (
              <span className="ndv-field-warning-icon" title="Este campo es obligatorio">
                <AlertTriangle size={13} />
              </span>
            )}
          </div>
        )}
        {prop.description ? hint(prop.description) : null}
      </div>
    );
  }

  if (type === "multiOptions") {
    return <N8nMultiOptionsField prop={prop} current={current} onSet={onSet} />;
  }

  if (type === "collection" || type === "fixedCollection") {
    return (
      <CollapsibleCollection
        key={prop.name}
        prop={prop}
        config={type === "collection" ? sub : config}
        version={version}
        onSet={onSet}
        onSetSub={onSetSub}
      />
    );
  }

  if (type === "json" || (type === "string" && (prop.typeOptions?.rows as number) > 1)) {
    // A multi-line string holding an expression is shown the way n8n shows it:
    // as the expression input (`fx` chip, reset action) rather than a textarea.
    // A textarea is for prose, and an expression is not prose.
    const asExpressionInput = type === "string" && isExpressionValue(current);
    if (asExpressionInput) {
      return (
        <div className="ndv-field-block" key={prop.name}>
          <DroppableInput
            label={title}
            {...valueBinding(current, onSet)}
            placeholder={prop.placeholder || ""}
          />
          {prop.description ? hint(prop.description) : null}
        </div>
      );
    }
    return (
      <div className="ndv-field-block" key={prop.name}>
        <DroppableInput
          label={title}
          type="textarea"
          rows={(prop.typeOptions?.rows as number) || 4}
          {...valueBinding(current, onSet)}
          placeholder={prop.placeholder || (type === "json" ? "{}" : "")}
        />
        {prop.description ? hint(prop.description) : null}
      </div>
    );
  }

  if (type === "number") {
    return (
      <div className="ndv-field-block" key={prop.name}>
        <DroppableInput
          label={title}
          type="number"
          value={current === "" || current == null ? "" : Number(current)}
          onChange={(v: string) => onSet(v === "" ? "" : Number(v))}
          placeholder={prop.placeholder}
        />
        {prop.description ? hint(prop.description) : null}
      </div>
    );
  }

  if (type === "dateTime") {
    return (
      <div className="ndv-field-block" key={prop.name}>
        {label(title)}
        <input
          className="ndv-plain-input"
          type="datetime-local"
          value={String(current ?? "")}
          onChange={(e) => onSet(e.target.value)}
        />
        {prop.description ? hint(prop.description) : null}
      </div>
    );
  }

  if (type === "color") {
    return (
      <div className="ndv-field-block" key={prop.name}>
        {label(title)}
        <input
          className="ndv-color-input"
          type="color"
          value={String(current || "#888888")}
          onChange={(e) => onSet(e.target.value)}
        />
        {prop.description ? hint(prop.description) : null}
      </div>
    );
  }

  const isPassword = prop.typeOptions?.password;
  const displayVal =
    current == null
      ? ""
      : typeof current === "object"
      ? (current as Record<string, unknown>).value !== undefined
        ? String((current as Record<string, unknown>).value ?? "")
        : ""
      : String(current);

  if (isPassword) {
    return (
      <div className="ndv-field-block" key={prop.name}>
        {label(title)}
        <input
          className="ndv-plain-input"
          type="password"
          value={displayVal}
          onChange={(e) => onSet(e.target.value)}
          placeholder={prop.placeholder || ""}
        />
        {prop.description ? hint(prop.description) : null}
      </div>
    );
  }

  return (
    <div className="ndv-field-block" key={prop.name}>
      <DroppableInput
        label={title}
        {...valueBinding(current, onSet)}
        placeholder={prop.placeholder || ""}
        hint={prop.loadOptionsMethod ? "Opciones cargadas desde la API en n8n." : undefined}
      />
      {prop.description ? hint(prop.description) : null}
    </div>
  );
}

export default PropertyField;
