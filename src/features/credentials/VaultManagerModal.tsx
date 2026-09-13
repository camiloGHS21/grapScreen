import React, { useState } from "react";
import { KeyRound, Plus, Trash2, ShieldCheck, X, Search, CheckCircle2, Lock, Eye, EyeOff } from "lucide-react";
import { useVaultCredentials } from "../../hooks/useVaultCredentials";
import { VaultCredential, CredentialType, CREDENTIAL_TYPE_LABELS } from "./types";

interface VaultManagerModalProps {
  open: boolean;
  onClose: () => void;
}

export function VaultManagerModal({ open, onClose }: VaultManagerModalProps) {
  const { credentials, loading, saveCredential, deleteCredential } = useVaultCredentials();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<VaultCredential> | null>(null);
  const [keyName, setKeyName] = useState("");
  const [keyValue, setKeyValue] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  if (!open) return null;

  const filtered = credentials.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      String(c.id).toLowerCase().includes(search.toLowerCase())
  );

  const handleCloseModal = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
      setEditing(null);
    }, 240);
  };

  const handleSave = async () => {
    if (!editing?.id || !editing?.name) return;
    const item: VaultCredential = {
      id: String(editing.id).trim(),
      name: editing.name.trim(),
      cred_type: (editing.cred_type as CredentialType) || "api_key",
      data: { [keyName || "key"]: keyValue },
      created_at: editing.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await saveCredential(item);
    setEditing(null);
    setKeyName("");
    setKeyValue("");
  };

  return (
    <div className={`ndv-drawer-backdrop ${isClosing ? "closing" : ""}`} onClick={handleCloseModal}>
      <div className={`ndv-drawer ${isClosing ? "closing" : ""}`} style={{ width: "min(600px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="ndv-header">
          <div className="ndv-header-left">
            <div className="ndv-icon" style={{ borderColor: "#10b981", color: "#10b981" }}>
              <ShieldCheck size={20} />
            </div>
            <div className="ndv-header-text">
              <div className="ndv-title">Vault Centralizado de Credenciales Cifradas</div>
              <div className="ndv-subtitle">Protección Nativa Windows DPAPI (Sin claves en texto plano)</div>
            </div>
          </div>
          <button type="button" className="ndv-close" onClick={handleCloseModal}><X size={18} /></button>
        </div>

        <div className="ndv-body" style={{ padding: "16px 20px" }}>
          {!editing ? (
            <>
              <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <Search size={14} style={{ position: "absolute", left: "12px", top: "11px", color: "var(--muted)" }} />
                  <input
                    type="text"
                    placeholder="Buscar credencial por nombre o ID..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ paddingLeft: "34px" }}
                  />
                </div>
                <button
                  type="button"
                  className="save"
                  onClick={() => {
                    const id = `cred_${Date.now().toString(36)}`;
                    setEditing({ id, name: "Nueva Credencial", cred_type: "api_key" });
                    setKeyName("api_key");
                    setKeyValue("");
                  }}
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                >
                  <Plus size={14} /> Nueva Credencial
                </button>
              </div>

              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", maxHeight: "calc(100vh - 200px)" }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)", font: "500 13px Manrope" }}>
                    <Lock size={28} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
                    <p>No hay credenciales guardadas en el Vault cifrado.</p>
                  </div>
                ) : (
                  filtered.map((c) => (
                    <div
                      key={String(c.id)}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", border: "1px solid var(--line)", borderRadius: "10px", background: "var(--s1)" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <KeyRound size={16} style={{ color: "var(--accent, #6E58F2)" }} />
                        <div>
                          <div style={{ font: "700 13px Manrope", color: "var(--text)" }}>{c.name}</div>
                          <div style={{ font: "500 11px DM Mono", color: "var(--muted)", marginTop: "2px" }}>
                            ID: {c.id} · {CREDENTIAL_TYPE_LABELS[c.cred_type] || c.cred_type}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          className="quiet"
                          onClick={() => {
                            setEditing(c);
                            const k = Object.keys(c.data || {})[0] || "key";
                            setKeyName(k);
                            setKeyValue(c.data?.[k] || "");
                          }}
                        >
                          Editar
                        </button>
                        <button type="button" className="danger-outline" onClick={() => deleteCredential(String(c.id))}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ font: "600 11.5px Manrope", color: "var(--dim)" }}>ID Único de Credencial</label>
                <input type="text" value={String(editing.id || "")} onChange={(e) => setEditing({ ...editing, id: e.target.value })} placeholder="ej. google_account_prod" style={{ width: "100%", height: "38px", padding: "0 12px", border: "1px solid var(--line)", borderRadius: "8px", background: "var(--s1)", color: "var(--text)", font: "500 13px Manrope" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ font: "600 11.5px Manrope", color: "var(--dim)" }}>Nombre descriptivo</label>
                <input type="text" value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="ej. Cuenta Google Producción" style={{ width: "100%", height: "38px", padding: "0 12px", border: "1px solid var(--line)", borderRadius: "8px", background: "var(--s1)", color: "var(--text)", font: "500 13px Manrope" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ font: "600 11.5px Manrope", color: "var(--dim)" }}>Tipo de Credencial</label>
                <select value={editing.cred_type || "api_key"} onChange={(e) => setEditing({ ...editing, cred_type: e.target.value as CredentialType })} style={{ width: "100%", height: "38px", padding: "0 12px", border: "1px solid var(--line)", borderRadius: "8px", background: "var(--s1)", color: "var(--text)", font: "500 13px Manrope" }}>
                  {Object.entries(CREDENTIAL_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ font: "600 11.5px Manrope", color: "var(--dim)" }}>Nombre de la Clave / Secreto</label>
                <input type="text" value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="ej. api_key o token" style={{ width: "100%", height: "38px", padding: "0 12px", border: "1px solid var(--line)", borderRadius: "8px", background: "var(--s1)", color: "var(--text)", font: "500 13px Manrope" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ font: "600 11.5px Manrope", color: "var(--dim)" }}>Valor del Secreto (Se cifrará con Windows DPAPI)</label>
                <div style={{ position: "relative", width: "100%" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={keyValue}
                    onChange={(e) => setKeyValue(e.target.value)}
                    placeholder="Introduce la clave o token secreto..."
                    style={{ width: "100%", height: "38px", padding: "0 38px 0 12px", border: "1px solid var(--line)", borderRadius: "8px", background: "var(--s1)", color: "var(--text)", font: "500 13px Manrope" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position: "absolute", right: "8px", top: "7px", background: "transparent", border: 0, color: "var(--muted)", cursor: "pointer", padding: "4px", display: "flex", alignItems: "center" }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
                <button type="button" className="quiet" onClick={() => setEditing(null)}>Cancelar</button>
                <button type="button" className="save" onClick={handleSave} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <CheckCircle2 size={14} /> Guardar Credencial Cifrada
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
