import React, { useState, useEffect } from "react";

interface TimeSelectorProps {
  valueMs: number;
  onChange: (ms: number) => void;
}

/**
 * Selector de tiempo cómodo estilo n8n.
 * Descompone milisegundos en [minutos : segundos . milisegundos]
 * con dropdowns compactos para una edición humana y rápida.
 */
export function TimeSelector({ valueMs, onChange }: TimeSelectorProps) {
  const total = Math.max(0, valueMs || 0);
  const [minutes, setMinutes] = useState(Math.floor(total / 60000));
  const [seconds, setSeconds] = useState(Math.floor((total % 60000) / 1000));
  const [millis, setMillis] = useState(total % 1000);

  useEffect(() => {
    const t = Math.max(0, valueMs || 0);
    setMinutes(Math.floor(t / 60000));
    setSeconds(Math.floor((t % 60000) / 1000));
    setMillis(t % 1000);
  }, [valueMs]);

  const emit = (m: number, s: number, ms: number) => {
    const total = Math.max(0, m * 60000 + s * 1000 + ms);
    onChange(total);
  };

  const numOption = (n: number, max: number) => (
    <option key={n} value={n}>{String(n).padStart(max >= 100 ? 3 : 2, "0")}</option>
  );

  return (
    <div className="ts-wrap">
      <select
        className="ts-field"
        value={minutes}
        onChange={e => { const v = parseInt(e.target.value) || 0; setMinutes(v); emit(v, seconds, millis); }}
        title="Minutos"
      >
        {Array.from({ length: 10 }, (_, i) => numOption(i, 99))}
      </select>
      <span className="ts-Sep">:</span>
      <select
        className="ts-field"
        value={seconds}
        onChange={e => { const v = parseInt(e.target.value) || 0; setSeconds(v); emit(minutes, v, millis); }}
        title="Segundos"
      >
        {Array.from({ length: 60 }, (_, i) => numOption(i, 99))}
      </select>
      <span className="ts-Sep">.</span>
      <select
        className="ts-field tsMs"
        value={millis}
        onChange={e => { const v = parseInt(e.target.value) || 0; setMillis(v); emit(minutes, seconds, v); }}
        title="Milisegundos"
      >
        {Array.from({ length: 20 }, (_, i) => i * 50).map(v => (
          <option key={v} value={v}>{String(v).padStart(3, "0")}</option>
        ))}
      </select>
      <span className="tsUnit">ms</span>
    </div>
  );
}
export default TimeSelector;
