import React, { useEffect, useMemo } from "react";
import { N8nProperty, optionChoices, optionLabel } from "./n8nParamsUtils";
import { hint, inputStyle, label } from "./n8nFieldUI";

interface N8nMultiOptionsFieldProps {
  prop: N8nProperty;
  current: unknown;
  onSet: (v: unknown) => void;
}

export function N8nMultiOptionsField({
  prop,
  current,
  onSet,
}: N8nMultiOptionsFieldProps) {
  // Filtered: an entry without a name is not selectable, and an entry that is
  // `null` — which the old extractor wrote for an unresolved import — used to
  // throw when reading `o.value`.
  const opts = useMemo(() => optionChoices(prop), [prop]);
  const rawSelected = Array.isArray(current) ? (current as string[]) : [];

  const effectiveSelected = useMemo(() => {
    if (rawSelected.length > 0) return rawSelected;
    if (opts.length > 0) {
      const wildcard = opts.find((o) => String(o.value) === "*");
      return wildcard ? ["*"] : [String(opts[0].value)];
    }
    return [];
  }, [rawSelected, opts]);

  useEffect(() => {
    if (rawSelected.length === 0 && effectiveSelected.length > 0) {
      onSet(effectiveSelected);
    }
  }, [rawSelected.length, effectiveSelected, onSet]);

  const selected = effectiveSelected;
  const missing = !!prop.required && selected.length === 0;

  return (
    <div style={{ marginBottom: "14px" }} key={prop.name}>
      {label(prop.displayName + (prop.required ? " *" : ""))}
      <select
        style={{
          ...inputStyle,
          marginBottom: selected.length ? "8px" : 0,
          borderColor: missing ? "color-mix(in srgb, var(--red) 45%, var(--line))" : undefined,
        }}
        value=""
        onChange={(e) => {
          const v = e.target.value;
          if (v && !selected.includes(v)) {
            onSet([...selected, v]);
          }
          e.target.value = "";
        }}
      >
        <option value="">{selected.length ? "— añadir otro —" : prop.placeholder || "Selecciona…"}</option>
        {opts
          .filter((o) => !selected.includes(String(o.value)))
          .map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {optionLabel(o)}
            </option>
          ))}
      </select>
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {selected.map((val) => {
            const name = opts.find((o) => String(o.value) === val)?.name || val;
            return (
              <span
                key={val}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "3px 10px",
                  borderRadius: "20px",
                  fontSize: "11px",
                  border: "1px solid var(--line)",
                  background: "var(--s2)",
                  color: "var(--text)",
                }}
              >
                {name}
                <button
                  type="button"
                  onClick={() => onSet(selected.filter((v) => v !== val))}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    fontSize: "12px",
                    color: "var(--dim)",
                    lineHeight: 1,
                  }}
                  title="Quitar"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
      {missing && (
        <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--red)" }}>
          Obligatorio: elige al menos un evento. Sin esto el trigger no se dispara.
        </div>
      )}
      {prop.description ? hint(prop.description) : null}
    </div>
  );
}
export default N8nMultiOptionsField;
