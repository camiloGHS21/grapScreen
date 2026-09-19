import React, { useState } from "react";
import { Copy, GripVertical, ChevronRight, ChevronDown } from "lucide-react";
import { formatN8nExpression } from "../hooks/useNdvDragDrop";
import { NdvDragData } from "../types";

export interface DraggableJsonTreeProps {
  data: unknown;
  parentPath?: string;
  nodeName?: string;
  onCopyExpression?: (expr: string) => void;
  onDragStart?: (e: React.DragEvent, data: NdvDragData) => void;
  level?: number;
}

export function DraggableJsonTree({
  data,
  parentPath = "",
  nodeName,
  onCopyExpression,
  onDragStart,
  level = 0,
}: DraggableJsonTreeProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (data === null || data === undefined) {
    return <span className="ndv-json-null">null</span>;
  }

  const type = typeof data;
  if (type === "number" || type === "boolean") {
    return <span className={`ndv-json-${type}`}>{String(data)}</span>;
  }

  if (type === "string") {
    return <span className="ndv-json-string">"{data as string}"</span>;
  }

  const isArray = Array.isArray(data);
  const keys = isArray ? (data as unknown[]).map((_, i) => String(i)) : Object.keys(data as Record<string, unknown>);

  if (keys.length === 0) {
    return <span className="ndv-json-empty">{isArray ? "[]" : "{}"}</span>;
  }

  const toggle = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const getTypeBadge = (val: unknown): { label: string; className: string } => {
    if (val === null) return { label: "null", className: "badge-null" };
    if (Array.isArray(val)) return { label: `[${val.length}]`, className: "badge-arr" };
    const t = typeof val;
    if (t === "string") return { label: "str", className: "badge-str" };
    if (t === "number") return { label: "num", className: "badge-num" };
    if (t === "boolean") return { label: "bool", className: "badge-bool" };
    if (t === "object") return { label: "{}", className: "badge-obj" };
    return { label: t, className: "badge-any" };
  };

  return (
    <div className="ndv-json-tree" style={{ paddingLeft: level > 0 ? 14 : 0 }}>
      {keys.map((key) => {
        const val = (data as Record<string, unknown>)[key];
        const isObj = val !== null && typeof val === "object";
        const currentPath = parentPath ? (isArray ? `${parentPath}[${key}]` : `${parentPath}.${key}`) : key;
        const expr = formatN8nExpression(currentPath, nodeName);
        const isCol = !!collapsed[key];
        const badge = getTypeBadge(val);

        const dragPayload: NdvDragData = {
          path: currentPath,
          expression: expr,
          nodeName,
          type: badge.label,
        };

        return (
          <div key={key} className="ndv-json-row-wrapper">
            <div
              className="ndv-json-row"
              draggable={!isObj}
              onDragStart={(e) => {
                if (!isObj) {
                  onDragStart?.(e, dragPayload);
                  e.dataTransfer.setData("application/x-n8n-expression", JSON.stringify(dragPayload));
                  e.dataTransfer.setData("text/plain", expr);
                }
              }}
              title={isObj ? "Objeto expandible" : `Arrastra o haz clic para copiar: ${expr}`}
            >
              {isObj ? (
                <button
                  type="button"
                  className="ndv-json-toggle"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(key);
                  }}
                >
                  {isCol ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                </button>
              ) : (
                <span className="ndv-json-grip" title="Arrastra este dato a un valor">
                  <GripVertical size={12} />
                </span>
              )}

              <span className={`ndv-type-badge ${badge.className}`}>{badge.label}</span>

              <span
                className="ndv-json-key"
                onClick={() => {
                  if (isObj) toggle(key);
                  else onCopyExpression?.(expr);
                }}
              >
                {key}:
              </span>

              {isObj ? (
                <span
                  className="ndv-json-summary"
                  onClick={() => toggle(key)}
                >
                  {Array.isArray(val) ? `Array(${val.length})` : "Object"}
                </span>
              ) : (
                <span
                  className="ndv-json-value-cell"
                  onClick={() => onCopyExpression?.(expr)}
                >
                  <DraggableJsonTree
                    data={val}
                    parentPath={currentPath}
                    nodeName={nodeName}
                    onCopyExpression={onCopyExpression}
                    onDragStart={onDragStart}
                    level={level + 1}
                  />
                </span>
              )}

              {!isObj && onCopyExpression && (
                <button
                  type="button"
                  className="ndv-json-copy-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCopyExpression(expr);
                  }}
                  title={`Copiar expresión: ${expr}`}
                >
                  <Copy size={11} />
                </button>
              )}
            </div>

            {isObj && !isCol && (
              <div className="ndv-json-sub">
                <DraggableJsonTree
                  data={val}
                  parentPath={currentPath}
                  nodeName={nodeName}
                  onCopyExpression={onCopyExpression}
                  onDragStart={onDragStart}
                  level={level + 1}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
