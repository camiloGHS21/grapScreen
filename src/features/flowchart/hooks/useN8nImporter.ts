import { useRef, useState, useCallback, type ChangeEvent } from "react";
import type { RecordedEvent } from "../../../types";
import { importN8nWorkflow } from "../utils/n8nWorkflowImporter";

interface UseN8nImporterOptions {
  onSaveEvents?: (events: RecordedEvent[]) => void;
  notify: (msg: string) => void;
}

export function useN8nImporter({ onSaveEvents, notify }: UseN8nImporterOptions) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const processJsonText = useCallback(
    (text: string) => {
      try {
        setIsImporting(true);
        const result = importN8nWorkflow(text);
        if (!onSaveEvents) {
          notify("No se puede guardar: editor no listo");
          return;
        }
        onSaveEvents(result.events);
        const { nodeCount, connectionCount } = result.summary;
        notify(`⚡ Flujo n8n importado: ${nodeCount} nodo(s) y ${connectionCount} cable(s) traducidos`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        notify(`⚠ Error al importar flujo n8n: ${message}`);
      } finally {
        setIsImporting(false);
      }
    },
    [onSaveEvents, notify],
  );

  const handleFileDrop = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".json") && file.type !== "application/json") {
        notify("Solo se pueden importar archivos de flujo n8n (.json)");
        return;
      }
      try {
        const text = await file.text();
        processJsonText(text);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        notify(`Error al leer archivo: ${message}`);
      }
    },
    [notify, processJsonText],
  );

  const handleFileSelected = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await handleFileDrop(file);
      e.target.value = "";
    },
    [handleFileDrop],
  );

  const triggerFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return {
    fileInputRef,
    isImporting,
    triggerFilePicker,
    handleFileSelected,
    handleFileDrop,
  };
}
