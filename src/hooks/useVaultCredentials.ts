import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { VaultCredential } from "../features/credentials/types";

export function useVaultCredentials() {
  const [credentials, setCredentials] = useState<VaultCredential[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCredentials = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke<VaultCredential[]>("list_vault_credentials");
      setCredentials(list || []);
      setError(null);
    } catch (e: any) {
      console.error("[useVaultCredentials] error fetching:", e);
      setError(e?.toString() || "Error al cargar credenciales");
    } finally {
      setLoading(false);
    }
  }, []);

  const saveCredential = async (cred: VaultCredential) => {
    try {
      await invoke("save_vault_credential", { cred });
      await fetchCredentials();
    } catch (e: any) {
      throw new Error(e?.toString() || "Error al guardar credencial");
    }
  };

  const deleteCredential = async (id: string) => {
    try {
      await invoke("delete_vault_credential", { id });
      await fetchCredentials();
    } catch (e: any) {
      throw new Error(e?.toString() || "Error al eliminar credencial");
    }
  };

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  return {
    credentials,
    loading,
    error,
    refresh: fetchCredentials,
    saveCredential,
    deleteCredential,
  };
}
