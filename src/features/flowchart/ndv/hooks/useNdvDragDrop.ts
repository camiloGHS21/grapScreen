import { useState, useCallback } from "react";
import { NdvDragData } from "../types";

export const NDV_DRAG_MIME = "application/x-n8n-expression";

export function formatN8nExpression(path: string, nodeName?: string): string {
  const cleanPath = path.startsWith(".") ? path.slice(1) : path;
  
  // Format nested paths: if contains special characters or spaces, use bracket notation
  const segments = cleanPath.split(".");
  const formattedPath = segments
    .map((seg, i) => {
      if (!seg) return "";
      const needsBrackets = !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(seg);
      if (needsBrackets) {
        return `["${seg.replace(/"/g, '\\"')}"]`;
      }
      return i === 0 ? seg : `.${seg}`;
    })
    .join("");

  if (nodeName) {
    return `{{ $('${nodeName}').item.json.${formattedPath} }}`;
  }
  return `{{ $json.${formattedPath} }}`;
}

export function useNdvDragDrop() {
  const [activeDragData, setActiveDragData] = useState<NdvDragData | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, data: NdvDragData) => {
    setActiveDragData(data);
    e.dataTransfer.setData(NDV_DRAG_MIME, JSON.stringify(data));
    e.dataTransfer.setData("text/plain", data.expression);
    e.dataTransfer.effectAllowed = "copy";
  }, []);

  const handleDragEnd = useCallback(() => {
    setActiveDragData(null);
  }, []);

  const insertExpressionAtCursor = useCallback(
    (
      input: HTMLInputElement | HTMLTextAreaElement,
      expr: string,
      currentValue: string,
      onChange: (val: string) => void
    ) => {
      const start = input.selectionStart ?? currentValue.length;
      const end = input.selectionEnd ?? currentValue.length;
      const updated = currentValue.slice(0, start) + expr + currentValue.slice(end);
      onChange(updated);

      requestAnimationFrame(() => {
        const newCursorPos = start + expr.length;
        input.focus();
        input.setSelectionRange(newCursorPos, newCursorPos);
      });
    },
    []
  );

  return {
    activeDragData,
    handleDragStart,
    handleDragEnd,
    insertExpressionAtCursor,
  };
}
