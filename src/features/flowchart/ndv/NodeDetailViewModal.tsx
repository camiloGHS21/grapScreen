import React, { useState } from "react";
import { Check } from "lucide-react";
import { FlowNode } from "../../../types";
import { NODE_COLORS } from "../../../Flowchart";
import { NdvHeader } from "./NdvHeader";
import { NdvInputPanel } from "./NdvInputPanel";
import { NdvParamsPanel } from "./NdvParamsPanel";
import { NdvOutputPanel } from "./NdvOutputPanel";
import { useNdvInputData } from "./hooks/useNdvInputData";
import { useNdvExecution } from "./hooks/useNdvExecution";
import { CredentialEditorModal, CredentialEditorTarget } from "../../credentials/CredentialEditorModal";
import { aiProviderCredentialTypes } from "../../credentials/types";
import { useVaultCredentials } from "../../../hooks/useVaultCredentials";
import n8nCatalog from "../../../data/n8n-catalog.json";

const CATALOG = n8nCatalog as unknown as Array<{
  key: string;
  displayName: string;
  icon: string | null;
  credentialName: string | null;
  /** Every credential type the node declares, in n8n's order. */
  credentialNames?: string[];
  isTrigger?: boolean;
  group?: string;
}>;
const CATALOG_BY_KEY = new Map(CATALOG.map((e) => [e.key, e]));
const CATALOG_BY_KEY_LOWER = new Map(CATALOG.map((e) => [e.key.toLowerCase(), e]));

/**
 * Built-in app nodes whose own form renders a vault picker (see
 * `AiConnectionFields`). Adding the shared "Credencial de la Bóveda" block on top
 * would show two selectors for the same credential.
 */
const INLINE_CREDENTIAL_NODE_TYPES = new Set([
  "llm_chain",
  "classifier",
  "information_extractor",
  "sentiment_analysis",
]);

interface NodeDetailViewModalProps {
  editingNode: {
    node: FlowNode;
    eventIndex: number;
    rangeStart?: number;
    rangeEnd?: number;
  } | null;
  setEditingNode: (node: any) => void;
  busy: boolean;
  deleteNodeStep: () => void;
  saveNodeEdit: () => void;
  state: any;
  onUpdateNodePin?: (nodeId: string, pinEnabled: boolean, pinnedData: any) => void;
}

