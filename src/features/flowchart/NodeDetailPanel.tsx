import React from "react";
import { Pencil, X, Check, Clock, MousePointer, Keyboard, Move, Command, AppWindow, XCircle, ScanEye, Variable, Camera, Terminal, GitBranch, Repeat, Globe, Pause, AlertTriangle, Zap, Play, FolderOpen, Route, GitMerge, Code2, Loader, type LucideIcon } from "lucide-react";
import { RecordedEvent, FlowNode } from "../../types";
import { NODE_COLORS } from "../../Flowchart";
import { getNodeIcon } from "./buildNodes";
import { ADVANCED_NODE_TYPES } from "./utils/nodeCatalog";
import { DetailRowEdit } from "./detail/DetailRowEdit";

interface NodeDetailPanelProps {
  isExpanded: boolean;
  isEditingGroup: boolean;
  setIsEditingGroup: (b: boolean) => void;
  editEventsList: RecordedEvent[];
  setEditEventsList: React.Dispatch<React.SetStateAction<RecordedEvent[]>>;
  handleSaveGroupedEvents: () => void;
  updateSubEvent: (idx: number, key: string, val: any) => void;
  updateSubEventTime: (idx: number, time: number) => void;
  node: FlowNode;
  events: RecordedEvent[];
  nodes: FlowNode[];
  onClose: () => void;
  onEditNode?: (n: FlowNode) => void;
}

const EVENT_ICONS: Record<string, LucideIcon> = {
  mouse_move: MousePointer, button_press: MousePointer, button_release: MousePointer,
  key_press: Keyboard, key_release: Keyboard, wheel: Move, hotkey: Command,
  open_app: AppWindow, close_app: XCircle, wait_image: ScanEye, set_var: Variable,
  screenshot: Camera, run_cmd: Terminal, condition: GitBranch, loop_start: Repeat,
  webhook: Globe, http_request: Globe, switch: Route, merge: GitMerge, wait: Pause,
  code: Code2, error_handler: AlertTriangle, trigger: Zap, cron: Clock, startup: Play,
  file_change: FolderOpen, hotkey_trigger: Command, scroll: Move,
  google_sheets: Globe, google_docs: Globe, whatsapp: Globe, telegram: Globe,
  ai_agent: Loader, form: Globe,
};

const EVENT_LABELS: Record<string, string> = {
  mouse_move: "Mover ratón", button_press: "Clic", button_release: "Soltar clic",
  key_press: "Pulsar tecla", key_release: "Soltar tecla", wheel: "Scroll",
  hotkey: "Atajo", open_app: "Abrir app", close_app: "Cerrar app",
  wait_image: "Esperar imagen", set_var: "Variable", screenshot: "Captura",
  run_cmd: "Comando", condition: "Condición", loop_start: "Bucle",
  webhook: "Webhook", http_request: "HTTP", switch: "Switch", merge: "Merge",
  wait: "Esperar", code: "Código", error_handler: "Error", trigger: "Trigger",
  cron: "Cron", startup: "Inicio", file_change: "Archivo", hotkey_trigger: "Atajo",
  scroll: "Scroll", google_sheets: "Sheets", google_docs: "Docs",
  whatsapp: "WhatsApp", telegram: "Telegram", ai_agent: "IA", form: "Formulario", delay: "Esperar",
};

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

