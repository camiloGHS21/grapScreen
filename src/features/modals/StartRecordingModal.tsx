import React from "react";
import { Backdrop } from "../../components/Backdrop";
import { Project } from "../../types";
import { safeName } from "../../utils/text";

interface StartRecordingModalProps {
  selectedProject: Project;
  recordingName: string;
  setRecordingName: (n: string) => void;
  mp4: boolean;
  setMp4: (m: boolean) => void;
  startRecording: () => void;
  setRecordingNameOpen: (open: boolean) => void;
  busy: boolean;
}

export function StartRecordingModal({
  selectedProject,
  recordingName,
  setRecordingName,
  mp4,
  setMp4,
  startRecording,
  setRecordingNameOpen,
  busy
}: StartRecordingModalProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startRecording();
  };

  return (
    <Backdrop>
      <form className="modal" onSubmit={handleSubmit}>
        <small>NUEVA GRABACIÓN EN {selectedProject.name.toUpperCase()}</small>
        <h2>Nombra tu automatización</h2>
        <p>Introduce un nombre para la tarea que vas a grabar.</p>
        <input
          id="recording-name"
          value={recordingName}
          onChange={e => setRecordingName(e.target.value)}
          maxLength={80}
          placeholder="Ej. Iniciar sesión y descargar PDF"
          autoFocus
        />
        <p className="recording-mode-help">
          Al grabar verás el cronómetro y los controles de pausa y parada.
          Después podrás ejecutar la automatización en primer o segundo plano
          desde el botón Ejecutar Flujo.
        </p>
        <div style={{ marginTop: "16px" }}>
          <label className="check" style={{ borderTop: "none", background: "transparent", padding: 0 }}>
            <input type="checkbox" checked={mp4} onChange={e => setMp4(e.target.checked)} />
            <span aria-hidden="true">✓</span> Generar video MP4
          </label>
        </div>
        <div className="actions">
          <button type="button" className="quiet" disabled={busy} onClick={() => { setRecordingNameOpen(false); setRecordingName(""); }}>
            Cancelar
          </button>
          <button className="save" disabled={busy || !safeName(recordingName)}>
            Iniciar Grabación
          </button>
        </div>
      </form>
    </Backdrop>
  );
}
