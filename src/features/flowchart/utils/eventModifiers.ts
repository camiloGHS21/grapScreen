import { FlowNode, RecordedEvent } from "../../../types";

export function buildAddedEvents(type: FlowNode["type"], baseTime: number, evs: RecordedEvent[], insertAt: number): RecordedEvent[] {
  const markManual = (ev: RecordedEvent): RecordedEvent => ({
    ...ev,
    data: { ...ev.data, __manual: true },
  });

  if (type === "delay") return [markManual({ at_ms: baseTime + 200, kind: "delay", data: { seconds: 1 } })];

  if (type === "type") {
    const text = "texto";
    let t = baseTime + 200;
    const added: RecordedEvent[] = [];
    for (const ch of text) {
      const key = ch === " " ? "Space" : "Key" + ch.toUpperCase();
      added.push(markManual({ at_ms: t, kind: "key_press", data: { key } }));
      added.push(markManual({ at_ms: t + 20, kind: "key_release", data: { key } }));
      t += 60;
    }
    return added;
  }
  if (type === "click") {
    const t = baseTime + 200;
    return [
      markManual({ at_ms: t, kind: "mouse_move", data: { x: 400, y: 300 } }),
      markManual({ at_ms: t + 10, kind: "button_press", data: { button: "Left" } }),
      markManual({ at_ms: t + 50, kind: "button_release", data: { button: "Left" } }),
    ];
  }
  if (type === "scroll") return [markManual({ at_ms: baseTime + 200, kind: "wheel", data: { x: 0, y: -120 } })];
  if (type === "hotkey") return [markManual({ at_ms: baseTime + 200, kind: "hotkey", data: { keys: "Ctrl+C" } })];
  if (type === "open_app") return [markManual({ at_ms: baseTime + 200, kind: "open_app", data: { exe: "notepad.exe" } })];
  if (type === "close_app") return [markManual({ at_ms: baseTime + 200, kind: "close_app", data: { name: "Notepad" } })];
  if (type === "wait_image") return [markManual({ at_ms: baseTime + 200, kind: "wait_image", data: { description: "Esperar botón", timeout: 10 } })];
  if (type === "set_var") return [markManual({ at_ms: baseTime + 200, kind: "set_var", data: { name: "variable", value: "valor" } })];
  if (type === "screenshot") return [markManual({ at_ms: baseTime + 200, kind: "screenshot", data: { filename: "captura.png" } })];
  if (type === "run_cmd") return [markManual({ at_ms: baseTime + 200, kind: "run_cmd", data: { command: "ping google.com", args: "" } })];
  if (type === "condition") return [markManual({ at_ms: baseTime + 200, kind: "condition", data: { description: "", condition_type: "expression", expression: '{{ variable }} == "valor"' } })];
  if (type === "loop") return [markManual({ at_ms: baseTime + 200, kind: "loop_start", data: { iterations: 3 } })];
  if (type === "split_batches") return [markManual({ at_ms: baseTime + 200, kind: "split_batches", data: { array_var: "items", batch_size: 1 } })];
  if (type === "google_sheets") return [markManual({ at_ms: baseTime + 200, kind: "google_sheets", data: { spreadsheet_id: "", range: "Sheet1!A:Z", values: "" } })];
  if (type === "excel_local") return [markManual({ at_ms: baseTime + 200, kind: "excel_local", data: { file_path: "datos.xlsx", header: "[\"Nombre\",\"Email\",\"Telefono\"]", values: "[[\"{{ nombre }}\",\"{{ email }}\",\"{{ telefono }}\"]]", delimiter: ",", overwrite: false } })];
  if (type === "google_docs") return [markManual({ at_ms: baseTime + 200, kind: "google_docs", data: { document_id: "", text: "" } })];
  if (type === "whatsapp") return [markManual({ at_ms: baseTime + 200, kind: "whatsapp", data: { to: "", message: "", api_type: "web" } })];
  if (type === "telegram") return [markManual({ at_ms: baseTime + 200, kind: "telegram", data: { message: "", chat_id: "" } })];
  if (type === "ai_agent") return [markManual({ at_ms: baseTime + 200, kind: "ai_agent", data: { prompt: "", system_prompt: "Eres un asistente inteligente.", provider: "openai", model: "gpt-4o-mini", output_var: "ai_response", enable_tools: ["ocr_scan_text", "rpa_click", "rpa_type_text", "get_workflow_var", "set_workflow_var"], max_iterations: 5 } })];
  // New n8n-level node types
  if (type === "trigger" || type === "start") return [markManual({ at_ms: baseTime + 200, kind: "trigger", data: { schedule: "manual", description: "Inicio" } })];
  if (type === "startup") return [markManual({ at_ms: baseTime + 200, kind: "startup", data: { mode: "system", delay_seconds: 0 } })];
  if (type === "webhook") return [markManual({ at_ms: baseTime + 200, kind: "webhook", data: { path: "/webhook", method: "POST" } })];
  if (type === "polling") return [markManual({ at_ms: baseTime + 200, kind: "polling", data: { url: "", method: "GET", headers: "{}", body: "", interval: 60 } })];
  if (type === "http_request") return [markManual({ at_ms: baseTime + 200, kind: "http_request", data: { method: "GET", url: "https://api.example.com", headers: "{}", body: "", output_var: "http_response" } })];
  if (type === "switch") return [markManual({ at_ms: baseTime + 200, kind: "switch", data: { field: "status", cases: [{ value: "ok", output: 0 }, { value: "error", output: 1 }] } })];
  if (type === "merge") return [markManual({ at_ms: baseTime + 200, kind: "merge", data: { mode: "append" } })];
  if (type === "wait") return [markManual({ at_ms: baseTime + 200, kind: "wait", data: { seconds: 5, resume_on: "timeout" } })];
  if (type === "code") return [markManual({ at_ms: baseTime + 200, kind: "code", data: { language: "javascript", code: "// Escribe tu script. La salida (stdout) se guarda en la variable.\nconsole.log(\"hola\");", output_var: "code_output" } })];
  if (type === "error_handler") return [markManual({ at_ms: baseTime + 200, kind: "error_handler", data: { action: "retry", max_retries: 3 } })];
  if (type === "note") return [markManual({ at_ms: baseTime, kind: "note", data: { text: "Nota aquí..." } })];
  if (type === "cron") return [markManual({ at_ms: baseTime + 200, kind: "cron", data: { schedule: "1h" } })];
  if (type === "file_change") return [markManual({ at_ms: baseTime + 200, kind: "file_change", data: { path: "", event: "Modify" } })];
  if (type === "hotkey_trigger") return [markManual({ at_ms: baseTime + 200, kind: "hotkey_trigger", data: { shortcut: "Ctrl+Alt+A" } })];
  if (type === "form") return [markManual({ at_ms: baseTime + 200, kind: "form", data: { fields: [{ id: "input1", label: "Campo 1", type: "text", required: true }] } })];
  if (type === "sub_workflow") return [markManual({ at_ms: baseTime + 200, kind: "sub_workflow", data: { project_name: "Default", workflow_id: "", workflow_name: "Sub-Flujo" } })];
  // Data transformation (Phase 3). Defaults are valid, runnable examples so a
  // freshly dropped node does something sensible instead of erroring.
  if (type === "filter") return [markManual({ at_ms: baseTime + 200, kind: "filter", data: { condition: "{{ $json.value }} > 0", mode: "keep" } })];
  if (type === "sort") return [markManual({ at_ms: baseTime + 200, kind: "sort", data: { fields: "created_at" } })];
  if (type === "limit") return [markManual({ at_ms: baseTime + 200, kind: "limit", data: { skip: 0, max_items: 10 } })];
  if (type === "aggregate") return [markManual({ at_ms: baseTime + 200, kind: "aggregate", data: { mode: "list", field: "", separator: "," } })];
  if (type === "edit_fields") return [markManual({ at_ms: baseTime + 200, kind: "edit_fields", data: { set_fields: "{\n  \"nuevo_campo\": \"{{ $json.valor }}\"\n}", keep_only: "" } })];
  if (type === "date_time") return [markManual({ at_ms: baseTime + 200, kind: "date_time", data: { operation: "format", field: "created_at", format: "%Y-%m-%d", unit: "days", amount: 0, result_field: "" } })];
  // AI (Phase 3). base_url/api_key are left empty so the placeholder shows and
  // the user must make a deliberate choice about which model to call.
  if (type === "llm_chain") return [markManual({ at_ms: baseTime + 200, kind: "llm_chain", data: { base_url: "", api_key: "", model: "gpt-4o-mini", system_prompt: "", prompt: "{{ $json.text }}", temperature: 0.7, max_tokens: 1024, result_field: "text", output_var: "ai_output" } })];
  if (type === "classifier") return [markManual({ at_ms: baseTime + 200, kind: "classifier", data: { base_url: "", api_key: "", model: "gpt-4o-mini", system_prompt: "", prompt: "{{ $json.text }}", categories: ["Factura", "Soporte", "Otro"], category_field: "category", output_var: "classification" } })];
  // Phase 4 — data hygiene and diffs. These are pure local transforms and need
  // no network access, so no credential field is involved.
  if (type === "remove_duplicates") return [markManual({ at_ms: baseTime + 200, kind: "remove_duplicates", data: { fields: "", keep: "first" } })];
  if (type === "compare_datasets") return [markManual({ at_ms: baseTime + 200, kind: "compare_datasets", data: { compare_with: "{{ $json.previous }}", key: "id", compare_fields: "", mode: "all" } })];
  // Phase 4 — AI nodes. `credential_id` lets the node reuse a vault credential
  // instead of storing an api_key inline.
  if (type === "information_extractor") return [markManual({ at_ms: baseTime + 200, kind: "information_extractor", data: { base_url: "", api_key: "", credential_id: "", model: "gpt-4o-mini", system_prompt: "", prompt: "{{ $json.text }}", schema: "{\n  \"nombre\": \"nombre completo\",\n  \"total\": \"importe total como número\"\n}", mode: "merge", output_var: "extracted" } })];
  if (type === "sentiment_analysis") return [markManual({ at_ms: baseTime + 200, kind: "sentiment_analysis", data: { base_url: "", api_key: "", credential_id: "", model: "gpt-4o-mini", system_prompt: "", prompt: "{{ $json.text }}", labels: "positive,neutral,negative", label_field: "sentiment", score_field: "sentiment_score", output_var: "sentiment" } })];
  // Phase 6 — SQLite nodes.
  if (type === "sqlite_query") return [markManual({ at_ms: baseTime + 200, kind: "sqlite_query", data: { db_path: "datos.db", query: "SELECT * FROM tabla", params: "" } })];
  if (type === "sqlite_execute") return [markManual({ at_ms: baseTime + 200, kind: "sqlite_execute", data: { db_path: "datos.db", query: "INSERT INTO tabla (nombre) VALUES (?)", params: "[\"nuevo\"]" } })];
  // Phase 11 — parsing nodes. `source` is left as an expression so the node
  // reads from the incoming item instead of a hardcoded document.
  if (type === "xml_parse") return [markManual({ at_ms: baseTime + 200, kind: "xml_parse", data: { source: "{{ $json.xml }}", root: "" } })];
  if (type === "html_extract") return [markManual({ at_ms: baseTime + 200, kind: "html_extract", data: { source: "{{ $json.html }}", selector: "a", attr: "href" } })];
  if (type === "rss_read") return [markManual({ at_ms: baseTime + 200, kind: "rss_read", data: { url: "https://news.ycombinator.com/rss", limit: 20 } })];
  // Phase 11 — integrations.
  if (type === "send_email") return [markManual({ at_ms: baseTime + 200, kind: "send_email", data: { smtp_host: "smtp.gmail.com", smtp_port: 587, username: "", password: "", from_email: "", to_email: "", subject: "Asunto", body: "{{ $json.mensaje }}", is_html: false } })];
  if (type === "slack_webhook") return [markManual({ at_ms: baseTime + 200, kind: "slack_webhook", data: { webhook_url: "", text: "{{ $json.mensaje }}", channel: "", bot_name: "" } })];
  if (type === "discord_webhook") return [markManual({ at_ms: baseTime + 200, kind: "discord_webhook", data: { webhook_url: "", content: "{{ $json.mensaje }}", bot_name: "" } })];
  if (type === "notion") return [markManual({ at_ms: baseTime + 200, kind: "notion", data: { operation: "query_database", token: "", database_id: "", page_id: "", title: "", properties_json: "", filter_json: "" } })];
  if (type === "airtable") return [markManual({ at_ms: baseTime + 200, kind: "airtable", data: { operation: "list", api_key: "", base_id: "", table: "", record_id: "", fields_json: "" } })];
  // Phase 11 — flow control.
  if (type === "stop_error") return [markManual({ at_ms: baseTime + 200, kind: "stop_error", data: { message: "El flujo se detuvo: {{ $json.motivo }}" } })];
  if (type === "noop") return [markManual({ at_ms: baseTime + 200, kind: "noop", data: {} })];
  // n8n Core nodes. Defaults are runnable on their own: Split Out reads a list
  // from the incoming item, Summarize counts, Rename Keys renames one field,
  // Markdown converts its own input, Crypto hashes the input, and the file
  // nodes point at a file in the user's home directory.
  if (type === "split_out") return [markManual({ at_ms: baseTime + 200, kind: "split_out", data: { field: "items", include: "all", include_fields: "", destination_field: "" } })];
  if (type === "summarize") return [markManual({ at_ms: baseTime + 200, kind: "summarize", data: { group_by: "", aggregations: [{ operation: "count", field: "", output_field: "" }], separator: ", " } })];
  if (type === "rename_keys") return [markManual({ at_ms: baseTime + 200, kind: "rename_keys", data: { renames: [{ from: "old_name", to: "new_name" }], mode: "plain", keep_only: false, deep: false } })];
  if (type === "markdown") return [markManual({ at_ms: baseTime + 200, kind: "markdown", data: { mode: "markdown_to_html", source: "{{ $json.text }}", target_field: "data" } })];
  if (type === "crypto") return [markManual({ at_ms: baseTime + 200, kind: "crypto", data: { action: "hash", algorithm: "SHA256", encoding: "hex", value: "{{ $json.text }}", secret: "", length: 32, target_field: "data" } })];
  if (type === "read_file") return [markManual({ at_ms: baseTime + 200, kind: "read_file", data: { file_path: "~/datos.txt", encoding: "utf8", target_field: "data" } })];
  if (type === "write_file") return [markManual({ at_ms: baseTime + 200, kind: "write_file", data: { file_path: "~/salida.txt", content: "{{ $json.text }}", encoding: "utf8", append: false } })];
  return [];
}

