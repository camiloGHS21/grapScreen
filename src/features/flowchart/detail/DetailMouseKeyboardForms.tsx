import React from "react";
import { RecordedEvent } from "../../../types";

interface FormProps {
  ev: RecordedEvent;
  idx: number;
  updateSubEvent: (idx: number, key: string, val: any) => void;
}

export function MouseMoveDetailForm({ ev, idx, updateSubEvent }: FormProps) {
  return (
    <>
      <div className="ndp-field">
        <span className="ndp-field-label">Coordenada X</span>
        <input type="number" className="ndp-input ndp-input-sm" value={ev.data.x ?? 0} onChange={(e) => updateSubEvent(idx, "x", parseInt(e.target.value) || 0)} />
      </div>
      <div className="ndp-field">
        <span className="ndp-field-label">Coordenada Y</span>
        <input type="number" className="ndp-input ndp-input-sm" value={ev.data.y ?? 0} onChange={(e) => updateSubEvent(idx, "y", parseInt(e.target.value) || 0)} />
      </div>
    </>
  );
}

export function ButtonPressDetailForm({ ev, idx, updateSubEvent }: FormProps) {
  return (
    <>
      <div className="ndp-field">
        <span className="ndp-field-label">Botón</span>
        <select className="ndp-select" value={ev.data.button || "Left"} onChange={(e) => updateSubEvent(idx, "button", e.target.value)}>
          <option value="Left">Izquierdo</option>
          <option value="Right">Derecho</option>
          <option value="Middle">Central</option>
        </select>
      </div>
      {(ev.data.x !== undefined || ev.data.y !== undefined) && (
        <>
          <div className="ndp-field">
            <span className="ndp-field-label">Coordenada X</span>
            <input type="number" className="ndp-input ndp-input-sm" value={ev.data.x ?? 0} onChange={(e) => updateSubEvent(idx, "x", parseInt(e.target.value) || 0)} />
          </div>
          <div className="ndp-field">
            <span className="ndp-field-label">Coordenada Y</span>
            <input type="number" className="ndp-input ndp-input-sm" value={ev.data.y ?? 0} onChange={(e) => updateSubEvent(idx, "y", parseInt(e.target.value) || 0)} />
          </div>
        </>
      )}
    </>
  );
}

export function KeyPressDetailForm({ ev, idx, updateSubEvent }: FormProps) {
  return (
    <div className="ndp-field">
      <span className="ndp-field-label">Tecla</span>
      <input type="text" className="ndp-input" value={ev.data.key || ""} onChange={(e) => updateSubEvent(idx, "key", e.target.value)} placeholder="Ej. KeyA, Space, Return" />
    </div>
  );
}

export function WheelDetailForm({ ev, idx, updateSubEvent }: FormProps) {
  return (
    <>
      <div className="ndp-field">
        <span className="ndp-field-label">Scroll X</span>
        <input type="number" className="ndp-input ndp-input-sm" value={ev.data.x ?? 0} onChange={(e) => updateSubEvent(idx, "x", parseInt(e.target.value) || 0)} />
      </div>
      <div className="ndp-field">
        <span className="ndp-field-label">Scroll Y (Delta)</span>
        <input type="number" className="ndp-input ndp-input-sm" value={ev.data.delta_y ?? ev.data.y ?? 0} onChange={(e) => updateSubEvent(idx, "delta_y", parseInt(e.target.value) || 0)} />
      </div>
    </>
  );
}