export function NodeDetailPanel({
  isExpanded, isEditingGroup, setIsEditingGroup, editEventsList, setEditEventsList,
  handleSaveGroupedEvents, updateSubEvent, updateSubEventTime, node, events, onClose, onEditNode
}: NodeDetailPanelProps) {
  if (!isExpanded || node.type === "start" || node.type === "end") return null;

  const handleCancel = () => {
    if (node.start != null && node.end != null) {
      setEditEventsList(JSON.parse(JSON.stringify(events.slice(node.start, node.end + 1))));
    }
    setIsEditingGroup(false);
  };

  const totalDuration = editEventsList.length > 0
    ? editEventsList[editEventsList.length - 1].at_ms - editEventsList[0].at_ms : 0;

  const accent = (NODE_COLORS as Record<string, string>)[node.type] || "#6E58F2";
  const nodeIcon = getNodeIcon(node.type, 18);

  return (
    <div className="ndp" style={{ "--accent": accent } as React.CSSProperties} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <div className="ndp-head">
        <div className="ndp-head-left">
          <span className="ndp-head-icon" style={{ color: accent, borderColor: accent }}>{nodeIcon}</span>
          <div className="ndp-head-info">
            <span className="ndp-head-title">{node.label}</span>
            <span className="ndp-head-sub">{editEventsList.length} evento{editEventsList.length !== 1 ? "s" : ""} · {formatTime(totalDuration)}</span>
          </div>
        </div>
        <button type="button" onClick={onClose} className="ndp-close" title="Cerrar"><X size={15} /></button>
      </div>

      {!isEditingGroup && (
        <div className="ndp-edit-bar">
          {ADVANCED_NODE_TYPES.has(node.type) ? (
            <button type="button" onClick={() => onEditNode?.(node)} className="ndp-btn ndp-btn-edit" title="Configurar Parámetros">
              <Pencil size={12} /> Configurar Parámetros
            </button>
          ) : (
            <button type="button" onClick={() => setIsEditingGroup(true)} className="ndp-btn ndp-btn-edit" title="Editar configuración">
              <Pencil size={12} /> Editar configuración
            </button>
          )}
        </div>
      )}

      <div className="ndp-list">
        {editEventsList.length === 0 ? (
          <div className="ndp-empty"><Clock size={22} /><span>Sin eventos en este grupo.</span></div>
        ) : (
          editEventsList.map((ev, idx) => {
            if (isEditingGroup) {
              return <DetailRowEdit key={idx} ev={ev} idx={idx} updateSubEvent={updateSubEvent} updateSubEventTime={updateSubEventTime} />;
            }
            const IconComp = EVENT_ICONS[ev.kind] || Loader;
            return (
              <div className="ndp-row" key={idx}>
                <span className="ndp-row-icon"><IconComp size={13} /></span>
                <span className="ndp-row-kind">{EVENT_LABELS[ev.kind] || ev.kind}</span>
                <span className="ndp-row-val">
                  {ev.kind === "mouse_move" && `(${ev.data.x}, ${ev.data.y})`}
                  {(ev.kind === "button_press" || ev.kind === "button_release") && `${ev.data.button} (${ev.data.x}, ${ev.data.y})`}
                  {(ev.kind === "key_press" || ev.kind === "key_release") && ev.data.key}
                  {ev.kind === "wheel" && `ΔY: ${ev.data.delta_y ?? ev.data.y}`}
                  {ev.kind === "hotkey" && (ev.data.keys || ev.data.key)}
                  {ev.kind === "open_app" && ev.data.exe}
                  {ev.kind === "close_app" && ev.data.name}
                  {ev.kind === "wait_image" && ev.data.description}
                  {ev.kind === "set_var" && `${ev.data.name} = ${ev.data.value}`}
                  {ev.kind === "screenshot" && ev.data.filename}
                  {ev.kind === "run_cmd" && ev.data.command}
                  {ev.kind === "condition" && ev.data.description}
                  {ev.kind === "loop_start" && `${ev.data.iterations}× iteraciones`}
                  {ev.kind === "webhook" && `${ev.data.method || "POST"} ${ev.data.path || "/webhook"}`}
                  {ev.kind === "polling" && `${ev.data.method || "GET"} ${ev.data.url || "sin URL"} · cada ${ev.data.interval || 60}s`}
                  {ev.kind === "http_request" && `${ev.data.method || "GET"} ${ev.data.url || ""}`}
                  {ev.kind === "switch" && ev.data.field}
                  {ev.kind === "merge" && ev.data.mode}
                  {ev.kind === "wait" && `${ev.data.seconds || 5}s`}
                  {ev.kind === "code" && ev.data.language}
                  {ev.kind === "error_handler" && ev.data.action}
                  {ev.kind === "trigger" && ev.data.schedule}
                  {ev.kind === "startup" && "Automático"}
                  {ev.kind === "form" && `${ev.data.fields?.length || 0} campos`}
                  {ev.kind === "google_docs" && ev.data.document_id}
                  {ev.kind === "sqlite_query" && (ev.data.query || "").toString().slice(0, 40)}
                  {ev.kind === "sqlite_execute" && (ev.data.query || "").toString().slice(0, 40)}
                  {ev.kind === "xml_parse" && (ev.data.root ? `raíz: ${ev.data.root}` : "documento completo")}
                  {ev.kind === "html_extract" && `${ev.data.selector || "?"} → ${ev.data.attr || "texto"}`}
                  {ev.kind === "rss_read" && (ev.data.url || "sin URL")}
                  {ev.kind === "send_email" && `${ev.data.to_email || "sin destinatario"} · ${ev.data.subject || "sin asunto"}`}
                  {ev.kind === "slack_webhook" && (ev.data.channel || ev.data.text || "mensaje")}
                  {ev.kind === "discord_webhook" && (ev.data.content || "mensaje")}
                  {ev.kind === "notion" && `${ev.data.operation || "query_database"}${ev.data.database_id ? ` · ${ev.data.database_id}` : ""}`}
                  {ev.kind === "airtable" && `${ev.data.operation || "list"}${ev.data.table ? ` · ${ev.data.table}` : ""}`}
                  {ev.kind === "stop_error" && (ev.data.message || "abortar")}
                  {ev.kind === "noop" && "sin operación"}
                </span>
                <span className="ndp-row-time">{formatTime(ev.at_ms)}</span>
              </div>
            );
          })
        )}
      </div>

      {isEditingGroup && (
        <div className="ndp-foot">
          <button type="button" onClick={handleCancel} className="ndp-btn ndp-btn-cancel"><X size={13} /> Cancelar</button>
          <button type="button" onClick={handleSaveGroupedEvents} className="ndp-btn ndp-btn-save"><Check size={13} /> Guardar cambios</button>
        </div>
      )}
    </div>
  );
}
export default NodeDetailPanel;