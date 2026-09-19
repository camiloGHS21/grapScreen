import React, { useEffect, useMemo, useRef, useState } from "react";
import { applyAppDefaults, isEmptyValue } from "./paramDefaults";
import { collectDefaults } from "./n8nDefaults";
import { N8nConfig, N8nParamsPayload } from "./n8nParamsUtils";
import { notice } from "./N8nPropertyField";
import {
  N8nParamsFields,
  payloadProperties,
  payloadVersion,
  visiblePayloadFields,
} from "./N8nParamsFields";

export type { N8nConfig };

export function N8nParamsForm({
  nodeKey,
  value,
  onChange,
  onMissingRequired,
}: {
  nodeKey: string;
  value: N8nConfig;
  onChange: (next: N8nConfig) => void;
  onMissingRequired?: (count: number) => void;
}) {
  const [payload, setPayload] = useState<N8nParamsPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const seeded = useRef("");

  useEffect(() => {
    let alive = true;
    setPayload(null);
    setFailed(false);
    if (!nodeKey) return;
    fetch(`${import.meta.env.BASE_URL}n8n-params/${encodeURIComponent(nodeKey)}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: N8nParamsPayload) => alive && setPayload(json))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [nodeKey]);

  useEffect(() => {
    if (!payload || seeded.current === payload.key) return;
    seeded.current = payload.key;
    const defaults: N8nConfig = {};
    collectDefaults(payloadProperties(payload), defaults, payloadVersion(payload));

    // Merge: defaults first, non-empty stored values take precedence
    const effective: N8nConfig = { ...defaults };
    for (const [k, v] of Object.entries(value || {})) {
      if (!isEmptyValue(v)) {
        effective[k] = v;
      }
    }
    const merged = applyAppDefaults(payload.key, effective);
    onChange(merged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload]);

  // The version the `@version` conditions are evaluated against.
  const version = payloadVersion(payload);
  const visibleProps = useMemo(
    () => visiblePayloadFields(payload, value, version),
    [payload, value, version],
  );

  useEffect(() => {
    if (!onMissingRequired) return;
    let missing = 0;
    for (const p of visibleProps) {
      if (!p.required || p.type === "notice") continue;
      const v = value[p.name];
      if (isEmptyValue(v)) missing += 1;
    }
    onMissingRequired(missing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleProps, value]);

  if (!nodeKey) return null;

  if (failed) {
    return notice(
      "Este nodo no tiene formulario de parámetros extraído (la carga de su código fuente falló). " +
        "Configúralo con los campos genéricos de abajo.",
    );
  }
  if (!payload) {
    return <div style={{ fontSize: "11px", color: "var(--dim)", marginBottom: "12px" }}>Cargando parámetros…</div>;
  }
  if (visibleProps.length === 0) {
    return notice("Este nodo no tiene parámetros configurables. Usa los campos genéricos de abajo.");
  }

  return <N8nParamsFields payload={payload} value={value} onChange={onChange} />;
}

export default N8nParamsForm;
