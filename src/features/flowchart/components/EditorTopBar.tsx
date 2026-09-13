import React from "react";
import { ChevronLeft, Pencil, Play, History, Gauge, Zap, Check, Loader2, MoreVertical, Download, Trash2, Video } from "lucide-react";

export type EditorTab = "editor" | "executions" | "evaluations" | "triggers";

interface EditorTopBarProps {
  projectName: string;
  automationName: string;
  tab: EditorTab;
  setTab: (t: EditorTab) => void;
  onBack: () => void;
  onRename?: () => void;
  /** Save is a no-op today because edits persist immediately; kept for parity. */
  onSave?: () => void;
  onPublish?: () => void;
  /** Auto-save feedback. */
  saved?: boolean;
  saving?: boolean;
  /** Trigger activation state (n8n "Active" / our "Publicado"). */
  published?: boolean;
  publishBusy?: boolean;
  /** Read-only flow stats, shown inline instead of on a second toolbar. */
  durationLabel?: string;
  eventCount?: number;
  hasVideo?: boolean;
  /** n8n "Active" switch — arms this automation's own triggers. */
  triggerActive?: boolean;
  triggerBusy?: boolean;
  onToggleTrigger?: () => void;
  historyOpen?: boolean;
  onToggleHistory?: () => void;
  /** Automation options menu (Rebuild / Rename / Export / Delete). */
  menuOpen?: boolean;
  onToggleMenu?: (e: React.MouseEvent) => void;
  onRebuild?: () => void;
  onExport?: () => void;
  onDelete?: () => void;
}

const TABS: { id: EditorTab; label: string; icon: React.ElementType }[] = [
  { id: "editor", label: "Editor", icon: Pencil },
  { id: "executions", label: "Ejecuciones", icon: History },
  { id: "evaluations", label: "Evaluaciones", icon: Gauge },
  { id: "triggers", label: "Triggers", icon: Zap },
];

export function EditorTopBar({
  projectName,
  automationName,
  tab,
  setTab,
  onBack,
  onRename,
  onSave,
  onPublish,
  saved = true,
  saving = false,
  published = false,
  publishBusy = false,
  durationLabel,
  eventCount,
  hasVideo = false,
  triggerActive = false,
  triggerBusy = false,
  onToggleTrigger,
  historyOpen = false,
  onToggleHistory,
  menuOpen = false,
  onToggleMenu,
  onRebuild,
  onExport,
  onDelete,
}: EditorTopBarProps) {
  return (
    <div className="flow-topbar">
      {/* Left: breadcrumb + inline stats */}
      <div className="ftb-left">
        <button type="button" className="ftb-back" onClick={onBack} title="Volver a la biblioteca">
          <ChevronLeft size={16} />
        </button>
        <div className="ftb-crumb">
          <span className="ftb-crumb-scope">{projectName}</span>
          <span className="ftb-crumb-sep">/</span>
          <button type="button" className="ftb-crumb-name" onClick={onRename} title="Renombrar">
            {automationName}
          </button>
        </div>

        <div className="ftb-stats">
          <span className="ftb-stat"><em>Duración</em><b>{durationLabel ?? "00:00"}</b></span>
          <span className="ftb-stat"><em>Pasos</em><b>{eventCount ?? 0}</b></span>
          <span className="ftb-stat"><em>Video</em><b className={hasVideo ? "on" : ""}>{hasVideo ? "MP4" : "—"}</b></span>
        </div>
      </div>

      {/* Center: tabs */}
      <div className="ftb-tabs" role="tablist" aria-label="Vistas del flujo">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={"ftb-tab" + (active ? " active" : "")}
              onClick={() => setTab(t.id)}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Right: actions */}
      <div className="ftb-right">
        {onToggleTrigger && (
          <button
            type="button"
            className={"ftb-btn ghost" + (triggerActive ? " on" : "")}
            onClick={onToggleTrigger}
            disabled={triggerBusy}
            title={triggerActive ? "Desactivar triggers: deja de ejecutarse sola" : "Activar triggers: se dispara sola (intervalo, atajo, webhook, archivo)"}
          >
            {triggerBusy ? <Loader2 size={12} className="ftb-spin" /> : <Zap size={12} />}
            {triggerActive ? "Activa" : "Inactiva"}
          </button>
        )}
        {onToggleHistory && (
          <button
            type="button"
            className={"ftb-btn ghost" + (historyOpen ? " on" : "")}
            onClick={onToggleHistory}
            title="Historial de ejecuciones"
          >
            <History size={12} /> Historial
          </button>
        )}
        <span className={"ftb-saved" + (saving ? " saving" : "")} aria-live="polite">
          {saving ? (
            <>
              <Loader2 size={12} className="ftb-spin" /> Guardando…
            </>
          ) : saved ? (
            <>
              <Check size={12} /> Guardado
            </>
          ) : (
            "Sin guardar"
          )}
        </span>
        <button type="button" className="ftb-btn ghost" onClick={onSave} title="Guardar cambios">
          Guardar
        </button>
        <button
          type="button"
          className={"ftb-btn primary" + (published ? " on" : "")}
          onClick={onPublish}
          disabled={publishBusy}
          title={published ? "Desactivar disparadores automáticos" : "Activar: el flujo se dispara solo"}
        >
          {publishBusy ? <Loader2 size={12} className="ftb-spin" /> : published ? <Check size={12} /> : <Play size={12} />}
          {published ? "Publicado" : "Publicar"}
        </button>

        {onToggleMenu && (
          <div className="ftb-menu-anchor">
            <button
              type="button"
              className="ftb-btn ghost ftb-icon"
              aria-label="Opciones de la automatización"
              aria-expanded={menuOpen}
              onClick={onToggleMenu}
              title="Más opciones"
            >
              <MoreVertical size={14} />
            </button>
            {menuOpen && (
              <div className="ftb-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                {onRebuild && (
                  <button type="button" role="menuitem" onClick={onRebuild}>
                    <Video size={12} /> Regrabar
                  </button>
                )}
                <button type="button" role="menuitem" onClick={onRename}>
                  <Pencil size={12} /> Renombrar
                </button>
                {onExport && (
                  <button type="button" role="menuitem" onClick={onExport}>
                    <Download size={12} /> Exportar flujo…
                  </button>
                )}
                {onDelete && (
                  <button type="button" role="menuitem" className="danger" onClick={onDelete}>
                    <Trash2 size={12} /> Eliminar
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default EditorTopBar;
