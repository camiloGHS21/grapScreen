import { FlowNode, AutomationDetail } from "../../../types";

export interface NodeStatePopulatorTarget {
  setEditX: (v: number) => void;
  setEditY: (v: number) => void;
  setEditText: (v: string) => void;
  setEditSeconds: (v: number) => void;
  setEditAppExe: (v: string) => void;
  setEditAppTitle: (v: string) => void;
  setEditAppClass: (v: string) => void;
  setEditAppName: (v: string) => void;
  setEditScrollY: (v: number) => void;
  setEditHotkeyKeys: (v: string) => void;
  setEditOpenAppExe: (v: string) => void;
  setEditCloseAppName: (v: string) => void;
  setEditWaitImageDesc: (v: string) => void;
  setEditWaitImageTimeout: (v: number) => void;
  setEditVarName: (v: string) => void;
  setEditVarValue: (v: string) => void;
  setEditScreenshotName: (v: string) => void;
  setEditRunCmd: (v: string) => void;
  setEditRunCmdArgs: (v: string) => void;
  setEditConditionDesc: (v: string) => void;
  setEditConditionType: (v: "pixel" | "text" | "image" | "expression") => void;
  setEditConditionExpression: (v: string) => void;
  setEditLoopIterations: (v: number) => void;
  setEditSplitArrayVar: (v: string) => void;
  setEditSplitBatchSize: (v: number) => void;
  setEditSheetSpreadsheetId: (v: string) => void;
  setEditSheetRange: (v: string) => void;
  setEditSheetValues: (v: string) => void;
  setEditExcelPath: (v: string) => void;
  setEditExcelHeader: (v: string) => void;
  setEditExcelValues: (v: string) => void;
  setEditExcelDelimiter: (v: string) => void;
  setEditExcelOverwrite: (v: boolean) => void;
  setEditExcelFormat: (v: string) => void;
  setEditDocDocumentId: (v: string) => void;
  setEditDocText: (v: string) => void;
  setEditWhatsappTo: (v: string) => void;
  setEditWhatsappMessage: (v: string) => void;
  setEditWhatsappApiType: (v: "web" | "api") => void;
  setEditTelegramMessage: (v: string) => void;
  setEditTelegramChatId: (v: string) => void;
  setEditCredentialId?: (v: string) => void;
  setEditAiAgentPrompt: (v: string) => void;
  setEditAiAgentSystemPrompt: (v: string) => void;
  setEditAiAgentProvider?: (v: string) => void;
  setEditAiAgentModel: (v: string) => void;
  setEditAiAgentOutputVar: (v: string) => void;
  setEditAiAgentEnableTools?: (v: any) => void;
  setEditAiAgentMaxIterations?: (v: number) => void;
  setEditWebhookPath: (v: string) => void;
  setEditWebhookMethod: (v: string) => void;
  setEditPollingUrl?: (v: string) => void;
  setEditPollingMethod?: (v: string) => void;
  setEditPollingHeaders?: (v: string) => void;
  setEditPollingBody?: (v: string) => void;
  setEditPollingInterval?: (v: number) => void;
  setEditHttpRequestMethod: (v: string) => void;
  setEditHttpRequestUrl: (v: string) => void;
  setEditHttpRequestHeaders: (v: string) => void;
  setEditHttpRequestBody: (v: string) => void;
  setEditHttpRequestOutputVar: (v: string) => void;
  setEditSwitchField: (v: string) => void;
  setEditSwitchCases: (v: string) => void;
  setEditMergeMode: (v: string) => void;
  setEditWaitSeconds: (v: number) => void;
  setEditWaitResumeOn: (v: string) => void;
  setEditCodeLanguage: (v: string) => void;
  setEditCodeContent: (v: string) => void;
  setEditCodeOutputVar: (v: string) => void;
  setEditErrorHandlerAction: (v: string) => void;
  setEditErrorHandlerMaxRetries: (v: number) => void;
  setEditTriggerSchedule: (v: string) => void;
  setEditCronSchedule: (v: string) => void;
  setEditFileChangePath: (v: string) => void;
  setEditFileChangeEvent: (v: string) => void;
  setEditHotkeyTriggerShortcut: (v: string) => void;
  setEditNotes: (v: string) => void;
  setEditFormFields: (v: any[]) => void;
  setEditSubWorkflowId?: (v: string) => void;
  setEditSubWorkflowName?: (v: string) => void;
  setEditSubWorkflowProject?: (v: string) => void;
  setEditStartupMode?: (v: any) => void;
  setEditStartupAppExe?: (v: string) => void;
  setEditStartupDelay?: (v: number) => void;
  // Data transformation (Phase 3)
  setEditFilterCondition?: (v: string) => void;
  setEditFilterMode?: (v: string) => void;
  setEditSortFields?: (v: string) => void;
  setEditLimitSkip?: (v: number) => void;
  setEditLimitMax?: (v: number) => void;
  setEditAggregateMode?: (v: string) => void;
  setEditAggregateField?: (v: string) => void;
  setEditAggregateSeparator?: (v: string) => void;
  setEditFieldsSet?: (v: string) => void;
  setEditFieldsKeepOnly?: (v: string) => void;
  setEditDateTimeOperation?: (v: string) => void;
  setEditDateTimeField?: (v: string) => void;
  setEditDateTimeFormat?: (v: string) => void;
  setEditDateTimeUnit?: (v: string) => void;
  setEditDateTimeAmount?: (v: number) => void;
  setEditDateTimeCompareTo?: (v: string) => void;
  setEditDateTimeResultField?: (v: string) => void;
  // AI (Phase 3)
  setEditLlmBaseUrl?: (v: string) => void;
  setEditLlmApiKey?: (v: string) => void;
  setEditLlmModel?: (v: string) => void;
  setEditLlmSystemPrompt?: (v: string) => void;
  setEditLlmPrompt?: (v: string) => void;
  setEditLlmTemperature?: (v: number) => void;
  setEditLlmMaxTokens?: (v: number) => void;
  setEditLlmResultField?: (v: string) => void;
  setEditLlmOutputVar?: (v: string) => void;
  setEditClsBaseUrl?: (v: string) => void;
  setEditClsApiKey?: (v: string) => void;
  setEditClsModel?: (v: string) => void;
  setEditClsSystemPrompt?: (v: string) => void;
  setEditClsPrompt?: (v: string) => void;
  setEditClsCategories?: (v: string[]) => void;
  setEditClsCategoryField?: (v: string) => void;
  setEditClsOutputVar?: (v: string) => void;
  // Data hygiene + dataset diffs (Phase 4)
  setEditDedupeFields?: (v: string) => void;
  setEditDedupeKeep?: (v: string) => void;
  setEditCompareWith?: (v: string) => void;
  setEditCompareKey?: (v: string) => void;
  setEditCompareFields?: (v: string) => void;
  setEditCompareMode?: (v: string) => void;
  // AI (Phase 4)
  setEditExtractBaseUrl?: (v: string) => void;
  setEditExtractApiKey?: (v: string) => void;
  setEditExtractCredentialId?: (v: string) => void;
  setEditExtractModel?: (v: string) => void;
  setEditExtractSystemPrompt?: (v: string) => void;
  setEditExtractPrompt?: (v: string) => void;
  setEditExtractSchema?: (v: string) => void;
  setEditExtractMode?: (v: string) => void;
  setEditExtractOutputVar?: (v: string) => void;
  setEditSentBaseUrl?: (v: string) => void;
  setEditSentApiKey?: (v: string) => void;
  setEditSentCredentialId?: (v: string) => void;
  setEditSentModel?: (v: string) => void;
  setEditSentSystemPrompt?: (v: string) => void;
  setEditSentPrompt?: (v: string) => void;
  setEditSentLabels?: (v: string) => void;
  setEditSentLabelField?: (v: string) => void;
  setEditSentScoreField?: (v: string) => void;
  setEditSentOutputVar?: (v: string) => void;
  // Phase 6 — SQLite.
  setEditSqliteQueryDbPath?: (v: string) => void;
  setEditSqliteQuerySql?: (v: string) => void;
  setEditSqliteQueryParams?: (v: string) => void;
  setEditSqliteExecDbPath?: (v: string) => void;
  setEditSqliteExecSql?: (v: string) => void;
  setEditSqliteExecParams?: (v: string) => void;
  // Phase 11 — parsing nodes.
  setEditXmlSource?: (v: string) => void;
  setEditXmlRoot?: (v: string) => void;
  setEditHtmlSource?: (v: string) => void;
  setEditHtmlSelector?: (v: string) => void;
  setEditHtmlAttr?: (v: string) => void;
  setEditRssUrl?: (v: string) => void;
  setEditRssLimit?: (v: number) => void;
  // Phase 11 — integrations.
  setEditEmailSmtpHost?: (v: string) => void;
  setEditEmailSmtpPort?: (v: number) => void;
  setEditEmailUsername?: (v: string) => void;
  setEditEmailPassword?: (v: string) => void;
  setEditEmailFrom?: (v: string) => void;
  setEditEmailTo?: (v: string) => void;
  setEditEmailSubject?: (v: string) => void;
  setEditEmailBody?: (v: string) => void;
  setEditEmailIsHtml?: (v: boolean) => void;
  setEditSlackWebhookUrl?: (v: string) => void;
  setEditSlackText?: (v: string) => void;
  setEditSlackChannel?: (v: string) => void;
  setEditSlackBotName?: (v: string) => void;
  setEditDiscordWebhookUrl?: (v: string) => void;
  setEditDiscordContent?: (v: string) => void;
  setEditDiscordBotName?: (v: string) => void;
  setEditNotionOperation?: (v: string) => void;
  setEditNotionToken?: (v: string) => void;
  setEditNotionDatabaseId?: (v: string) => void;
  setEditNotionPageId?: (v: string) => void;
  setEditNotionTitle?: (v: string) => void;
  setEditNotionProperties?: (v: string) => void;
  setEditNotionFilter?: (v: string) => void;
  setEditAirtableOperation?: (v: string) => void;
  setEditAirtableApiKey?: (v: string) => void;
  setEditAirtableBaseId?: (v: string) => void;
  setEditAirtableTable?: (v: string) => void;
  setEditAirtableRecordId?: (v: string) => void;
  setEditAirtableFields?: (v: string) => void;
  // Phase 11 — flow control.
  setEditStopErrorMessage?: (v: string) => void;
  // n8n Core nodes.
  setEditSplitOutField?: (v: string) => void;
  setEditSplitOutInclude?: (v: string) => void;
  setEditSplitOutIncludeFields?: (v: string) => void;
  setEditSplitOutDestination?: (v: string) => void;
  setEditSummarizeGroupBy?: (v: string) => void;
  setEditSummarizeAggregations?: (v: any[]) => void;
  setEditSummarizeSeparator?: (v: string) => void;
  setEditRenameKeysRules?: (v: any[]) => void;
  setEditRenameKeysMode?: (v: string) => void;
  setEditRenameKeysKeepOnly?: (v: boolean) => void;
  setEditRenameKeysDeep?: (v: boolean) => void;
  setEditMarkdownMode?: (v: string) => void;
  setEditMarkdownSource?: (v: string) => void;
  setEditMarkdownTarget?: (v: string) => void;
  setEditCryptoAction?: (v: string) => void;
  setEditCryptoAlgorithm?: (v: string) => void;
  setEditCryptoEncoding?: (v: string) => void;
  setEditCryptoValue?: (v: string) => void;
  setEditCryptoSecret?: (v: string) => void;
  setEditCryptoLength?: (v: number) => void;
  setEditCryptoTarget?: (v: string) => void;
  setEditReadFilePath?: (v: string) => void;
  setEditReadFileEncoding?: (v: string) => void;
  setEditReadFileTarget?: (v: string) => void;
  setEditWriteFilePath?: (v: string) => void;
  setEditWriteFileContent?: (v: string) => void;
  setEditWriteFileEncoding?: (v: string) => void;
  setEditWriteFileAppend?: (v: boolean) => void;
}

