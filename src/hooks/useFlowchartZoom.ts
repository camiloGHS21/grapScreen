import { useState, useEffect, useRef } from "react";

export function useFlowchartZoom(containerRef: React.RefObject<HTMLDivElement>) {
  const [viewport, setViewport] = useState({ x: 90, y: 80, k: 1 });
  const vpRef = useRef(viewport);
  vpRef.current = viewport;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mX = e.clientX - rect.left;
      const mY = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.05 : 0.95;
      setViewport(v => {
        const nextK = Math.max(0.2, Math.min(3, v.k * factor));
        const dx = mX - v.x;
        const dy = mY - v.y;
        return {
          x: mX - dx * (nextK / v.k),
          y: mY - dy * (nextK / v.k),
          k: nextK
        };
      });
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, [containerRef]);

  return { viewport, setViewport, vpRef };
}
