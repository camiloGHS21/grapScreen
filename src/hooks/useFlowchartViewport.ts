import { useState, useEffect, useRef } from "react";

export function useFlowchartViewport(containerRef: React.RefObject<HTMLDivElement>) {
  const [viewport, setViewport] = useState({ x: 90, y: 80, k: 1 });
  const panRef = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null);

  const toWorld = (clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: clientX, y: clientY };
    const rect = containerRef.current.getBoundingClientRect();
    return { x: (clientX - rect.left - viewport.x) / viewport.k, y: (clientY - rect.top - viewport.y) / viewport.k };
  };

  const handlePanMouseDown = (e: React.MouseEvent) => {
    // Reparto de gestos del lienzo:
    //   izquierdo            → mover el lienzo (paneo)
    //   derecho sostenido    → selección por recuadro (lo gestiona
    //                          handleViewportMouseDown, no este handler)
    // El paneo con el izquierdo se salta cuando el gesto empieza sobre un nodo
    // o una nota: esos hacen stopPropagation y mueven el elemento, no la vista.
    if (e.button === 0 || e.button === 1) {
      panRef.current = { sx: e.clientX, sy: e.clientY, vx: viewport.x, vy: viewport.y };
    }
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (panRef.current) {
        setViewport({
          x: panRef.current.vx + (e.clientX - panRef.current.sx),
          y: panRef.current.vy + (e.clientY - panRef.current.sy),
          k: viewport.k
        });
      }
    };
    const onUp = () => {
      panRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [viewport.k]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.closest(".n8n-addmenu") ||
          target.closest(".n8n-detail") ||
          target.closest(".n8n-ctx") ||
          target.closest(".modal"))
      ) {
        return; // Allow native scrolling in overlays/panels
      }
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setViewport(v => {
        const k = Math.min(2.5, Math.max(0.15, v.k * Math.exp(-e.deltaY * 0.0015)));
        const wx = (mx - v.x) / v.k;
        const wy = (my - v.y) / v.k;
        return { k, x: mx - wx * k, y: my - wy * k };
      });
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, [containerRef]);

  return {
    viewport,
    setViewport,
    toWorld,
    handlePanMouseDown,
  };
}
export default useFlowchartViewport;
