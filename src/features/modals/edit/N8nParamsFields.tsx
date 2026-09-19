import React, { useMemo } from "react";
import {
  fieldKey,
  isN8nProperty,
  isVisible,
  N8nConfig,
  N8nParamsPayload,
  N8nProperty,
} from "./n8nParamsUtils";
import { PropertyField } from "./N8nPropertyField";

/**
 * The fields a payload declares, minus anything unusable.
 *
 * `properties` is typed as an array of fields, but it is read from a JSON file
 * fetched at runtime: an entry can be `null` (an import the extractor could not
 * resolve used to serialise that way), and `null.type` in a filter downstream
 * took the whole node panel down. One filter here covers both the default
 * collection and the render, so there is a single place that decides what a
 * field is.
 */
export function payloadProperties(payload: N8nParamsPayload | null): N8nProperty[] {
  const list = payload?.properties;
  if (!Array.isArray(list)) return [];
  return list.filter(isN8nProperty);
}

/**
 * The version the `@version` conditions are evaluated against. The extractor
 * writes the number n8n stamps on a new node (`defaultVersion`); an older file
 * could still carry the raw `[3, 3.1]` array, in which case `1` is the safest
 * stand-in — a wrong version only mis-selects variants, it cannot crash.
 */
export function payloadVersion(payload: N8nParamsPayload | null): number {
  return typeof payload?.version === "number" ? payload.version : 1;
}

export function visiblePayloadFields(
  payload: N8nParamsPayload | null,
  config: N8nConfig,
  version: number,
): N8nProperty[] {
  return payloadProperties(payload).filter(
    (p) => p.type !== "hidden" && isVisible(p, config, version),
  );
}

/**
 * The rendered parameter list: everything the panel shows under "Parameters".
 *
 * Split out from the form so the same list can be rendered by the acceptance
 * snapshot (`scripts/snapshot-params.mjs`) without the data fetching that only
 * a browser can run — the fields themselves are the thing under test.
 */
export function N8nParamsFields({
  payload,
  value,
  onChange,
}: {
  payload: N8nParamsPayload | null;
  value: N8nConfig;
  onChange: (next: N8nConfig) => void;
}) {
  const version = payloadVersion(payload);
  const visibleProps = useMemo(
    () => visiblePayloadFields(payload, value, version),
    [payload, value, version],
  );

  const setField = (name: string, v: unknown) => onChange({ ...value, [name]: v });
  const setSubField = (collection: string, name: string, v: unknown) =>
    onChange({
      ...value,
      [collection]: { ...((value[collection] as N8nConfig) ?? {}), [name]: v },
    });

  return (
    <>
      {visibleProps.map((prop, index) => (
        <PropertyField
          key={fieldKey(prop, index)}
          prop={prop}
          config={value}
          version={version}
          onSet={(v) => setField(prop.name, v)}
          onSetSub={(name, v) => setSubField(prop.name, name, v)}
        />
      ))}
    </>
  );
}

export default N8nParamsFields;
