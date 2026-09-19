import type { FlowNodeType } from "../../../types";
import type { NodeGroupId } from "../utils/nodeCatalog";

export type SidePanelMode = "empty" | "catalog" | "group" | "search";

export interface FlowSidePanelProps {
  mode: SidePanelMode;
  group?: NodeGroupId | null;
  panelSource?: { nodeId: string; portId: string } | null;
  onClearPort?: () => void;
  onPickNode: (
    type: FlowNodeType,
    label?: string,
    n8n?: { key: string; mode?: string | null },
  ) => void;
  onModeChange: (mode: SidePanelMode, group?: NodeGroupId | null) => void;
  onClose: () => void;
  nodeCount: number;
}

export interface CategoryRow {
  key: string;
  label: string;
  count: number;
}

export const normalise = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export const ACTION_CATEGORY_DESCS: Record<string, string> = {
  action: "Conectar con Slack, Google Sheets, Notion, Gmail...",
  transform: "Editar campos, filtrar, ordenar, agregar o transformar datos",
  flow: "Ramificar con If, Switch, bucles, esperas y subflujos",
  ai: "Agentes autónomos, modelos LLM y herramientas de IA",
  core: "Petición HTTP, código JS/Python, variables, comandos",
  human: "Pedir aprobación o datos por Telegram, WhatsApp o formulario",
  desktop: "Control de ratón, teclado, atajos y captura de pantalla",
  trigger: "Añadir otro disparador al flujo de trabajo",
};
