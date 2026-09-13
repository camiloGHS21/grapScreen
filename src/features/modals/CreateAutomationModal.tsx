import React from "react";
import { Video, Plus } from "lucide-react";
import { Backdrop } from "../../components/Backdrop";

interface CreateAutomationModalProps {
  setCreateAutTypeOpen: (open: boolean) => void;
  setRecordingNameOpen: (open: boolean) => void;
  setEmptyAutNameOpen: (open: boolean) => void;
}

export function CreateAutomationModal({
  setCreateAutTypeOpen,
  setRecordingNameOpen,
  setEmptyAutNameOpen
}: CreateAutomationModalProps) {
  return (
    <Backdrop>
      <div className="modal" style={{ width: '380px', padding: '24px', textAlign: 'center' }}>
        <small>NUEVA AUTOMATIZACIÓN</small>
        <h2 style={{ fontSize: '18px', marginBottom: '8px', fontWeight: 700 }}>Crear nueva automatización</h2>
        <p style={{ color: 'var(--muted)', fontSize: '12.5px', marginBottom: '20px' }}>Selecciona cómo deseas crear este flujo de trabajo.</p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            type="button"
            className="primary"
            onClick={() => {
              setCreateAutTypeOpen(false);
              setRecordingNameOpen(true);
            }}
            style={{
              height: '42px',
              minHeight: '42px',
              borderRadius: '10px',
              fontSize: '13px',
              width: '100%',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              background: 'var(--red)',
              color: '#fff',
              border: 0,
              cursor: 'pointer'
            }}
          >
            <Video size={16} /> Por captura de pantalla
          </button>

          <button
            type="button"
            className="quiet"
            onClick={() => {
              setCreateAutTypeOpen(false);
              setEmptyAutNameOpen(true);
            }}
            style={{
              height: '42px',
              minHeight: '42px',
              borderRadius: '10px',
              fontSize: '13px',
              width: '100%',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              border: '1px solid var(--line)',
              background: 'var(--s2)',
              color: 'var(--text)',
              cursor: 'pointer'
            }}
          >
            <Plus size={16} /> Crear desde cero (Flujo vacío)
          </button>
        </div>

        <div className="actions" style={{ marginTop: '16px', justifyContent: 'center' }}>
          <button
            type="button"
            className="quiet"
            onClick={() => setCreateAutTypeOpen(false)}
            style={{ border: 'none', background: 'transparent', color: 'var(--dim)', cursor: 'pointer', fontSize: '12.5px' }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </Backdrop>
  );
}