export function HotkeyDetailForm({ ev, idx, updateSubEvent }: FormProps) {
  return (
    <div className="ndp-field">
      <span className="ndp-field-label">Atajo de teclas</span>
      <input type="text" className="ndp-input" value={ev.data.keys || ev.data.key || ""} onChange={(e) => updateSubEvent(idx, "keys", e.target.value)} placeholder="Ej. Ctrl+C" />
    </div>
  );
}
export function AppControlDetailForm({ ev, idx, updateSubEvent, type }: FormProps & { type: string }) {
  if (type === "open_app") {
    return (
      <div className="ndp-field">
        <span className="ndp-field-label">Ejecutable</span>
        <input type="text" className="ndp-input" value={ev.data.exe || ""} onChange={(e) => updateSubEvent(idx, "exe", e.target.value)} placeholder="notepad.exe" />
      </div>
    );
  }
  if (type === "close_app") {
    return (
      <div className="ndp-field">
        <span className="ndp-field-label">Nombre de la app</span>
        <input type="text" className="ndp-input" value={ev.data.name || ""} onChange={(e) => updateSubEvent(idx, "name", e.target.value)} placeholder="Notepad" />
      </div>
    );
  }
  if (type === "wait_image") {
    return (
      <>
        <div className="ndp-field">
          <span className="ndp-field-label">Descripción</span>
          <input type="text" className="ndp-input" value={ev.data.description || ""} onChange={(e) => updateSubEvent(idx, "description", e.target.value)} placeholder="Esperar botón" />
        </div>
        <div className="ndp-field">
          <span className="ndp-field-label">Timeout (s)</span>
          <input type="number" className="ndp-input ndp-input-sm" value={ev.data.timeout || 10} onChange={(e) => updateSubEvent(idx, "timeout", parseInt(e.target.value) || 10)} min="1" />
        </div>
      </>
    );
  }
  if (type === "set_var") {
    return (
      <>
        <div className="ndp-field">
          <span className="ndp-field-label">Nombre variable</span>
          <input type="text" className="ndp-input" value={ev.data.name || ""} onChange={(e) => updateSubEvent(idx, "name", e.target.value)} placeholder="mi_variable" />
        </div>
        <div className="ndp-field">
          <span className="ndp-field-label">Valor</span>
          <input type="text" className="ndp-input" value={ev.data.value ?? ""} onChange={(e) => updateSubEvent(idx, "value", e.target.value)} placeholder="valor" />
        </div>
      </>
    );
  }
  if (type === "screenshot") {
    return (
      <>
        <div className="ndp-field">
          <span className="ndp-field-label">Nombre archivo</span>
          <input type="text" className="ndp-input" value={ev.data.filename || ""} onChange={(e) => updateSubEvent(idx, "filename", e.target.value)} placeholder="captura.png" />
        </div>
        <div className="ndp-field">
          <span className="ndp-field-label">Monitor</span>
          <select className="ndp-select" value={ev.data.monitor ?? ""} onChange={(e) => updateSubEvent(idx, "monitor", e.target.value === "" ? undefined : parseInt(e.target.value) || 0)}>
            <option value="">Principal (auto)</option>
            <option value="0">Monitor 1</option>
            <option value="1">Monitor 2</option>
            <option value="2">Monitor 3</option>
            <option value="3">Monitor 4</option>
          </select>
        </div>
      </>
    );
  }
  if (type === "run_cmd") {
    return (
      <>
        <div className="ndp-field">
          <span className="ndp-field-label">Comando</span>
          <input type="text" className="ndp-input" value={ev.data.command || ""} onChange={(e) => updateSubEvent(idx, "command", e.target.value)} placeholder="ping google.com" />
        </div>
        <div className="ndp-field">
          <span className="ndp-field-label">Argumentos</span>
          <input type="text" className="ndp-input" value={ev.data.args || ""} onChange={(e) => updateSubEvent(idx, "args", e.target.value)} placeholder="-t 4" />
        </div>
      </>
    );
  }
  if (type === "condition") {
    return (
      <>
        <div className="ndp-field">
          <span className="ndp-field-label">Tipo de condición</span>
          <select className="ndp-select" value={ev.data.condition_type || "expression"} onChange={(e) => updateSubEvent(idx, "condition_type", e.target.value)}>
            <option value="expression">Expresión (variables)</option>
            <option value="text">Texto (OCR)</option>
            <option value="image">Imagen (template)</option>
            <option value="pixel">Píxel (color)</option>
          </select>
        </div>
        {(ev.data.condition_type || "expression") === "expression" ? (
          <div className="ndp-field ndp-field-full">
            <span className="ndp-field-label">Expresión</span>
            <input type="text" className="ndp-input" value={ev.data.expression || ""} onChange={(e) => updateSubEvent(idx, "expression", e.target.value)} placeholder='{{ variable }} == "valor"' />
          </div>
        ) : (
          <>
            <div className="ndp-field ndp-field-full">
              <span className="ndp-field-label">Descripción / Lógica</span>
              <input type="text" className="ndp-input" value={ev.data.description || ""} onChange={(e) => updateSubEvent(idx, "description", e.target.value)} placeholder="Si existe texto en pantalla" />
            </div>
            <div className="ndp-field ndp-field-grow">
              <span className="ndp-field-label">Valor a comparar</span>
              <input type="text" className="ndp-input" value={ev.data.compare_value || ""} onChange={(e) => updateSubEvent(idx, "compare_value", e.target.value)} placeholder={ev.data.condition_type === "text" ? "Texto a buscar" : "Color hex o ruta"} />
            </div>
          </>
        )}
      </>
    );
  }
  return null;
}