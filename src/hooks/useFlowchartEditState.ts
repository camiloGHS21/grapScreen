import { useState, useEffect } from "react";
import { FlowNode, AutomationDetail } from "../types";
import { populateNodeState } from "../features/flowchart/utils/nodeStatePopulator";

export interface FormField {
  id: string;
  label: string;
  type: "text" | "password" | "email" | "number" | "phone" | "toggle" | "select";
  options?: string;
  required: boolean;
  defaultValue?: string;
}

export function useFlowchartEditState(
  editingNode: { node: FlowNode; eventIndex: number; rangeStart?: number; rangeEnd?: number } | null,
  selectedProjectDetail: AutomationDetail | null
) {
  const [editX, setEditX] = useState(0);
  const [editY, setEditY] = useState(0);
  const [editText, setEditText] = useState("");
  const [editSeconds, setEditSeconds] = useState(0);
  const [editAppName, setEditAppName] = useState("");
  const [editAppExe, setEditAppExe] = useState("");
  const [editAppTitle, setEditAppTitle] = useState("");
  const [editAppClass, setEditAppClass] = useState("");
  const [editOpenAppExe, setEditOpenAppExe] = useState("");
  const [editCloseAppName, setEditCloseAppName] = useState("");
  const [editWaitImageDesc, setEditWaitImageDesc] = useState("");
  const [editWaitImageTimeout, setEditWaitImageTimeout] = useState(10);
  const [editVarName, setEditVarName] = useState("");
  const [editVarValue, setEditVarValue] = useState("");
  const [editScreenshotName, setEditScreenshotName] = useState("captura.png");
  const [editRunCmd, setEditRunCmd] = useState("");
  const [editRunCmdArgs, setEditRunCmdArgs] = useState("");
  const [editConditionDesc, setEditConditionDesc] = useState("");
  const [editConditionType, setEditConditionType] = useState<"pixel" | "text" | "image" | "expression">("pixel");
  const [editConditionExpression, setEditConditionExpression] = useState("");
  const [editLoopIterations, setEditLoopIterations] = useState(3);
  const [editSplitArrayVar, setEditSplitArrayVar] = useState("items");
  const [editSplitBatchSize, setEditSplitBatchSize] = useState(1);
  const [editSheetSpreadsheetId, setEditSheetSpreadsheetId] = useState("");
  const [editSheetRange, setEditSheetRange] = useState("Sheet1!A:Z");
  const [editSheetValues, setEditSheetValues] = useState("");
  const [editDocDocumentId, setEditDocDocumentId] = useState("");
  const [editDocText, setEditDocText] = useState("");
  const [editWhatsappTo, setEditWhatsappTo] = useState("");
  const [editWhatsappMessage, setEditWhatsappMessage] = useState("");
  const [editWhatsappApiType, setEditWhatsappApiType] = useState<"web" | "api">("web");
  const [editTelegramMessage, setEditTelegramMessage] = useState("");
  const [editTelegramChatId, setEditTelegramChatId] = useState("");
  const [editAiAgentPrompt, setEditAiAgentPrompt] = useState("");
  const [editAiAgentSystemPrompt, setEditAiAgentSystemPrompt] = useState("Eres un asistente inteligente.");
  const [editAiAgentProvider, setEditAiAgentProvider] = useState("openai");
  const [editAiAgentModel, setEditAiAgentModel] = useState("gpt-4o-mini");
  const [editAiAgentOutputVar, setEditAiAgentOutputVar] = useState("ai_response");
  const [editAiAgentEnableTools, setEditAiAgentEnableTools] = useState<string[]>([
    "ocr_scan_text", "rpa_click", "rpa_type_text", "get_workflow_var", "set_workflow_var"
  ]);
  const [editAiAgentMaxIterations, setEditAiAgentMaxIterations] = useState(5);
  const [editCredentialId, setEditCredentialId] = useState("");
  const [editHotkeyKeys, setEditHotkeyKeys] = useState("");
  const [editFormFields, setEditFormFields] = useState<FormField[]>([]);
  const [editExcelPath, setEditExcelPath] = useState("datos.xlsx");
  const [editExcelHeader, setEditExcelHeader] = useState("");
  const [editExcelValues, setEditExcelValues] = useState("");
  const [editExcelDelimiter, setEditExcelDelimiter] = useState(",");
  const [editExcelOverwrite, setEditExcelOverwrite] = useState(false);
  const [editExcelFormat, setEditExcelFormat] = useState("csv");

  // New n8n-style state fields
  const [editWebhookPath, setEditWebhookPath] = useState("/webhook");
  const [editWebhookMethod, setEditWebhookMethod] = useState("POST");
  const [editPollingUrl, setEditPollingUrl] = useState("");
  const [editPollingMethod, setEditPollingMethod] = useState("GET");
  const [editPollingHeaders, setEditPollingHeaders] = useState("{}");
  const [editPollingBody, setEditPollingBody] = useState("");
  const [editPollingInterval, setEditPollingInterval] = useState(60);
  const [editHttpRequestMethod, setEditHttpRequestMethod] = useState("GET");
  const [editHttpRequestUrl, setEditHttpRequestUrl] = useState("https://api.example.com");
  const [editHttpRequestHeaders, setEditHttpRequestHeaders] = useState("{}");
  const [editHttpRequestBody, setEditHttpRequestBody] = useState("");
  const [editHttpRequestOutputVar, setEditHttpRequestOutputVar] = useState("http_response");
  const [editSwitchField, setEditSwitchField] = useState("status");
  const [editSwitchCases, setEditSwitchCases] = useState("[]");
  const [editMergeMode, setEditMergeMode] = useState("append");
  const [editWaitSeconds, setEditWaitSeconds] = useState(5);
  const [editWaitResumeOn, setEditWaitResumeOn] = useState("timeout");
  const [editCodeLanguage, setEditCodeLanguage] = useState("javascript");
  const [editCodeContent, setEditCodeContent] = useState("// Tu código aquí\nreturn items;");
  const [editCodeOutputVar, setEditCodeOutputVar] = useState("code_output");
  const [editErrorHandlerAction, setEditErrorHandlerAction] = useState("retry");
  const [editErrorHandlerMaxRetries, setEditErrorHandlerMaxRetries] = useState(3);
  const [editTriggerSchedule, setEditTriggerSchedule] = useState("manual");
  const [editCronSchedule, setEditCronSchedule] = useState("1h");
  const [editFileChangePath, setEditFileChangePath] = useState("");
  const [editFileChangeEvent, setEditFileChangeEvent] = useState("Modify");
  const [editHotkeyTriggerShortcut, setEditHotkeyTriggerShortcut] = useState("Ctrl+Alt+A");
  const [editScrollY, setEditScrollY] = useState(-120);
  const [editNotes, setEditNotes] = useState("");
  const [editSubWorkflowId, setEditSubWorkflowId] = useState("");
  const [editSubWorkflowName, setEditSubWorkflowName] = useState("Sub-Flujo");
  const [editSubWorkflowProject, setEditSubWorkflowProject] = useState("Default");

  // Startup node states
  const [editStartupMode, setEditStartupMode] = useState<"system" | "app_launch">("system");
  const [editStartupAppExe, setEditStartupAppExe] = useState("chrome.exe");
  const [editStartupDelay, setEditStartupDelay] = useState(0);

  // Data transformation (Phase 3)
  const [editFilterCondition, setEditFilterCondition] = useState("{{ $json.value }} > 0");
  const [editFilterMode, setEditFilterMode] = useState("keep");
  const [editSortFields, setEditSortFields] = useState("created_at");
  const [editLimitSkip, setEditLimitSkip] = useState(0);
  const [editLimitMax, setEditLimitMax] = useState(10);
  const [editAggregateMode, setEditAggregateMode] = useState("list");
  const [editAggregateField, setEditAggregateField] = useState("");
  const [editAggregateSeparator, setEditAggregateSeparator] = useState(",");
  const [editFieldsSet, setEditFieldsSet] = useState("{\n  \"nuevo_campo\": \"{{ $json.valor }}\"\n}");
  const [editFieldsKeepOnly, setEditFieldsKeepOnly] = useState("");
  const [editDateTimeOperation, setEditDateTimeOperation] = useState("format");
  const [editDateTimeField, setEditDateTimeField] = useState("created_at");
  const [editDateTimeFormat, setEditDateTimeFormat] = useState("%Y-%m-%d");
  const [editDateTimeUnit, setEditDateTimeUnit] = useState("days");
  const [editDateTimeAmount, setEditDateTimeAmount] = useState(0);
  const [editDateTimeCompareTo, setEditDateTimeCompareTo] = useState("");
  const [editDateTimeResultField, setEditDateTimeResultField] = useState("");

  // AI (Phase 3)
  const [editLlmBaseUrl, setEditLlmBaseUrl] = useState("");
  const [editLlmApiKey, setEditLlmApiKey] = useState("");
  const [editLlmModel, setEditLlmModel] = useState("gpt-4o-mini");
  const [editLlmSystemPrompt, setEditLlmSystemPrompt] = useState("");
  const [editLlmPrompt, setEditLlmPrompt] = useState("{{ $json.text }}");
  const [editLlmTemperature, setEditLlmTemperature] = useState(0.7);
  const [editLlmMaxTokens, setEditLlmMaxTokens] = useState(1024);
  const [editLlmResultField, setEditLlmResultField] = useState("text");
  const [editLlmOutputVar, setEditLlmOutputVar] = useState("ai_output");
  const [editClsBaseUrl, setEditClsBaseUrl] = useState("");
  const [editClsApiKey, setEditClsApiKey] = useState("");
  const [editClsModel, setEditClsModel] = useState("gpt-4o-mini");
  const [editClsSystemPrompt, setEditClsSystemPrompt] = useState("");
  const [editClsPrompt, setEditClsPrompt] = useState("{{ $json.text }}");
  const [editClsCategories, setEditClsCategories] = useState<string[]>(["Factura", "Soporte", "Otro"]);
  const [editClsCategoryField, setEditClsCategoryField] = useState("category");
  const [editClsOutputVar, setEditClsOutputVar] = useState("classification");

  // Data hygiene + dataset diffs (Phase 4)
  const [editDedupeFields, setEditDedupeFields] = useState("");
  const [editDedupeKeep, setEditDedupeKeep] = useState("first");
  const [editCompareWith, setEditCompareWith] = useState("");
  const [editCompareKey, setEditCompareKey] = useState("id");
  const [editCompareFields, setEditCompareFields] = useState("");
  const [editCompareMode, setEditCompareMode] = useState("all");

  // AI (Phase 4)
  const [editExtractBaseUrl, setEditExtractBaseUrl] = useState("");
  const [editExtractApiKey, setEditExtractApiKey] = useState("");
  const [editExtractCredentialId, setEditExtractCredentialId] = useState("");
  const [editExtractModel, setEditExtractModel] = useState("gpt-4o-mini");
  const [editExtractSystemPrompt, setEditExtractSystemPrompt] = useState("");
  const [editExtractPrompt, setEditExtractPrompt] = useState("{{ $json.text }}");
  const [editExtractSchema, setEditExtractSchema] = useState('{\n  "nombre": "nombre completo",\n  "total": "importe total como número"\n}');
  const [editExtractMode, setEditExtractMode] = useState("merge");
  const [editExtractOutputVar, setEditExtractOutputVar] = useState("extracted");
  const [editSentBaseUrl, setEditSentBaseUrl] = useState("");
  const [editSentApiKey, setEditSentApiKey] = useState("");
  const [editSentCredentialId, setEditSentCredentialId] = useState("");
  const [editSentModel, setEditSentModel] = useState("gpt-4o-mini");
  const [editSentSystemPrompt, setEditSentSystemPrompt] = useState("");
  const [editSentPrompt, setEditSentPrompt] = useState("{{ $json.text }}");
  const [editSentLabels, setEditSentLabels] = useState("positive,neutral,negative");
  const [editSentLabelField, setEditSentLabelField] = useState("sentiment");
  const [editSentScoreField, setEditSentScoreField] = useState("sentiment_score");
  const [editSentOutputVar, setEditSentOutputVar] = useState("sentiment");
  // Phase 6 — SQLite.
  const [editSqliteQueryDbPath, setEditSqliteQueryDbPath] = useState("datos.db");
  const [editSqliteQuerySql, setEditSqliteQuerySql] = useState("SELECT * FROM tabla");
  const [editSqliteQueryParams, setEditSqliteQueryParams] = useState("");
  const [editSqliteExecDbPath, setEditSqliteExecDbPath] = useState("datos.db");
  const [editSqliteExecSql, setEditSqliteExecSql] = useState("INSERT INTO tabla (nombre) VALUES (?)");
  const [editSqliteExecParams, setEditSqliteExecParams] = useState("[\"nuevo\"]");
  // Phase 11 — parsing nodes.
  const [editXmlSource, setEditXmlSource] = useState("{{ $json.xml }}");
  const [editXmlRoot, setEditXmlRoot] = useState("");
  const [editHtmlSource, setEditHtmlSource] = useState("{{ $json.html }}");
  const [editHtmlSelector, setEditHtmlSelector] = useState("a");
  const [editHtmlAttr, setEditHtmlAttr] = useState("href");
  const [editRssUrl, setEditRssUrl] = useState("");
  const [editRssLimit, setEditRssLimit] = useState(20);
  // Phase 11 — integrations.
  const [editEmailSmtpHost, setEditEmailSmtpHost] = useState("smtp.gmail.com");
  const [editEmailSmtpPort, setEditEmailSmtpPort] = useState(587);
  const [editEmailUsername, setEditEmailUsername] = useState("");
  const [editEmailPassword, setEditEmailPassword] = useState("");
  const [editEmailFrom, setEditEmailFrom] = useState("");
  const [editEmailTo, setEditEmailTo] = useState("");
  const [editEmailSubject, setEditEmailSubject] = useState("");
  const [editEmailBody, setEditEmailBody] = useState("");
  const [editEmailIsHtml, setEditEmailIsHtml] = useState(false);
  const [editSlackWebhookUrl, setEditSlackWebhookUrl] = useState("");
  const [editSlackText, setEditSlackText] = useState("");
  const [editSlackChannel, setEditSlackChannel] = useState("");
  const [editSlackBotName, setEditSlackBotName] = useState("");
  const [editDiscordWebhookUrl, setEditDiscordWebhookUrl] = useState("");
  const [editDiscordContent, setEditDiscordContent] = useState("");
  const [editDiscordBotName, setEditDiscordBotName] = useState("");
  const [editNotionOperation, setEditNotionOperation] = useState("query_database");
  const [editNotionToken, setEditNotionToken] = useState("");
  const [editNotionDatabaseId, setEditNotionDatabaseId] = useState("");
  const [editNotionPageId, setEditNotionPageId] = useState("");
  const [editNotionTitle, setEditNotionTitle] = useState("");
  const [editNotionProperties, setEditNotionProperties] = useState("");
  const [editNotionFilter, setEditNotionFilter] = useState("");
  const [editAirtableOperation, setEditAirtableOperation] = useState("list");
  const [editAirtableApiKey, setEditAirtableApiKey] = useState("");
  const [editAirtableBaseId, setEditAirtableBaseId] = useState("");
  const [editAirtableTable, setEditAirtableTable] = useState("");
  const [editAirtableRecordId, setEditAirtableRecordId] = useState("");
  const [editAirtableFields, setEditAirtableFields] = useState("");
  // Phase 11 — flow control.
  const [editStopErrorMessage, setEditStopErrorMessage] = useState("");
  // n8n Core nodes.
  const [editSplitOutField, setEditSplitOutField] = useState("items");
  const [editSplitOutInclude, setEditSplitOutInclude] = useState("all");
  const [editSplitOutIncludeFields, setEditSplitOutIncludeFields] = useState("");
  const [editSplitOutDestination, setEditSplitOutDestination] = useState("");
  const [editSummarizeGroupBy, setEditSummarizeGroupBy] = useState("");
  const [editSummarizeAggregations, setEditSummarizeAggregations] = useState<any[]>([{ operation: "count", field: "", output_field: "" }]);
  const [editSummarizeSeparator, setEditSummarizeSeparator] = useState(", ");
  const [editRenameKeysRules, setEditRenameKeysRules] = useState<any[]>([{ from: "", to: "" }]);
  const [editRenameKeysMode, setEditRenameKeysMode] = useState("plain");
  const [editRenameKeysKeepOnly, setEditRenameKeysKeepOnly] = useState(false);
  const [editRenameKeysDeep, setEditRenameKeysDeep] = useState(false);
  const [editMarkdownMode, setEditMarkdownMode] = useState("markdown_to_html");
  const [editMarkdownSource, setEditMarkdownSource] = useState("{{ $json.text }}");
  const [editMarkdownTarget, setEditMarkdownTarget] = useState("data");
  const [editCryptoAction, setEditCryptoAction] = useState("hash");
  const [editCryptoAlgorithm, setEditCryptoAlgorithm] = useState("SHA256");
  const [editCryptoEncoding, setEditCryptoEncoding] = useState("hex");
  const [editCryptoValue, setEditCryptoValue] = useState("{{ $json.text }}");
  const [editCryptoSecret, setEditCryptoSecret] = useState("");
  const [editCryptoLength, setEditCryptoLength] = useState(32);
  const [editCryptoTarget, setEditCryptoTarget] = useState("data");
  const [editReadFilePath, setEditReadFilePath] = useState("~/datos.txt");
  const [editReadFileEncoding, setEditReadFileEncoding] = useState("utf8");
  const [editReadFileTarget, setEditReadFileTarget] = useState("data");
  const [editWriteFilePath, setEditWriteFilePath] = useState("~/salida.txt");
  const [editWriteFileContent, setEditWriteFileContent] = useState("{{ $json.text }}");
  const [editWriteFileEncoding, setEditWriteFileEncoding] = useState("utf8");
  const [editWriteFileAppend, setEditWriteFileAppend] = useState(false);

  useEffect(() => {
    populateNodeState(editingNode, selectedProjectDetail, {
      setEditX, setEditY, setEditText, setEditSeconds, setEditAppExe, setEditAppTitle,
      setEditAppClass, setEditAppName, setEditScrollY, setEditHotkeyKeys, setEditOpenAppExe,
      setEditCloseAppName, setEditWaitImageDesc, setEditWaitImageTimeout, setEditVarName,
      setEditVarValue, setEditScreenshotName, setEditRunCmd, setEditRunCmdArgs,
      setEditConditionDesc, setEditConditionType, setEditConditionExpression, setEditLoopIterations, setEditSheetSpreadsheetId,
      setEditSplitArrayVar, setEditSplitBatchSize,
      setEditSheetRange, setEditSheetValues, setEditExcelPath, setEditExcelHeader,
      setEditExcelValues, setEditExcelDelimiter, setEditExcelOverwrite, setEditExcelFormat,
      setEditDocDocumentId, setEditDocText, setEditWhatsappTo, setEditWhatsappMessage,
      setEditWhatsappApiType, setEditTelegramMessage, setEditTelegramChatId, setEditCredentialId, setEditAiAgentPrompt,
      setEditAiAgentSystemPrompt, setEditAiAgentProvider, setEditAiAgentModel, setEditAiAgentOutputVar,
      setEditAiAgentEnableTools, setEditAiAgentMaxIterations, setEditWebhookPath,
      setEditWebhookMethod, setEditHttpRequestMethod, setEditHttpRequestUrl, setEditHttpRequestHeaders,
      setEditHttpRequestBody, setEditHttpRequestOutputVar, setEditSwitchField, setEditSwitchCases, setEditMergeMode,
      setEditWaitSeconds, setEditWaitResumeOn, setEditCodeLanguage, setEditCodeContent, setEditCodeOutputVar,
      setEditErrorHandlerAction, setEditErrorHandlerMaxRetries, setEditTriggerSchedule,
      setEditCronSchedule, setEditFileChangePath, setEditFileChangeEvent, setEditHotkeyTriggerShortcut,
      setEditNotes, setEditFormFields,
      setEditSubWorkflowId, setEditSubWorkflowName, setEditSubWorkflowProject,
      setEditStartupMode, setEditStartupAppExe, setEditStartupDelay,
      // Data transformation (Phase 3)
      setEditFilterCondition, setEditFilterMode, setEditSortFields,
      setEditLimitSkip, setEditLimitMax, setEditAggregateMode, setEditAggregateField,
      setEditAggregateSeparator, setEditFieldsSet, setEditFieldsKeepOnly,
      setEditDateTimeOperation, setEditDateTimeField, setEditDateTimeFormat,
      setEditDateTimeUnit, setEditDateTimeAmount, setEditDateTimeCompareTo, setEditDateTimeResultField,
      // AI (Phase 3)
      setEditLlmBaseUrl, setEditLlmApiKey, setEditLlmModel, setEditLlmSystemPrompt,
      setEditLlmPrompt, setEditLlmTemperature, setEditLlmMaxTokens,
      setEditLlmResultField, setEditLlmOutputVar,
      setEditClsBaseUrl, setEditClsApiKey, setEditClsModel, setEditClsSystemPrompt,
      setEditClsPrompt, setEditClsCategories, setEditClsCategoryField, setEditClsOutputVar,
      // Data hygiene + dataset diffs (Phase 4)
      setEditDedupeFields, setEditDedupeKeep,
      setEditCompareWith, setEditCompareKey, setEditCompareFields, setEditCompareMode,
      // AI (Phase 4)
      setEditExtractBaseUrl, setEditExtractApiKey, setEditExtractCredentialId, setEditExtractModel,
      setEditExtractSystemPrompt, setEditExtractPrompt, setEditExtractSchema,
      setEditExtractMode, setEditExtractOutputVar,
      setEditSentBaseUrl, setEditSentApiKey, setEditSentCredentialId, setEditSentModel,
      setEditSentSystemPrompt, setEditSentPrompt, setEditSentLabels,
      setEditSentLabelField, setEditSentScoreField, setEditSentOutputVar,
      // Phase 6 — SQLite.
      setEditSqliteQueryDbPath, setEditSqliteQuerySql, setEditSqliteQueryParams,
      setEditSqliteExecDbPath, setEditSqliteExecSql, setEditSqliteExecParams,
      // Phase 11 — parsing nodes, integrations and flow control.
      setEditXmlSource, setEditXmlRoot,
      setEditHtmlSource, setEditHtmlSelector, setEditHtmlAttr,
      setEditRssUrl, setEditRssLimit,
      setEditEmailSmtpHost, setEditEmailSmtpPort, setEditEmailUsername, setEditEmailPassword,
      setEditEmailFrom, setEditEmailTo, setEditEmailSubject, setEditEmailBody, setEditEmailIsHtml,
      setEditSlackWebhookUrl, setEditSlackText, setEditSlackChannel, setEditSlackBotName,
      setEditDiscordWebhookUrl, setEditDiscordContent, setEditDiscordBotName,
      setEditNotionOperation, setEditNotionToken, setEditNotionDatabaseId, setEditNotionPageId,
      setEditNotionTitle, setEditNotionProperties, setEditNotionFilter,
      setEditAirtableOperation, setEditAirtableApiKey, setEditAirtableBaseId,
      setEditAirtableTable, setEditAirtableRecordId, setEditAirtableFields,
      setEditStopErrorMessage,
      // n8n Core nodes.
      setEditSplitOutField, setEditSplitOutInclude, setEditSplitOutIncludeFields, setEditSplitOutDestination,
      setEditSummarizeGroupBy, setEditSummarizeAggregations, setEditSummarizeSeparator,
      setEditRenameKeysRules, setEditRenameKeysMode, setEditRenameKeysKeepOnly, setEditRenameKeysDeep,
      setEditMarkdownMode, setEditMarkdownSource, setEditMarkdownTarget,
      setEditCryptoAction, setEditCryptoAlgorithm, setEditCryptoEncoding, setEditCryptoValue,
      setEditCryptoSecret, setEditCryptoLength, setEditCryptoTarget,
      setEditReadFilePath, setEditReadFileEncoding, setEditReadFileTarget,
      setEditWriteFilePath, setEditWriteFileContent, setEditWriteFileEncoding, setEditWriteFileAppend
    });
  }, [editingNode, selectedProjectDetail]);

  return {
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
    editExcelPath, setEditExcelPath,
    editExcelHeader, setEditExcelHeader,
    editExcelValues, setEditExcelValues,
    editExcelDelimiter, setEditExcelDelimiter,
    editExcelOverwrite, setEditExcelOverwrite,
    editExcelFormat, setEditExcelFormat,

    // New n8n states
    editWebhookPath, setEditWebhookPath,
    editWebhookMethod, setEditWebhookMethod,
    editPollingUrl, setEditPollingUrl,
    editPollingMethod, setEditPollingMethod,
    editPollingHeaders, setEditPollingHeaders,
    editPollingBody, setEditPollingBody,
    editPollingInterval, setEditPollingInterval,
    editHttpRequestMethod, setEditHttpRequestMethod,
    editHttpRequestUrl, setEditHttpRequestUrl,
    editHttpRequestHeaders, setEditHttpRequestHeaders,
    editHttpRequestBody, setEditHttpRequestBody,
    editHttpRequestOutputVar, setEditHttpRequestOutputVar,
    editSwitchField, setEditSwitchField,
    editSwitchCases, setEditSwitchCases,
    editMergeMode, setEditMergeMode,
    editWaitSeconds, setEditWaitSeconds,
    editWaitResumeOn, setEditWaitResumeOn,
    editCodeLanguage, setEditCodeLanguage,
    editCodeContent, setEditCodeContent,
    editCodeOutputVar, setEditCodeOutputVar,
    editErrorHandlerAction, setEditErrorHandlerAction,
    editErrorHandlerMaxRetries, setEditErrorHandlerMaxRetries,
    editTriggerSchedule, setEditTriggerSchedule,
    editCronSchedule, setEditCronSchedule,
    editFileChangePath, setEditFileChangePath,
    editFileChangeEvent, setEditFileChangeEvent,
    editHotkeyTriggerShortcut, setEditHotkeyTriggerShortcut,
    editScrollY, setEditScrollY,
    editNotes, setEditNotes,
    editSubWorkflowId, setEditSubWorkflowId,
    editSubWorkflowName, setEditSubWorkflowName,
    editSubWorkflowProject, setEditSubWorkflowProject,
    editStartupMode, setEditStartupMode,
    editStartupAppExe, setEditStartupAppExe,
    editStartupDelay, setEditStartupDelay,

    // Data transformation (Phase 3)
    editFilterCondition, setEditFilterCondition,
    editFilterMode, setEditFilterMode,
    editSortFields, setEditSortFields,
    editLimitSkip, setEditLimitSkip,
    editLimitMax, setEditLimitMax,
    editAggregateMode, setEditAggregateMode,
    editAggregateField, setEditAggregateField,
    editAggregateSeparator, setEditAggregateSeparator,
    editFieldsSet, setEditFieldsSet,
    editFieldsKeepOnly, setEditFieldsKeepOnly,
    editDateTimeOperation, setEditDateTimeOperation,
    editDateTimeField, setEditDateTimeField,
    editDateTimeFormat, setEditDateTimeFormat,
    editDateTimeUnit, setEditDateTimeUnit,
    editDateTimeAmount, setEditDateTimeAmount,
    editDateTimeCompareTo, setEditDateTimeCompareTo,
    editDateTimeResultField, setEditDateTimeResultField,

    // AI (Phase 3)
    editLlmBaseUrl, setEditLlmBaseUrl,
    editLlmApiKey, setEditLlmApiKey,
    editLlmModel, setEditLlmModel,
    editLlmSystemPrompt, setEditLlmSystemPrompt,
    editLlmPrompt, setEditLlmPrompt,
    editLlmTemperature, setEditLlmTemperature,
    editLlmMaxTokens, setEditLlmMaxTokens,
    editLlmResultField, setEditLlmResultField,
    editLlmOutputVar, setEditLlmOutputVar,
    editClsBaseUrl, setEditClsBaseUrl,
    editClsApiKey, setEditClsApiKey,
    editClsModel, setEditClsModel,
    editClsSystemPrompt, setEditClsSystemPrompt,
    editClsPrompt, setEditClsPrompt,
    editClsCategories, setEditClsCategories,
    editClsCategoryField, setEditClsCategoryField,
    editClsOutputVar, setEditClsOutputVar,
    // Phase 4
    editDedupeFields, setEditDedupeFields,
    editDedupeKeep, setEditDedupeKeep,
    editCompareWith, setEditCompareWith,
    editCompareKey, setEditCompareKey,
    editCompareFields, setEditCompareFields,
    editCompareMode, setEditCompareMode,
    editExtractBaseUrl, setEditExtractBaseUrl,
    editExtractApiKey, setEditExtractApiKey,
    editExtractCredentialId, setEditExtractCredentialId,
    editExtractModel, setEditExtractModel,
    editExtractSystemPrompt, setEditExtractSystemPrompt,
    editExtractPrompt, setEditExtractPrompt,
    editExtractSchema, setEditExtractSchema,
    editExtractMode, setEditExtractMode,
    editExtractOutputVar, setEditExtractOutputVar,
    editSentBaseUrl, setEditSentBaseUrl,
    editSentApiKey, setEditSentApiKey,
    editSentCredentialId, setEditSentCredentialId,
    editSentModel, setEditSentModel,
    editSentSystemPrompt, setEditSentSystemPrompt,
    editSentPrompt, setEditSentPrompt,
    editSentLabels, setEditSentLabels,
    editSentLabelField, setEditSentLabelField,
    editSentScoreField, setEditSentScoreField,
    editSentOutputVar, setEditSentOutputVar,
    // Phase 6 — SQLite.
    editSqliteQueryDbPath, setEditSqliteQueryDbPath,
    editSqliteQuerySql, setEditSqliteQuerySql,
    editSqliteQueryParams, setEditSqliteQueryParams,
    editSqliteExecDbPath, setEditSqliteExecDbPath,
    editSqliteExecSql, setEditSqliteExecSql,
    editSqliteExecParams, setEditSqliteExecParams,
    // Phase 11 — parsing nodes.
    editXmlSource, setEditXmlSource,
    editXmlRoot, setEditXmlRoot,
    editHtmlSource, setEditHtmlSource,
    editHtmlSelector, setEditHtmlSelector,
    editHtmlAttr, setEditHtmlAttr,
    editRssUrl, setEditRssUrl,
    editRssLimit, setEditRssLimit,
    // Phase 11 — integrations.
    editEmailSmtpHost, setEditEmailSmtpHost,
    editEmailSmtpPort, setEditEmailSmtpPort,
    editEmailUsername, setEditEmailUsername,
    editEmailPassword, setEditEmailPassword,
    editEmailFrom, setEditEmailFrom,
    editEmailTo, setEditEmailTo,
    editEmailSubject, setEditEmailSubject,
    editEmailBody, setEditEmailBody,
    editEmailIsHtml, setEditEmailIsHtml,
    editSlackWebhookUrl, setEditSlackWebhookUrl,
    editSlackText, setEditSlackText,
    editSlackChannel, setEditSlackChannel,
    editSlackBotName, setEditSlackBotName,
    editDiscordWebhookUrl, setEditDiscordWebhookUrl,
    editDiscordContent, setEditDiscordContent,
    editDiscordBotName, setEditDiscordBotName,
    editNotionOperation, setEditNotionOperation,
    editNotionToken, setEditNotionToken,
    editNotionDatabaseId, setEditNotionDatabaseId,
    editNotionPageId, setEditNotionPageId,
    editNotionTitle, setEditNotionTitle,
    editNotionProperties, setEditNotionProperties,
    editNotionFilter, setEditNotionFilter,
    editAirtableOperation, setEditAirtableOperation,
    editAirtableApiKey, setEditAirtableApiKey,
    editAirtableBaseId, setEditAirtableBaseId,
    editAirtableTable, setEditAirtableTable,
    editAirtableRecordId, setEditAirtableRecordId,
    editAirtableFields, setEditAirtableFields,
    // Phase 11 — flow control.
    editStopErrorMessage, setEditStopErrorMessage,
    // n8n Core nodes.
    editSplitOutField, setEditSplitOutField,
    editSplitOutInclude, setEditSplitOutInclude,
    editSplitOutIncludeFields, setEditSplitOutIncludeFields,
    editSplitOutDestination, setEditSplitOutDestination,
    editSummarizeGroupBy, setEditSummarizeGroupBy,
    editSummarizeAggregations, setEditSummarizeAggregations,
    editSummarizeSeparator, setEditSummarizeSeparator,
    editRenameKeysRules, setEditRenameKeysRules,
    editRenameKeysMode, setEditRenameKeysMode,
    editRenameKeysKeepOnly, setEditRenameKeysKeepOnly,
    editRenameKeysDeep, setEditRenameKeysDeep,
    editMarkdownMode, setEditMarkdownMode,
    editMarkdownSource, setEditMarkdownSource,
    editMarkdownTarget, setEditMarkdownTarget,
    editCryptoAction, setEditCryptoAction,
    editCryptoAlgorithm, setEditCryptoAlgorithm,
    editCryptoEncoding, setEditCryptoEncoding,
    editCryptoValue, setEditCryptoValue,
    editCryptoSecret, setEditCryptoSecret,
    editCryptoLength, setEditCryptoLength,
    editCryptoTarget, setEditCryptoTarget,
    editReadFilePath, setEditReadFilePath,
    editReadFileEncoding, setEditReadFileEncoding,
    editReadFileTarget, setEditReadFileTarget,
    editWriteFilePath, setEditWriteFilePath,
    editWriteFileContent, setEditWriteFileContent,
    editWriteFileEncoding, setEditWriteFileEncoding,
    editWriteFileAppend, setEditWriteFileAppend
  };
}
export default useFlowchartEditState;
