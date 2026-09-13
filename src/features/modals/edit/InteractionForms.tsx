import React from "react";

interface ClickFormProps {
  editX: number; setEditX: (x: number) => void;
  editY: number; setEditY: (y: number) => void;
}
export function ClickForm({ editX, setEditX, editY, setEditY }: ClickFormProps) {
  return (
    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
      <div style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Coordenada X (px)</span>
        <input type="number" value={editX} onChange={e => setEditX(parseInt(e.target.value) || 0)} />
      </div>
      <div style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Coordenada Y (px)</span>
        <input type="number" value={editY} onChange={e => setEditY(parseInt(e.target.value) || 0)} />
      </div>
    </div>
  );
}

interface TypeFormProps {
  editText: string; setEditText: (t: string) => void;
}
export function TypeForm({ editText, setEditText }: TypeFormProps) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Texto a escribir</span>
      <textarea value={editText} onChange={e => setEditText(e.target.value)} placeholder="Escribe el texto..." />
    </div>
  );
}

interface HotkeyFormProps {
  editHotkeyKeys: string; setEditHotkeyKeys: (k: string) => void;
}
export function HotkeyForm({ editHotkeyKeys, setEditHotkeyKeys }: HotkeyFormProps) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Atajo de teclado (Modificadores + Tecla)</span>
      <input type="text" value={editHotkeyKeys} onChange={e => setEditHotkeyKeys(e.target.value)} placeholder="Ej. Ctrl+C o Win+R" />
    </div>
  );
}