export function populateNodeState(
  editingNode: { node: FlowNode; eventIndex: number; rangeStart?: number; rangeEnd?: number } | null,
  selectedProjectDetail: AutomationDetail | null,
  t: NodeStatePopulatorTarget
) {
  if (!editingNode) return;
  const node = editingNode.node;
  if (node.type === "click") {
    let mmIdx = -1;
    if (selectedProjectDetail && editingNode.eventIndex !== -1) {
      for (let j = editingNode.eventIndex - 1; j >= 0; j--) {
        if (selectedProjectDetail.events[j].kind === "mouse_move") {
          mmIdx = j;
          break;
        }
      }
      if (mmIdx !== -1) {
        t.setEditX(selectedProjectDetail.events[mmIdx].data.x || 0);
        t.setEditY(selectedProjectDetail.events[mmIdx].data.y || 0);
      }
    }
  } else if (node.type === "type") {
    if (selectedProjectDetail && editingNode.rangeStart !== undefined && editingNode.rangeEnd !== undefined) {
      let text = "";
      for (let k = editingNode.rangeStart; k <= editingNode.rangeEnd; k++) {
        const ev = selectedProjectDetail.events[k];
        if (ev && ev.kind === "key_press") {
          const key = ev.data.key;
          if (key) {
            if (key.startsWith("Key")) text += key.replace("Key", "").toLowerCase();
            else if (key === "Space") text += " ";
            else if (key === "Return") text += "\n";
          }
        }
      }
      t.setEditText(text);
    }
  } else if (node.type === "delay") {
    const secs = parseFloat(node.details.replace("s", ""));
    t.setEditSeconds(isNaN(secs) ? 0 : secs);
  } else if (node.type === "app") {
    t.setEditAppExe(node.app?.exe || "");
    t.setEditAppTitle(node.app?.title || "");
    t.setEditAppClass(node.app?.class || "");
    t.setEditAppName(node.app?.name || "");
  } else if (selectedProjectDetail && editingNode.eventIndex !== -1) {
    const ev = selectedProjectDetail.events[editingNode.eventIndex];
    if (ev) {
      t.setEditCredentialId?.(ev.data.credential_id || "");
      if (node.type === "scroll") t.setEditScrollY(ev.data.y ?? -120);
      else if (node.type === "hotkey") t.setEditHotkeyKeys(ev.data.keys || ev.data.key || "");
      else if (node.type === "open_app") t.setEditOpenAppExe(ev.data.exe || "");
      else if (node.type === "close_app") t.setEditCloseAppName(ev.data.name || "");
      else if (node.type === "wait_image") { t.setEditWaitImageDesc(ev.data.description || ""); t.setEditWaitImageTimeout(ev.data.timeout || 10); }
      else if (node.type === "set_var") { t.setEditVarName(ev.data.name || ""); t.setEditVarValue(ev.data.value || ""); }
      else if (node.type === "screenshot") t.setEditScreenshotName(ev.data.filename || "captura.png");
      else if (node.type === "run_cmd") { t.setEditRunCmd(ev.data.command || ""); t.setEditRunCmdArgs(ev.data.args || ""); }
      else if (node.type === "condition") { t.setEditConditionDesc(ev.data.description || ""); t.setEditConditionType(ev.data.condition_type || "expression"); t.setEditConditionExpression(ev.data.expression || '{{ variable }} == "valor"'); }
      else if (node.type === "loop") t.setEditLoopIterations(ev.data.iterations || 3);
      else if (node.type === "split_batches") { t.setEditSplitArrayVar(ev.data.array_var || "items"); t.setEditSplitBatchSize(ev.data.batch_size || 1); }
      else if (node.type === "google_sheets") { t.setEditSheetSpreadsheetId(ev.data.spreadsheet_id || ""); t.setEditSheetRange(ev.data.range || "Sheet1!A:Z"); t.setEditSheetValues(ev.data.values || ""); }
      else if (node.type === "excel_local") {
        t.setEditExcelPath(ev.data.file_path || "datos.xlsx"); t.setEditExcelHeader(ev.data.header || "");
        t.setEditExcelValues(ev.data.values || ""); t.setEditExcelDelimiter(ev.data.delimiter || ",");
        t.setEditExcelOverwrite(ev.data.overwrite || false); t.setEditExcelFormat(ev.data.format || "csv");
      }
      else if (node.type === "google_docs") { t.setEditDocDocumentId(ev.data.document_id || ""); t.setEditDocText(ev.data.text || ""); }
      else if (node.type === "whatsapp") { t.setEditWhatsappTo(ev.data.to || ""); t.setEditWhatsappMessage(ev.data.message || ""); t.setEditWhatsappApiType(ev.data.api_type || "web"); }
      else if (node.type === "telegram") { t.setEditTelegramMessage(ev.data.message || ""); t.setEditTelegramChatId(ev.data.chat_id || ""); }
      else if (node.type === "ai_agent") {
        t.setEditAiAgentPrompt(ev.data.prompt || "");
        t.setEditAiAgentSystemPrompt(ev.data.system_prompt || "Eres un asistente inteligente.");
        t.setEditAiAgentProvider?.(ev.data.provider || "openai");
        t.setEditAiAgentModel(ev.data.model || "gpt-4o-mini");
        t.setEditAiAgentOutputVar(ev.data.output_var || "ai_response");
        t.setEditAiAgentEnableTools?.(ev.data.enable_tools || ["ocr_scan_text", "rpa_click", "rpa_type_text", "get_workflow_var", "set_workflow_var"]);
        t.setEditAiAgentMaxIterations?.(ev.data.max_iterations || 5);
      }
      else if (node.type === "webhook") { t.setEditWebhookPath(ev.data.path || "/webhook"); t.setEditWebhookMethod(ev.data.method || "POST"); }
      else if (node.type === "polling") {
        t.setEditPollingUrl?.(ev.data.url || "");
        t.setEditPollingMethod?.(ev.data.method || "GET");
        t.setEditPollingHeaders?.(ev.data.headers || "{}");
        t.setEditPollingBody?.(ev.data.body || "");
        const iv = typeof ev.data.interval === "number" ? ev.data.interval : parseInt(String(ev.data.interval ?? "60"), 10);
        t.setEditPollingInterval?.(Number.isFinite(iv) && iv > 0 ? iv : 60);
      }
      else if (node.type === "http_request") { t.setEditHttpRequestMethod(ev.data.method || "GET"); t.setEditHttpRequestUrl(ev.data.url || "https://api.example.com"); t.setEditHttpRequestHeaders(ev.data.headers || "{}"); t.setEditHttpRequestBody(ev.data.body || ""); t.setEditHttpRequestOutputVar(ev.data.output_var || "http_response"); }
      else if (node.type === "switch") { t.setEditSwitchField(ev.data.field || "status"); t.setEditSwitchCases(JSON.stringify(ev.data.cases || [], null, 2)); }
      else if (node.type === "merge") t.setEditMergeMode(ev.data.mode || "append");
      else if (node.type === "wait") { t.setEditWaitSeconds(ev.data.seconds || 5); t.setEditWaitResumeOn(ev.data.resume_on || "timeout"); }
      else if (node.type === "code") { t.setEditCodeLanguage(ev.data.language || "javascript"); t.setEditCodeContent(ev.data.code || "// Tu código aquí\nreturn items;"); t.setEditCodeOutputVar(ev.data.output_var || "code_output"); }
      else if (node.type === "error_handler") { t.setEditErrorHandlerAction(ev.data.action || "retry"); t.setEditErrorHandlerMaxRetries(ev.data.max_retries || 3); }
      else if (node.type === "trigger") t.setEditTriggerSchedule(ev.data.schedule || "manual");
      else if (node.type === "cron") t.setEditCronSchedule(ev.data.schedule || "1h");
      else if (node.type === "file_change") { t.setEditFileChangePath(ev.data.path || ""); t.setEditFileChangeEvent(ev.data.event || "Modify"); }
      else if (node.type === "hotkey_trigger") t.setEditHotkeyTriggerShortcut(ev.data.shortcut || "Ctrl+Alt+A");
      else if (node.type === "startup") { t.setEditStartupMode?.(ev.data.mode || "system"); t.setEditStartupAppExe?.(ev.data.exe || "chrome.exe"); t.setEditStartupDelay?.(ev.data.delay_seconds || 0); }
      else if (node.type === "sub_workflow") {
        t.setEditSubWorkflowId?.(ev.data.workflow_id || "");
        t.setEditSubWorkflowName?.(ev.data.workflow_name || "Sub-Flujo");
        t.setEditSubWorkflowProject?.(ev.data.project_name || "Default");
      }
      // Data transformation (Phase 3).
      else if (node.type === "filter") { t.setEditFilterCondition?.(ev.data.condition || "{{ $json.value }} > 0"); t.setEditFilterMode?.(ev.data.mode || "keep"); }
      else if (node.type === "sort") t.setEditSortFields?.(ev.data.fields || "created_at");
      else if (node.type === "limit") { t.setEditLimitSkip?.(ev.data.skip ?? 0); t.setEditLimitMax?.(ev.data.max_items ?? ev.data.maxItems ?? 10); }
      else if (node.type === "aggregate") { t.setEditAggregateMode?.(ev.data.mode || "list"); t.setEditAggregateField?.(ev.data.field || ""); t.setEditAggregateSeparator?.(ev.data.separator || ","); }
      else if (node.type === "edit_fields") { t.setEditFieldsSet?.(ev.data.set_fields || "{}"); t.setEditFieldsKeepOnly?.(ev.data.keep_only || ""); }
      else if (node.type === "date_time") {
        t.setEditDateTimeOperation?.(ev.data.operation || "format");
        t.setEditDateTimeField?.(ev.data.field || "created_at");
        t.setEditDateTimeFormat?.(ev.data.format || "%Y-%m-%d");
        t.setEditDateTimeUnit?.(ev.data.unit || "days");
        t.setEditDateTimeAmount?.(ev.data.amount ?? 0);
        t.setEditDateTimeCompareTo?.(ev.data.compare_to || "");
        t.setEditDateTimeResultField?.(ev.data.result_field || "");
      }
      // AI (Phase 3).
      else if (node.type === "llm_chain") {
        t.setEditLlmBaseUrl?.(ev.data.base_url || "");
        t.setEditLlmApiKey?.(ev.data.api_key || "");
        t.setEditLlmModel?.(ev.data.model || "gpt-4o-mini");
        t.setEditLlmSystemPrompt?.(ev.data.system_prompt || "");
        t.setEditLlmPrompt?.(ev.data.prompt || "");
        t.setEditLlmTemperature?.(ev.data.temperature ?? 0.7);
        t.setEditLlmMaxTokens?.(ev.data.max_tokens ?? 1024);
        t.setEditLlmResultField?.(ev.data.result_field || "text");
        t.setEditLlmOutputVar?.(ev.data.output_var || "ai_output");
      }
      else if (node.type === "classifier") {
        t.setEditClsBaseUrl?.(ev.data.base_url || "");
        t.setEditClsApiKey?.(ev.data.api_key || "");
        t.setEditClsModel?.(ev.data.model || "gpt-4o-mini");
        t.setEditClsSystemPrompt?.(ev.data.system_prompt || "");
        t.setEditClsPrompt?.(ev.data.prompt || "");
        t.setEditClsCategories?.(ev.data.categories || []);
        t.setEditClsCategoryField?.(ev.data.category_field || "category");
        t.setEditClsOutputVar?.(ev.data.output_var || "classification");
      }
      // Data hygiene + dataset diffs (Phase 4).
      else if (node.type === "remove_duplicates") {
        t.setEditDedupeFields?.(ev.data.fields || "");
        t.setEditDedupeKeep?.(ev.data.keep || "first");
      }
      else if (node.type === "compare_datasets") {
        t.setEditCompareWith?.(ev.data.compare_with || "");
        t.setEditCompareKey?.(ev.data.key || "id");
        t.setEditCompareFields?.(ev.data.compare_fields || "");
        t.setEditCompareMode?.(ev.data.mode || "all");
      }
      // AI (Phase 4).
      else if (node.type === "information_extractor") {
        t.setEditExtractBaseUrl?.(ev.data.base_url || "");
        t.setEditExtractApiKey?.(ev.data.api_key || "");
        t.setEditExtractCredentialId?.(ev.data.credential_id || "");
        t.setEditExtractModel?.(ev.data.model || "gpt-4o-mini");
        t.setEditExtractSystemPrompt?.(ev.data.system_prompt || "");
        t.setEditExtractPrompt?.(ev.data.prompt || "");
        t.setEditExtractSchema?.(ev.data.schema || "");
        t.setEditExtractMode?.(ev.data.mode || "merge");
        t.setEditExtractOutputVar?.(ev.data.output_var || "extracted");
      }
      else if (node.type === "sentiment_analysis") {
        t.setEditSentBaseUrl?.(ev.data.base_url || "");
        t.setEditSentApiKey?.(ev.data.api_key || "");
        t.setEditSentCredentialId?.(ev.data.credential_id || "");
        t.setEditSentModel?.(ev.data.model || "gpt-4o-mini");
        t.setEditSentSystemPrompt?.(ev.data.system_prompt || "");
        t.setEditSentPrompt?.(ev.data.prompt || "");
        t.setEditSentLabels?.(ev.data.labels || "positive,neutral,negative");
        t.setEditSentLabelField?.(ev.data.label_field || "sentiment");
        t.setEditSentScoreField?.(ev.data.score_field || "sentiment_score");
        t.setEditSentOutputVar?.(ev.data.output_var || "sentiment");
      }
      else if (node.type === "sqlite_query") {
        t.setEditSqliteQueryDbPath?.(ev.data.db_path || "datos.db");
        t.setEditSqliteQuerySql?.(ev.data.query || "SELECT * FROM tabla");
        t.setEditSqliteQueryParams?.(ev.data.params || "");
      }
      else if (node.type === "sqlite_execute") {
        t.setEditSqliteExecDbPath?.(ev.data.db_path || "datos.db");
        t.setEditSqliteExecSql?.(ev.data.query || "INSERT INTO tabla (nombre) VALUES (?)");
        t.setEditSqliteExecParams?.(ev.data.params || "[\"nuevo\"]");
      }
      // Phase 11 — parsing nodes.
      else if (node.type === "xml_parse") {
        t.setEditXmlSource?.(ev.data.source || "{{ $json.xml }}");
        t.setEditXmlRoot?.(ev.data.root || "");
      }
      else if (node.type === "html_extract") {
        t.setEditHtmlSource?.(ev.data.source || "{{ $json.html }}");
        t.setEditHtmlSelector?.(ev.data.selector || "a");
        t.setEditHtmlAttr?.(ev.data.attr || "href");
      }
      else if (node.type === "rss_read") {
        t.setEditRssUrl?.(ev.data.url || "");
        const lim = typeof ev.data.limit === "number" ? ev.data.limit : parseInt(String(ev.data.limit ?? "20"), 10);
        t.setEditRssLimit?.(Number.isFinite(lim) && lim > 0 ? lim : 20);
      }
      // Phase 11 — integrations.
      else if (node.type === "send_email") {
        t.setEditEmailSmtpHost?.(ev.data.smtp_host || "smtp.gmail.com");
        const port = typeof ev.data.smtp_port === "number" ? ev.data.smtp_port : parseInt(String(ev.data.smtp_port ?? "587"), 10);
        t.setEditEmailSmtpPort?.(Number.isFinite(port) && port > 0 ? port : 587);
        t.setEditEmailUsername?.(ev.data.username || "");
        t.setEditEmailPassword?.(ev.data.password || "");
        t.setEditEmailFrom?.(ev.data.from_email || "");
        t.setEditEmailTo?.(ev.data.to_email || "");
        t.setEditEmailSubject?.(ev.data.subject || "");
        t.setEditEmailBody?.(ev.data.body || "");
        t.setEditEmailIsHtml?.(ev.data.is_html === true);
      }
      else if (node.type === "slack_webhook") {
        t.setEditSlackWebhookUrl?.(ev.data.webhook_url || "");
        t.setEditSlackText?.(ev.data.text || "");
        t.setEditSlackChannel?.(ev.data.channel || "");
        t.setEditSlackBotName?.(ev.data.bot_name || "");
      }
      else if (node.type === "discord_webhook") {
        t.setEditDiscordWebhookUrl?.(ev.data.webhook_url || "");
        t.setEditDiscordContent?.(ev.data.content || "");
        t.setEditDiscordBotName?.(ev.data.bot_name || "");
      }
      else if (node.type === "notion") {
        t.setEditNotionOperation?.(ev.data.operation || "query_database");
        t.setEditNotionToken?.(ev.data.token || "");
        t.setEditNotionDatabaseId?.(ev.data.database_id || "");
        t.setEditNotionPageId?.(ev.data.page_id || "");
        t.setEditNotionTitle?.(ev.data.title || "");
        t.setEditNotionProperties?.(ev.data.properties_json || "");
        t.setEditNotionFilter?.(ev.data.filter_json || "");
      }
      else if (node.type === "airtable") {
        t.setEditAirtableOperation?.(ev.data.operation || "list");
        t.setEditAirtableApiKey?.(ev.data.api_key || "");
        t.setEditAirtableBaseId?.(ev.data.base_id || "");
        t.setEditAirtableTable?.(ev.data.table || "");
        t.setEditAirtableRecordId?.(ev.data.record_id || "");
        t.setEditAirtableFields?.(ev.data.fields_json || "");
      }
      // Phase 11 — flow control.
      else if (node.type === "stop_error") {
        t.setEditStopErrorMessage?.(ev.data.message || "");
      }
      // n8n Core nodes.
      else if (node.type === "split_out") {
        t.setEditSplitOutField?.(ev.data.field || "items");
        t.setEditSplitOutInclude?.(ev.data.include || "all");
        t.setEditSplitOutIncludeFields?.(ev.data.include_fields || "");
        t.setEditSplitOutDestination?.(ev.data.destination_field || "");
      }
      else if (node.type === "summarize") {
        t.setEditSummarizeGroupBy?.(ev.data.group_by || "");
        // Guard the array shape: a hand-edited automation could hold anything.
        t.setEditSummarizeAggregations?.(
          Array.isArray(ev.data.aggregations) && ev.data.aggregations.length
            ? ev.data.aggregations
            : [{ operation: "count", field: "", output_field: "" }]
        );
        t.setEditSummarizeSeparator?.(ev.data.separator ?? ", ");
      }
      else if (node.type === "rename_keys") {
        t.setEditRenameKeysRules?.(
          Array.isArray(ev.data.renames) && ev.data.renames.length
            ? ev.data.renames
            : [{ from: "", to: "" }]
        );
        t.setEditRenameKeysMode?.(ev.data.mode || "plain");
        t.setEditRenameKeysKeepOnly?.(!!ev.data.keep_only);
        t.setEditRenameKeysDeep?.(!!ev.data.deep);
      }
      else if (node.type === "markdown") {
        t.setEditMarkdownMode?.(ev.data.mode || "markdown_to_html");
        t.setEditMarkdownSource?.(ev.data.source || "");
        t.setEditMarkdownTarget?.(ev.data.target_field || "data");
      }
      else if (node.type === "crypto") {
        t.setEditCryptoAction?.(ev.data.action || "hash");
        t.setEditCryptoAlgorithm?.(ev.data.algorithm || "SHA256");
        t.setEditCryptoEncoding?.(ev.data.encoding || "hex");
        t.setEditCryptoValue?.(ev.data.value || "");
        t.setEditCryptoSecret?.(ev.data.secret || "");
        t.setEditCryptoLength?.(typeof ev.data.length === "number" ? ev.data.length : 32);
        t.setEditCryptoTarget?.(ev.data.target_field || "data");
      }
      else if (node.type === "read_file") {
        t.setEditReadFilePath?.(ev.data.file_path || "");
        t.setEditReadFileEncoding?.(ev.data.encoding || "utf8");
        t.setEditReadFileTarget?.(ev.data.target_field || "data");
      }
      else if (node.type === "write_file") {
        t.setEditWriteFilePath?.(ev.data.file_path || "");
        t.setEditWriteFileContent?.(ev.data.content || "");
        t.setEditWriteFileEncoding?.(ev.data.encoding || "utf8");
        t.setEditWriteFileAppend?.(!!ev.data.append);
      }

      if (ev && ev.data) t.setEditNotes(ev.data.notes || "");
      if (node.type === "form") t.setEditFormFields(ev.data.fields || []);
    }
  }
}
