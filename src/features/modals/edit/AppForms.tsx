import React from "react";

interface AppFormProps {
  editAppName: string; setEditAppName: (n: string) => void;
  editAppExe: string; setEditAppExe: (e: string) => void;
  editAppTitle: string; setEditAppTitle: (t: string) => void;
  editAppClass: string; setEditAppClass: (c: string) => void;
}
export function AppForm({ editAppName, setEditAppName, editAppExe, setEditAppExe, editAppTitle, setEditAppTitle, editAppClass, setEditAppClass }: AppFormProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Nombre descriptivo</span>
        <input type="text" value={editAppName} onChange={e => setEditAppName(e.target.value)} placeholder="Ej. Bloc de notas" />
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Ruta del ejecutable (exe)</span>
        <input type="text" value={editAppExe} onChange={e => setEditAppExe(e.target.value)} placeholder="Ej. notepad.exe" />
      </div>
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Título de ventana</span>
          <input type="text" value={editAppTitle} onChange={e => setEditAppTitle(e.target.value)} placeholder="Ej. Sin título: Bloc de notas" />
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Clase de ventana</span>
          <input type="text" value={editAppClass} onChange={e => setEditAppClass(e.target.value)} placeholder="Ej. Notepad" />
        </div>
      </div>
    </div>
  );
}

interface OpenAppFormProps {
  editOpenAppExe: string; setEditOpenAppExe: (e: string) => void;
}
export function OpenAppForm({ editOpenAppExe, setEditOpenAppExe }: OpenAppFormProps) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Ruta del ejecutable / Comando a abrir</span>
      <input type="text" value={editOpenAppExe} onChange={e => setEditOpenAppExe(e.target.value)} placeholder="Ej. C:\Windows\notepad.exe" />
    </div>
  );
}

interface CloseAppFormProps {
  editCloseAppName: string; setEditCloseAppName: (n: string) => void;
}
export function CloseAppForm({ editCloseAppName, setEditCloseAppName }: CloseAppFormProps) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Nombre o Título de la aplicación a cerrar</span>
      <input type="text" value={editCloseAppName} onChange={e => setEditCloseAppName(e.target.value)} placeholder="Ej. notepad.exe o Notepad" />
    </div>
  );
}
