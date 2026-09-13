import React, { useState } from "react";
import { Backdrop } from "../../components/Backdrop";
import { safeName } from "../../utils/text";

interface CreateProjectModalProps {
  createProject: (name: string, onSuccess: (folder: string) => void) => void;
  setCreateOpen: (open: boolean) => void;
  busy: boolean;
}

export function CreateProjectModal({ createProject, setCreateOpen, busy }: CreateProjectModalProps) {
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createProject(name, () => {
      setCreateOpen(false);
      setName("");
    });
  };

  return (
    <Backdrop>
      <form className="modal" onSubmit={handleSubmit}>
        <small>NUEVO PROYECTO</small>
        <h2>Crea tu carpeta</h2>
        <p>Se guardará en Documents/automateScreen.</p>
        <input
          id="project-name"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={80}
          placeholder="Ej. reportes"
          autoFocus
        />
        <code style={{ display: 'block', marginTop: '6px' }}>
          /automateScreen/{safeName(name) || "nuevo-proyecto"}
        </code>
        <div className="actions">
          <button type="button" className="quiet" disabled={busy} onClick={() => { setCreateOpen(false); setName(""); }}>
            Cancelar
          </button>
          <button className="save" disabled={busy || !safeName(name)}>
            Crear Carpeta
          </button>
        </div>
      </form>
    </Backdrop>
  );
}
