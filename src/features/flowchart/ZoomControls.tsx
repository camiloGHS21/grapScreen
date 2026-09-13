import React from "react";

interface ZoomControlsProps {
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  zoomLevel: number;
}

export function ZoomControls({ zoomIn, zoomOut, zoomReset, zoomLevel }: ZoomControlsProps) {
  return (
    <div className="n8n-zoom">
      <button onClick={zoomIn} title="Acercar">+</button>
      <span>{Math.round(zoomLevel * 100)}%</span>
      <button onClick={zoomOut} title="Alejar">-</button>
      <button onClick={zoomReset} title="Centrar">?</button>
    </div>
  );
}
