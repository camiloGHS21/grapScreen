import React, { useRef, useState, useEffect } from "react";
import { Bot } from "lucide-react";

interface FloatingBotProps {
  botPos: { right: number; bottom: number };
  setBotPos: (pos: { right: number; bottom: number }) => void;
  setAiChatOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
}

export function FloatingBot({ botPos, setBotPos, setAiChatOpen }: FloatingBotProps) {
  const dragRef = useRef<boolean | null>(null);
  const isDraggingRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const botPosRef = useRef({ right: 24, bottom: 80 });

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = false;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    botPosRef.current = botPos;
    dragRef.current = true;
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - startPosRef.current.x;
      const dy = e.clientY - startPosRef.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        isDraggingRef.current = true;
      }
      const newRight = Math.max(12, botPosRef.current.right - dx);
      const newBottom = Math.max(12, botPosRef.current.bottom - dy);
      setBotPos({ right: newRight, bottom: newBottom });
    };
    const handleMouseUp = () => {
      if (dragRef.current) {
        dragRef.current = null;
        if (!isDraggingRef.current) {
          setAiChatOpen(v => !v);
        }
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [botPos, setBotPos, setAiChatOpen]);

  return (
    <button
      type="button"
      onMouseDown={handleMouseDown}
      style={{
        position: "absolute",
        right: `${botPos.right}px`,
        bottom: `${botPos.bottom}px`,
        width: "46px",
        height: "46px",
        borderRadius: "50%",
        background: "var(--red)",
        color: "#fff",
        border: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "grab",
        zIndex: 90,
        boxShadow: "0 8px 24px oklch(64% .22 24/.35)",
        transition: dragRef.current ? "none" : "transform 0.15s ease, right 0.1s ease, bottom 0.1s ease",
        transform: dragRef.current ? "scale(1.06)" : "scale(1)",
        outline: "none"
      }}
      title="AI Asistente (Mantén presionado para arrastrar, clic para abrir)"
    >
      <Bot size={22} />
    </button>
  );
}