export function updateEventFromState(
  node: FlowNode,
  state: any,
  eventIndex: number,
  rangeStart: number | undefined,
  rangeEnd: number | undefined,
  events: RecordedEvent[]
): RecordedEvent[] {
  const updatedEvents = [...events];
  if (node.type === "click") {
    let mmIdx = -1;
    for (let j = eventIndex - 1; j >= 0; j--) {
      if (updatedEvents[j].kind === "mouse_move") {
        mmIdx = j;
        break;
      }
    }
    if (mmIdx !== -1) {
      updatedEvents[mmIdx] = {
        ...updatedEvents[mmIdx],
        data: { ...updatedEvents[mmIdx].data, x: state.editX, y: state.editY }
      };
    }
  } else if (node.type === "type") {
    if (rangeStart !== undefined && rangeEnd !== undefined) {
      const startAt = updatedEvents[rangeStart].at_ms;
      const newEvents: RecordedEvent[] = [];
      let currentAt = startAt;

      for (let i = 0; i < state.editText.length; i++) {
        const char = state.editText[i];
        let key = char === " " ? "Space" : (char === "\n" ? "Return" : "Key" + char.toUpperCase());
        newEvents.push({ at_ms: currentAt, kind: "key_press", data: { key } });
        newEvents.push({ at_ms: currentAt + 20, kind: "key_release", data: { key } });
        currentAt += 50;
      }

      const oldEndAt = events[rangeEnd].at_ms;
      const timeShift = currentAt - oldEndAt;

      updatedEvents.splice(rangeStart, (rangeEnd - rangeStart + 1), ...newEvents);

      for (let k = rangeStart + newEvents.length; k < updatedEvents.length; k++) {
        updatedEvents[k] = { ...updatedEvents[k], at_ms: updatedEvents[k].at_ms + timeShift };
      }
    }
  } else if (node.type === "delay") {
    const T_old = updatedEvents[eventIndex].at_ms;
    const T_prev = eventIndex > 0 ? updatedEvents[eventIndex - 1].at_ms : 0;
    const D_old = T_old - T_prev;
    const D_new = state.editSeconds * 1000;
    const timeShift = D_new - D_old;

    for (let k = eventIndex; k < updatedEvents.length; k++) {
      updatedEvents[k] = { ...updatedEvents[k], at_ms: updatedEvents[k].at_ms + timeShift };
    }
  } else if (eventIndex !== -1) {
    const ev = updatedEvents[eventIndex];
    if (state.editCredentialId !== undefined) {
      ev.data = { ...ev.data, credential_id: state.editCredentialId };
    }
    if (node.type === "scroll") ev.data = { ...ev.data, y: state.editScrollY };
    else if (node.type === "hotkey") ev.data = { ...ev.data, keys: state.editHotkeyKeys };
    else if (node.type === "open_app") ev.data = { ...ev.data, exe: state.editOpenAppExe };
    else if (node.type === "close_app") ev.data = { ...ev.data, name: state.editCloseAppName };
    else if (node.type === "wait_image") ev.data = { ...ev.data, description: state.editWaitImageDesc, timeout: state.editWaitImageTimeout };
    else if (node.type === "set_var") ev.data = { ...ev.data, name: state.editVarName, value: state.editVarValue };
    else if (node.type === "screenshot") ev.data = { ...ev.data, filename: state.editScreenshotName };
    else if (node.type === "run_cmd") ev.data = { ...ev.data, command: state.editRunCmd, args: state.editRunCmdArgs };
    else if (node.type === "condition") ev.data = { ...ev.data, description: state.editConditionDesc, condition_type: state.editConditionType, expression: state.editConditionExpression };
    else if (node.type === "loop") ev.data = { ...ev.data, iterations: state.editLoopIterations };
    else if (node.type === "split_batches") ev.data = { ...ev.data, array_var: state.editSplitArrayVar, batch_size: state.editSplitBatchSize };
    else if (node.type === "google_sheets") ev.data = { ...ev.data, spreadsheet_id: state.editSheetSpreadsheetId, range: state.editSheetRange, values: state.editSheetValues };
    else if (node.type === "excel_local") ev.data = { ...ev.data, file_path: state.editExcelPath, header: state.editExcelHeader, values: state.editExcelValues, delimiter: state.editExcelDelimiter, overwrite: state.editExcelOverwrite, format: state.editExcelFormat };
    else if (node.type === "google_docs") ev.data = { ...ev.data, document_id: state.editDocDocumentId, text: state.editDocText };
    else if (node.type === "whatsapp") ev.data = { ...ev.data, to: state.editWhatsappTo, message: state.editWhatsappMessage, api_type: state.editWhatsappApiType };
    else if (node.type === "telegram") ev.data = { ...ev.data, message: state.editTelegramMessage, chat_id: state.editTelegramChatId };
    else if (node.type === "ai_agent") ev.data = { ...ev.data, prompt: state.editAiAgentPrompt, system_prompt: state.editAiAgentSystemPrompt, provider: state.editAiAgentProvider, model: state.editAiAgentModel, output_var: state.editAiAgentOutputVar, enable_tools: state.editAiAgentEnableTools, max_iterations: state.editAiAgentMaxIterations };
    else if (node.type === "form") ev.data = { ...ev.data, fields: state.editFormFields };
    else if (node.type === "webhook") ev.data = { ...ev.data, path: state.editWebhookPath, method: state.editWebhookMethod };
    else if (node.type === "polling") ev.data = { ...ev.data, url: state.editPollingUrl, method: state.editPollingMethod, headers: state.editPollingHeaders, body: state.editPollingBody, interval: state.editPollingInterval };
    else if (node.type === "http_request") ev.data = { ...ev.data, method: state.editHttpRequestMethod, url: state.editHttpRequestUrl, headers: state.editHttpRequestHeaders, body: state.editHttpRequestBody, output_var: state.editHttpRequestOutputVar };
    else if (node.type === "sub_workflow") ev.data = { ...ev.data, workflow_id: state.editSubWorkflowId, workflow_name: state.editSubWorkflowName, project_name: state.editSubWorkflowProject };
    else if (node.type === "switch") {
      let switchCases = [];
      try {
        switchCases = JSON.parse(state.editSwitchCases);
      } catch (e) {
        console.error(e);
        switchCases = ev.data.cases || [];
      }
      ev.data = { ...ev.data, field: state.editSwitchField, cases: switchCases };
    }
    else if (node.type === "merge") ev.data = { ...ev.data, mode: state.editMergeMode };
    else if (node.type === "wait") ev.data = { ...ev.data, seconds: state.editWaitSeconds, resume_on: state.editWaitResumeOn };
    else if (node.type === "code") ev.data = { ...ev.data, language: state.editCodeLanguage, code: state.editCodeContent, output_var: state.editCodeOutputVar };
    else if (node.type === "error_handler") ev.data = { ...ev.data, action: state.editErrorHandlerAction, max_retries: state.editErrorHandlerMaxRetries };
    else if (node.type === "trigger") ev.data = { ...ev.data, schedule: state.editTriggerSchedule };
    else if (node.type === "cron") ev.data = { ...ev.data, schedule: state.editCronSchedule };
    else if (node.type === "file_change") ev.data = { ...ev.data, path: state.editFileChangePath, event: state.editFileChangeEvent };
    else if (node.type === "hotkey_trigger") ev.data = { ...ev.data, shortcut: state.editHotkeyTriggerShortcut };
    else if (node.type === "startup") ev.data = { ...ev.data, mode: state.editStartupMode || "system", exe: state.editStartupAppExe || "chrome.exe", delay_seconds: state.editStartupDelay || 0 };
    // Data transformation (Phase 3).
    else if (node.type === "filter") ev.data = { ...ev.data, condition: state.editFilterCondition, mode: state.editFilterMode };
    else if (node.type === "sort") ev.data = { ...ev.data, fields: state.editSortFields };
    else if (node.type === "limit") ev.data = { ...ev.data, skip: state.editLimitSkip, max_items: state.editLimitMax };
    else if (node.type === "aggregate") ev.data = { ...ev.data, mode: state.editAggregateMode, field: state.editAggregateField, separator: state.editAggregateSeparator };
    else if (node.type === "edit_fields") ev.data = { ...ev.data, set_fields: state.editFieldsSet, keep_only: state.editFieldsKeepOnly };
    else if (node.type === "date_time") ev.data = { ...ev.data, operation: state.editDateTimeOperation, field: state.editDateTimeField, format: state.editDateTimeFormat, unit: state.editDateTimeUnit, amount: state.editDateTimeAmount, compare_to: state.editDateTimeCompareTo, result_field: state.editDateTimeResultField };
    // AI (Phase 3).
    else if (node.type === "llm_chain") ev.data = { ...ev.data, base_url: state.editLlmBaseUrl, api_key: state.editLlmApiKey, model: state.editLlmModel, system_prompt: state.editLlmSystemPrompt, prompt: state.editLlmPrompt, temperature: state.editLlmTemperature, max_tokens: state.editLlmMaxTokens, result_field: state.editLlmResultField, output_var: state.editLlmOutputVar };
    else if (node.type === "classifier") ev.data = { ...ev.data, base_url: state.editClsBaseUrl, api_key: state.editClsApiKey, model: state.editClsModel, system_prompt: state.editClsSystemPrompt, prompt: state.editClsPrompt, categories: state.editClsCategories, category_field: state.editClsCategoryField, output_var: state.editClsOutputVar };
    // ---- Phase 4 ----
    else if (node.type === "remove_duplicates") ev.data = { ...ev.data, fields: state.editDedupeFields, keep: state.editDedupeKeep };
    else if (node.type === "compare_datasets") ev.data = { ...ev.data, compare_with: state.editCompareWith, key: state.editCompareKey, compare_fields: state.editCompareFields, mode: state.editCompareMode };
    else if (node.type === "information_extractor") ev.data = { ...ev.data, base_url: state.editExtractBaseUrl, api_key: state.editExtractApiKey, credential_id: state.editExtractCredentialId, model: state.editExtractModel, system_prompt: state.editExtractSystemPrompt, prompt: state.editExtractPrompt, schema: state.editExtractSchema, mode: state.editExtractMode, output_var: state.editExtractOutputVar };
    else if (node.type === "sentiment_analysis") ev.data = { ...ev.data, base_url: state.editSentBaseUrl, api_key: state.editSentApiKey, credential_id: state.editSentCredentialId, model: state.editSentModel, system_prompt: state.editSentSystemPrompt, prompt: state.editSentPrompt, labels: state.editSentLabels, label_field: state.editSentLabelField, score_field: state.editSentScoreField, output_var: state.editSentOutputVar };
    // Phase 6 — SQLite.
    else if (node.type === "sqlite_query") ev.data = { ...ev.data, db_path: state.editSqliteQueryDbPath, query: state.editSqliteQuerySql, params: state.editSqliteQueryParams };
    else if (node.type === "sqlite_execute") ev.data = { ...ev.data, db_path: state.editSqliteExecDbPath, query: state.editSqliteExecSql, params: state.editSqliteExecParams };
    // Phase 11 — parsing nodes.
    else if (node.type === "xml_parse") ev.data = { ...ev.data, source: state.editXmlSource, root: state.editXmlRoot };
    else if (node.type === "html_extract") ev.data = { ...ev.data, source: state.editHtmlSource, selector: state.editHtmlSelector, attr: state.editHtmlAttr };
    else if (node.type === "rss_read") ev.data = { ...ev.data, url: state.editRssUrl, limit: state.editRssLimit };
    // Phase 11 — integrations.
    else if (node.type === "send_email") ev.data = { ...ev.data, smtp_host: state.editEmailSmtpHost, smtp_port: state.editEmailSmtpPort, username: state.editEmailUsername, password: state.editEmailPassword, from_email: state.editEmailFrom, to_email: state.editEmailTo, subject: state.editEmailSubject, body: state.editEmailBody, is_html: state.editEmailIsHtml };
    else if (node.type === "slack_webhook") ev.data = { ...ev.data, webhook_url: state.editSlackWebhookUrl, text: state.editSlackText, channel: state.editSlackChannel, bot_name: state.editSlackBotName };
    else if (node.type === "discord_webhook") ev.data = { ...ev.data, webhook_url: state.editDiscordWebhookUrl, content: state.editDiscordContent, bot_name: state.editDiscordBotName };
    else if (node.type === "notion") ev.data = { ...ev.data, operation: state.editNotionOperation, token: state.editNotionToken, database_id: state.editNotionDatabaseId, page_id: state.editNotionPageId, title: state.editNotionTitle, properties_json: state.editNotionProperties, filter_json: state.editNotionFilter };
    else if (node.type === "airtable") ev.data = { ...ev.data, operation: state.editAirtableOperation, api_key: state.editAirtableApiKey, base_id: state.editAirtableBaseId, table: state.editAirtableTable, record_id: state.editAirtableRecordId, fields_json: state.editAirtableFields };
    // Phase 11 — flow control. `noop` has no config at all, so only its notes
    // (handled below) are ever persisted.
    else if (node.type === "stop_error") ev.data = { ...ev.data, message: state.editStopErrorMessage };
    // n8n Core nodes.
    else if (node.type === "split_out") ev.data = { ...ev.data, field: state.editSplitOutField, include: state.editSplitOutInclude, include_fields: state.editSplitOutIncludeFields, destination_field: state.editSplitOutDestination };
    else if (node.type === "summarize") ev.data = { ...ev.data, group_by: state.editSummarizeGroupBy, aggregations: state.editSummarizeAggregations, separator: state.editSummarizeSeparator };
    else if (node.type === "rename_keys") ev.data = { ...ev.data, renames: state.editRenameKeysRules, mode: state.editRenameKeysMode, keep_only: state.editRenameKeysKeepOnly, deep: state.editRenameKeysDeep };
    else if (node.type === "markdown") ev.data = { ...ev.data, mode: state.editMarkdownMode, source: state.editMarkdownSource, target_field: state.editMarkdownTarget };
    else if (node.type === "crypto") ev.data = { ...ev.data, action: state.editCryptoAction, algorithm: state.editCryptoAlgorithm, encoding: state.editCryptoEncoding, value: state.editCryptoValue, secret: state.editCryptoSecret, length: state.editCryptoLength, target_field: state.editCryptoTarget };
    else if (node.type === "read_file") ev.data = { ...ev.data, file_path: state.editReadFilePath, encoding: state.editReadFileEncoding, target_field: state.editReadFileTarget };
    else if (node.type === "write_file") ev.data = { ...ev.data, file_path: state.editWriteFilePath, content: state.editWriteFileContent, encoding: state.editWriteFileEncoding, append: state.editWriteFileAppend };
    if (ev && typeof ev.data === "object") ev.data = { ...ev.data, notes: state.editNotes };
  }
  return updatedEvents;
}

