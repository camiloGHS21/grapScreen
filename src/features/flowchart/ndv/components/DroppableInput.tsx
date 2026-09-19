import React, { useState, useRef } from "react";
import { Loader2, CheckCircle2, AlertCircle, RotateCcw } from "lucide-react";
import { useRustExpressionEvaluator } from "../hooks/useRustExpressionEvaluator";
import { NDV_DRAG_MIME } from "../hooks/useNdvDragDrop";
import { ExpressionEditorModal } from "./ExpressionEditorModal";

export interface DroppableInputProps {
  value: string | number;
  onChange: (val: string) => void;
  placeholder?: string;
  type?: "text" | "textarea" | "number";
  rows?: number;
  label?: string;
  hint?: string;
  itemData?: unknown;
  disabled?: boolean;
}

export function DroppableInput({
  value,
  onChange,
  placeholder,
  type = "text",
  rows = 3,
  label,
  hint,
  itemData,
  disabled = false,
}: DroppableInputProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const stringVal = String(value ?? "");
  const { evaluation, isEvaluating, hasExpression } = useRustExpressionEvaluator({
    expression: stringVal,
    itemData,
  });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!isDragOver) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    let expr = "";
    const rawN8n = e.dataTransfer.getData(NDV_DRAG_MIME);
    if (rawN8n) {
      try {
        const parsed = JSON.parse(rawN8n);
        expr = parsed.expression || "";
      } catch {
        expr = "";
      }
    }

    if (!expr) {
      expr = e.dataTransfer.getData("text/plain") || "";
    }

    if (!expr) return;

    const el = inputRef.current;
    if (el) {
      const start = el.selectionStart ?? stringVal.length;
      const end = el.selectionEnd ?? stringVal.length;
      const newVal = stringVal.slice(0, start) + expr + stringVal.slice(end);
      onChange(newVal);

      requestAnimationFrame(() => {
        el.focus();
        const cursor = start + expr.length;
        el.setSelectionRange(cursor, cursor);
      });
    } else {
      onChange(stringVal ? `${stringVal} ${expr}` : expr);
    }
  };

  const isRequired = label ? (label.endsWith(" *") || label.includes("*")) : false;
  const cleanLabel = label ? label.replace(/\s*\*+$/, "") : "";
  // n8n marks an expression with an `fx` chip inside the input and offers a
  // reset beside it. Both are chrome over the same value, so they follow the
  // value rather than a mode the user has to switch to.
  const showExpressionChrome = hasExpression && type !== "textarea";

  /** Turns the current text into an expression and opens the editor on it. */
  const startExpression = () => {
    onChange(stringVal ? `{{ ${stringVal} }}` : "{{ $json. }}");
    setIsModalOpen(true);
  };

  return (
    <div className={`ndv-droppable-field ${isDragOver ? "drag-over" : ""}`}>
      {label && (
        <div className="ndv-field-header-row">
          <label className="ndv-n8n-field-label">
            <span>{cleanLabel}</span>
            {isRequired && <span className="ndv-required-asterisk"> *</span>}
          </label>
          {/* One chip instead of the old Fixed/Expression pair: n8n has no
              segmented control here either, but the way into the expression
              editor has to stay somewhere. */}
          {!hasExpression && (
            <button
              type="button"
              className="ndv-fx-toggle"
              onClick={startExpression}
              title="Calcular este campo con una expresión"
            >
              fx
            </button>
          )}
        </div>
      )}

      <div className={`ndv-input-wrapper ${showExpressionChrome ? "is-expression" : ""}`}>
        {showExpressionChrome && (
          <button
            type="button"
            className="ndv-fx-badge"
            onClick={() => setIsModalOpen(true)}
            title="Editar la expresión"
          >
            fx
          </button>
        )}
        {type === "textarea" ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={stringVal}
            onChange={(e) => onChange(e.target.value)}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            placeholder={placeholder}
            rows={rows}
            disabled={disabled}
            className="ndv-droppable-input textarea"
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={type === "number" ? "number" : "text"}
            value={stringVal}
            onChange={(e) => onChange(e.target.value)}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            placeholder={placeholder}
            disabled={disabled}
            className="ndv-droppable-input"
          />
        )}

        {showExpressionChrome && (
          <button
            type="button"
            className="ndv-input-reset"
            onClick={() => onChange("")}
            title="Quitar la expresión"
            aria-label="Quitar la expresión"
          >
            <RotateCcw size={12} />
          </button>
        )}

        {/* Real-time live Rust evaluation pill */}
        {hasExpression && (
          <div className="ndv-live-eval-pill" title="Previsualización calculada en Rust">
            {isEvaluating ? (
              <span className="ndv-eval-evaluating">
                <Loader2 size={11} className="spin" /> Evaluando…
              </span>
            ) : evaluation?.error ? (
              <span className="ndv-eval-error text-danger" title={evaluation.error}>
                <AlertCircle size={11} /> Error en expresión
              </span>
            ) : (
              <span className="ndv-eval-success">
                <CheckCircle2 size={11} className="text-success" />
                <span className="ndv-eval-text">
                  {evaluation?.result != null
                    ? typeof evaluation.result === "object"
                      ? JSON.stringify(evaluation.result)
                    : String(evaluation.result)
                    : "—"}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {hint && <span className="ndv-field-hint">{hint}</span>}

      <ExpressionEditorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        expression={stringVal}
        onSave={onChange}
        itemData={itemData}
        fieldName={cleanLabel}
      />
    </div>
  );
}

export default DroppableInput;
