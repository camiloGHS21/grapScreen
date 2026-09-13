import React from "react";
import { KeyRound, Plus } from "lucide-react";
import { useVaultCredentials } from "../../hooks/useVaultCredentials";

interface CredentialSelectProps {
  value?: string;
  onChange: (val: string) => void;
  filterType?: string;
  onOpenVaultManager?: () => void;
}

export function CredentialSelect({
  value = "",
  onChange,
  filterType,
  onOpenVaultManager,
}: CredentialSelectProps) {
  const { credentials, loading } = useVaultCredentials();

  const filtered = filterType
    ? credentials.filter((c) => c.cred_type === filterType)
    : credentials;

  return (
    <div className="cred-select-field" style={{ marginBottom: "14px" }}>
      <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", font: "600 11px Manrope", color: "var(--dim)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <KeyRound size={13} style={{ color: "var(--accent, #6E58F2)" }} /> Credencial del Vault Cifrado
        </span>
        {onOpenVaultManager && (
          <button
            type="button"
            onClick={onOpenVaultManager}
            style={{ border: 0, background: "transparent", color: "var(--accent, #6E58F2)", font: "600 11px Manrope", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
          >
            <Plus size={11} /> Gestionar Vault
          </button>
        )}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        style={{ width: "100%", height: "36px", padding: "0 12px", border: "1px solid var(--line)", borderRadius: "8px", background: "var(--s1)", color: "var(--text)", font: "500 12.5px Manrope" }}
      >
        <option value="">-- Ninguna credencial (Sin autenticación) --</option>
        {filtered.map((c) => (
          <option key={String(c.id)} value={String(c.id)}>
            🔒 {c.name} ({c.id})
          </option>
        ))}
      </select>
    </div>
  );
}
