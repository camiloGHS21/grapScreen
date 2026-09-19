/**
 * The curated half of the palette parity rules — the hand-written tables.
 *
 * Kept apart from `n8nParity.ts` so the rules read as rules and the reviewed
 * data reads as data. `n8n-nodes-completo.json` (the node-by-node mapping of
 * every hand-written kind onto the n8n node it mirrors) is the source these
 * tables come from; they live here as a checked-in list because the palette
 * must not depend on a generator running first.
 */

/**
 * Entries that are not HTTP clients, so the declarative runner can never
 * execute them: n8n implements them in-process (files, shell, crypto, image
 * work) and the generic runner only knows how to build one request.
 *
 * `FormTrigger`/`Form` are here for a second reason: the n8n form is a page
 * n8n serves and this engine only exposes a webhook, so it is not the same
 * capability as the hand-written `form` node, which does render the fields.
 */
export const NOT_HTTP_KEYS = new Set([
  "ExecuteCommand",
  "Git",
  "ReadWriteFile",
  "ReadBinaryFile",
  "ReadBinaryFiles",
  "WriteBinaryFile",
  "SpreadsheetFile",
  "ConvertToFile",
  "Compression",
  "DebugHelper",
  "EditImage",
  "ReadPDF",
  "ExtractFromFile",
  "Jwt",
  "Ssh",
  "RespondToWebhook",
  "ExecutionData",
  "TrackTimeSaved",
  "N8n",
  "Form",
  "FormTrigger",
  "MoveBinaryData",
  "LocalFileTrigger",
]);

/**
 * Hand-written kind → the n8n entries covering the same capability. The first
 * key is the canonical replacement; the rest are the older aliases n8n keeps
 * around (Cron/Interval, Read Binary File…) and are suppressed together with
 * it, so the palette shows one node per capability.
 */
export const OWN_DUPLICATES: Record<string, readonly string[]> = {
  // Disparadores
  trigger: ["ManualTrigger"],
  cron: ["ScheduleTrigger", "Cron", "Interval"],
  webhook: ["Webhook"],
  startup: ["N8nTrigger"],
  file_change: ["LocalFileTrigger"],
  form: ["FormTrigger", "Form"],
  rss_trigger: ["RssFeedReadTrigger", "RssFeedRead"],
  whatsapp_trigger: ["WhatsAppTrigger"],
  telegram_trigger: ["TelegramTrigger"],
  email_trigger: ["EmailReadImap"],
  // IA
  ai_agent: ["Agent", "AgentV1"],
  llm_chain: ["ChainLlm", "ChainRetrievalQa", "ChainSummarization", "ChainSummarizationV1", "AiTransform"],
  classifier: ["TextClassifier"],
  information_extractor: ["InformationExtractor"],
  sentiment_analysis: ["SentimentAnalysis"],
  // Acciones
  http_request: ["HttpRequest"],
  google_sheets: ["GoogleSheets"],
  google_docs: ["GoogleDocs"],
  excel_local: ["SpreadsheetFile"],
  send_email: ["EmailSend"],
  slack_webhook: ["Slack"],
  discord_webhook: ["Discord"],
  notion: ["Notion"],
  airtable: ["Airtable"],
  read_file: ["ReadWriteFile", "ReadBinaryFile", "ReadBinaryFiles"],
  write_file: ["WriteBinaryFile"],
  run_cmd: ["ExecuteCommand", "Git"],
  // Transformación
  edit_fields: ["Set", "ItemLists"],
  filter: ["Filter"],
  sort: ["Sort"],
  limit: ["Limit"],
  aggregate: ["Aggregate"],
  date_time: ["DateTime"],
  split_batches: ["SplitInBatches"],
  remove_duplicates: ["RemoveDuplicates"],
  compare_datasets: ["CompareDatasets"],
  xml_parse: ["Xml"],
  html_extract: ["HtmlExtract", "Html"],
  split_out: ["SplitOut"],
  summarize: ["Summarize"],
  rename_keys: ["RenameKeys"],
  markdown: ["Markdown"],
  crypto: ["Crypto"],
  // Flujo
  condition: ["If"],
  switch: ["Switch"],
  merge: ["Merge"],
  wait: ["Wait"],
  sub_workflow: ["ExecuteWorkflow"],
  error_handler: ["ErrorTrigger"],
  stop_error: ["StopAndError"],
  noop: ["NoOp"],
  // Núcleo
  code: ["Code"],
};

/**
 * Hand-written nodes that stay in the palette no matter what: they are the
 * app's own capability (desktop automation, the manual trigger, launching and
 * closing programs) and no n8n node could replace them.
 */
export const ALWAYS_KEEP_OWN = new Set([
  "click",
  "type",
  "scroll",
  "hotkey",
  "wait_image",
  "screenshot",
  "hotkey_trigger",
  "open_app",
  "close_app",
  "trigger",
]);
