import React from "react";
import { RecordedEvent } from "../../../types";
import { TimeSelector } from "./TimeSelector";
import {
  MouseMoveDetailForm,
  ButtonPressDetailForm,
  KeyPressDetailForm,
  WheelDetailForm,
  HotkeyDetailForm,
  AppControlDetailForm
} from "./DetailMouseKeyboardForms";
import {
  WebhookDetailForm,
  HttpRequestDetailForm,
  SwitchDetailForm,
  WaitDetailForm,
  CodeDetailForm,
  ErrorHandlerDetailForm,
  FileChangeDetailForm,
  IntegrationDetailForm,
  MergeDetailForm,
  FormDetailForm,
  TriggerDetailForm,
  StartupDetailForm,
  HotkeyCaptureForm
} from "./DetailN8nForms";

interface DetailRowEditProps {
  ev: RecordedEvent;
  idx: number;
  updateSubEvent: (idx: number, key: string, val: any) => void;
  updateSubEventTime: (idx: number, time: number) => void;
}

export function DetailRowEdit({ ev, idx, updateSubEvent, updateSubEventTime }: DetailRowEditProps) {
  return (
    <div className="ndp-edit">
      <div className="ndp-edit-top">
        <span className="ndp-edit-kind">{ev.kind}</span>
        <div className="ndp-edit-time">
          <span className="ndp-edit-time-label">Tiempo</span>
          <TimeSelector valueMs={ev.at_ms} onChange={(ms) => updateSubEventTime(idx, ms)} />
        </div>
      </div>
      <div className="ndp-edit-fields">
        {/* Mouse/Keyboard interactions */}
        {ev.kind === "mouse_move" && <MouseMoveDetailForm ev={ev} idx={idx} updateSubEvent={updateSubEvent} />}
        {(ev.kind === "button_press" || ev.kind === "button_release") && <ButtonPressDetailForm ev={ev} idx={idx} updateSubEvent={updateSubEvent} />}
        {(ev.kind === "key_press" || ev.kind === "key_release") && <KeyPressDetailForm ev={ev} idx={idx} updateSubEvent={updateSubEvent} />}
        {ev.kind === "wheel" && <WheelDetailForm ev={ev} idx={idx} updateSubEvent={updateSubEvent} />}
        {ev.kind === "hotkey" && <HotkeyDetailForm ev={ev} idx={idx} updateSubEvent={updateSubEvent} />}

        {/* Apps & OS control */}
        {["open_app", "close_app", "wait_image", "set_var", "screenshot", "run_cmd", "condition"].includes(ev.kind) && (
          <AppControlDetailForm ev={ev} idx={idx} updateSubEvent={updateSubEvent} type={ev.kind} />
        )}
        {ev.kind === "loop_start" && (
          <div className="ndp-field">
            <span className="ndp-field-label">Iteraciones</span>
            <input
              type="number"
              className="ndp-input ndp-input-sm"
              value={ev.data.iterations || 3}
              onChange={(e) => updateSubEvent(idx, 'iterations', parseInt(e.target.value) || 1)}
              min="1"
            />
          </div>
        )}
        {ev.kind === "delay" && (
          <div className="ndp-field">
            <span className="ndp-field-label">Segundos de espera</span>
            <input
              type="number"
              className="ndp-input ndp-input-sm"
              value={ev.data.seconds ?? 1}
              onChange={(e) => updateSubEvent(idx, 'seconds', parseFloat(e.target.value) || 1)}
              min="0.1"
              step="0.1"
            />
          </div>
        )}

        {/* n8n-style nodes */}
        {ev.kind === "webhook" && <WebhookDetailForm ev={ev} idx={idx} updateSubEvent={updateSubEvent} />}
        {ev.kind === "http_request" && <HttpRequestDetailForm ev={ev} idx={idx} updateSubEvent={updateSubEvent} />}
        {ev.kind === "switch" && <SwitchDetailForm ev={ev} idx={idx} updateSubEvent={updateSubEvent} />}
        {ev.kind === "wait" && <WaitDetailForm ev={ev} idx={idx} updateSubEvent={updateSubEvent} />}
        {ev.kind === "code" && <CodeDetailForm ev={ev} idx={idx} updateSubEvent={updateSubEvent} />}
        {ev.kind === "error_handler" && <ErrorHandlerDetailForm ev={ev} idx={idx} updateSubEvent={updateSubEvent} />}
        {ev.kind === "file_change" && <FileChangeDetailForm ev={ev} idx={idx} updateSubEvent={updateSubEvent} />}
        {["google_sheets", "google_docs", "whatsapp", "telegram", "ai_agent", "excel_local"].includes(ev.kind) && (
          <IntegrationDetailForm ev={ev} idx={idx} updateSubEvent={updateSubEvent} type={ev.kind} />
        )}
        {ev.kind === "merge" && <MergeDetailForm ev={ev} idx={idx} updateSubEvent={updateSubEvent} />}
        {ev.kind === "form" && <FormDetailForm ev={ev} idx={idx} updateSubEvent={updateSubEvent} />}
        {ev.kind === "trigger" && <TriggerDetailForm ev={ev} idx={idx} updateSubEvent={updateSubEvent} />}
        {ev.kind === "startup" && <StartupDetailForm ev={ev} idx={idx} updateSubEvent={updateSubEvent} />}

        {/* Triggers */}
        {ev.kind === "cron" && (
          <>
            <div className="ndp-field ndp-field-full">
              <span className="ndp-field-label">Frecuencia</span>
              <select className="ndp-select" value={ev.data.schedule || "1h"} onChange={(e) => updateSubEvent(idx, 'schedule', e.target.value)}>
                <option value="1m">Cada minuto</option>
                <option value="5m">Cada 5 minutos</option>
                <option value="15m">Cada 15 minutos</option>
                <option value="30m">Cada 30 minutos</option>
                <option value="1h">Cada hora</option>
                <option value="2h">Cada 2 horas</option>
                <option value="6h">Cada 6 horas</option>
                <option value="12h">Cada 12 horas</option>
                <option value="1d">Cada día</option>
                <option value="1w">Cada semana</option>
                <option value="custom">Personalizada...</option>
              </select>
            </div>
            {ev.data.schedule === "custom" && (
              <div className="ndp-field ndp-field-full">
                <span className="ndp-field-label">Expresión Cron</span>
                <input type="text" className="ndp-input" value={ev.data.cron_custom || ""} onChange={(e) => updateSubEvent(idx, 'cron_custom', e.target.value)} placeholder="*/5 * * * *" />
              </div>
            )}
          </>
        )}
        {ev.kind === "hotkey_trigger" && <HotkeyCaptureForm ev={ev} idx={idx} updateSubEvent={updateSubEvent} />}
      </div>
    </div>
  );
}
