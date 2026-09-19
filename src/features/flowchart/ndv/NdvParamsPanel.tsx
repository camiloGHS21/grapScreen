import React from "react";
import { FlowNode } from "../../../types";
import { CredentialSelect } from "../../credentials/CredentialSelect";
import { CredentialEditorTarget } from "../../credentials/CredentialEditorModal";
import { ClickForm, TypeForm, HotkeyForm } from "../../modals/edit/InteractionForms";
import { AppForm, OpenAppForm, CloseAppForm } from "../../modals/edit/AppForms";
import {
  DelayForm, WaitImageForm, SetVarForm, ScreenshotForm, RunCmdForm, ConditionForm,
  LoopForm, SplitBatchesForm, FilterForm, SortForm, LimitForm, AggregateForm,
  EditFieldsForm, DateTimeForm, LlmChainForm, ClassifierForm, RemoveDuplicatesForm,
  CompareDatasetsForm, InformationExtractorForm, SentimentAnalysisForm, SqliteQueryForm, SqliteExecuteForm
} from "../../modals/edit/ControlForms";
import { GoogleSheetsForm, GoogleDocsForm, WhatsappForm, TelegramForm, AiAgentForm, ExcelLocalForm } from "../../modals/edit/IntegrationForms";
import { FormNodeForm } from "../../modals/edit/FormNodeForm";
import { N8nTriggerForms } from "../../modals/edit/N8nTriggerForms";
import { N8nCoreActionForms } from "../../modals/edit/N8nCoreActionForms";
import { N8nFlowForms } from "../../modals/edit/N8nFlowForms";
import { N8nIntegrationForms } from "../../modals/edit/N8nIntegrationForms";
import { N8nTransformForms } from "../../modals/edit/N8nTransformForms";
import { DeclarativeN8nForm } from "../../modals/edit/DeclarativeN8nForm";

interface NdvParamsPanelProps {
  node: FlowNode;
  tab: "params" | "settings";
  setTab: (t: "params" | "settings") => void;
  state: any;
  showsCredential: boolean;
  nodeCredentialTypes: string[];
  editCredentialId: string;
  setEditCredentialId: (id: string) => void;
  setCredEditor: (t: CredentialEditorTarget | null) => void;
  vaultCredentials: Array<{ id: string; name: string; cred_type: string }>;
  setMissingRequired: (n: number) => void;
  retryOnFail: boolean;
  setRetryOnFail: (b: boolean) => void;
  alwaysOutput: boolean;
  setAlwaysOutput: (b: boolean) => void;
}

const TRIGGER_TYPES = [
  "trigger", "cron", "startup", "file_change", "hotkey_trigger", "polling",
  "webhook", "whatsapp_trigger", "telegram_trigger", "email_trigger", "rss_trigger",
];

const CORE_ACTION_TYPES = [
  "http_request", "code", "scroll", "error_handler", "stop_error", "noop",
];

const FLOW_TYPES = [
  "switch", "merge", "wait", "sub_workflow",
];

const INTEGRATION_TYPES = [
  "send_email", "slack_webhook", "discord_webhook", "notion", "airtable",
];

const TRANSFORM_TYPES = [
  "split_out", "summarize", "rename_keys", "markdown", "crypto",
  "read_file", "write_file", "xml_parse", "html_extract", "rss_read",
];

