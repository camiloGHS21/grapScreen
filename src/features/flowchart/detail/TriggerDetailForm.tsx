import React from "react";
import { RecordedEvent } from "../../../types";

interface FormProps {
  ev: RecordedEvent;
  idx: number;
  updateSubEvent: (idx: number, key: string, val: any) => void;
}

export function TriggerDetailForm({ ev, idx, updateSubEvent }: FormProps) {
  const schedule = ev.data.schedule || "manual";
  return (
    <>
      <div className="ndp-field ndp-field-full">
        <span className="ndp-field-label">Tipo de disparo</span>
        <select className="ndp-select" value={schedule} onChange={e => updateSubEvent(idx, "schedule", e.target.value)}>
          <option value="manual">Manual (al ejecutar)</option>
          <option value="cron">Cron (programado)</option>
          <option value="interval">Intervalo de tiempo</option>
        </select>
      </div>
      {schedule === "cron" && (
        <div className="ndp-field ndp-field-full">
          <span className="ndp-field-label">Expresión Cron</span>
          <select className="ndp-select" value={ev.data.cron_expr || "0 * * * *"} onChange={e => updateSubEvent(idx, "cron_expr", e.target.value)}>
            <option value="* * * * *">Cada minuto</option>
            <option value="0 * * * *">Cada hora</option>
            <option value="0 0 * * *">Cada día (00:00)</option>
            <option value="0 9 * * *">Diario a las 9:00</option>
            <option value="0 9 * * 1">Cada lunes a las 9:00</option>
            <option value="*/15 * * * *">Cada 15 minutos</option>
            <option value="*/30 * * * *">Cada 30 minutos</option>
            <option value="0 */2 * * *">Cada 2 horas</option>
            <option value="custom">Personalizada...</option>
          </select>
        </div>
      )}
      {schedule === "cron" && ev.data.cron_expr === "custom" && (
        <div className="ndp-field ndp-field-full">
          <span className="ndp-field-label">Expresión personalizada</span>
          <input type="text" className="ndp-input" value={ev.data.cron_custom || ""} onChange={e => updateSubEvent(idx, "cron_custom", e.target.value)} placeholder="*/5 * * * *" />
        </div>
      )}
      {schedule === "interval" && (
        <>
          <div className="ndp-field">
            <span className="ndp-field-label">Cantidad</span>
            <input type="number" className="ndp-input ndp-input-sm" value={ev.data.interval_value || 5} onChange={e => updateSubEvent(idx, "interval_value", parseInt(e.target.value) || 1)} min="1" />
          </div>
          <div className="ndp-field">
            <span className="ndp-field-label">Unidad</span>
            <select className="ndp-select" value={ev.data.interval_unit || "minutes"} onChange={e => updateSubEvent(idx, "interval_unit", e.target.value)}>
              <option value="seconds">Segundos</option>
              <option value="minutes">Minutos</option>
              <option value="hours">Horas</option>
              <option value="days">Días</option>
            </select>
          </div>
        </>
      )}
      {schedule === "manual" && (
        <div className="ndp-field ndp-field-full">
          <p className="ndp-hint">La automatización se ejecutará manualmente al pulsar el botón Ejecutar.</p>
        </div>
      )}
    </>
  );
}
