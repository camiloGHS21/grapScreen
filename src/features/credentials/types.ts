export type CredentialType =
  | "api_key"
  | "bearer_token"
  | "basic_auth"
  | "oauth2"
  | "custom_header"
  | "database";

export interface VaultCredential {
  id: String;
  name: string;
  cred_type: CredentialType;
  data: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export const CREDENTIAL_TYPE_LABELS: Record<CredentialType, string> = {
  api_key: "Clave de API (API Key)",
  bearer_token: "Token Bearer",
  basic_auth: "Autenticación Básica (Usuario/Pass)",
  oauth2: "OAuth 2.0 (Token de Acceso)",
  custom_header: "Encabezado Personalizado",
  database: "Base de Datos (Host/User/Pass)",
};
