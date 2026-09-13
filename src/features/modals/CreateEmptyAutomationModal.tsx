import React, { useState } from "react";
import { Backdrop } from "../../components/Backdrop";
import { safeName } from "../../utils/text";

interface CreateEmptyAutomationModalProps {
  emptyAutNameOpen: boolean;
  setEmptyAutNameOpen: (open: boolean) => void;
  busy: boolean;
  createEmptyAut: (name: string, onSuccess: () => void) => void;
}

export function CreateEmptyAutomationModal({
  emptyAutNameOpen,
  setEmptyAutNameOpen,
  busy,
  createEmptyAut
}: CreateEmptyAutomationModalProps) {
  const [emptyAutName, setEmptyAutName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createEmptyAut(emptyAutName, () => {
      setEmptyAutNameOpen(false);
      setEmptyAutName("");
    });
  };

  if (!emptyAutNameOpen) return null;

  return (
    <Backdrop>
      <form className="modal" onSubmit={handleSubmit}>
        <small>NUEVA AUTOMATIZACIÓN DESDE CERO</small>
        <h2>Nombra tu flujo de trabajo</h2>
        <p>Introduce un nombre para la nueva automatización vacía.</p>
        <input
          id="empty-aut-name"
          value={emptyAutName}
          onChange={(e) => setEmptyAutName(e.target.value)}
          maxLength={80}
          placeholder="Ej. Mi flujo automatizado"
          autoFocus
        />
        <div className="actions">
          <button
            type="button"
            className="quiet"
            disabled={busy}
            onClick={() => {
              setEmptyAutNameOpen(false);
              setEmptyAutName("");
            }}
          >
            Cancelar
          </button>
          <button className="save" disabled={busy || !safeName(emptyAutName)}>
            Crear Flujo
          </button>
        </div>
      </form>
    </Backdrop>
  );
}
