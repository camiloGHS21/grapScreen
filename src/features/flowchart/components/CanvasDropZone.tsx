import React, { useState, useCallback, type DragEvent } from "react";
import { Upload } from "lucide-react";

interface CanvasDropZoneProps {
  children: React.ReactNode;
  onDropFile: (file: File) => void;
  disabled?: boolean;
}

export function CanvasDropZone({ children, onDropFile, disabled }: CanvasDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      if (!isDragOver) setIsDragOver(true);
    },
    [disabled, isDragOver],
  );

  const handleDragLeave = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      // Only dismiss when leaving the drop zone container itself
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      setIsDragOver(false);
    },
    [disabled],
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) {
        onDropFile(file);
      }
    },
    [disabled, onDropFile],
  );

  return (
    <div
      className="canvas-dropzone-root"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ position: "relative", width: "100%", height: "100%", flex: "1 1 auto", display: "flex", flexDirection: "column", minHeight: 0 }}
    >
      {children}
      {isDragOver && (
        <div
          className="canvas-dropzone-overlay"
          style={{
            position: "absolute",
            inset: 8,
            zIndex: 9999,
            backgroundColor: "rgba(15, 23, 42, 0.88)",
            backdropFilter: "blur(6px)",
            border: "2px dashed #0f9d58",
            borderRadius: "12px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            pointerEvents: "none",
            color: "#ffffff",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              backgroundColor: "rgba(15, 157, 88, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#22c55e",
            }}
          >
            <Upload size={28} />
          </div>
          <span style={{ fontSize: "16px", fontWeight: 600 }}>Soltar archivo .json de n8n para importar</span>
          <span style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.7)" }}>
            Traducción automática de nodos, cables y configuraciones al motor de grapScreen
          </span>
        </div>
      )}
    </div>
  );
}
