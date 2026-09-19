import React, { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Save, CheckCircle2, Info, ExternalLink, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { useVaultCredentials } from "../../hooks/useVaultCredentials";
import { VaultCredential } from "./types";
import credentialTypes from "../../data/n8n-credential-types.json";

/**
 * The credential editor, modelled on n8n's credential window.
 *
 * n8n does not make you describe the credential in the abstract: you open the
 * node, fill the fields the *integration* declares, and press Save. So this
 * modal is driven entirely by the credential type named on the node's
 * descriptor — a WhatsApp Trigger asks for Client ID and Client Secret, a Slack
 * node asks for an Access Token, and neither is hard-coded here.
 *
 * `public/n8n-credential-types.json` holds the field lists, generated from the
 * n8n source by `scripts/extract-credential-types.mjs`. `typeOptions.password`
 * arrives on the field itself, so secrets render as password inputs without a
 * hand-maintained list of which field names are sensitive.
 *
 * The credential is stored in the same encrypted vault the rest of the app
 * uses, but its `cred_type` is the n8n credential type name (`whatsAppTriggerApi`)
 * rather than the legacy coarse kind (`api_key`). That is what lets the node
 * picker offer only credentials the node can actually use, and it is what the
 * Rust runner stored on the node resolves against.
 */

interface CredentialField {
  name: string;
  displayName: string;
  type: string;
  default?: unknown;
  required?: boolean;
  description?: string;
  placeholder?: string;
  typeOptions?: { password?: boolean; rows?: number };
  options?: { name: string; value: unknown; description?: string }[];
}

interface CredentialTypeDef {
  name: string;
  displayName: string;
  fields: CredentialField[];
  hasSecret: boolean;
  documentationUrl?: string;
}

const TYPES = credentialTypes as unknown as Record<string, CredentialTypeDef>;

/**
 * What the Rust `test_vault_credential` command returns.
 *
 * `reachable` and `authenticated` are separate on purpose: a 401 means the URL
 * was fine but the secret was wrong, and reporting that as "no connection"
 * would send the user hunting for a network problem that does not exist.
 */
interface CredentialProbe {
  url: string;
  status: number | null;
  reachable: boolean;
  authenticated: boolean;
  rejected: boolean;
  message: string;
  notes: string[];
}

const N8N_DOCS: Record<string, string> = {
  whatsapp: "https://docs.n8n.io/integrations/builtin/credentials/whatsapp/",
  slack: "https://docs.n8n.io/integrations/builtin/credentials/slack/",
  telegram: "https://docs.n8n.io/integrations/builtin/credentials/telegram/",
  google: "https://docs.n8n.io/integrations/builtin/credentials/google/",
};

function docsUrl(def: CredentialTypeDef | null): string | null {
  if (!def?.documentationUrl) return null;
  const key = def.documentationUrl.toLowerCase();
  return N8N_DOCS[key] || `https://docs.n8n.io/search?q=${encodeURIComponent(def.documentationUrl)}`;
}

/** Strips the tags n8n puts inside notice text, keeping the readable sentence. */
function plainText(html: string): string {
  return html
    .replace(/<a\b[^>]*>(.*?)<\/a>/gi, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/** Seeds a fresh credential with the defaults n8n declares for each field. */
function seedValues(def: CredentialTypeDef | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of def?.fields || []) {
    if (f.type === "hidden" || f.type === "notice") continue;
    out[f.name] = f.default ?? (f.type === "multiOptions" ? [] : "");
  }
  return out;
}

export interface CredentialEditorTarget {
  /** Vault id being edited, or null when creating a new credential. */
  id: string | null;
  /** n8n credential type name this node expects (`whatsAppTriggerApi`). */
  credType: string | null;
  /** Title shown in the header, e.g. "WhatsApp OAuth account". */
  displayName: string;
  /**
   * Vault ids the node is allowed to pick from. When set, the saved credential
   * is stamped with this exact type, so a credential created here can never be
   * offered to a node whose integration it does not match.
   */
  lockedType?: boolean;
}

interface CredentialEditorModalProps {
  target: CredentialEditorTarget | null;
  onClose: () => void;
  /** Called with the saved credential id so the node can adopt it immediately. */
  onSaved?: (id: string) => void;
}

type Tab = "connection" | "sharing" | "details";

export function CredentialEditorModal({ target, onClose, onSaved }: CredentialEditorModalProps) {
  const { credentials, saveCredential, deleteCredential } = useVaultCredentials();
  const [tab, setTab] = useState<Tab>("connection");
  const [name, setName] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testState, setTestState] = useState<"idle" | "ok" | "error">("idle");
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testDetails, setTestDetails] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  /**
   * The credential type is fixed by the node, so it is resolved once per open.
   * The id being edited (if any) is read from the live vault list rather than
   * passed in, so the modal always shows what is actually on disk.
   */
  const existing = useMemo(
    () => (target?.id ? credentials.find((c) => String(c.id) === String(target.id)) || null : null),
    [target?.id, credentials],
  );

  const credType = target?.credType || (existing ? String(existing.cred_type) : null);
  const def = credType ? TYPES[credType] || null : null;

  const visibleFields = useMemo(
    () => (def?.fields || []).filter((f) => f.type !== "hidden" && f.type !== "notice"),
    [def],
  );
  const notices = useMemo(
    () => (def?.fields || []).filter((f) => f.type === "notice"),
    [def],
  );

  // Load the stored values whenever the target changes. Seeding defaults only
  // happens for a brand-new credential: an existing one must show exactly what
  // was saved, blanks included.
  useEffect(() => {
    if (!target) return;
    setTab("connection");
    setError(null);
    setTestState("idle");
    setRevealed({});
    if (existing) {
      setName(existing.name);
      const stored = (existing.data || {}) as Record<string, unknown>;
      setValues({ ...seedValues(def), ...stored });
    } else {
      setName(def?.displayName ? `${def.displayName} account` : target.displayName);
      setValues(seedValues(def));
    }
    // `def` is derived from the credential type, which is fixed for this target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, existing?.id, credType]);

  if (!target) return null;

  const setField = (field: string, v: unknown) => {
    setValues((prev) => ({ ...prev, [field]: v }));
    // Any edit invalidates a previous test result — showing "connected" for
    // values that have since changed is a lie.
    setTestState("idle");
    setTestMessage(null);
    setTestDetails([]);
  };

  const missingRequired = visibleFields.filter(
    (f) => f.required && String(values[f.name] ?? "").trim() === "",
  );

  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 200);
  };

  /**
   * Persists into the encrypted vault.
   *
   * The credential id is generated from the type and a timestamp rather than
   * reusing the display name, because two WhatsApp accounts must be able to
   * coexist and a name is not a key.
   */
  const handleSave = async () => {
    if (missingRequired.length) {
      setError(`Faltan campos obligatorios: ${missingRequired.map((f) => f.displayName).join(", ")}`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const id = existing ? String(existing.id) : `${(credType || "cred").replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now().toString(36)}`;
      const item: VaultCredential = {
        id,
        name: name.trim() || def?.displayName || target.displayName,
        // The n8n credential type name is the type. The Rust runner stores the
        // same string on the node, so the two always agree.
        cred_type: credType || "api_key",
        data: values,
        created_at: existing?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await saveCredential(item);
      onSaved?.(id);
      handleClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existing) return;
    if (!confirm(`¿Eliminar la credencial "${existing.name}"? Esta acción no se puede deshacer.`)) return;
    setSaving(true);
    try {
      await deleteCredential(String(existing.id));
      handleClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Test connection.
   *
   * This sends a real authenticated request to the integration's API root and
   * reports what came back, the way n8n does. It runs the *same* auth routine a
   * real execution uses, so a green strip here means the node will balance too —
   * not merely that the form is complete.
   *
   * There is deliberately no "assume success" path. The strip stays neutral until
   * a probe has actually answered, because a green tick that appears before you
   * press anything — or after typing an arbitrary key — tells the user their
   * credentials work when nothing was ever verified.
   */
  const handleTest = async () => {
    if (missingRequired.length) {
      setTestState("error");
      setTestMessage(
        `Completa los campos obligatorios antes de probar: ${missingRequired
          .map((f) => f.displayName)
          .join(", ")}`,
      );
      return;
    }
    setTesting(true);
    setError(null);
    setTestState("idle");
    try {
      const cred: VaultCredential = {
        id: existing ? String(existing.id) : "probe",
        name: name.trim() || def?.displayName || target.displayName,
        cred_type: credType || "api_key",
        data: values,
        created_at: existing?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const probe = await invoke<CredentialProbe>("test_vault_credential", { cred });
      setTestMessage(probe.message);
      // A probe that never reached the provider cannot attest to anything, so
      // it can never turn the strip green — even if it also did not fail hard.
      if (probe.authenticated && probe.reachable) {
        setTestState("ok");
        setTestDetails([]);
      } else {
        // Rejected credentials and an unreachable host are both failures, but
        // the user needs to know which one they are looking at.
        setTestState("error");
        setTestDetails([probe.url ? `Probado: ${probe.url}` : "", ...(probe.notes || [])].filter(Boolean));
      }
    } catch (e) {
      setTestState("error");
      setTestMessage(String(e));
      setTestDetails([]);
    } finally {
      setTesting(false);
    }
  };

  const doc = docsUrl(def);
  const title = def?.displayName || target.displayName || "Credencial";
  const subtitle = credType
    ? `${title} API`
    : "Credencial del Vault Cifrado";

  return (
    <div className={`ndv-drawer-backdrop cred-editor-backdrop ${isClosing ? "closing" : ""}`} onClick={handleClose}>
      <div
        className={`ndv-drawer ${isClosing ? "closing" : ""}`}
        style={{ width: "min(680px, 94vw)", "--accent": "#e8562a" } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ndv-header">
          <div className="ndv-header-left">
            <div className="ndv-icon" style={{ borderColor: "#e8562a", color: "#e8562a" }}>
              <CheckCircle2 size={18} />
            </div>
            <div className="ndv-header-text">
              <div className="ndv-title">{title}</div>
              <div className="ndv-subtitle">{subtitle}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              className="save"
              onClick={handleSave}
              disabled={saving}
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              {saving ? <Loader2 size={13} className="spin" /> : <Save size={13} />} Guardar
            </button>
            {existing && (
              <button
                type="button"
                className="danger-outline"
                onClick={handleDelete}
                disabled={saving}
              >
                Eliminar
              </button>
            )}
            <button type="button" className="ndv-close" onClick={handleClose} title="Cerrar">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* n8n's left tab rail: Connection / Sharing / Details */}
        <div style={{ display: "flex", gap: "18px", padding: "14px 20px 0", borderBottom: "1px solid var(--line)" }}>
          {([
            ["connection", "Connection"],
            ["sharing", "Sharing"],
            ["details", "Details"],
          ] as [Tab, string][]).map(([id, text]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              style={{
                background: "none",
                border: "none",
                padding: "0 0 10px",
                cursor: "pointer",
                fontSize: "12.5px",
                fontWeight: tab === id ? 700 : 500,
                color: tab === id ? "var(--text)" : "var(--dim)",
                borderBottom: tab === id ? "2px solid #e8562a" : "2px solid transparent",
              }}
            >
              {text}
            </button>
          ))}
        </div>

        <div className="ndv-body" style={{ padding: "16px 20px", overflowY: "auto", maxHeight: "62vh" }}>
          {tab === "connection" && (
            <>
              {doc && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                  <a
                    href={doc}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11.5px", color: "#e8562a", textDecoration: "none", fontWeight: 600 }}
                  >
                    <Info size={12} /> Ver instrucciones de configuración
                    <ExternalLink size={11} />
                  </a>
                </div>
              )}

              {notices.map((n) => (
                <div
                  key={n.name}
                  style={{
                    marginBottom: "14px",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    border: "1px solid #f0d9b8",
                    borderLeft: "3px solid #f19c48",
                    background: "#fdf6e9",
                    fontSize: "12px",
                    color: "#6b5a3e",
                    lineHeight: 1.6,
                  }}
                >
                  {plainText(n.displayName)}
                </div>
              ))}

              {/* Connection test strip, mirroring n8n's green "tested successfully" */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                  marginBottom: "18px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border:
                    testState === "ok"
                      ? "1px solid #a7e0b5"
                      : testState === "error"
                        ? "1px solid #f0b8b8"
                        : "1px solid var(--line)",
                  background:
                    testState === "ok"
                      ? "#e8f7ec"
                      : testState === "error"
                        ? "#fdecec"
                        : "var(--s2)",
                  fontSize: "12px",
                  color:
                    testState === "ok" ? "#1c7c3c" : testState === "error" ? "#a33" : "var(--dim)",
                }}
              >
                <span style={{ display: "flex", alignItems: "flex-start", gap: "7px", lineHeight: 1.55 }}>
                  {testState === "ok" ? (
                    <>
                      <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: "1px" }} />
                      <span>{testMessage || "Conexión verificada correctamente"}</span>
                    </>
                  ) : testState === "error" ? (
                    <>
                      <AlertCircle size={14} style={{ flexShrink: 0, marginTop: "1px" }} />
                      <span>
                        {testMessage || "Completa los campos obligatorios antes de probar"}
                        {testState === "error" && testDetails.length > 0 && (
                          <span style={{ display: "block", marginTop: "3px", opacity: 0.85 }}>
                            {testDetails.join(" · ")}
                          </span>
                        )}
                      </span>
                    </>
                  ) : (
                    <>
                      <Info size={14} style={{ flexShrink: 0, marginTop: "1px" }} />
                      <span>
                        Sin verificar. Pulsa <strong>Probar conexión</strong> para comprobar
                        las claves contra el servicio.
                      </span>
                    </>
                  )}
                </span>
                <button
                  type="button"
                  className="quiet"
                  onClick={handleTest}
                  disabled={testing}
                  style={{ height: "28px", fontSize: "11.5px", padding: "0 12px", whiteSpace: "nowrap" }}
                >
                  {testing ? (
                    <>
                      <Loader2 size={12} className="spin" /> Probando…
                    </>
                  ) : testState === "idle" ? (
                    "Probar conexión"
                  ) : (
                    "Retry"
                  )}
                </button>
              </div>

              {!def && (
                <div style={{ marginBottom: "14px", fontSize: "12px", color: "var(--dim)", lineHeight: 1.6 }}>
                  Este nodo no declara un tipo de credencial reconocido en el catálogo. Se guardará
                  como credencial genérica del Vault.
                </div>
              )}

              {visibleFields.map((f) => (
                <CredentialFieldInput
                  key={f.name}
                  field={f}
                  value={values[f.name]}
                  revealed={!!revealed[f.name]}
                  onToggleReveal={() => setRevealed((p) => ({ ...p, [f.name]: !p[f.name] }))}
                  onChange={(v) => setField(f.name, v)}
                />
              ))}

              {def && visibleFields.length === 0 && (
                <div style={{ fontSize: "12px", color: "var(--dim)", lineHeight: 1.6 }}>
                  {/oauth/i.test(def.displayName) || /oauth/i.test(def.name) ? (
                    <>
                      Esta credencial usa el flujo OAuth de n8n: no se rellena con claves, sino
                      conectando la cuenta en el navegador. Este editor todavía no puede iniciar
                      ese flujo, así que guárdala con un nombre y complétala desde n8n si necesitas
                      el token.
                    </>
                  ) : (
                    <>Esta credencial no necesita campos: el servicio no requiere autenticación.</>
                  )}
                </div>
              )}

              {error && (
                <div
                  style={{
                    marginTop: "12px",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid #f0b8b8",
                    background: "#fdecec",
                    color: "#a33",
                    fontSize: "12px",
                  }}
                >
                  {error}
                </div>
              )}
            </>
          )}

          {tab === "sharing" && (
            <div style={{ fontSize: "12.5px", color: "var(--dim)", lineHeight: 1.7 }}>
              <p style={{ marginTop: 0 }}>
                Las credenciales de esta aplicación viven en el Vault cifrado con Windows DPAPI.
              </p>
              <p>
                {existing
                  ? "Esta credencial está disponible para todos los nodos del catálogo que declaren el mismo tipo. No se comparte fuera de tu equipo."
                  : "Al guardarla quedará disponible para los nodos que usen este mismo tipo de credencial. No se comparte fuera de tu equipo."}
              </p>
            </div>
          )}

          {tab === "details" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>
                  Nombre de la credencial
                </label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi cuenta" style={{ width: "100%" }} />
                <div style={{ marginTop: "4px", fontSize: "11px", color: "var(--dim)" }}>
                  Es el nombre que verás al elegir la credencial en el nodo.
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>
                  Tipo de credencial
                </label>
                <input value={credType || "—"} readOnly style={{ width: "100%", opacity: 0.7 }} />
                <div style={{ marginTop: "4px", fontSize: "11px", color: "var(--dim)" }}>
                  Lo fija el nodo: un nodo solo puede usar credenciales de su propio tipo.
                </div>
              </div>
              {existing && (
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>
                    Identificador
                  </label>
                  <input value={String(existing.id)} readOnly style={{ width: "100%", opacity: 0.7, fontFamily: "DM Mono, monospace", fontSize: "11.5px" }} />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="ndv-footer">
          <div className="ndv-footer-right" style={{ marginLeft: "auto" }}>
            <button type="button" className="quiet" onClick={handleClose} disabled={saving}>
              Cancelar
            </button>
            <button
              type="button"
              className="save"
              onClick={handleSave}
              disabled={saving || missingRequired.length > 0}
            >
              {saving ? "Guardando…" : "Guardar credencial"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One credential field, rendered by the type n8n declares for it. */
function CredentialFieldInput({
  field,
  value,
  revealed,
  onToggleReveal,
  onChange,
}: {
  field: CredentialField;
  value: unknown;
  revealed: boolean;
  onToggleReveal: () => void;
  onChange: (v: unknown) => void;
}) {
  const isPassword = !!field.typeOptions?.password;
  const rows = field.typeOptions?.rows;

  const label = (
    <label style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "5px", fontWeight: 600 }}>
      {field.displayName}
      {field.required ? <span style={{ color: "#e8562a" }}> *</span> : null}
    </label>
  );

  const desc = field.description ? (
    <div style={{ marginTop: "4px", fontSize: "11px", color: "var(--dim)", lineHeight: 1.5 }}>
      {plainText(field.description)}
    </div>
  ) : null;

  if (field.type === "boolean") {
    return (
      <div className="ndv-toggle" style={{ marginBottom: "14px" }}>
        <input
          id={`cred-${field.name}`}
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
        />
        <label htmlFor={`cred-${field.name}`}>{field.displayName}</label>
        {desc}
      </div>
    );
  }

  if (field.type === "options") {
    return (
      <div style={{ marginBottom: "14px" }}>
        {label}
        <select
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: "100%" }}
        >
          <option value="">— elige —</option>
          {(field.options || []).map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.name}
            </option>
          ))}
        </select>
        {desc}
      </div>
    );
  }

  if (field.type === "multiOptions") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div style={{ marginBottom: "14px" }}>
        {label}
        <select
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v && !selected.includes(v)) onChange([...selected, v]);
            e.target.value = "";
          }}
          style={{ width: "100%", marginBottom: selected.length ? "8px" : 0 }}
        >
          <option value="">— añadir —</option>
          {(field.options || [])
            .filter((o) => !selected.includes(String(o.value)))
            .map((o) => (
              <option key={String(o.value)} value={String(o.value)}>
                {o.name}
              </option>
            ))}
        </select>
        {selected.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {selected.map((val) => (
              <span
                key={val}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "3px 10px",
                  borderRadius: "20px",
                  fontSize: "11px",
                  border: "1px solid var(--line)",
                  background: "var(--s2)",
                  color: "var(--text)",
                }}
              >
                {(field.options || []).find((o) => String(o.value) === val)?.name || val}
                <button
                  type="button"
                  onClick={() => onChange(selected.filter((v) => v !== val))}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--dim)", lineHeight: 1 }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {desc}
      </div>
    );
  }

  if (field.type === "json" || (rows && rows > 1)) {
    return (
      <div style={{ marginBottom: "14px" }}>
        {label}
        <textarea
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || "{}"}
          rows={rows || 4}
          style={{ width: "100%", fontFamily: "DM Mono, monospace", fontSize: "11.5px" }}
        />
        {desc}
      </div>
    );
  }

  if (field.type === "number") {
    return (
      <div style={{ marginBottom: "14px" }}>
        {label}
        <input
          type="number"
          value={value === "" || value == null ? "" : Number(value)}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          placeholder={field.placeholder}
          style={{ width: "100%" }}
        />
        {desc}
      </div>
    );
  }

  // string / color / dateTime / anything unrecognised: a single-line input,
  // masked when the field declares itself a secret.
  return (
    <div style={{ marginBottom: "14px" }}>
      {label}
      <div style={{ position: "relative", width: "100%" }}>
        <input
          type={isPassword && !revealed ? "password" : field.type === "color" ? "color" : "text"}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || ""}
          style={{ width: "100%", paddingRight: isPassword ? "38px" : undefined }}
        />
        {isPassword && (
          <button
            type="button"
            onClick={onToggleReveal}
            title={revealed ? "Ocultar" : "Mostrar"}
            style={{
              position: "absolute",
              right: "8px",
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: 0,
              color: "var(--dim)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              padding: "4px",
            }}
          >
            {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
      {desc}
    </div>
  );
}

export default CredentialEditorModal;
