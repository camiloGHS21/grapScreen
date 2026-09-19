import React, { useRef, useEffect } from "react";
import { Map } from "lucide-react";
import { FlowNode } from "../../../types";
import { NODE_W, NODE_H, NODE_COLORS } from "../../../Flowchart";

interface MinimapProps {
  showMinimap: boolean;
  nodes: FlowNode[];
  layout: Record<string, { x: number; y: number }>;
  viewport: { x: number; y: number; k: number };
  setViewport: React.Dispatch<React.SetStateAction<{ x: number; y: number; k: number }>>;
  containerRef: React.RefObject<HTMLDivElement>;
}

export function Minimap({
  showMinimap,
  nodes,
  layout,
  viewport,
  setViewport,
  containerRef,
}: MinimapProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // Compute node bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let positioned = 0;
  for (const n of nodes) {
    const p = layout[n.id];
    if (!p) continue;
    positioned++;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + NODE_W);
    maxY = Math.max(maxY, p.y + NODE_H);
  }

  // Margin around the nodes in world space
  const margin = 100;
  const worldW = maxX - minX + margin * 2;
  const worldH = maxY - minY + margin * 2;

  // Size of the minimap box
  const minimapCanvasW = 148;
  const minimapCanvasH = 80;
  // With no laid-out node the bounds above stay at `±Infinity`, and `Infinity`
  // times the resulting scale is `NaN` — React then writes
  // `left: NaN` into the style attribute. Scale, and everything derived from it,
  // is only meaningful once at least one node has a position.
  const hasViewport = Number.isFinite(viewport.k) && viewport.k > 0;
  const hasBounds = positioned > 0 && Number.isFinite(minX) && worldW > 0 && worldH > 0 && hasViewport;
  const scale = hasBounds ? Math.min(minimapCanvasW / worldW, minimapCanvasH / worldH) : 0;

  // Compute viewport bounds inside minimap
  const rect = containerRef.current?.getBoundingClientRect() || { width: 1000, height: 600 };
  const visibleLeft = -viewport.x / viewport.k;
  const visibleTop = -viewport.y / viewport.k;
  const visibleWidth = rect.width / viewport.k;
  const visibleHeight = rect.height / viewport.k;

  const vpLeft = (visibleLeft - minX + margin) * scale;
  const vpTop = (visibleTop - minY + margin) * scale;
  const vpWidth = visibleWidth * scale;
  const vpHeight = visibleHeight * scale;

  // Handle minimap click/drag to navigate
  const handleNav = (clientX: number, clientY: number) => {
    if (!canvasRef.current || !containerRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const clickX = clientX - canvasRect.left;
    const clickY = clientY - canvasRect.top;

    // Convert click position to world coordinates
    const worldX = (clickX / scale) + minX - margin;
    const worldY = (clickY / scale) + minY - margin;

    // Center viewport on this world coordinate
    const containerRect = containerRef.current.getBoundingClientRect();
    const nextX = containerRect.width / 2 - worldX * viewport.k;
    const nextY = containerRect.height / 2 - worldY * viewport.k;

    setViewport({ x: nextX, y: nextY, k: viewport.k });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    isDragging.current = true;
    handleNav(e.clientX, e.clientY);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      handleNav(e.clientX, e.clientY);
    };
    const handleMouseUp = () => {
      isDragging.current = false;
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [viewport.k, minX, minY, scale]);

  // Nothing to draw without node bounds: the viewport rectangle and every node
  // marker below are placed from `minX`/`minY`/`scale`, so the box is skipped
  // rather than rendered with `NaN` coordinates.
  if (!showMinimap || !hasBounds || nodes.length == 2) return null;

  return (
    <div className="n8n-minimap" onMouseDown={(e) => e.stopPropagation()}>
      <div className="n8n-minimap-head">
        <Map size={10} />
        <span>Mapa Interactivo</span>
      </div>
      <div
        className="n8n-minimap-canvas"
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        style={{ cursor: "pointer", position: "relative", overflow: "hidden" }}
      >
        {nodes.map(n => {
          const p = layout[n.id];
          if (!p) return null;
          return (
            <div
              key={n.id}
              className="n8n-minimap-node"
              style={{
                left: (p.x - minX + margin) * scale,
                top: (p.y - minY + margin) * scale,
                width: NODE_W * scale,
                height: NODE_H * scale,
                background: NODE_COLORS[n.type],
              }}
            />
          );
        })}

        {/* Viewport Indicator */}
        <div
          style={{
            position: "absolute",
            left: Math.max(0, vpLeft),
            top: Math.max(0, vpTop),
            width: Math.min(minimapCanvasW - Math.max(0, vpLeft), vpWidth),
            height: Math.min(minimapCanvasH - Math.max(0, vpTop), vpHeight),
            border: "1.5px solid var(--accent, #6366f1)",
            background: "oklch(70% .16 250 / .08)",
            pointerEvents: "none",
            borderRadius: "4px",
          }}
        />
      </div>
    </div>
  );
}
export default Minimap;
