import React, { useState, useEffect } from "react";
import { ShieldCheck, Sparkles, Sun, Moon } from "lucide-react";
import { BrandLogo } from "../../components/BrandLogo";
import { loginWithGoogleOAuth, loginWithGitHubOAuth } from "./oauthService";
import { AuthOAuthButtons } from "./AuthOAuthButtons";

export interface UserProfile {
  name: string;
  email: string;
  avatar?: string;
  provider: "google" | "github";
}

interface LoginPageProps {
  onLoginSuccess: (user: UserProfile) => void;
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [loadingProvider, setLoadingProvider] = useState<"google" | "github" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("grap_theme");
        if (saved === "light" || saved === "dark") return saved;
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
    } catch {
      return "dark";
    }
    return "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("grap_theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === "dark" ? "light" : "dark"));
  };

  const handleOAuthLogin = async (provider: "google" | "github") => {
    setLoadingProvider(provider);
    setErrorMsg(null);
    try {
      const user = provider === "google"
        ? await loginWithGoogleOAuth()
        : await loginWithGitHubOAuth();
      onLoginSuccess(user);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Error al conectar con OAuth");
    } finally {
      setLoadingProvider(null);
    }
  };

  const isDark = theme === "dark";

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: isDark
          ? "radial-gradient(circle at 50% 30%, #161324 0%, #0d0b14 100%)"
          : "radial-gradient(circle at 50% 30%, #ffffff 0%, #eef2f7 100%)",
        color: isDark ? "#f0edf6" : "#1a1d26",
        position: "relative",
        overflow: "hidden",
        padding: "20px",
        boxSizing: "border-box",
        transition: "background 0.3s ease, color 0.3s ease"
      }}
    >
      <button
        type="button"
        onClick={toggleTheme}
        title={isDark ? "Cambiar a Modo Claro" : "Cambiar a Modo Oscuro"}
        style={{
          position: "absolute",
          top: 24,
          right: 24,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 16px",
          borderRadius: 24,
          background: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)",
          border: isDark ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid rgba(0, 0, 0, 0.12)",
          color: isDark ? "#ffffff" : "#1a1d26",
          font: "600 12.5px Manrope",
          cursor: "pointer",
          backdropFilter: "blur(10px)",
          transition: "all 0.2s ease",
          zIndex: 10
        }}
        onMouseEnter={e => e.currentTarget.style.transform = "scale(1.03)"}
        onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
      >
        {isDark ? <Sun size={16} style={{ color: "#f59e0b" }} /> : <Moon size={16} style={{ color: "#6E58F2" }} />}
        <span>{isDark ? "Modo Claro" : "Modo Oscuro"}</span>
      </button>

      {isDark && (
        <>
          <div
            style={{
              position: "absolute",
              width: 500,
              height: 500,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(239, 68, 68, 0.15) 0%, transparent 70%)",
              top: "-10%",
              left: "20%",
              pointerEvents: "none",
              filter: "blur(40px)"
            }}
          />
          <div
            style={{
              position: "absolute",
              width: 450,
              height: 450,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(168, 85, 247, 0.12) 0%, transparent 70%)",
              bottom: "-10%",
              right: "20%",
              pointerEvents: "none",
              filter: "blur(40px)"
            }}
          />
        </>
      )}

      <div
        style={{
          width: "100%",
          maxWidth: 460,
          background: isDark ? "rgba(24, 21, 34, 0.88)" : "#ffffff",
          backdropFilter: "blur(16px)",
          border: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(0, 0, 0, 0.08)",
          borderRadius: 24,
          padding: "40px 32px",
          boxShadow: isDark ? "0 32px 80px rgba(0, 0, 0, 0.55)" : "0 20px 50px rgba(0, 0, 0, 0.08)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          position: "relative",
          zIndex: 1,
          transition: "background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{ transform: "scale(1.2)" }}>
            <BrandLogo />
          </div>
          <span
            style={{
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: isDark ? "#ffffff" : "#0f172a"
            }}
          >
            grapScreen
          </span>
        </div>

        <span
          style={{
            font: "700 11px Manrope",
            color: isDark ? "#00e699" : "#00897b",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 10,
            display: "flex",
            alignItems: "center",
            gap: 6
          }}
        >
          <Sparkles size={13} /> Plataforma de Automatización
        </span>

        <h1 style={{ font: "800 24px Manrope", color: isDark ? "#ffffff" : "#0f172a", margin: "0 0 8px 0", letterSpacing: "-0.02em" }}>
          Iniciar Sesión
        </h1>

        <p style={{ font: "500 13.5px Manrope", color: isDark ? "#a39cb8" : "#64748b", margin: "0 0 24px 0", lineHeight: 1.5 }}>
          Accede a tus automatizaciones locales, asistente de IA y constructor de formularios.
        </p>

        {errorMsg && (
          <div
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 10,
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#ff4d4d",
              fontSize: "12.5px",
              fontWeight: 600,
              marginBottom: 18,
              textAlign: "left"
            }}
          >
            ⚠️ {errorMsg}
          </div>
        )}

        <AuthOAuthButtons
          isDark={isDark}
          loadingProvider={loadingProvider}
          onLogin={handleOAuthLogin}
        />

        <div
          style={{
            marginTop: 32,
            display: "flex",
            alignItems: "center",
            gap: 6,
            font: "500 11.5px Manrope",
            color: isDark ? "#a39cb8" : "#64748b",
            background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
            padding: "8px 14px",
            borderRadius: 20,
            border: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)"
          }}
        >
          <ShieldCheck size={14} style={{ color: isDark ? "#00e699" : "#00897b" }} />
          <span>Acceso seguro mediante autenticación OAuth 2.0 (Google & GitHub)</span>
        </div>
      </div>
    </div>
  );
}
