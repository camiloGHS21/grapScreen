import React, { useState, useEffect } from "react";
import { Trash2, X, Play, Settings as SettingsIcon, Sliders } from "lucide-react";
import { FlowNode } from "../../types";
import { Backdrop } from "../../components/Backdrop";
import { NODE_COLORS } from "../../Flowchart";
import { getNodeIcon } from "../../features/flowchart/buildNodes";
import { ClickForm, TypeForm, HotkeyForm } from "./edit/InteractionForms";
import { AppForm, OpenAppForm, CloseAppForm } from "./edit/AppForms";
import { DelayForm, WaitImageForm, SetVarForm, ScreenshotForm, RunCmdForm, ConditionForm, LoopForm, SplitBatchesForm, FilterForm, SortForm, LimitForm, AggregateForm, EditFieldsForm, DateTimeForm, LlmChainForm, ClassifierForm, RemoveDuplicatesForm, CompareDatasetsForm, InformationExtractorForm, SentimentAnalysisForm, SqliteQueryForm, SqliteExecuteForm } from "./edit/ControlForms";
import { GoogleSheetsForm, GoogleDocsForm, WhatsappForm, TelegramForm, AiAgentForm, ExcelLocalForm } from "./edit/IntegrationForms";
import { FormNodeForm } from "./edit/FormNodeForm";
import { N8nTriggerForms } from "./edit/N8nTriggerForms";
import { CredentialSelect } from "../credentials/CredentialSelect";
import { useVaultCredentials } from "../../hooks/useVaultCredentials";

interface NodeEditModalProps {
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
}