export function NodeDetailViewModal({
  editingNode,
  setEditingNode,
  saveNodeEdit,
  state,
  onUpdateNodePin,
}: NodeDetailViewModalProps) {
  const [tab, setTab] = useState<"params" | "settings">("params");
  const [showInputPanel, setShowInputPanel] = useState(true);
  const [showOutputPanel, setShowOutputPanel] = useState(true);
  const [, setMissingRequired] = useState(0);
  const [retryOnFail, setRetryOnFail] = useState(false);
  const [alwaysOutput, setAlwaysOutput] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [credEditor, setCredEditor] = useState<CredentialEditorTarget | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  const { credentials } = useVaultCredentials();
  const vaultCredentials = credentials.map((c) => ({
    id: String(c.id),
    name: c.name,
    cred_type: String(c.cred_type),
  }));

  const node = editingNode?.node ?? null;
  const nodeType = node?.type || "";
  const n8nKey = node?.n8nKey || state?.editN8nKey || (node as any)?.data?.n8n_key || "";

  const accent = (NODE_COLORS as Record<string, string>)[nodeType] || "#ff6d5a";
  const catalogEntry = n8nKey
    ? CATALOG_BY_KEY.get(n8nKey) || CATALOG_BY_KEY_LOWER.get(n8nKey.toLowerCase()) || null
    : null;

  const isTriggerNode =
    nodeType === "trigger" ||
    nodeType === "n8n_trigger" ||
    nodeType.endsWith("_trigger") ||
    nodeType.includes("trigger") ||
    Boolean(catalogEntry?.isTrigger) ||
    Boolean((node as any)?.data?.isTrigger) ||
    Boolean((node as any)?.data?.n8n_is_trigger);

  const n8nIcon = catalogEntry?.icon
    ? `${import.meta.env.BASE_URL}n8n-icons/${catalogEntry.icon}`
    : null;

  const automationId = state?.selectedAutomationId as string | undefined;
  const projectName = (state?.selectedProjectName as string | undefined) || "Personal";

  const {
    upstreamSources,
    selectedSourceId,
    setSelectedSourceId,
    activeInputItem,
  } = useNdvInputData({
    currentNode: node,
    events: state?.selectedProjectDetail?.events || [],
  });

  const {
    stepRunning,
    upstreamRunning,
    stepResult,
    runStep,
    executePreviousNodes,
  } = useNdvExecution({
    automationId,
    projectName,
    nodeId: node?.id,
    onSavedBeforeRun: saveNodeEdit,
  });

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2200);
  };

  const handleCopyExpression = (expr: string) => {
    navigator.clipboard.writeText(expr);
    showToast(`Copiado al portapapeles: ${expr}`);
  };

  const handleUpdatePin = (data: any) => {
    if (!node) return;
    onUpdateNodePin?.(node.id, true, data);
    showToast("Datos fijados (Pin Data) guardados.");
  };

  const handleClose = () => {
    if (isClosing) return;
    saveNodeEdit();
    setIsClosing(true);
    setTimeout(() => {
      setEditingNode(null);
      setIsClosing(false);
    }, 240);
  };

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !credEditor) {
        handleClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [credEditor, isClosing]);

  if (!editingNode || !node) return null;

  /**
   * The credential types this node actually declares, taken from the catalogue.
   *
   * That list is generated from the n8n source (`n8n-credential-audit.mjs`): it
   * holds the credentials the node's *current* version declares, filtered by
   * `displayOptions` against the node's default parameters — the same rule n8n
   * uses to decide whether to show the field. A node that declares none (the AI
   * Agent, If, Set, Code, the chat and webhook triggers) resolves to an empty
   * list, so it gets no selector at all rather than one borrowed from whatever
   * else lives in its source directory.
   */
  const declaredCredentialTypes = catalogEntry?.credentialNames?.length
    ? catalogEntry.credentialNames
    : catalogEntry?.credentialName
      ? [catalogEntry.credentialName]
      : [];

  const nodeCredentialTypes = INLINE_CREDENTIAL_NODE_TYPES.has(nodeType)
    ? []
    : nodeType === "ai_agent" && n8nKey
      ? // The catalogue Agent declares no credential of its own, exactly like
        // n8n, where the credential belongs to the chat model wired to its
        // Model port.
        []
      : nodeType === "ai_agent"
        ? // A flow's original agent authenticates with a provider key: the
          // vault lookup reads `api_key`/`token`/… off whatever credential is
          // attached, so the picker offers provider credentials and nothing
          // else.
          aiProviderCredentialTypes(state?.editAiAgentProvider)
        : declaredCredentialTypes;

  const showsCredential = nodeCredentialTypes.length > 0;

  const canRunStep =
    Boolean(automationId) &&
    nodeType !== "app" &&
    nodeType !== "error_handler" &&
    nodeType !== "noop";

  return (
    <div className={`ndv-modal-overlay ${isClosing ? "closing" : ""}`} onClick={handleClose}>
      <div
        className={`ndv-modal-card ${isTriggerNode ? "trigger-mode" : ""} ${isClosing ? "closing" : ""}`}
        style={{ "--accent": accent } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        {toastMsg && (
          <div className="ndv-toast">
            <Check size={14} /> {toastMsg}
          </div>
        )}

        {/* Top Header matching n8n: Left (Icon+Name), Center (Tabs + Execute Button), Right (Docs + Close) */}
        <NdvHeader
          node={node}
          accent={accent}
          n8nIconUrl={n8nIcon}
          initialFallback={catalogEntry ? catalogEntry.displayName.charAt(0).toUpperCase() : undefined}
          onClose={handleClose}
          nodeName={state.editAppName || node.label}
          setNodeName={(val) => {
            if (state.setEditAppName) state.setEditAppName(val);
          }}
          tab={tab}
          setTab={setTab}
          stepRunning={stepRunning}
          canRunStep={canRunStep}
          onExecuteStep={runStep}
          isTriggerNode={isTriggerNode}
          docsUrl={catalogEntry?.key ? `https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.${catalogEntry.key.toLowerCase()}/` : null}
        />

        {/* Body: For Triggers: 2 Columns [Parameters | Output] / For Actions: 3 Columns [Input | Parameters | Output] */}
        <div className={`ndv-modal-body ${isTriggerNode ? "trigger-body" : ""}`}>
          {!isTriggerNode && showInputPanel && (
            <NdvInputPanel
              upstreamSources={upstreamSources}
              activeInputItem={activeInputItem}
              selectedSourceId={selectedSourceId}
              onSelectSourceId={setSelectedSourceId}
              onExecutePreviousNodes={executePreviousNodes}
              upstreamRunning={upstreamRunning}
              onCopyExpression={handleCopyExpression}
              onUpdatePinData={handleUpdatePin}
            />
          )}

          <NdvParamsPanel
            node={node}
            tab={tab}
            setTab={setTab}
            state={state}
            showsCredential={showsCredential}
            nodeCredentialTypes={nodeCredentialTypes}
            editCredentialId={state.editCredentialId || ""}
            setEditCredentialId={(id) => state.setEditCredentialId?.(id)}
            setCredEditor={setCredEditor}
            vaultCredentials={vaultCredentials}
            setMissingRequired={setMissingRequired}
            retryOnFail={retryOnFail}
            setRetryOnFail={setRetryOnFail}
            alwaysOutput={alwaysOutput}
            setAlwaysOutput={setAlwaysOutput}
          />

          {showOutputPanel && (
            <NdvOutputPanel
              stepResult={stepResult}
              stepRunning={stepRunning}
              onExecuteStep={runStep}
              onCopyExpression={handleCopyExpression}
              isTriggerNode={isTriggerNode}
              onSetMockData={() => onUpdateNodePin?.(node.id, true, {})}
            />
          )}
        </div>
      </div>

      <CredentialEditorModal
        target={credEditor}
        onClose={() => setCredEditor(null)}
        onSaved={(id) => state.setEditCredentialId?.(id)}
      />
    </div>
  );
}

export default NodeDetailViewModal;
