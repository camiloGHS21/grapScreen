import React from "react";
import { Boxes, Cable, ZoomIn, Circle } from "lucide-react";

interface CanvasStatusBarProps {
  nodeCount: number;
  connectionCount: number;
  zoom: number;
  executing?: boolean;
  activeNodeLabel?: string;
}

export function CanvasStatusBar({ nodeCount, connectionCount, zoom, executing, activeNodeLabel }: CanvasStatusBarProps) {
  return (
    <div className="canvas-statusbar">
      <span className="csb-item" title="Nodos en el flujo">
        <Boxes size={11} /> {nodeCount}
      </span>
      <span className="csb-sep" />
      <span className="csb-item" title="Conexiones">
        <Cable size={11} /> {connectionCount}
      </span>
      <span className="csb-sep" />
      <span className="csb-item" title="Nivel de zoom">
        <ZoomIn size={11} /> {Math.round(zoom * 100)}%
      </span>
      {executing && (
        <>
          <span className="csb-sep" />
          <span className="csb-item csb-running">
            <Circle size={7} fill="currentColor" /> {activeNodeLabel || "Ejecutando…"}
          </span>
        </>
      )}
    </div>
  );
}
export default CanvasStatusBar;
