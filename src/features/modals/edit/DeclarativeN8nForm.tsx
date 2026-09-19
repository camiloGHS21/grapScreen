import React, { useMemo } from "react";
import type { FlowNode } from "../../../types";
import n8nCatalog from "../../../data/n8n-catalog.json";
import N8nParamsForm from "./N8nParamsForm";
import { DeclarativeAdvancedOverrides } from "./DeclarativeAdvancedOverrides";
import { AgentModelNote } from "./AgentModelNote";

interface N8nCatalogEntry {
  key: string;
  displayName: string;
  description: string;
  category: string;
  isTrigger: boolean;
  triggerMode: string | null;
  polling: boolean;
  webhook: boolean;
  baseUrl: string | null;
  credentialName: string | null;
  authType: string | null;
  credentialFields: string[];
}

const CATALOG = n8nCatalog as unknown as N8nCatalogEntry[];
const BY_KEY = new Map(CATALOG.map((e) => [e.key, e]));
const BY_KEY_LOWER = new Map(CATALOG.map((e) => [e.key.toLowerCase(), e]));

function resolveTriggerMode(stored: unknown, descriptor: N8nCatalogEntry | null): string {
  if (typeof stored === "string" && stored.trim()) return stored.trim();
  if (descriptor?.triggerMode) return descriptor.triggerMode;
  if (descriptor?.webhook) return "webhook";
  if (descriptor?.polling) return "polling";
  return "event";
}

export function DeclarativeN8nForm({
  node,
  state,
  onMissingRequired,
}: {
  node: FlowNode;
  state: any;
  onMissingRequired?: (count: number) => void;
}) {
  const nodeKey = state.editN8nKey || node.n8nKey || (node as any)?.data?.n8n_key || "";

  const descriptor = useMemo(() => {
    if (!nodeKey) return null;
    return BY_KEY.get(nodeKey) || BY_KEY_LOWER.get(nodeKey.toLowerCase()) || null;
  }, [nodeKey]);

  const isTrigger = node.type === "n8n_trigger";
  const mode = isTrigger ? resolveTriggerMode(state.editN8nMode, descriptor) : "";

  // The agent runs through the engine's own agent runner, not through one HTTP
  // request, so the request overrides would be fields nothing reads. Its key
  // comes from the app's credential store instead.
  const isAgent = node.type === "ai_agent";

  return (
    <div className="declarative-n8n-form">
      {/* Real n8n parameters extracted from the node descriptor */}
      <N8nParamsForm
        nodeKey={nodeKey}
        value={state.editN8nConfig || {}}
        onChange={state.setEditN8nConfig}
        onMissingRequired={onMissingRequired}
      />

      {isAgent && <AgentModelNote />}

      {/* Optional advanced request overrides (collapsed by default) */}
      {!isAgent && (
        <DeclarativeAdvancedOverrides
          isTrigger={isTrigger}
          mode={mode}
          state={state}
          descriptor={descriptor}
        />
      )}
    </div>
  );
}

export default DeclarativeN8nForm;
