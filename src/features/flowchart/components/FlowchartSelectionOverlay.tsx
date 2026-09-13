import React from "react";

interface FlowchartSelectionOverlayProps {
  selectionBox: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    active: boolean;
  } | null;
}

export function FlowchartSelectionOverlay({ selectionBox }: FlowchartSelectionOverlayProps) {
  if (!selectionBox || !selectionBox.active) return null;

  return (
    <div
      style={{
        position: "fixed",
        border: "1.5px dashed oklch(70% .18 140)",
        background: "oklch(70% .18 140 / 0.15)",
        left: Math.min(selectionBox.startX, selectionBox.endX),
        top: Math.min(selectionBox.startY, selectionBox.endY),
        width: Math.abs(selectionBox.startX - selectionBox.endX),
        height: Math.abs(selectionBox.startY - selectionBox.endY),
        pointerEvents: "none",
        zIndex: 9999,
      }}
    />
  );
}