export function NdvParamsPanel({
  node,
  tab,
  state,
  showsCredential,
  nodeCredentialTypes,
  editCredentialId,
  setEditCredentialId,
  setCredEditor,
  vaultCredentials,
  setMissingRequired,
  retryOnFail,
  setRetryOnFail,
  alwaysOutput,
  setAlwaysOutput,
}: NdvParamsPanelProps) {
  const {
    editX, setEditX, editY, setEditY, editText, setEditText, editSeconds, setEditSeconds,
    editAppName, setEditAppName, editAppExe, setEditAppExe, editAppTitle, setEditAppTitle,
    editAppClass, setEditAppClass, editHotkeyKeys, setEditHotkeyKeys, editOpenAppExe, setEditOpenAppExe,
    editCloseAppName, setEditCloseAppName, editWaitImageDesc, setEditWaitImageDesc,
    editWaitImageTimeout, setEditWaitImageTimeout, editVarName, setEditVarName, editVarValue, setEditVarValue,
    editScreenshotName, setEditScreenshotName, editRunCmd, setEditRunCmd, editRunCmdArgs, setEditRunCmdArgs,
    editConditionDesc, setEditConditionDesc, editConditionType, setEditConditionType,
    editConditionExpression, setEditConditionExpression, editLoopIterations, setEditLoopIterations,
    editSplitArrayVar, setEditSplitArrayVar, editSplitBatchSize, setEditSplitBatchSize,
    editSheetSpreadsheetId, setEditSheetSpreadsheetId, editSheetRange, setEditSheetRange,
    editSheetValues, setEditSheetValues, editExcelPath, setEditExcelPath, editExcelHeader, setEditExcelHeader,
    editExcelValues, setEditExcelValues, editExcelDelimiter, setEditExcelDelimiter,
    editExcelOverwrite, setEditExcelOverwrite, editExcelFormat, setEditExcelFormat,
    editDocDocumentId, setEditDocDocumentId, editDocText, setEditDocText,
    editWhatsappTo, setEditWhatsappTo, editWhatsappMessage, setEditWhatsappMessage,
    editWhatsappApiType, setEditWhatsappApiType, editTelegramMessage, setEditTelegramMessage,
    editTelegramChatId, setEditTelegramChatId, editAiAgentPrompt, setEditAiAgentPrompt,
    editAiAgentSystemPrompt, setEditAiAgentSystemPrompt, editAiAgentProvider, setEditAiAgentProvider,
    editAiAgentModel, setEditAiAgentModel, editAiAgentOutputVar, setEditAiAgentOutputVar,
    editAiAgentEnableTools, setEditAiAgentEnableTools, editAiAgentMaxIterations, setEditAiAgentMaxIterations,
    editFormFields, setEditFormFields,
  } = state;

  return (
    <div className="ndv-col-params">
      <div className="ndv-col-body">
        {tab === "params" ? (
          <div className="ndv-scroll">
            {showsCredential && (
              <div className="ndv-credential-group" style={{ marginBottom: 16 }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
                  Credencial de la Bóveda
                </div>
                <CredentialSelect
                  value={editCredentialId}
                  onChange={(val) => setEditCredentialId(val)}
                  filterTypes={nodeCredentialTypes}
                  label={nodeCredentialTypes.join(" / ") || undefined}
                  onEditCredential={(opts) => setCredEditor(opts)}
                />
              </div>
            )}

            {/* Automatización de escritorio RPA */}
            {node.type === "click" && <ClickForm editX={editX} setEditX={setEditX} editY={editY} setEditY={setEditY} />}
            {node.type === "type" && <TypeForm editText={editText} setEditText={setEditText} />}
            {node.type === "delay" && <DelayForm editSeconds={editSeconds} setEditSeconds={setEditSeconds} />}
            {node.type === "app" && <AppForm editAppName={editAppName} setEditAppName={setEditAppName} editAppExe={editAppExe} setEditAppExe={setEditAppExe} editAppTitle={editAppTitle} setEditAppTitle={setEditAppTitle} editAppClass={editAppClass} setEditAppClass={setEditAppClass} />}
            {node.type === "hotkey" && <HotkeyForm editHotkeyKeys={editHotkeyKeys} setEditHotkeyKeys={setEditHotkeyKeys} />}
            {node.type === "open_app" && <OpenAppForm editOpenAppExe={editOpenAppExe} setEditOpenAppExe={setEditOpenAppExe} />}
            {node.type === "close_app" && <CloseAppForm editCloseAppName={editCloseAppName} setEditCloseAppName={setEditCloseAppName} />}
            {node.type === "wait_image" && <WaitImageForm editWaitImageDesc={editWaitImageDesc} setEditWaitImageDesc={setEditWaitImageDesc} editWaitImageTimeout={editWaitImageTimeout} setEditWaitImageTimeout={setEditWaitImageTimeout} />}
            {node.type === "set_var" && <SetVarForm editVarName={editVarName} setEditVarName={setEditVarName} editVarValue={editVarValue} setEditVarValue={setEditVarValue} />}
            {node.type === "screenshot" && <ScreenshotForm editScreenshotName={editScreenshotName} setEditScreenshotName={setEditScreenshotName} />}
            {node.type === "run_cmd" && <RunCmdForm editRunCmd={editRunCmd} setEditRunCmd={setEditRunCmd} editRunCmdArgs={editRunCmdArgs} setEditRunCmdArgs={setEditRunCmdArgs} />}
            {node.type === "condition" && <ConditionForm editConditionDesc={editConditionDesc} setEditConditionDesc={setEditConditionDesc} editConditionType={editConditionType} setEditConditionType={setEditConditionType} editConditionExpression={editConditionExpression} setEditConditionExpression={setEditConditionExpression} />}
            {node.type === "loop" && <LoopForm editLoopIterations={editLoopIterations} setEditLoopIterations={setEditLoopIterations} />}
            {node.type === "split_batches" && <SplitBatchesForm editSplitArrayVar={editSplitArrayVar} setEditSplitArrayVar={setEditSplitArrayVar} editSplitBatchSize={editSplitBatchSize} setEditSplitBatchSize={setEditSplitBatchSize} />}

            {/* Integraciones básicas */}
            {node.type === "google_sheets" && <GoogleSheetsForm editSheetSpreadsheetId={editSheetSpreadsheetId} setEditSheetSpreadsheetId={setEditSheetSpreadsheetId} editSheetRange={editSheetRange} setEditSheetRange={setEditSheetRange} editSheetValues={editSheetValues} setEditSheetValues={setEditSheetValues} />}
            {node.type === "excel_local" && <ExcelLocalForm editExcelPath={editExcelPath} setEditExcelPath={setEditExcelPath} editExcelHeader={editExcelHeader} setEditExcelHeader={setEditExcelHeader} editExcelValues={editExcelValues} setEditExcelValues={setEditExcelValues} editExcelDelimiter={editExcelDelimiter} setEditExcelDelimiter={setEditExcelDelimiter} editExcelOverwrite={editExcelOverwrite} setEditExcelOverwrite={setEditExcelOverwrite} editExcelFormat={editExcelFormat} setEditExcelFormat={setEditExcelFormat} />}
            {node.type === "google_docs" && <GoogleDocsForm editDocDocumentId={editDocDocumentId} setEditDocDocumentId={setEditDocDocumentId} editDocText={editDocText} setEditDocText={setEditDocText} />}
            {node.type === "whatsapp" && <WhatsappForm editWhatsappTo={editWhatsappTo} setEditWhatsappTo={setEditWhatsappTo} editWhatsappMessage={editWhatsappMessage} setEditWhatsappMessage={setEditWhatsappMessage} editWhatsappApiType={editWhatsappApiType} setEditWhatsappApiType={setEditWhatsappApiType} />}
            {node.type === "telegram" && <TelegramForm editTelegramMessage={editTelegramMessage} setEditTelegramMessage={setEditTelegramMessage} editTelegramChatId={editTelegramChatId} setEditTelegramChatId={setEditTelegramChatId} />}
            {/* The agent added from the catalogue is configured with n8n's own
                Agent parameters; only a flow's original `ai_agent` (no
                `n8n_key`) still shows the provider form it was built with. */}
            {node.type === "ai_agent" && !node.n8nKey && <AiAgentForm editAiAgentPrompt={editAiAgentPrompt} setEditAiAgentPrompt={setEditAiAgentPrompt} editAiAgentSystemPrompt={editAiAgentSystemPrompt} setEditAiAgentSystemPrompt={setEditAiAgentSystemPrompt} editAiAgentProvider={editAiAgentProvider} setEditAiAgentProvider={setEditAiAgentProvider} editAiAgentModel={editAiAgentModel} setEditAiAgentModel={setEditAiAgentModel} editAiAgentOutputVar={editAiAgentOutputVar} setEditAiAgentOutputVar={setEditAiAgentOutputVar} editAiAgentEnableTools={editAiAgentEnableTools} setEditAiAgentEnableTools={setEditAiAgentEnableTools} editAiAgentMaxIterations={editAiAgentMaxIterations} setEditAiAgentMaxIterations={setEditAiAgentMaxIterations} />}
            {node.type === "form" && <FormNodeForm editFormFields={editFormFields} setEditFormFields={setEditFormFields} />}

            {/* Transformaciones locales */}
            {node.type === "filter" && <FilterForm editFilterCondition={state.editFilterCondition ?? ""} setEditFilterCondition={(v) => state.setEditFilterCondition?.(v)} editFilterMode={state.editFilterMode ?? "keep"} setEditFilterMode={(v) => state.setEditFilterMode?.(v)} />}
            {node.type === "sort" && <SortForm editSortFields={state.editSortFields ?? ""} setEditSortFields={(v) => state.setEditSortFields?.(v)} />}
            {node.type === "limit" && <LimitForm editLimitSkip={state.editLimitSkip ?? 0} setEditLimitSkip={(v) => state.setEditLimitSkip?.(v)} editLimitMax={state.editLimitMax ?? 10} setEditLimitMax={(v) => state.setEditLimitMax?.(v)} />}
            {node.type === "aggregate" && <AggregateForm editAggregateMode={state.editAggregateMode ?? "list"} setEditAggregateMode={(v) => state.setEditAggregateMode?.(v)} editAggregateField={state.editAggregateField ?? ""} setEditAggregateField={(v) => state.setEditAggregateField?.(v)} editAggregateSeparator={state.editAggregateSeparator ?? ","} setEditAggregateSeparator={(v) => state.setEditAggregateSeparator?.(v)} />}
            {node.type === "edit_fields" && <EditFieldsForm editFieldsSet={state.editFieldsSet ?? "{}"} setEditFieldsSet={(v) => state.setEditFieldsSet?.(v)} editFieldsKeepOnly={state.editFieldsKeepOnly ?? ""} setEditFieldsKeepOnly={(v) => state.setEditFieldsKeepOnly?.(v)} />}
            {node.type === "date_time" && <DateTimeForm editDateTimeOperation={state.editDateTimeOperation ?? "format"} setEditDateTimeOperation={(v) => state.setEditDateTimeOperation?.(v)} editDateTimeField={state.editDateTimeField ?? ""} setEditDateTimeField={(v) => state.setEditDateTimeField?.(v)} editDateTimeFormat={state.editDateTimeFormat ?? "%Y-%m-%d"} setEditDateTimeFormat={(v) => state.setEditDateTimeFormat?.(v)} editDateTimeUnit={state.editDateTimeUnit ?? "days"} setEditDateTimeUnit={(v) => state.setEditDateTimeUnit?.(v)} editDateTimeAmount={state.editDateTimeAmount ?? 0} setEditDateTimeAmount={(v) => state.setEditDateTimeAmount?.(v)} editDateTimeCompareTo={state.editDateTimeCompareTo ?? ""} setEditDateTimeCompareTo={(v) => state.setEditDateTimeCompareTo?.(v)} editDateTimeResultField={state.editDateTimeResultField ?? ""} setEditDateTimeResultField={(v) => state.setEditDateTimeResultField?.(v)} />}

            {/* IA especializada */}
            {node.type === "llm_chain" && <LlmChainForm baseUrl={state.editLlmBaseUrl ?? ""} setBaseUrl={(v) => state.setEditLlmBaseUrl?.(v)} apiKey={state.editLlmApiKey ?? ""} setApiKey={(v) => state.setEditLlmApiKey?.(v)} model={state.editLlmModel ?? "gpt-4o-mini"} setModel={(v) => state.setEditLlmModel?.(v)} editLlmSystemPrompt={state.editLlmSystemPrompt ?? ""} setEditLlmSystemPrompt={(v) => state.setEditLlmSystemPrompt?.(v)} editLlmPrompt={state.editLlmPrompt ?? ""} setEditLlmPrompt={(v) => state.setEditLlmPrompt?.(v)} editLlmTemperature={state.editLlmTemperature ?? 0.7} setEditLlmTemperature={(v) => state.setEditLlmTemperature?.(v)} editLlmMaxTokens={state.editLlmMaxTokens ?? 1024} setEditLlmMaxTokens={(v) => state.setEditLlmMaxTokens?.(v)} editLlmResultField={state.editLlmResultField ?? "text"} setEditLlmResultField={(v) => state.setEditLlmResultField?.(v)} editLlmOutputVar={state.editLlmOutputVar ?? "ai_output"} setEditLlmOutputVar={(v) => state.setEditLlmOutputVar?.(v)} />}
            {node.type === "classifier" && <ClassifierForm baseUrl={state.editClsBaseUrl ?? ""} setBaseUrl={(v) => state.setEditClsBaseUrl?.(v)} apiKey={state.editClsApiKey ?? ""} setApiKey={(v) => state.setEditClsApiKey?.(v)} model={state.editClsModel ?? "gpt-4o-mini"} setModel={(v) => state.setEditClsModel?.(v)} editClsSystemPrompt={state.editClsSystemPrompt ?? ""} setEditClsSystemPrompt={(v) => state.setEditClsSystemPrompt?.(v)} editClsPrompt={state.editClsPrompt ?? ""} setEditClsPrompt={(v) => state.setEditClsPrompt?.(v)} editClsCategories={state.editClsCategories ?? []} setEditClsCategories={(v) => state.setEditClsCategories?.(v)} editClsCategoryField={state.editClsCategoryField ?? "category"} setEditClsCategoryField={(v) => state.setEditClsCategoryField?.(v)} editClsOutputVar={state.editClsOutputVar ?? "classification"} setEditClsOutputVar={(v) => state.setEditClsOutputVar?.(v)} />}
            {node.type === "remove_duplicates" && <RemoveDuplicatesForm editDedupeFields={state.editDedupeFields ?? ""} setEditDedupeFields={(v) => state.setEditDedupeFields?.(v)} editDedupeKeep={state.editDedupeKeep ?? "first"} setEditDedupeKeep={(v) => state.setEditDedupeKeep?.(v)} />}
            {node.type === "compare_datasets" && <CompareDatasetsForm editCompareWith={state.editCompareWith ?? ""} setEditCompareWith={(v) => state.setEditCompareWith?.(v)} editCompareKey={state.editCompareKey ?? "id"} setEditCompareKey={(v) => state.setEditCompareKey?.(v)} editCompareFields={state.editCompareFields ?? ""} setEditCompareFields={(v) => state.setEditCompareFields?.(v)} editCompareMode={state.editCompareMode ?? "all"} setEditCompareMode={(v) => state.setEditCompareMode?.(v)} />}
            {node.type === "information_extractor" && <InformationExtractorForm baseUrl={state.editExtractBaseUrl ?? ""} setBaseUrl={(v) => state.setEditExtractBaseUrl?.(v)} apiKey={state.editExtractApiKey ?? ""} setApiKey={(v) => state.setEditExtractApiKey?.(v)} model={state.editExtractModel ?? "gpt-4o-mini"} setModel={(v) => state.setEditExtractModel?.(v)} credentialId={state.editExtractCredentialId ?? ""} setCredentialId={(v) => state.setEditExtractCredentialId?.(v)} credentials={vaultCredentials} editExtractSystemPrompt={state.editExtractSystemPrompt ?? ""} setEditExtractSystemPrompt={(v) => state.setEditExtractSystemPrompt?.(v)} editExtractPrompt={state.editExtractPrompt ?? ""} setEditExtractPrompt={(v) => state.setEditExtractPrompt?.(v)} editExtractSchema={state.editExtractSchema ?? ""} setEditExtractSchema={(v) => state.setEditExtractSchema?.(v)} editExtractMode={state.editExtractMode ?? "merge"} setEditExtractMode={(v) => state.setEditExtractMode?.(v)} editExtractOutputVar={state.editExtractOutputVar ?? "extracted"} setEditExtractOutputVar={(v) => state.setEditExtractOutputVar?.(v)} />}
            {node.type === "sentiment_analysis" && <SentimentAnalysisForm baseUrl={state.editSentBaseUrl ?? ""} setBaseUrl={(v) => state.setEditSentBaseUrl?.(v)} apiKey={state.editSentApiKey ?? ""} setApiKey={(v) => state.setEditSentApiKey?.(v)} model={state.editSentModel ?? "gpt-4o-mini"} setModel={(v) => state.setEditSentModel?.(v)} credentialId={state.editSentCredentialId ?? ""} setCredentialId={(v) => state.setEditSentCredentialId?.(v)} credentials={vaultCredentials} editSentSystemPrompt={state.editSentSystemPrompt ?? ""} setEditSentSystemPrompt={(v: string) => state.setEditSentSystemPrompt?.(v)} editSentPrompt={state.editSentPrompt ?? ""} setEditSentPrompt={(v) => state.setEditSentPrompt?.(v)} editSentLabels={state.editSentLabels ?? "positive,neutral,negative"} setEditSentLabels={(v) => state.setEditSentLabels?.(v)} editSentLabelField={state.editSentLabelField ?? "sentiment"} setEditSentLabelField={(v) => state.setEditSentLabelField?.(v)} editSentScoreField={state.editSentScoreField ?? "sentiment_score"} setEditSentScoreField={(v) => state.setEditSentScoreField?.(v)} editSentOutputVar={state.editSentOutputVar ?? "sentiment"} setEditSentOutputVar={(v) => state.setEditSentOutputVar?.(v)} />}

            {/* Base de datos SQLite */}
            {node.type === "sqlite_query" && <SqliteQueryForm editDbPath={state.editSqliteQueryDbPath ?? "datos.db"} setEditDbPath={(v) => state.setEditSqliteQueryDbPath?.(v)} editQuery={state.editSqliteQuerySql ?? "SELECT * FROM tabla"} setEditQuery={(v) => state.setEditSqliteQuerySql?.(v)} editParams={state.editSqliteQueryParams ?? ""} setEditParams={(v) => state.setEditSqliteQueryParams?.(v)} />}
            {node.type === "sqlite_execute" && <SqliteExecuteForm editDbPath={state.editSqliteExecDbPath ?? "datos.db"} setEditDbPath={(v) => state.setEditSqliteExecDbPath?.(v)} editQuery={state.editSqliteExecSql ?? "INSERT INTO tabla (nombre) VALUES (?)"} setEditQuery={(v) => state.setEditSqliteExecSql?.(v)} editParams={state.editSqliteExecParams ?? ""} setEditParams={(v) => state.setEditSqliteExecParams?.(v)} />}

            {/* Nodos estilo n8n modulares */}
            {TRIGGER_TYPES.includes(node.type) && <N8nTriggerForms type={node.type} state={state} />}
            {CORE_ACTION_TYPES.includes(node.type) && <N8nCoreActionForms type={node.type} state={state} />}
            {FLOW_TYPES.includes(node.type) && <N8nFlowForms type={node.type} state={state} />}
            {INTEGRATION_TYPES.includes(node.type) && <N8nIntegrationForms type={node.type} state={state} />}
            {TRANSFORM_TYPES.includes(node.type) && <N8nTransformForms type={node.type} state={state} />}

            {/* Nodos declarativos del catálogo oficial n8n */}
            {(node.type === "n8n_node" ||
              node.type === "n8n_trigger" ||
              (node.type === "ai_agent" && Boolean(node.n8nKey))) && (
              <DeclarativeN8nForm node={node} state={state} onMissingRequired={setMissingRequired} />
            )}
          </div>
        ) : (
          <div className="ndv-settings">
            <div className="ndv-set-row">
              <label className="ndv-set-label">Notas del paso</label>
              <textarea
                value={state.editNotes ?? ""}
                onChange={(e) => state.setEditNotes?.(e.target.value)}
                placeholder="Añade notas o documentación sobre este paso del flujo..."
              />
            </div>
            <div className="ndv-set-row">
              <div className="ndv-toggle">
                <input
                  type="checkbox"
                  id="ndv-retry"
                  checked={retryOnFail}
                  onChange={(e) => setRetryOnFail(e.target.checked)}
                />
                <label htmlFor="ndv-retry">Reintentar al fallar</label>
              </div>
              <p className="ndv-expr-hint">Si el paso falla, se reintentará automáticamente antes de detener el flujo.</p>
            </div>
            <div className="ndv-set-row">
              <div className="ndv-toggle">
                <input
                  type="checkbox"
                  id="ndv-output"
                  checked={alwaysOutput}
                  onChange={(e) => setAlwaysOutput(e.target.checked)}
                />
                <label htmlFor="ndv-output">Siempre generar datos de salida</label>
              </div>
              <p className="ndv-expr-hint">El nodo devolverá un elemento vacío aunque no produzca resultados.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default NdvParamsPanel;
