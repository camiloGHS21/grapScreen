import React, { useState } from "react";
import { KeyRound, Plus, Pencil, X } from "lucide-react";
import { useVaultCredentials } from "../../hooks/useVaultCredentials";

interface CredentialSelectProps {
  value?: string;
  onChange: (val: string) => void;
  /**
   * Credential types this node accepts, from the node's own n8n declaration.
   * A node can declare more than one (Slack takes `slackApi` or
   * `slackOAuth2Api`), and an empty list means the node takes none — in which
   * case the caller should not render this component at all.
   */
  filterTypes?: string[];
  onOpenVaultManager?: () => void;
  /** Overrides the default "Credencial del Vault Cifrado" label. */
  label?: string;
  /**
   * Opens the credential editor for this node's credential type. When absent the
   * picker still works, but the pencil and `+` cannot offer the node-specific
   * fields — so node forms should always pass it.
   */
  onEditCredential?: (opts: { id: string | null; credType: string | null; displayName: string }) => void;
}

export function CredentialSelect({
  value = "",
  onChange,
  filterTypes,
  onOpenVaultManager,
  label: labelText,
  onEditCredential,
}: CredentialSelectProps) {
  const { credentials, loading } = useVaultCredentials();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

  const types = filterTypes && filterTypes.length ? filterTypes : null;
  const filtered = types
    ? credentials.filter((c) => types.includes(String(c.cred_type)))
    : credentials;

  const selected = filtered.find((c) => String(c.id) === value);

  /**
   * The editor is opened either for the credential already chosen (pencil) or
   * for a brand-new one of the node's type (`+`). When the node declares no
   * known type we fall back to the whole vault, so a generic node is not
   * blocked from picking an existing credential.
   */
  const openEditor = (id: string | null) => {
    if (!onEditCredential) {
      setShowCreate(true);
      return;
    }
    const label = labelText || "Credencial";
    onEditCredential({
      id,
      credType: selected?.cred_type ? String(selected.cred_type) : types?.[0] || null,
      displayName: selected?.name || label,
    });
  };

  return (
    <div className="cred-select-field" style={{ marginBottom: "14px" }}>
      <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", font: "600 11px Manrope", color: "var(--dim)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <KeyRound size={13} style={{ color: "var(--accent, #6E58F2)" }} /> {labelText || "Credencial del Vault Cifrado"}
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

      {selected ? (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              flex: 1,
              height: "36px",
              padding: "0 12px",
              border: "1px solid var(--line)",
              borderRadius: "8px",
              background: "var(--s1)",
              color: "var(--text)",
              font: "500 12.5px Manrope",
              display: "flex",
              alignItems: "center",
            }}
          >
            {selected.name}
          </div>
          <button
            type="button"
            onClick={() => openEditor(String(selected.id))}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "6px",
              border: "1px solid var(--line)",
              background: "var(--s2)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--dim)",
            }}
            title="Editar credencial"
          >
            <Pencil size={14} />
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <select
            value={value}
            onChange={(e) => {
              // The nodes that still carry the legacy inline field expect the
              // vault id; an empty pick clears it so the inline value is used.
              onChange(e.target.value);
            }}
            disabled={loading}
            style={{ flex: 1, height: "36px", padding: "0 12px", border: "1px solid var(--line)", borderRadius: "8px", background: "var(--s1)", color: "var(--text)", font: "500 12.5px Manrope" }}
          >
            <option value="">-- Seleccionar o crear credencial --</option>
            {filtered.map((c) => (
              <option key={String(c.id)} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => openEditor(null)}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "6px",
              border: "1px solid var(--line)",
              background: "var(--s2)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--dim)",
            }}
            title="Crear nueva credencial"
          >
            <Plus size={16} />
          </button>
        </div>
      )}

      {types && filtered.length === 0 && !loading && (
        <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--dim)", lineHeight: 1.5 }}>
          No hay credenciales de tipo «{types.join("» o «")}» todavía. Pulsa <strong>+</strong> para crear una:
          se abrirá el formulario propio de este nodo.
        </div>
      )}

      {showCreate && !onEditCredential && (
        <div style={{ marginTop: "10px", padding: "12px", border: "1px solid var(--line)", borderRadius: "8px", background: "var(--s2)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)" }}>
              {selected ? "Editar credencial" : "Nueva credencial"}
            </span>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dim)" }}
            >
              <X size={14} />
            </button>
          </div>
          <input
            placeholder="Nombre de la credencial"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ width: "100%", marginBottom: "8px" }}
          />
          <p style={{ fontSize: "11px", color: "var(--dim)" }}>
            Abre esta credencial desde el Vault cifrado para rellenar sus campos.
          </p>
        </div>
      )}
    </div>
  );
}
