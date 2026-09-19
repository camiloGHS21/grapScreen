/**
 * The coarse kinds the pre-n8n nodes use. They are still stored verbatim, but
 * they are no longer the whole story.
 */
export type LegacyCredentialType =
  | "api_key"
  | "bearer_token"
  | "basic_auth"
  | "oauth2"
  | "custom_header"
  | "database";

/**
 * A credential's type.
 *
 * This is the n8n credential type name (`whatsAppTriggerApi`) for anything that
 * comes from the catalogue, and one of the legacy kinds above for the nodes that
 * predate it. Two shapes coexist rather than one replacing the other, so old
 * credentials keep working.
 *
 * The `(string & {})` member is deliberate: it keeps autocomplete on the known
 * names while still accepting the 445 generated ones. Narrowing this back to a
 * closed union is what makes `save_vault_credential` fail with "unknown variant".
 */
export type CredentialType = LegacyCredentialType | (string & {});

export interface VaultCredential {
  id: String;
  name: string;
  cred_type: CredentialType;
  data: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export const CREDENTIAL_TYPE_LABELS: Record<LegacyCredentialType, string> = {
  api_key: "Clave de API (API Key)",
  bearer_token: "Token Bearer",
  basic_auth: "Autenticación Básica (Usuario/Pass)",
  oauth2: "OAuth 2.0 (Token de Acceso)",
  custom_header: "Encabezado Personalizado",
  database: "Base de Datos (Host/User/Pass)",
};

/**
 * Credential types every AI node may attach, whatever provider it talks to.
 *
 * The built-in `ai_agent` node authenticates with a provider key, so its vault
 * picker has to offer provider credentials and nothing else — the vault also
 * holds database and SMTP credentials, and a node whose credential type was
 * inferred from unrelated data could end up offering one of those.
 */
export const AI_PROVIDER_CREDENTIAL_TYPES: string[] = [
  "openAiApi",
  "azureOpenAiApi",
  "anthropicApi",
  "googlePalmApi",
  "ollamaApi",
  "deepSeekApi",
  "openRouterApi",
  "groqApi",
  "mistralCloudApi",
  "cohereApi",
  "perplexityApi",
  "xAiApi",
];

/**
 * The credential types that make sense for one of the built-in AI nodes'
 * providers. LM Studio serves the OpenAI-compatible API but ships no credential
 * type of its own, so it shares OpenAI's and Ollama's (both are keyless-friendly).
 */
const PROVIDER_CREDENTIAL_TYPES: Record<string, string[]> = {
  openai: ["openAiApi"],
  ollama: ["ollamaApi"],
  lmstudio: ["openAiApi", "ollamaApi"],
  gemini: ["googlePalmApi"],
  deepseek: ["deepSeekApi"],
  openrouter: ["openRouterApi"],
};

/** Credential types to offer for a provider, defaulting to every AI type. */
export function aiProviderCredentialTypes(provider?: string | null): string[] {
  const key = (provider || "").trim().toLowerCase();
  return PROVIDER_CREDENTIAL_TYPES[key] || AI_PROVIDER_CREDENTIAL_TYPES;
}
