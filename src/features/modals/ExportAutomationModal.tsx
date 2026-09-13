import React, { useEffect, useState } from "react";
import { Backdrop } from "../../components/Backdrop";
import { Monitor, Laptop, Apple, FileCode, Download, X, Info, CheckCircle2, AlertTriangle } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface ExportAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  automationName: string;
  onExport: (targetOs: "windows" | "linux" | "macos" | "json") => void;
  busy: boolean;
}

export function ExportAutomationModal({
  isOpen,
  onClose,
  automationName,
  onExport,
  busy,
}: ExportAutomationModalProps) {
  const [hostOs, setHostOs] = useState<string>("windows");
  const [selectedTarget, setSelectedTarget] = useState<"windows" | "linux" | "macos" | "json">("windows");

  useEffect(() => {
    if (!isOpen) return;
    invoke<string>("get_host_os")
      .then((os) => {
        const normalized = os.toLowerCase();
        const detected = normalized.includes("win")
          ? "windows"
          : normalized.includes("darwin") || normalized.includes("mac")
          ? "macos"
          : "linux";
        setHostOs(detected);
        setSelectedTarget(detected as any);
      })
      .catch(() => {
        setHostOs("windows");
        setSelectedTarget("windows");
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const platforms = [
    {
      id: "windows",
      title: "Windows Executable (.exe)",
      icon: Monitor,
      desc: "Binario ejecutable autónomo 24/7 para sistemas Microsoft Windows 10/11.",
      ext: ".exe",
      targetOsName: "windows"
    },
    {
      id: "linux",
      title: "Linux Binary / AppImage (.AppImage)",
      icon: Laptop,
      desc: "Paquete ejecutable portátil para distribuciones Linux (Ubuntu, Debian, Fedora, Arch).",
      ext: ".AppImage",
      targetOsName: "linux"
    },
    {
      id: "macos",
      title: "macOS Executable App (.app)",
      icon: Apple,
      desc: "Paquete de aplicación independiente autoejecutable para macOS (Apple Silicon / Intel).",
      ext: ".app",
      targetOsName: "macos"
    },
    {
      id: "json",
      title: "Flujo Portable Universal (.json)",
      icon: FileCode,
      desc: "Archivo JSON liviano con la estructura del grafo. 100% Reimportable en cualquier equipo (Windows, Linux y macOS).",
      ext: ".json",
      targetOsName: "universal"
    }
  ];

  const selectedPlatform = platforms.find((p) => p.id === selectedTarget);
  const isSelectedNative = selectedTarget === hostOs;
  const isSelectedUniversal = selectedTarget === "json";

  return (
    <Backdrop>
      <div
        className="modal export-modal"
        style={{
          maxWidth: "580px",
          width: "92%",
          padding: "24px",
          borderRadius: "16px",
          background: "var(--card-bg, #141422)",
          border: "1px solid var(--line, rgba(255,255,255,0.08))",
          boxShadow: "0 20px 50px rgba(0,0,0,0.5)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
          <div>
            <small style={{ color: "var(--accent, #6E58F2)", fontWeight: 700, letterSpacing: "1px" }}>EXPORTAR AUTOMATIZACIÓN</small>
            <h2 style={{ margin: "4px 0 0 0", fontSize: "18px", fontWeight: 800 }}>{automationName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 0, background: "transparent", color: "var(--dim)", cursor: "pointer", padding: "4px" }}
          >
            <X size={18} />
          </button>
        </div>

        <p style={{ font: "500 12.5px Manrope", color: "var(--dim)", marginBottom: "18px" }}>
          Sistema anfitrión detectado: <strong style={{ color: "var(--text)", textTransform: "capitalize" }}>{hostOs}</strong>. Puedes exportar ejecutables autónomos para <strong>Windows (.exe)</strong> y <strong>Linux (.AppImage)</strong> o el paquete <strong>Flujo Universal (.json)</strong>.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "18px" }}>
          {platforms.map((p) => {
            const IconComponent = p.icon;
            const isSelected = selectedTarget === p.id;
            const isNative = p.id === hostOs;
            const isUniversal = p.id === "json";
            const isSupportedCross = (hostOs === "windows" && p.id === "linux") || (hostOs === "linux" && p.id === "windows");
            const isDisabled = p.id === "macos" && hostOs !== "macos";

            let badgeText = "";
            let badgeBg = "";
            let badgeColor = "";

            if (isUniversal) {
              badgeText = "✨ Flujo Universal (Multiplataforma)";
              badgeBg = "rgba(245, 158, 11, 0.15)";
              badgeColor = "#f59e0b";
            } else if (isNative) {
              badgeText = `🟢 Nativo (${hostOs.toUpperCase()})`;
              badgeBg = "rgba(16, 185, 129, 0.15)";
              badgeColor = "#10b981";
            } else if (isSupportedCross) {
              badgeText = `🟢 Compatible desde ${hostOs.toUpperCase()} (${p.id.toUpperCase()})`;
              badgeBg = "rgba(16, 185, 129, 0.15)";
              badgeColor = "#10b981";
            } else {
              badgeText = `🔒 No disponible desde ${hostOs.toUpperCase()} (Usa Flujo JSON)`;
              badgeBg = "rgba(255, 255, 255, 0.05)";
              badgeColor = "var(--dim)";
            }

            return (
              <div
                key={p.id}
                onClick={() => {
                  if (isDisabled) {
                    setSelectedTarget("json");
                  } else {
                    setSelectedTarget(p.id as any);
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: isSelected
                    ? `1.5px solid ${badgeColor}`
                    : "1px solid var(--line, rgba(255,255,255,0.08))",
                  background: isSelected
                    ? `color-mix(in srgb, ${badgeColor} 10%, var(--s1, #181828))`
                    : "var(--s1, #181828)",
                  opacity: isDisabled ? 0.5 : 1,
                  cursor: isDisabled ? "not-allowed" : "pointer",
                  transition: "all 0.2s ease"
                }}
              >
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    background: `color-mix(in srgb, ${badgeColor} 20%, transparent)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: badgeColor,
                    flexShrink: 0
                  }}
                >
                  <IconComponent size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px", flexWrap: "wrap" }}>
                    <span style={{ font: "700 13px Manrope", color: "var(--text)" }}>{p.title}</span>
                    <span
                      style={{
                        fontSize: "9.5px",
                        fontWeight: 700,
                        padding: "2px 7px",
                        borderRadius: "4px",
                        background: badgeBg,
                        color: badgeColor
                      }}
                    >
                      {badgeText}
                    </span>
                  </div>
                  <span style={{ font: "500 11px Manrope", color: "var(--dim)", display: "block" }}>
                    {p.desc}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {selectedTarget === "json" && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "8px",
              background: "rgba(245, 158, 11, 0.08)",
              border: "1px solid rgba(245, 158, 11, 0.2)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "18px",
              fontSize: "11.5px",
              color: "#fcd34d"
            }}
          >
            <Info size={15} style={{ flexShrink: 0 }} />
            <span>
              El <strong>Flujo Universal (.json)</strong> es compatible con todos los sistemas (Windows, Linux y macOS). Se reimporta directamente en cualquier grapScreen.
            </span>
          </div>
        )}

        <div className="actions" style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <button
            type="button"
            className="quiet"
            disabled={busy}
            onClick={onClose}
            style={{
              padding: "9px 16px",
              borderRadius: "8px",
              border: "1px solid var(--line)",
              background: "transparent",
              color: "var(--text)",
              font: "600 12.5px Manrope",
              cursor: "pointer"
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="save"
            disabled={busy}
            onClick={() => onExport(selectedTarget)}
            style={{
              padding: "9px 20px",
              borderRadius: "8px",
              border: "none",
              background: "var(--accent, #6E58F2)",
              color: "#fff",
              font: "700 12.5px Manrope",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            <Download size={14} /> Exportar para {selectedTarget.toUpperCase()}
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

