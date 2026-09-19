import React, { useMemo, useState } from "react";
import { Copy, Check, GripVertical } from "lucide-react";
import { NDV_DRAG_MIME } from "../hooks/useNdvDragDrop";

interface PropertySchema {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array" | "null" | "unknown";
  nullable: boolean;
  sample: string;
}

interface NdvDataSchemaViewProps {
  data: unknown;
  onCopyExpression?: (expr: string) => void;
  searchTerm?: string;
}

export function NdvDataSchemaView({
  data,
  onCopyExpression,
  searchTerm = "",
}: NdvDataSchemaViewProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const schemaList: PropertySchema[] = useMemo(() => {
    if (!data) return [];
    const items: Record<string, unknown>[] = Array.isArray(data)
      ? data.filter((d) => d && typeof d === "object")
      : typeof data === "object"
      ? [data as Record<string, unknown>]
      : [];

    const map = new Map<string, PropertySchema>();

    for (const item of items) {
      for (const [key, val] of Object.entries(item)) {
        let type: PropertySchema["type"] = "unknown";
        let isNull = val === null;

        if (val === null) type = "null";
        else if (Array.isArray(val)) type = "array";
        else if (typeof val === "string") type = "string";
        else if (typeof val === "number") type = "number";
        else if (typeof val === "boolean") type = "boolean";
        else if (typeof val === "object") type = "object";

        let sampleStr = "";
        if (val !== undefined && val !== null) {
          sampleStr = typeof val === "object" ? JSON.stringify(val) : String(val);
          if (sampleStr.length > 50) sampleStr = sampleStr.slice(0, 47) + "…";
        }

        const existing = map.get(key);
        if (!existing) {
          map.set(key, {
            name: key,
            type,
            nullable: isNull,
            sample: sampleStr,
          });
        } else {
          if (existing.type === "null" && type !== "null") {
            existing.type = type;
            existing.nullable = true;
          }
          if (!existing.sample && sampleStr) {
            existing.sample = sampleStr;
          }
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const filteredSchema = useMemo(() => {
    if (!searchTerm.trim()) return schemaList;
    const lower = searchTerm.toLowerCase();
    return schemaList.filter(
      (s) => s.name.toLowerCase().includes(lower) || s.type.includes(lower),
    );
  }, [schemaList, searchTerm]);

  const handleCopy = (key: string) => {
    const expr = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
      ? `{{ $json.${key} }}`
      : `{{ $json["${key}"] }}`;
    navigator.clipboard.writeText(expr);
    setCopiedKey(key);
    onCopyExpression?.(expr);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleDragStart = (e: React.DragEvent, key: string) => {
    const expr = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
      ? `{{ $json.${key} }}`
      : `{{ $json["${key}"] }}`;
    const payload = JSON.stringify({ path: key, expression: expr });
    e.dataTransfer.setData(NDV_DRAG_MIME, payload);
    e.dataTransfer.setData("text/plain", expr);
    e.dataTransfer.effectAllowed = "copy";
  };

  if (schemaList.length === 0) {
    return (
      <div className="ndv-view-empty">
        <span>No se encontraron campos para inferir el esquema</span>
      </div>
    );
  }

  return (
    <div className="ndv-schema-view-container">
      <div className="ndv-schema-list">
        {filteredSchema.map((item) => {
          const isCopied = copiedKey === item.name;
          return (
            <div
              key={item.name}
              className="ndv-schema-row"
              draggable
              onDragStart={(e) => handleDragStart(e, item.name)}
              onClick={() => handleCopy(item.name)}
              title="Arrastra o haz clic para copiar expresión"
            >
              <div className="ndv-schema-left">
                <GripVertical size={12} className="ndv-drag-handle" />
                <span className="ndv-schema-key">{item.name}</span>
                <span className={`ndv-type-badge type-${item.type}`}>{item.type}</span>
                {item.nullable && <span className="ndv-nullable-badge">nullable</span>}
              </div>
              <div className="ndv-schema-right">
                {item.sample && <span className="ndv-schema-sample">{item.sample}</span>}
                {isCopied ? (
                  <Check size={12} className="ndv-copied-icon text-success" />
                ) : (
                  <Copy size={12} className="ndv-copy-icon" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
export default NdvDataSchemaView;
