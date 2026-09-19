import React, { useState } from "react";
import { ChevronRight } from "lucide-react";

interface DeclarativeAdvancedOverridesProps {
  isTrigger: boolean;
  mode: string;
  state: any;
  descriptor: {
    baseUrl: string | null;
    key?: string;
  } | null;
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const label = (text: string) => (
  <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>
    {text}
  </span>
);

const hint = (text: string) => (
  <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--dim)", lineHeight: 1.5 }}>{text}</div>
);

const note = (text: string, tone: "info" | "warn" = "info") => (
  <div
    style={{
      marginBottom: "14px",
      padding: "10px 12px",
      borderRadius: "8px",
      border: "1px solid var(--line)",
      background: "var(--s2)",
      fontSize: "11px",
      color: tone === "warn" ? "var(--warn, var(--dim))" : "var(--dim)",
      lineHeight: 1.6,
    }}
  >
    {text}
  </div>
);

export function DeclarativeAdvancedOverrides({
  isTrigger,
  mode,
  state,
  descriptor,
}: DeclarativeAdvancedOverridesProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const baseUrl = state.editN8nBaseUrl ?? "";
  const method = state.editN8nMethod ?? "GET";
  const path = state.editN8nPath ?? "";
  const qs = state.editN8nQs ?? "";
  const body = state.editN8nBody ?? "";
  const paginate = !!state.editN8nPaginate;
  const pageParam = state.editN8nPageParam ?? "page";
  const maxPages = state.editN8nMaxPages ?? 10;
  const port = state.editN8nPort ?? 8787;
  const interval = state.editN8nInterval ?? 60;

  return (
    <div style={{ margin: "20px 0 10px" }}>
      <button
        type="button"
        onClick={() => setShowAdvanced((s) => !s)}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          fontSize: "11.5px",
          color: "var(--dim)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "5px",
        }}
      >
        <ChevronRight
          size={14}
          style={{
            transform: showAdvanced ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform .15s",
          }}
        />
        Ajustes avanzados de petición (sobrescribir)
      </button>

      {showAdvanced && (
        <div style={{ marginTop: 12, paddingLeft: "12px", borderLeft: "2px solid var(--line)" }}>
          {isTrigger ? (
            <>
              {mode === "webhook" && (
                <>
                  <div style={{ marginBottom: "12px" }}>
                    {label("Ruta del webhook")}
                    <input
                      value={path}
                      onChange={(e) => state.setEditN8nPath?.(e.target.value)}
                      placeholder={`/webhook/${(state.editN8nKey || "trigger").toLowerCase()}`}
                    />
                  </div>
                  <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
                    <div style={{ flex: 1 }}>
                      {label("Método esperado")}
                      <select value={method} onChange={(e) => state.setEditN8nMethod?.(e.target.value)}>
                        {METHODS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ width: "130px" }}>
                      {label("Puerto local")}
                      <input
                        type="number"
                        min={1}
                        max={65535}
                        value={port}
                        onChange={(e) => state.setEditN8nPort?.(Number(e.target.value) || 8787)}
                      />
                    </div>
                  </div>
                </>
              )}

              {mode === "polling" && (
                <>
                  <div style={{ marginBottom: "12px" }}>
                    {label("URL base")}
                    <input
                      value={baseUrl}
                      onChange={(e) => state.setEditN8nBaseUrl?.(e.target.value)}
                      placeholder={descriptor?.baseUrl || "https://api.ejemplo.com"}
                    />
                  </div>
                  <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
                    <div style={{ width: "110px" }}>
                      {label("Método")}
                      <select value={method} onChange={(e) => state.setEditN8nMethod?.(e.target.value)}>
                        {METHODS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      {label("Ruta del recurso")}
                      <input
                        value={path}
                        onChange={(e) => state.setEditN8nPath?.(e.target.value)}
                        placeholder="items"
                      />
                    </div>
                    <div style={{ width: "110px" }}>
                      {label("Intervalo (s)")}
                      <input
                        type="number"
                        min={5}
                        value={interval}
                        onChange={(e) => state.setEditN8nInterval?.(Number(e.target.value) || 5)}
                      />
                    </div>
                  </div>
                </>
              )}

              {mode === "schedule" && (
                <div style={{ marginBottom: "12px", width: "160px" }}>
                  {label("Intervalo (segundos)")}
                  <input
                    type="number"
                    min={5}
                    value={interval}
                    onChange={(e) => state.setEditN8nInterval?.(Number(e.target.value) || 5)}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ marginBottom: "12px" }}>
                {label("URL base")}
                <input
                  value={baseUrl}
                  onChange={(e) => state.setEditN8nBaseUrl?.(e.target.value)}
                  placeholder={descriptor?.baseUrl || "https://api.ejemplo.com"}
                />
              </div>

              <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
                <div style={{ width: "120px" }}>
                  {label("Método")}
                  <select value={method} onChange={(e) => state.setEditN8nMethod?.(e.target.value)}>
                    {METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  {label("Ruta del recurso")}
                  <input
                    value={path}
                    onChange={(e) => state.setEditN8nPath?.(e.target.value)}
                    placeholder="items"
                  />
                </div>
              </div>

              <div style={{ marginBottom: "12px" }}>
                {label("Cuerpo personalizado (JSON)")}
                <textarea
                  style={{ fontFamily: "monospace", fontSize: "11px" }}
                  value={body}
                  onChange={(e) => state.setEditN8nBody?.(e.target.value)}
                  placeholder={'{\n  "key": "value"\n}'}
                  rows={3}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
