import React, { useMemo, useState } from "react";
import { Plus, Minus } from "lucide-react";
import {
  collectionFields,
  fieldKey,
  isVisible,
  N8nConfig,
  N8nProperty,
} from "./n8nParamsUtils";
import { hint } from "./n8nFieldUI";
import { PropertyField } from "./N8nPropertyField";

export function CollapsibleCollection({
  prop,
  config,
  version = 1,
  onSet,
  onSetSub,
}: {
  prop: N8nProperty;
  config: N8nConfig;
  /** The `@version` the nested fields' conditions are evaluated against. */
  version?: number;
  onSet: (v: unknown) => void;
  onSetSub: (name: string, v: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  // Flattened through the shared helper, which drops the entries that cannot be
  // rendered. `Agent.json` shipped two `null`s inside this array and the
  // `f.type` read below was what crashed the panel.
  const fields = useMemo(() => collectionFields(prop), [prop]);
  const visibleFields = useMemo(
    () => fields.filter((f) => f.type !== "notice" && isVisible(f, config, version)),
    [fields, config, version],
  );
  if (visibleFields.length === 0) return null;

  const btnText = prop.placeholder || `+ Add ${prop.displayName.toLowerCase().replace(/s$/, "")}`;

  return (
    <div className="ndv-collection-group">
      <div className="ndv-collection-header">
        <span className="ndv-collection-title">
          {prop.displayName}
        </span>
        <button
          type="button"
          className="ndv-collection-toggle-btn"
          onClick={() => setOpen((s) => !s)}
          title={open ? "Colapsar" : "Expandir"}
        >
          {open ? <Minus size={13} /> : <Plus size={13} />}
        </button>
      </div>

      {!open && (
        <button
          type="button"
          className="ndv-add-option-btn"
          onClick={() => setOpen(true)}
        >
          <Plus size={12} />
          <span>{btnText.replace(/^\+\s*/, "")}</span>
        </button>
      )}

      {open && (
        <div className="ndv-collection-body">
          {visibleFields.map((f, index) => (
            <PropertyField
              // Two fields of one collection can share a name (the same field
              // declared per operation), so the index is what makes this unique.
              key={fieldKey(f, index)}
              prop={f}
              config={config}
              version={version}
              onSet={(v) => onSetSub(f.name, v)}
              onSetSub={onSetSub}
            />
          ))}
          {prop.description ? hint(prop.description) : null}
        </div>
      )}
    </div>
  );
}

export default CollapsibleCollection;
