import React, { useState } from "react";
import { X, Check, Code, Sparkles, Database, ChevronRight, Copy } from "lucide-react";
import { useRustExpressionEvaluator } from "../hooks/useRustExpressionEvaluator";

interface ExpressionEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  expression: string;
  onSave: (newExpr: string) => void;
  itemData?: unknown;
  fieldName?: string;
}

export function ExpressionEditorModal({
  isOpen,
  onClose,
  expression,
  onSave,
  itemData,
  fieldName = "Parámetro",
}: ExpressionEditorModalProps) {
  const [draft, setDraft] = useState(expression);
  const [copied, setCopied] = useState(false);

  const { evaluation, isEvaluating } = useRustExpressionEvaluator({
    expression: draft,
    itemData,
  });

  if (!isOpen) return null;

  const currentObj =
    itemData && typeof itemData === "object" && !Array.isArray(itemData)
      ? (itemData as Record<string, unknown>)
      : Array.isArray(itemData) && itemData[0] && typeof itemData[0] === "object"
      ? (itemData[0] as Record<string, unknown>)
      : null;

  const keys = currentObj ? Object.keys(currentObj) : [];

  const handleInsertKey = (key: string) => {
    const exprToken = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
      ? `{{ $json.${key} }}`
      : `{{ $json["${key}"] }}`;
    setDraft((prev) => (prev ? `${prev} ${exprToken}` : exprToken));
  };

  const resultText = evaluation?.error
    ? `Error: ${evaluation.error}`
    : evaluation?.result != null
    ? typeof evaluation.result === "object"
      ? JSON.stringify(evaluation.result, null, 2)
      : String(evaluation.result)
    : "";

  const handleCopyResult = () => {
    if (!resultText) return;
    navigator.clipboard.writeText(resultText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="ndv-expression-modal-overlay" onClick={onClose}>
      <div className="ndv-expression-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="ndv-expression-modal-head">
          <div className="ndv-expr-head-left">
            <Code size={16} className="text-accent" />
            <span className="ndv-expr-title">Editor de Expresiones</span>
            <span className="ndv-expr-sub">{fieldName}</span>
          </div>
          <button type="button" className="ndv-btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* 2-Column Body: Explorer on Left, Editor + Preview on Right */}
        <div className="ndv-expression-modal-body">
          {/* Left Explorer */}
          <div className="ndv-expr-explorer">
            <div className="ndv-expr-explorer-head">
              <Database size={13} />
              <span>Variables Disponibles</span>
            </div>
            <div className="ndv-expr-explorer-list">
              <div className="ndv-expr-group-title">
                <span>$json (Elemento actual)</span>
              </div>
              {keys.length > 0 ? (
                keys.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="ndv-expr-key-btn"
                    onClick={() => handleInsertKey(k)}
                    title={`Haz clic para insertar {{ $json.${k} }}`}
                  >
                    <ChevronRight size={11} />
                    <span className="ndv-key-name">{k}</span>
                    <span className="ndv-key-val">
                      {String(currentObj?.[k] ?? "").slice(0, 20)}
                    </span>
                  </button>
                ))
              ) : (
                <div className="ndv-expr-empty-vars">
                  <span>Sin datos de entrada para explorar</span>
                </div>
              )}

              <div className="ndv-expr-group-title mt-2">
                <span>Atajos comunes</span>
              </div>
              <button
                type="button"
                className="ndv-expr-key-btn"
                onClick={() => setDraft((d) => `${d} {{ $json }}`)}
              >
                <code>{"{{ $json }}"}</code> (objeto completo)
              </button>
              <button
                type="button"
                className="ndv-expr-key-btn"
                onClick={() => setDraft((d) => `${d} {{ $today }}`)}
              >
                <code>{"{{ $today }}"}</code> (fecha actual)
              </button>
            </div>
          </div>

          {/* Right Editor & Preview */}
          <div className="ndv-expr-main">
            <div className="ndv-expr-editor-wrap">
              <label className="ndv-expr-label">
                <Sparkles size={13} /> Expresión (se evalúa en Rust)
              </label>
              <textarea
                className="ndv-expr-textarea"
                rows={5}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ejemplo: Hola {{ $json.nombre }}, tu pedido es {{ $json.id }}"
              />
            </div>

            <div className="ndv-expr-preview-wrap">
              <div className="ndv-expr-preview-head">
                <span className="ndv-preview-title">Resultado evaluado en tiempo real:</span>
                {resultText && (
                  <button
                    type="button"
                    className="ndv-copy-result-btn"
                    onClick={handleCopyResult}
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? "Copiado" : "Copiar"}
                  </button>
                )}
              </div>
              <div className="ndv-expr-result-box">
                {isEvaluating ? (
                  <span className="ndv-evaluating-text">Evaluando en Rust…</span>
                ) : resultText ? (
                  <pre className="ndv-result-content">{resultText}</pre>
                ) : (
                  <span className="ndv-empty-eval">Escribe una expresión arriba para ver el resultado</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="ndv-expression-modal-footer">
          <button type="button" className="quiet" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="save"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
          >
            Aplicar expresión
          </button>
        </div>
      </div>
    </div>
  );
}
export default ExpressionEditorModal;
