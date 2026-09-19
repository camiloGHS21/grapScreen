import React, { useMemo, useState } from "react";
import { Copy, Check, Search, GripVertical } from "lucide-react";
import { NDV_DRAG_MIME } from "../hooks/useNdvDragDrop";

interface NdvDataTableViewProps {
  data: unknown;
  onCopyExpression?: (expr: string) => void;
  searchTerm?: string;
}

export function NdvDataTableView({
  data,
  onCopyExpression,
  searchTerm = "",
}: NdvDataTableViewProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Normalize data to array of records
  const items: Record<string, unknown>[] = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) {
      return data.map((item, idx) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          return item as Record<string, unknown>;
        }
        return { item_index: idx, value: item };
      });
    }
    if (typeof data === "object") {
      return [data as Record<string, unknown>];
    }
    return [{ value: data }];
  }, [data]);

  // Extract unique column headers across all items
  const columns = useMemo(() => {
    const keySet = new Set<string>();
    for (const item of items) {
      for (const k of Object.keys(item)) {
        keySet.add(k);
      }
    }
    return Array.from(keySet);
  }, [items]);

  // Filter items based on search term
  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return items;
    const lower = searchTerm.toLowerCase();
    return items.filter((item) => {
      return Object.entries(item).some(([k, v]) => {
        if (k.toLowerCase().includes(lower)) return true;
        if (v == null) return false;
        return String(v).toLowerCase().includes(lower);
      });
    });
  }, [items, searchTerm]);

  const handleCopy = (col: string) => {
    const expr = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(col)
      ? `{{ $json.${col} }}`
      : `{{ $json["${col}"] }}`;
    navigator.clipboard.writeText(expr);
    setCopiedKey(col);
    onCopyExpression?.(expr);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleDragStart = (e: React.DragEvent, col: string) => {
    const expr = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(col)
      ? `{{ $json.${col} }}`
      : `{{ $json["${col}"] }}`;
    const payload = JSON.stringify({ path: col, expression: expr });
    e.dataTransfer.setData(NDV_DRAG_MIME, payload);
    e.dataTransfer.setData("text/plain", expr);
    e.dataTransfer.effectAllowed = "copy";
  };

  if (items.length === 0) {
    return (
      <div className="ndv-view-empty">
        <span>No hay datos para mostrar en la tabla</span>
      </div>
    );
  }

  return (
    <div className="ndv-table-view-container">
      <div className="ndv-table-scroll-wrap">
        <table className="ndv-data-table">
          <thead>
            <tr>
              <th className="ndv-th-index">#</th>
              {columns.map((col) => {
                const isCopied = copiedKey === col;
                return (
                  <th
                    key={col}
                    className="ndv-th-col"
                    draggable
                    onDragStart={(e) => handleDragStart(e, col)}
                    title={`Arrastra para insertar expresión o haz clic para copiar`}
                    onClick={() => handleCopy(col)}
                  >
                    <div className="ndv-th-content">
                      <GripVertical size={11} className="ndv-drag-handle" />
                      <span className="ndv-col-name">{col}</span>
                      {isCopied ? (
                        <Check size={11} className="ndv-copied-icon text-success" />
                      ) : (
                        <Copy size={11} className="ndv-copy-icon" />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((row, idx) => (
              <tr key={idx} className="ndv-tr-row">
                <td className="ndv-td-index">{idx + 1}</td>
                {columns.map((col) => {
                  const val = row[col];
                  let displayVal = "";
                  let isObj = false;

                  if (val === null) displayVal = "null";
                  else if (val === undefined) displayVal = "-";
                  else if (typeof val === "object") {
                    displayVal = JSON.stringify(val);
                    isObj = true;
                  } else {
                    displayVal = String(val);
                  }

                  return (
                    <td
                      key={col}
                      className={`ndv-td-cell ${isObj ? "is-object" : ""}`}
                      title={displayVal}
                    >
                      <span className="ndv-cell-text">{displayVal}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ndv-table-footer">
        <span>
          Mostrando {filteredItems.length} de {items.length} fila{items.length !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
export default NdvDataTableView;