export function NodeEditModal({
  editingNode,
  setEditingNode,
  busy,
  deleteNodeStep,
  saveNodeEdit,
  state
}: NodeEditModalProps) {
  const [tab, setTab] = useState<"params" | "settings">("params");
  const [retryOnFail, setRetryOnFail] = useState(false);
  const [alwaysOutput, setAlwaysOutput] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Credentials available to the AI nodes. Loaded lazily so the modal stays
  // cheap for the nodes that never need one.
  const { credentials } = useVaultCredentials();
  const vaultCredentials = credentials.map(c => ({ id: String(c.id), name: c.name, cred_type: String(c.cred_type) }));

  useEffect(() => {
    if (editingNode) {
      setIsClosing(false);
      setTab("params");
    }
  }, [editingNode]);

  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      setEditingNode(null);
      setIsClosing(false);
    }, 240);
  };

  const handleSave = () => {
    saveNodeEdit();
    handleClose();
  };

  const handleDelete = () => {
    deleteNodeStep();
    handleClose();
  };

  if (!editingNode) return null;

  const {
    editX, setEditX,
    editY, setEditY,
    editText, setEditText,
    editSeconds, setEditSeconds,
    editAppName, setEditAppName,
    editAppExe, setEditAppExe,
    editAppTitle, setEditAppTitle,
    editAppClass, setEditAppClass,
    editOpenAppExe, setEditOpenAppExe,
    editCloseAppName, setEditCloseAppName,
    editWaitImageDesc, setEditWaitImageDesc,
    editWaitImageTimeout, setEditWaitImageTimeout,
    editVarName, setEditVarName,
    editVarValue, setEditVarValue,
    editScreenshotName, setEditScreenshotName,
    editRunCmd, setEditRunCmd,
    editRunCmdArgs, setEditRunCmdArgs,
    editConditionDesc, setEditConditionDesc,
    editConditionType, setEditConditionType,
    editConditionExpression, setEditConditionExpression,
    editLoopIterations, setEditLoopIterations,
    editSplitArrayVar, setEditSplitArrayVar,
    editSplitBatchSize, setEditSplitBatchSize,
    editSheetSpreadsheetId, setEditSheetSpreadsheetId,
    editSheetRange, setEditSheetRange,
    editSheetValues, setEditSheetValues,
    editExcelPath, setEditExcelPath,
    editExcelHeader, setEditExcelHeader,
    editExcelValues, setEditExcelValues,
    editExcelDelimiter, setEditExcelDelimiter,
    editExcelOverwrite, setEditExcelOverwrite,
    editExcelFormat, setEditExcelFormat,
    editDocDocumentId, setEditDocDocumentId,
    editDocText, setEditDocText,
    editWhatsappTo, setEditWhatsappTo,
    editWhatsappMessage, setEditWhatsappMessage,
    editWhatsappApiType, setEditWhatsappApiType,
    editTelegramMessage, setEditTelegramMessage,
    editTelegramChatId, setEditTelegramChatId,
    editCredentialId, setEditCredentialId,
    editAiAgentPrompt, setEditAiAgentPrompt,
    editAiAgentSystemPrompt, setEditAiAgentSystemPrompt,
    editAiAgentProvider, setEditAiAgentProvider,
    editAiAgentModel, setEditAiAgentModel,
    editAiAgentOutputVar, setEditAiAgentOutputVar,
    editAiAgentEnableTools, setEditAiAgentEnableTools,
    editAiAgentMaxIterations, setEditAiAgentMaxIterations,
    editHotkeyKeys, setEditHotkeyKeys,
    editFormFields, setEditFormFields,
  } = state;

  const variablesList = [
    { name: "ai_response", desc: "Respuesta del Agente IA" },
    { name: "ocr_text", desc: "Texto detectado en pantalla" },
    { name: "loop_index", desc: "Número de iteración actual" },
    { name: "fecha_actual", desc: "Fecha y hora en tiempo de ejecución" },
    { name: "directorio_trabajo", desc: "Ruta raíz del proyecto" },
    { name: "last_screenshot", desc: "Ruta de la última captura" },
    { name: "variable", desc: "Variable personalizada de flujo" },
  ];

  const handleCopyVariable = (name: string) => {
    navigator.clipboard.writeText(`{{ ${name} }}`);
    alert(`Expresión {{ ${name} }} copiada al portapapeles`);
  };

  const n8nTypes = [
    "webhook", "http_request", "switch", "merge", "wait", "code",
    "error_handler", "trigger", "cron", "startup", "file_change", "hotkey_trigger", "scroll", "sub_workflow", "polling",
    // Phase 11 — parsing, integrations and flow control.
    "xml_parse", "html_extract", "rss_read",
    "send_email", "slack_webhook", "discord_webhook", "notion", "airtable",
    "stop_error", "noop",
    // n8n Core nodes.
    "split_out", "summarize", "rename_keys", "markdown", "crypto",
    "read_file", "write_file"
  ];

  const nodeType = editingNode.node.type;
  const accent = (NODE_COLORS as Record<string, string>)[nodeType] || "#6E58F2";
  const icon = getNodeIcon(nodeType, 20);
  const typeLabels: Record<string, string> = {
    click: "Interacción · Clic", type: "Interacción · Teclado", scroll: "Interacción · Scroll",
    hotkey: "Interacción · Atajo", delay: "Control · Espera", app: "Aplicación objetivo",
    open_app: "Control · Abrir app", close_app: "Control · Cerrar app", wait_image: "Control · Visión",
    set_var: "Control · Variable", screenshot: "Control · Captura", run_cmd: "Control · Comando",
    condition: "Flujo · Condición", loop: "Flujo · Bucle", webhook: "Trigger · Webhook",
    http_request: "Integración · HTTP", switch: "Flujo · Switch", merge: "Flujo · Merge",
    wait: "Flujo · Esperar", code: "Flujo · Código", error_handler: "Flujo · Errores",
    trigger: "Trigger · Manual", cron: "Trigger · Cron", startup: "Trigger · Inicio",
    file_change: "Trigger · Archivo", hotkey_trigger: "Trigger · Atajo",
    google_sheets: "Integración · Google Sheets", google_docs: "Integración · Google Docs",
    whatsapp: "Integración · WhatsApp", telegram: "Integración · Telegram",
    ai_agent: "Integración · IA", form: "Interfaz · Formulario",
    // Phase 11
    xml_parse: "Transformar · XML", html_extract: "Transformar · HTML", rss_read: "Transformar · RSS",
    send_email: "Integración · Email", slack_webhook: "Integración · Slack",
    discord_webhook: "Integración · Discord", notion: "Integración · Notion",
    airtable: "Integración · Airtable",
    stop_error: "Flujo · Detener", noop: "Flujo · Sin operación",
    split_out: "Transformar · Dividir lista", summarize: "Transformar · Resumir",
    rename_keys: "Transformar · Renombrar claves", markdown: "Transformar · Markdown",
    crypto: "Transformar · Criptografía",
    read_file: "Servicio · Leer archivo", write_file: "Servicio · Escribir archivo",
  };
  const typeLabel = typeLabels[nodeType] || nodeType;
  const titleText = nodeType === "app" ? "Aplicación Objetivo" : editingNode.node.label;
  return (
    <div className={`ndv-drawer-backdrop ${isClosing ? "closing" : ""}`} onClick={handleClose}>
      <div className={`ndv-drawer ${isClosing ? "closing" : ""}`} style={{ "--accent": accent } as React.CSSProperties} onClick={(e) => e.stopPropagation()}>
        <div className="ndv-header">
          <div className="ndv-header-left">
            <div className="ndv-icon" style={{ color: accent, borderColor: accent }}>{icon}</div>
            <div className="ndv-header-text">
              <div className="ndv-title">{titleText}</div>
              <div className="ndv-subtitle">{typeLabel}</div>
            </div>
          </div>
          <button type="button" className="ndv-close" title="Cerrar" onClick={handleClose}>
            <X size={18} />
          </button>
        </div>

        <div className="ndv-tabs">
          <button type="button" className={tab === "params" ? "active" : ""} onClick={() => setTab("params")}>
            <Sliders size={14} /> Parámetros
          </button>
          <button type="button" className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
            <SettingsIcon size={14} /> Ajustes
          </button>
        </div>

        <div className="ndv-body">
          <div className="ndv-params" style={{ display: tab === "params" ? "flex" : "none" }}>
            <div className="ndv-params-forms">
              <div className="ndv-scroll">
                {["http_request", "webhook", "google_sheets", "google_docs", "whatsapp", "telegram", "ai_agent",
                  // These read their secret from a vault credential when the
                  // inline field is left empty. `crypto` uses it for the HMAC
                  // secret when no inline secret is configured.
                  "send_email", "notion", "airtable", "crypto"].includes(editingNode.node.type) && (
                  <CredentialSelect
                    value={editCredentialId}
                    onChange={(val) => setEditCredentialId(val)}
                  />
                )}
                {editingNode.node.type === "click" && <ClickForm editX={editX} setEditX={setEditX} editY={editY} setEditY={setEditY} />}
                {editingNode.node.type === "type" && <TypeForm editText={editText} setEditText={setEditText} />}
                {editingNode.node.type === "delay" && <DelayForm editSeconds={editSeconds} setEditSeconds={setEditSeconds} />}
                {editingNode.node.type === "app" && <AppForm editAppName={editAppName} setEditAppName={setEditAppName} editAppExe={editAppExe} setEditAppExe={setEditAppExe} editAppTitle={editAppTitle} setEditAppTitle={setEditAppTitle} editAppClass={editAppClass} setEditAppClass={setEditAppClass} />}
                {editingNode.node.type === "hotkey" && <HotkeyForm editHotkeyKeys={editHotkeyKeys} setEditHotkeyKeys={setEditHotkeyKeys} />}
                {editingNode.node.type === "open_app" && <OpenAppForm editOpenAppExe={editOpenAppExe} setEditOpenAppExe={setEditOpenAppExe} />}
                {editingNode.node.type === "close_app" && <CloseAppForm editCloseAppName={editCloseAppName} setEditCloseAppName={setEditCloseAppName} />}
                {editingNode.node.type === "wait_image" && <WaitImageForm editWaitImageDesc={editWaitImageDesc} setEditWaitImageDesc={setEditWaitImageDesc} editWaitImageTimeout={editWaitImageTimeout} setEditWaitImageTimeout={setEditWaitImageTimeout} />}
                {editingNode.node.type === "set_var" && <SetVarForm editVarName={editVarName} setEditVarName={setEditVarName} editVarValue={editVarValue} setEditVarValue={setEditVarValue} />}
                {editingNode.node.type === "screenshot" && <ScreenshotForm editScreenshotName={editScreenshotName} setEditScreenshotName={setEditScreenshotName} />}
                {editingNode.node.type === "run_cmd" && <RunCmdForm editRunCmd={editRunCmd} setEditRunCmd={setEditRunCmd} editRunCmdArgs={editRunCmdArgs} setEditRunCmdArgs={setEditRunCmdArgs} />}
                {editingNode.node.type === "condition" && <ConditionForm editConditionDesc={editConditionDesc} setEditConditionDesc={setEditConditionDesc} editConditionType={editConditionType} setEditConditionType={setEditConditionType} editConditionExpression={editConditionExpression} setEditConditionExpression={setEditConditionExpression} />}
                {editingNode.node.type === "loop" && <LoopForm editLoopIterations={editLoopIterations} setEditLoopIterations={setEditLoopIterations} />}
                {editingNode.node.type === "split_batches" && <SplitBatchesForm editSplitArrayVar={editSplitArrayVar} setEditSplitArrayVar={setEditSplitArrayVar} editSplitBatchSize={editSplitBatchSize} setEditSplitBatchSize={setEditSplitBatchSize} />}
                {editingNode.node.type === "google_sheets" && <GoogleSheetsForm editSheetSpreadsheetId={editSheetSpreadsheetId} setEditSheetSpreadsheetId={setEditSheetSpreadsheetId} editSheetRange={editSheetRange} setEditSheetRange={setEditSheetRange} editSheetValues={editSheetValues} setEditSheetValues={setEditSheetValues} />}
                {editingNode.node.type === "excel_local" && <ExcelLocalForm editExcelPath={editExcelPath} setEditExcelPath={setEditExcelPath} editExcelHeader={editExcelHeader} setEditExcelHeader={setEditExcelHeader} editExcelValues={editExcelValues} setEditExcelValues={setEditExcelValues} editExcelDelimiter={editExcelDelimiter} setEditExcelDelimiter={setEditExcelDelimiter} editExcelOverwrite={editExcelOverwrite} setEditExcelOverwrite={setEditExcelOverwrite} editExcelFormat={editExcelFormat} setEditExcelFormat={setEditExcelFormat} />}
                {editingNode.node.type === "google_docs" && <GoogleDocsForm editDocDocumentId={editDocDocumentId} setEditDocDocumentId={setEditDocDocumentId} editDocText={editDocText} setEditDocText={setEditDocText} />}
                {editingNode.node.type === "whatsapp" && <WhatsappForm editWhatsappTo={editWhatsappTo} setEditWhatsappTo={setEditWhatsappTo} editWhatsappMessage={editWhatsappMessage} setEditWhatsappMessage={setEditWhatsappMessage} editWhatsappApiType={editWhatsappApiType} setEditWhatsappApiType={setEditWhatsappApiType} />}
                {editingNode.node.type === "telegram" && <TelegramForm editTelegramMessage={editTelegramMessage} setEditTelegramMessage={setEditTelegramMessage} editTelegramChatId={editTelegramChatId} setEditTelegramChatId={setEditTelegramChatId} />}
                {editingNode.node.type === "ai_agent" && <AiAgentForm editAiAgentPrompt={editAiAgentPrompt} setEditAiAgentPrompt={setEditAiAgentPrompt} editAiAgentSystemPrompt={editAiAgentSystemPrompt} setEditAiAgentSystemPrompt={setEditAiAgentSystemPrompt} editAiAgentProvider={editAiAgentProvider} setEditAiAgentProvider={setEditAiAgentProvider} editAiAgentModel={editAiAgentModel} setEditAiAgentModel={setEditAiAgentModel} editAiAgentOutputVar={editAiAgentOutputVar} setEditAiAgentOutputVar={setEditAiAgentOutputVar} editAiAgentEnableTools={editAiAgentEnableTools} setEditAiAgentEnableTools={setEditAiAgentEnableTools} editAiAgentMaxIterations={editAiAgentMaxIterations} setEditAiAgentMaxIterations={setEditAiAgentMaxIterations} />}
                {editingNode.node.type === "form" && <FormNodeForm editFormFields={editFormFields} setEditFormFields={setEditFormFields} />}

                {/* Data transformation (Phase 3) */}
                {editingNode.node.type === "filter" && <FilterForm editFilterCondition={state.editFilterCondition ?? ""} setEditFilterCondition={v => state.setEditFilterCondition?.(v)} editFilterMode={state.editFilterMode ?? "keep"} setEditFilterMode={v => state.setEditFilterMode?.(v)} />}
                {editingNode.node.type === "sort" && <SortForm editSortFields={state.editSortFields ?? ""} setEditSortFields={v => state.setEditSortFields?.(v)} />}
                {editingNode.node.type === "limit" && <LimitForm editLimitSkip={state.editLimitSkip ?? 0} setEditLimitSkip={v => state.setEditLimitSkip?.(v)} editLimitMax={state.editLimitMax ?? 10} setEditLimitMax={v => state.setEditLimitMax?.(v)} />}
                {editingNode.node.type === "aggregate" && <AggregateForm editAggregateMode={state.editAggregateMode ?? "list"} setEditAggregateMode={v => state.setEditAggregateMode?.(v)} editAggregateField={state.editAggregateField ?? ""} setEditAggregateField={v => state.setEditAggregateField?.(v)} editAggregateSeparator={state.editAggregateSeparator ?? ","} setEditAggregateSeparator={v => state.setEditAggregateSeparator?.(v)} />}
                {editingNode.node.type === "edit_fields" && <EditFieldsForm editFieldsSet={state.editFieldsSet ?? "{}"} setEditFieldsSet={v => state.setEditFieldsSet?.(v)} editFieldsKeepOnly={state.editFieldsKeepOnly ?? ""} setEditFieldsKeepOnly={v => state.setEditFieldsKeepOnly?.(v)} />}
                {editingNode.node.type === "date_time" && <DateTimeForm editDateTimeOperation={state.editDateTimeOperation ?? "format"} setEditDateTimeOperation={v => state.setEditDateTimeOperation?.(v)} editDateTimeField={state.editDateTimeField ?? ""} setEditDateTimeField={v => state.setEditDateTimeField?.(v)} editDateTimeFormat={state.editDateTimeFormat ?? "%Y-%m-%d"} setEditDateTimeFormat={v => state.setEditDateTimeFormat?.(v)} editDateTimeUnit={state.editDateTimeUnit ?? "days"} setEditDateTimeUnit={v => state.setEditDateTimeUnit?.(v)} editDateTimeAmount={state.editDateTimeAmount ?? 0} setEditDateTimeAmount={v => state.setEditDateTimeAmount?.(v)} editDateTimeCompareTo={state.editDateTimeCompareTo ?? ""} setEditDateTimeCompareTo={v => state.setEditDateTimeCompareTo?.(v)} editDateTimeResultField={state.editDateTimeResultField ?? ""} setEditDateTimeResultField={v => state.setEditDateTimeResultField?.(v)} />}

                {/* AI (Phase 3) */}
                {editingNode.node.type === "llm_chain" && <LlmChainForm baseUrl={state.editLlmBaseUrl ?? ""} setBaseUrl={v => state.setEditLlmBaseUrl?.(v)} apiKey={state.editLlmApiKey ?? ""} setApiKey={v => state.setEditLlmApiKey?.(v)} model={state.editLlmModel ?? "gpt-4o-mini"} setModel={v => state.setEditLlmModel?.(v)} editLlmSystemPrompt={state.editLlmSystemPrompt ?? ""} setEditLlmSystemPrompt={v => state.setEditLlmSystemPrompt?.(v)} editLlmPrompt={state.editLlmPrompt ?? ""} setEditLlmPrompt={v => state.setEditLlmPrompt?.(v)} editLlmTemperature={state.editLlmTemperature ?? 0.7} setEditLlmTemperature={v => state.setEditLlmTemperature?.(v)} editLlmMaxTokens={state.editLlmMaxTokens ?? 1024} setEditLlmMaxTokens={v => state.setEditLlmMaxTokens?.(v)} editLlmResultField={state.editLlmResultField ?? "text"} setEditLlmResultField={v => state.setEditLlmResultField?.(v)} editLlmOutputVar={state.editLlmOutputVar ?? "ai_output"} setEditLlmOutputVar={v => state.setEditLlmOutputVar?.(v)} />}
                {editingNode.node.type === "classifier" && <ClassifierForm baseUrl={state.editClsBaseUrl ?? ""} setBaseUrl={v => state.setEditClsBaseUrl?.(v)} apiKey={state.editClsApiKey ?? ""} setApiKey={v => state.setEditClsApiKey?.(v)} model={state.editClsModel ?? "gpt-4o-mini"} setModel={v => state.setEditClsModel?.(v)} editClsSystemPrompt={state.editClsSystemPrompt ?? ""} setEditClsSystemPrompt={v => state.setEditClsSystemPrompt?.(v)} editClsPrompt={state.editClsPrompt ?? ""} setEditClsPrompt={v => state.setEditClsPrompt?.(v)} editClsCategories={state.editClsCategories ?? []} setEditClsCategories={v => state.setEditClsCategories?.(v)} editClsCategoryField={state.editClsCategoryField ?? "category"} setEditClsCategoryField={v => state.setEditClsCategoryField?.(v)} editClsOutputVar={state.editClsOutputVar ?? "classification"} setEditClsOutputVar={v => state.setEditClsOutputVar?.(v)} />}

                {/* Data hygiene + dataset diffs (Phase 4) */}
                {editingNode.node.type === "remove_duplicates" && <RemoveDuplicatesForm editDedupeFields={state.editDedupeFields ?? ""} setEditDedupeFields={v => state.setEditDedupeFields?.(v)} editDedupeKeep={state.editDedupeKeep ?? "first"} setEditDedupeKeep={v => state.setEditDedupeKeep?.(v)} />}
                {editingNode.node.type === "compare_datasets" && <CompareDatasetsForm editCompareWith={state.editCompareWith ?? ""} setEditCompareWith={v => state.setEditCompareWith?.(v)} editCompareKey={state.editCompareKey ?? "id"} setEditCompareKey={v => state.setEditCompareKey?.(v)} editCompareFields={state.editCompareFields ?? ""} setEditCompareFields={v => state.setEditCompareFields?.(v)} editCompareMode={state.editCompareMode ?? "all"} setEditCompareMode={v => state.setEditCompareMode?.(v)} />}

                {/* AI (Phase 4) */}
                {editingNode.node.type === "information_extractor" && <InformationExtractorForm baseUrl={state.editExtractBaseUrl ?? ""} setBaseUrl={v => state.setEditExtractBaseUrl?.(v)} apiKey={state.editExtractApiKey ?? ""} setApiKey={v => state.setEditExtractApiKey?.(v)} model={state.editExtractModel ?? "gpt-4o-mini"} setModel={v => state.setEditExtractModel?.(v)} credentialId={state.editExtractCredentialId ?? ""} setCredentialId={v => state.setEditExtractCredentialId?.(v)} credentials={vaultCredentials} editExtractSystemPrompt={state.editExtractSystemPrompt ?? ""} setEditExtractSystemPrompt={v => state.setEditExtractSystemPrompt?.(v)} editExtractPrompt={state.editExtractPrompt ?? ""} setEditExtractPrompt={v => state.setEditExtractPrompt?.(v)} editExtractSchema={state.editExtractSchema ?? ""} setEditExtractSchema={v => state.setEditExtractSchema?.(v)} editExtractMode={state.editExtractMode ?? "merge"} setEditExtractMode={v => state.setEditExtractMode?.(v)} editExtractOutputVar={state.editExtractOutputVar ?? "extracted"} setEditExtractOutputVar={v => state.setEditExtractOutputVar?.(v)} />}
                {editingNode.node.type === "sentiment_analysis" && <SentimentAnalysisForm baseUrl={state.editSentBaseUrl ?? ""} setBaseUrl={v => state.setEditSentBaseUrl?.(v)} apiKey={state.editSentApiKey ?? ""} setApiKey={v => state.setEditSentApiKey?.(v)} model={state.editSentModel ?? "gpt-4o-mini"} setModel={v => state.setEditSentModel?.(v)} credentialId={state.editSentCredentialId ?? ""} setCredentialId={v => state.setEditSentCredentialId?.(v)} credentials={vaultCredentials} editSentSystemPrompt={state.editSentSystemPrompt ?? ""} setEditSentSystemPrompt={v => state.setEditSentSystemPrompt?.(v)} editSentPrompt={state.editSentPrompt ?? ""} setEditSentPrompt={v => state.setEditSentPrompt?.(v)} editSentLabels={state.editSentLabels ?? "positive,neutral,negative"} setEditSentLabels={v => state.setEditSentLabels?.(v)} editSentLabelField={state.editSentLabelField ?? "sentiment"} setEditSentLabelField={v => state.setEditSentLabelField?.(v)} editSentScoreField={state.editSentScoreField ?? "sentiment_score"} setEditSentScoreField={v => state.setEditSentScoreField?.(v)} editSentOutputVar={state.editSentOutputVar ?? "sentiment"} setEditSentOutputVar={v => state.setEditSentOutputVar?.(v)} />}

                {/* Phase 6 — SQLite */}
                {editingNode.node.type === "sqlite_query" && <SqliteQueryForm editDbPath={state.editSqliteQueryDbPath ?? "datos.db"} setEditDbPath={v => state.setEditSqliteQueryDbPath?.(v)} editQuery={state.editSqliteQuerySql ?? "SELECT * FROM tabla"} setEditQuery={v => state.setEditSqliteQuerySql?.(v)} editParams={state.editSqliteQueryParams ?? ""} setEditParams={v => state.setEditSqliteQueryParams?.(v)} />}
                {editingNode.node.type === "sqlite_execute" && <SqliteExecuteForm editDbPath={state.editSqliteExecDbPath ?? "datos.db"} setEditDbPath={v => state.setEditSqliteExecDbPath?.(v)} editQuery={state.editSqliteExecSql ?? "INSERT INTO tabla (nombre) VALUES (?)"} setEditQuery={v => state.setEditSqliteExecSql?.(v)} editParams={state.editSqliteExecParams ?? ""} setEditParams={v => state.setEditSqliteExecParams?.(v)} />}

                {n8nTypes.includes(editingNode.node.type) && (
                  <N8nTriggerForms type={editingNode.node.type} state={state} />
                )}
              </div>
            </div>
          </div>

          <div className="ndv-settings" style={{ display: tab === "settings" ? "block" : "none" }}>
            <div className="ndv-set-row">
              <label className="ndv-set-label">Notas del paso</label>
              <textarea value={state.editNotes ?? ""} onChange={e => state.setEditNotes?.(e.target.value)} placeholder="Añade notas o documentación sobre este paso del flujo..." />
            </div>
            <div className="ndv-set-row">
              <div className="ndv-toggle">
                <input type="checkbox" id="ndv-retry" checked={retryOnFail} onChange={e => setRetryOnFail(e.target.checked)} />
                <label htmlFor="ndv-retry">Reintentar al fallar</label>
              </div>
              <p className="ndv-expr-hint">Si el paso falla, se reintentará automáticamente antes de detener el flujo.</p>
            </div>
            <div className="ndv-set-row">
              <div className="ndv-toggle">
                <input type="checkbox" id="ndv-output" checked={alwaysOutput} onChange={e => setAlwaysOutput(e.target.checked)} />
                <label htmlFor="ndv-output">Siempre generar datos de salida</label>
              </div>
              <p className="ndv-expr-hint">El nodo devolverá un elemento vacío aunque no produzca resultados.</p>
            </div>
          </div>
        </div>

        <div className="ndv-footer">
          <button type="button" className="ndv-exec" disabled={busy} onClick={handleSave}>
            <Play size={14} /> Probar paso
          </button>
          <div className="ndv-footer-right">
            <button type="button" className="danger-outline" disabled={busy} onClick={handleDelete}>
              <Trash2 size={14} /> Eliminar
            </button>
            <button type="button" className="quiet" disabled={busy} onClick={handleClose}>Cancelar</button>
            <button type="button" className="save" disabled={busy} onClick={handleSave}>Guardar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
export default NodeEditModal;