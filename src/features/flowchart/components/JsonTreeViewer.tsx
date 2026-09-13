import React, { useState } from "react";
import { Copy } from "lucide-react";

export interface JsonTreeProps {
  data: any;
  parentPath?: string;
  onCopyPath: (expression: string) => void;
  level?: number;
}

export function JsonTreeViewer({ data, parentPath = "", onCopyPath, level = 0 }: JsonTreeProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (data === null || data === undefined) {
    return <span className="json-null">null</span>;
  }

  const type = typeof data;

  if (type === "number" || type === "boolean") {
    return <span className={`json-${type}`}>{String(data)}</span>;
  }

  if (type === "string") {
    return <span className="json-string">"{data}"</span>;
  }

  const isArray = Array.isArray(data);
  const keys = isArray ? data.map((_, i) => String(i)) : Object.keys(data);

  if (keys.length === 0) {
    return <span className="json-empty">{isArray ? "[]" : "{}"}</span>;
  }

  const toggle = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="json-tree" style={{ paddingLeft: level > 0 ? 12 : 0 }}>
      {keys.map((key) => {
        const val = data[key];
        const valType = typeof val;
        const isObj = val !== null && valType === "object";
        const currentPath = parentPath
          ? parentPath.endsWith("]")
            ? `${parentPath}.${key}`
            : parentPath.startsWith("variables.")
            ? parentPath.replace("variables.", "")
            : `${parentPath}.${key}`
          : key;

        const expr = currentPath.startsWith("variables.")
          ? `{{ ${currentPath.replace("variables.", "")} }}`
          : `{{ ${currentPath} }}`;

        const isCol = !!collapsed[key];

        return (
          <div key={key} className="json-line">
            <span className="json-row">
              {isObj ? (
                <button
                  type="button"
                  className="json-toggle-btn"
                  onClick={() => toggle(key)}
                >
                  {isCol ? "▶" : "▼"}
                </button>
              ) : (
                <span className="json-bullet">•</span>
              )}

              <span
                className="json-key"
                title="Haz clic para copiar expresión {{ var }}"
                onClick={() => onCopyPath(expr)}
              >
                {key}:
              </span>

              {isObj ? (
                <span className="json-bracket-summary" onClick={() => toggle(key)}>
                  {Array.isArray(val) ? ` Array(${val.length})` : " Object"}
                </span>
              ) : (
                <span className="json-val-wrap" onClick={() => onCopyPath(expr)}>
                  <JsonTreeViewer
                    data={val}
                    parentPath={currentPath}
                    onCopyPath={onCopyPath}
                    level={level + 1}
                  />
                </span>
              )}

              <button
                type="button"
                className="json-copy-btn"
                title={`Copiar ${expr}`}
                onClick={() => onCopyPath(expr)}
              >
                <Copy size={11} />
              </button>
            </span>

            {isObj && !isCol && (
              <div className="json-sub">
                <JsonTreeViewer
                  data={val}
                  parentPath={currentPath}
                  onCopyPath={onCopyPath}
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
