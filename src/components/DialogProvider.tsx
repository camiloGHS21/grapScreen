import React, { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { AlertTriangle, HelpCircle, Info, X, Check } from "lucide-react";

/* ───────────────────────── Types ───────────────────────── */

export type DialogKind = "confirm" | "prompt" | "alert";

interface DialogOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  defaultValue?: string;
  placeholder?: string;
  variant?: "danger" | "warning" | "info";
}

interface DialogState extends DialogOptions {
  kind: DialogKind;
}

interface DialogFns {
  confirm: (opts: DialogOptions | string) => Promise<boolean>;
  prompt: (opts: DialogOptions | string, defaultValue?: string) => Promise<string | null>;
  alert: (opts: DialogOptions | string) => Promise<void>;
}

/* ───────────────────────── Context ───────────────────────── */

const DialogCtx = createContext<DialogFns | null>(null);

/* ───────────────────────── Provider ───────────────────────── */

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [ resolver, setResolver ] = useState<((v: any) => void) | null>(null);

  const resolve = useCallback((v: any) => {
    if (resolver) resolver(v);
    setResolver(null);
  }, [resolver]);

  const open = useCallback((kind: DialogKind, opts: DialogOptions) => {
    return new Promise<any>((r) => {
      setResolver(() => r);
      setInputValue(opts.defaultValue ?? "");
      setDialog({ ...opts, kind });
    });
  }, []);

  const close = useCallback((value: any) => {
    resolve(value);
    setDialog(null);
    setInputValue("");
  }, [resolve]);

  const confirm = useCallback((opts: DialogOptions | string): Promise<boolean> => {
    const o = typeof opts === "string" ? { message: opts } : opts;
    return open("confirm", o).then((v) => v === true);
  }, [open]);

  const prompt = useCallback((opts: DialogOptions | string, defaultValue?: string): Promise<string | null> => {
    const o = typeof opts === "string" ? { message: opts } : opts;
    return open("prompt", { ...o, defaultValue }).then((v) => (v == null ? null : String(v)));
  }, [open]);

  const alert = useCallback((opts: DialogOptions | string): Promise<void> => {
    const o = typeof opts === "string" ? { message: opts } : opts;
    return open("alert", o).then(() => undefined);
  }, [open]);

  // Keyboard
  React.useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(dialog.kind === "prompt" ? null : dialog.kind === "confirm" ? false : undefined);
      } else if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        if (dialog.kind === "prompt") close(inputValue);
        else if (dialog.kind === "confirm") close(true);
        else close(undefined);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, inputValue, close]);

  return (
    <DialogCtx.Provider value={{ confirm, prompt, alert }}>
      {children}
      {dialog && (
        <div className="dlg-backdrop" onMouseDown={() => close(dialog.kind === "alert" ? undefined : dialog.kind === "prompt" ? null : false)}>
          <div
            className={`dlg dlg-${dialog.variant || (dialog.kind === "confirm" ? "warning" : "info")}`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="dlg-icon">
              {dialog.variant === "danger" ? <AlertTriangle size={20} />
                : dialog.variant === "warning" ? <HelpCircle size={20} />
                : <Info size={20} />}
            </div>
            <div className="dlg-body">
              {dialog.title && <h3 className="dlg-title">{dialog.title}</h3>}
              <p className="dlg-message">{dialog.message}</p>
              {dialog.kind === "prompt" && (
                <input
                  className="dlg-input"
                  type="text"
                  value={inputValue}
                  autoFocus
                  placeholder={dialog.placeholder}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); close(inputValue); }
                  }}
                />
              )}
            </div>
            <div className="dlg-actions">
              {dialog.kind !== "alert" && (
                <button className="dlg-btn dlg-btn-cancel" onClick={() => close(dialog.kind === "prompt" ? null : false)}>
                  {dialog.cancelLabel || "Cancelar"}
                </button>
              )}
              <button
                className={`dlg-btn dlg-btn-ok ${dialog.variant === "danger" ? "danger" : ""}`}
                onClick={() => close(dialog.kind === "prompt" ? inputValue : dialog.kind === "alert" ? undefined : true)}
                autoFocus={dialog.kind === "alert"}
              >
                {dialog.variant === "danger" ? <X size={14} /> : <Check size={14} />}
                {dialog.confirmLabel || (dialog.variant === "danger" ? "Eliminar" : "Aceptar")}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogCtx.Provider>
  );
}

/* ───────────────────────── Hook ───────────────────────── */

export function useDialog(): DialogFns {
  const ctx = useContext(DialogCtx);
  if (!ctx) throw new Error("useDialog must be used within <DialogProvider>");
  return ctx;
}

export default DialogProvider;