export function deleteEventFromList(
  node: FlowNode,
  eventIndex: number,
  rangeStart: number | undefined,
  rangeEnd: number | undefined,
  events: RecordedEvent[]
): RecordedEvent[] {
  const updatedEvents = [...events];
  if (node.type === "click") {
    let mmIdx = -1;
    for (let j = eventIndex - 1; j >= 0; j--) {
      if (updatedEvents[j].kind === "mouse_move") {
        mmIdx = j;
        break;
      }
    }
    const startRemove = mmIdx !== -1 ? mmIdx : eventIndex;
    const countToRemove = eventIndex - startRemove + 1;
    let releaseCount = 0;
    if (eventIndex + 1 < updatedEvents.length && updatedEvents[eventIndex + 1].kind === "button_release") {
      releaseCount = 1;
    }
    updatedEvents.splice(startRemove, countToRemove + releaseCount);
  } else if (node.type === "type") {
    if (rangeStart !== undefined && rangeEnd !== undefined) {
      let trailingReleases = 0;
      let k = rangeEnd + 1;
      while (k < updatedEvents.length && updatedEvents[k].kind === "key_release") {
        trailingReleases++;
        k++;
      }
      updatedEvents.splice(rangeStart, (rangeEnd - rangeStart + 1) + trailingReleases);
    }
  } else if (node.type === "delay") {
    const T_old = updatedEvents[eventIndex].at_ms;
    const T_prev = eventIndex > 0 ? updatedEvents[eventIndex - 1].at_ms : 0;
    const delay = T_old - T_prev;

    for (let k = eventIndex; k < updatedEvents.length; k++) {
      updatedEvents[k] = { ...updatedEvents[k], at_ms: updatedEvents[k].at_ms - delay };
    }
  } else {
    if (eventIndex !== -1) {
      updatedEvents.splice(eventIndex, 1);
    }
  }
  return updatedEvents;
}
