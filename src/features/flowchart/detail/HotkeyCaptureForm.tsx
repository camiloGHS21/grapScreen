import React, { useState, useEffect, useCallback } from "react";
import { RecordedEvent } from "../../../types";

interface FormProps {
  ev: RecordedEvent;
  idx: number;
  updateSubEvent: (idx: number, key: string, val: any) => void;
}

const KEY_NAMES: Record<string, string> = {
  Control: "Ctrl", Alt: "Alt", Shift: "Shift", Meta: "Win",
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
  Backspace: "Backspace", Enter: "Enter", Escape: "Esc", Tab: "Tab",
  Space: "Space", Delete: "Delete", Insert: "Insert", Home: "Home", End: "End",
  PageUp: "PageUp", PageDown: "PageDown", CapsLock: "CapsLock",
  F1: "F1", F2: "F2", F3: "F3", F4: "F4", F5: "F5", F6: "F6",
  F7: "F7", F8: "F8", F9: "F9", F10: "F10", F11: "F11", F12: "F12",
};

function keyDisplayName(e: KeyboardEvent): string | null {
  if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return null;
  if (e.key.length === 1) return e.key.toUpperCase();
  if (KEY_NAMES[e.key]) return KEY_NAMES[e.key];
  if (e.code.startsWith("Key")) return e.code.slice(3);
  if (e.code.startsWith("Digit")) return e.code.slice(5);
  return e.key;
}

export function HotkeyCaptureForm({ ev, idx, updateSubEvent }: FormProps) {
  const [capturing, setCapturing] = useState(false);
  const [pressed, setPressed] = useState<Set<string>>(new Set());

  const stopCapture = useCallback(() => {
    setCapturing(false);
    setPressed(new Set());
  }, []);

  useEffect(() => {
    if (!capturing) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const mods = new Set<string>();
      if (e.ctrlKey) mods.add("Ctrl");
      if (e.altKey) mods.add("Alt");
      if (e.shiftKey) mods.add("Shift");
      if (e.metaKey) mods.add("Win");
      setPressed(mods);

      const keyName = keyDisplayName(e);
      if (keyName) {
        const parts = [...mods, keyName];
        const shortcut = parts.join("+");
        updateSubEvent(idx, "shortcut", shortcut);
        setTimeout(() => stopCapture(), 150);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) {
        const mods = new Set(pressed);
        const name = KEY_NAMES[e.key] || e.key;
        mods.delete(name);
        setPressed(mods);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [capturing, idx, updateSubEvent, stopCapture, pressed]);

  useEffect(() => {
    if (!capturing) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && pressed.size === 0) {
        e.preventDefault();
        stopCapture();
      }
    };
    window.addEventListener("keydown", onEsc, true);
    return () => window.removeEventListener("keydown", onEsc, true);
  }, [capturing, pressed, stopCapture]);

  const currentShortcut = ev.data.shortcut || "";

  return (
    <div className="ndp-field ndp-field-full">
      <span className="ndp-field-label">Atajo de teclado global</span>
      <div className="ndp-hotkey-row">
        <input
          type="text"
          className="ndp-input"
          value={currentShortcut}
          onChange={e => updateSubEvent(idx, "shortcut", e.target.value)}
          placeholder="Pulsa capturar..."
          readOnly={capturing}
        />
        <button
          type="button"
          className={`ndp-capture-btn${capturing ? " capturing" : ""}`}
          onClick={() => capturing ? stopCapture() : setCapturing(true)}
          title={capturing ? "Cancela con Esc" : "Capturar teclas"}
        >
          {capturing ? "● Grabando..." : "⌨ Capturar"}
        </button>
      </div>
      {capturing && (
        <p className="ndp-hint">
          Pulsa la combinación de teclas ahora... (Esc para cancelar)
          {pressed.size > 0 && (
            <span className="ndp-hotkey-preview"> {Array.from(pressed).join(" + ")} + ...</span>
          )}
        </p>
      )}
    </div>
  );
}
