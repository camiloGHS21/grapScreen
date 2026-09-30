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
 * Capabilities where the n8n entry takes the palette slot and the hand-written
 * node steps aside.
 *
 * `n8nRunnable` alone is not enough to hand a capability over. A node can run
 * and still *narrow* it — a trigger that needs a public URL where the native one
 * long-polls, or a runner that reads config keys the n8n form never writes — and
 * showing the narrower node as the only way to do the job is a silent downgrade.
 * So each entry here is audited one by one; the evidence is in the comment next
 * to it, and `scripts/verify-palette.mjs` fails if a name is added without the
 * capability also being runnable.
 *
 * Every other capability in `OWN_DUPLICATES` keeps its hand-written node: those
 * 45 n8n counterparts either cannot run at all (Core data nodes, LangChain
 * sub-nodes, broker triggers) or would narrow the capability, and the palette
 * says so on the entry instead of withdrawing the working node.
 */
export const N8N_REPLACES_OWN: ReadonlySet<string> = new Set([
  // The five app nodes below are the only duplicates whose n8n side both runs
  // and covers strictly more: the capture holds 9/10, 46/48, 15/21, 7/17 and
  // 7/8 of their declared operations against a hand-written node that offers a
  // single fixed request (1, 1, 1, 3 and 4 operations respectively). Supersets,
  // measured from `src/data/n8n-executable.json`.
  "google_sheets",
  "slack_webhook",
  "discord_webhook",
  "notion",
  "airtable",
  // Both triggers are armed by the same daemon the hand-written ones use — an
  // interval loop (`trigger_service` "schedule") and a locally served webhook
  // ("webhook") — and the n8n node carries the interval/path/method/port fields
  // those loops read, so the schedule and the endpoint survive the swap.
  "cron",
  "webhook",
]);

/**
 * The duplicate entries the palette suppresses *on the n8n side* even though
 * every other catalogue entry is now shown. One capability, and for the same
 * reason it keeps its hand-written node: the two sides are not the same offer.
 *
 * `ai_agent`: the engine runs an agent through `ai_agent_runner`, which reads
 * the prompt, the system prompt and the key from the node's *own* fields
 * (`ai_agent_runner.rs`), while a catalogue node keeps its parameters under
 * `n8n_config` (`eventModifiers.ts`) — and n8n's Agent asks for `promptType` /
 * `text` / `systemMessage`, none of which the runner reads
 * (`public/n8n-params/Agent.json`). Offering it would mean an agent that
 * silently ignores the prompt the user typed, so the catalogue key is hidden and
 * the hand-written agent keeps the spot — which is also how the palette ends up
 * with exactly one agent node.
 */
export const N8N_DUPLICATE_SUPPRESSED: ReadonlySet<string> = new Set(["ai_agent"]);

/**
 * Why one specific event-mode trigger cannot be armed, per node.
 *
 * These 17 triggers do not share a mechanism, so one sentence covering all of
 * them had to be wrong for most of them: "requiere un cliente externo (Kafka,
 * MQTT, IMAP)" described the three brokers and libelled the other fourteen,
 * which are manual triggers, in-n8n triggers and file watchers. Each line below
 * names what that node actually waits for.
 */
export const EVENT_TRIGGER_REASONS: Record<string, string> = {
  AmqpTrigger: "se suscribe a una cola AMQP: necesita un cliente de mensajería que este motor no trae",
  KafkaTrigger: "es un consumidor de Kafka: necesita el cliente de Kafka y un broker al que conectarse",
  MqttTrigger: "se suscribe a un broker MQTT: necesita el cliente MQTT, que este motor no trae",
  RabbitMQTrigger: "es un consumidor de RabbitMQ: necesita el cliente AMQP, que este motor no trae",
  RedisTrigger: "escucha pub/sub de Redis: necesita un cliente de Redis con la conexión abierta",
  SseTrigger: "mantiene abierta una conexión SSE contra una URL, y este motor no conserva ese canal",
  EmailReadImap: "vigila un buzón por IMAP: para eso ya está el nodo propio Email (IMAP)",
  PostgresTrigger: "escucha LISTEN/NOTIFY del servidor: el motor consulta Postgres, no mantiene esa escucha",
  LocalFileTrigger: "vigila el sistema de archivos: para eso ya está el nodo propio Cambio de archivo",
  ManualTrigger: "es el disparador manual de n8n: ese papel lo hace el nodo propio Manual",
  ManualChatTrigger: "es el disparador manual del chat de n8n, y este motor no sirve esa interfaz de chat",
  Chat: "es la interfaz de chat de n8n: la sirve n8n, no este motor",
  ExecuteWorkflowTrigger: "lo llama otro flujo de n8n al invocarlo: aquí ese papel lo hace Sub-flujo",
  WorkflowTrigger: "lo llama otro flujo de n8n al invocarlo: aquí ese papel lo hace Sub-flujo",
  ErrorTrigger: "se dispara con el fallo de otro flujo de n8n: para eso está el nodo propio Manejar error",
  SimulateTrigger: "es el disparador de pruebas de n8n y no recibe eventos reales",
  N8nTrigger: "se dispara con eventos internos de n8n (arranque, guardado): aquí está el nodo propio Al iniciar",
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

/**
 * Triggers whose captured request cannot be built here even though the capture
 * itself succeeded.
 *
 * Their URL is assembled from a value n8n writes into the credential during its
 * own OAuth exchange (`oauthTokenData.instance_url`). This app's vault stores
 * what the user types and never performs that exchange, so the host comes out
 * empty and the request would fail with a path and no server. The capture cannot
 * see that - it records the template, not the missing value - so it is declared
 * here, next to the other "shown but not runnable" tables.
 */
export const TRIGGERS_NEEDING_OAUTH_URL = new Set(["SalesforceTrigger"]);
