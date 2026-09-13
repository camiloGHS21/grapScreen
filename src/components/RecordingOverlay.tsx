import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { Play, Pause, Square, X } from "lucide-react";
import { useRecordingTimer } from "../hooks/useRecordingTimer";
import { useOverlayResizer } from "../hooks/useOverlayResizer";

function fmt(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function RecordingOverlay() {
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);

  const { elapsed, adjustTimerOnPause } = useRecordingTimer(paused);
  const { anchorState, hovered, handleMouseEnter, handleMouseLeave } = useOverlayResizer();

  // Ensure the document classes and transparent background are applied
  useEffect(() => {
    document.documentElement.classList.add("rec-overlay-html");
    document.documentElement.style.setProperty("background", "transparent", "important");
    if (document.body) {
      document.body.style.setProperty("background", "transparent", "important");
    }
  }, []);

  // Close this window automatically when the backend stops/cancels.
  useEffect(() => {
    const unFin = listen("recording-finished", () => {
      getCurrentWindow().close().catch(() => {});
    });
    const unCancel = listen("recording-cancelled", () => {
      getCurrentWindow().close().catch(() => {});
    });
    return () => {
      unFin.then((u) => u());
      unCancel.then((u) => u());
    };
  }, []);

  const togglePause = async () => {
    const next = !paused;
    adjustTimerOnPause(next);
    setPaused(next);
    try {
      if (next) await invoke("pause_recording");
      else await invoke("resume_recording");
    } catch {
      /* ignore */
    }
  };

  const stop = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await invoke("stop_recording");
    } catch {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await invoke("cancel_recording");
    } catch {
      setBusy(false);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag when clicking the capsule itself or status items, not buttons
    if ((e.target as HTMLElement).closest("button")) return;
    getCurrentWindow().startDragging().catch(() => {});
  };

  return (
    <div className={`rec-overlay rec-overlay--anchor-${anchorState}`}>
      <div
        className={`rec-bar rec-bar--anchor-${anchorState} ${paused ? "rec-bar--paused" : ""} ${hovered ? "rec-bar--hovered" : ""}`}
        role="toolbar"
        aria-label="Controles de grabación"
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Left: status + timer */}
        <div className="rec-status">
          <div className={`rec-dot ${paused ? "rec-dot--paused" : ""}`}>
            {paused ? (
              <Pause size={10} fill="currentColor" style={{ marginLeft: "1.5px" }} />
            ) : (
              <span className="rec-dot-inner" />
            )}
          </div>
          <div className="rec-info">
            <span className="rec-time" aria-live="polite">
              {fmt(elapsed)}
            </span>
          </div>
        </div>

        {/* Right: actions */}
        <div className="rec-actions">
          <button
            className={`rec-btn rec-btn--ghost ${
              paused ? "rec-btn--resume" : ""
            }`}
            onClick={togglePause}
            disabled={busy}
            title={paused ? "Reanudar grabación" : "Pausar grabación"}
            aria-label={paused ? "Reanudar" : "Pausar"}
          >
            {paused ? <Play size={13} fill="currentColor" /> : <Pause size={13} fill="currentColor" />}
            <span>{paused ? "Reanudar" : "Pausar"}</span>
          </button>
          <button
            className="rec-btn rec-btn--stop"
            onClick={stop}
            disabled={busy}
            title="Detener y guardar grabación"
            aria-label="Detener"
          >
            <Square size={13} fill="currentColor" />
            <span>Detener</span>
          </button>
          <button
            className="rec-btn rec-btn--cancel"
            onClick={cancel}
            disabled={busy}
            title="Cancelar grabación sin guardar"
            aria-label="Cancelar"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
