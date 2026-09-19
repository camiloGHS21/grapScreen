/**
 * What each node kind needs in order to actually run.
 *
 * This is the contract the Rust runners enforce, written down once so it can be
 * checked instead of remembered. `scripts/verify-templates.mjs` reads this
 * module and fails the build when a template breaks it; the marketplace UI reads
 * it to tell the user which templates need credentials.
 *
 * Every entry here was derived from a runner, not from the node's editor form:
 * a field the form shows but the runner ignores is not listed, and a field the
 * runner rejects when empty is listed even when the form lets it be blank.
 */
import type { FlowNodeType } from "../../types";

/** External service the user must supply a secret for before the flow can run. */
export type CredentialRequirement =
  | "google"
  | "smtp"
  | "slack"
  | "discord"
  | "telegram"
  | "whatsapp"
  | "notion"
  | "airtable"
  | "ai";

export const CREDENTIAL_REQUIREMENTS: readonly CredentialRequirement[] = [
  "google", "smtp", "slack", "discord", "telegram", "whatsapp", "notion", "airtable", "ai",
];

/** Dependencies that are not secrets, derived from the chain rather than declared. */
export type RuntimeRequirement = "network" | "desktop" | "node" | "database";

export const REQUIREMENT_LABELS: Record<CredentialRequirement, string> = {
  google: "Cuenta de Google (token OAuth)",
  smtp: "Servidor SMTP (usuario y contraseña)",
  slack: "Webhook entrante de Slack",
  discord: "Webhook de Discord",
  telegram: "Bot de Telegram (token y chat id)",
  whatsapp: "WhatsApp Cloud API (token y phone id)",
  notion: "Token de integración de Notion",
  airtable: "API key de Airtable",
  ai: "Proveedor de IA (API key)",
};

export const RUNTIME_LABELS: Record<RuntimeRequirement, string> = {
  network: "Conexión a internet",
  desktop: "Control del escritorio real",
  node: "Node.js instalado (nodo Código)",
  database: "Archivo de base de datos",
};

/**
 * Node kinds a template must never use, each with the reason.
 *
 * These are not "hard" nodes: they are nodes that cannot be made to work from a
 * template at all. A template containing one would look complete and fail on the
 * user's first run.
 */
export const FORBIDDEN_KINDS: Record<string, string> = {
  n8n_node:
    "el registro de descriptores de n8n carga 0 de 565 entradas en este build, y el runner exige una URL base que el descriptor no trae",
  n8n_trigger: "mismo registro vacío: el disparador nunca se arma",
  sub_workflow: "el runner exige un workflow_id que no existe en tiempo de siembra",
  stop_error: "el runner siempre aborta la ejecución, así que la plantilla nunca completaría",
  email_trigger: "no hay cliente IMAP implementado: el disparador nunca se arma",
  wait_image: "sin la imagen de referencia capturada por el usuario el nodo espera y expira sin hacer nada",
  postgres: "no existe en el tipo de nodo del editor: solo se alcanza vía n8n_node, que está prohibido",
};

/**
 * A field a runner rejects when it is empty after interpolation.
 *
 * `requirement` marks a field the user is expected to fill in themselves: when
 * the template declares that requirement, an empty value is legitimate and the
 * template is reported as "estructura válida, requiere credenciales" instead of
 * failing. `when` narrows a field that is only required for some operations.
 */
export interface RequiredField {
  field: string;
  requirement?: CredentialRequirement;
  when?: (data: Record<string, unknown>) => boolean;
}

const str = (data: Record<string, unknown>, key: string): string =>
  typeof data[key] === "string" ? (data[key] as string) : "";

/** `llm_chain` and friends waive the API key against a local model server. */
const needsRemoteKey = (data: Record<string, unknown>): boolean => {
  const base = str(data, "base_url").toLowerCase();
  return !base.includes("localhost") && !base.includes("127.0.0.1");
};

const isOperation = (data: Record<string, unknown>, ...ops: string[]) => {
  const op = str(data, "operation") || "query_database";
  return ops.includes(op);
};

export const REQUIRED_FIELDS: Partial<Record<FlowNodeType, RequiredField[]>> = {
  // -- Integrations ----------------------------------------------------------
  excel_local: [{ field: "file_path" }],
  form: [],
  google_sheets: [
    { field: "spreadsheet_id", requirement: "google" },
    { field: "token", requirement: "google" },
  ],
  google_docs: [
    { field: "document_id", requirement: "google" },
    { field: "token", requirement: "google" },
  ],
  send_email: [
    { field: "smtp_host", requirement: "smtp" },
    { field: "from_email", requirement: "smtp" },
    { field: "to_email" },
    { field: "username", requirement: "smtp" },
    { field: "password", requirement: "smtp" },
  ],
  slack_webhook: [
    { field: "webhook_url", requirement: "slack" },
    { field: "text" },
  ],
  discord_webhook: [
    { field: "webhook_url", requirement: "discord" },
    { field: "content" },
  ],
  notion: [
    { field: "token", requirement: "notion" },
    { field: "database_id", requirement: "notion", when: (d) => isOperation(d, "query_database", "create_page") },
    { field: "page_id", requirement: "notion", when: (d) => isOperation(d, "update_page") },
  ],
  airtable: [
    { field: "api_key", requirement: "airtable" },
    { field: "base_id", requirement: "airtable" },
    { field: "table", requirement: "airtable" },
    { field: "record_id", requirement: "airtable", when: (d) => isOperation(d, "update", "delete") },
    { field: "fields_json", when: (d) => isOperation(d, "create", "update") },
  ],
  telegram: [
    { field: "message" },
    { field: "chat_id", requirement: "telegram" },
    { field: "token", requirement: "telegram" },
  ],
  whatsapp: [
    { field: "message" },
    { field: "to", requirement: "whatsapp" },
    { field: "token", requirement: "whatsapp", when: (d) => str(d, "api_type") !== "web" },
    { field: "phone_id", requirement: "whatsapp", when: (d) => str(d, "api_type") !== "web" },
  ],

  // -- Core ------------------------------------------------------------------
  http_request: [{ field: "url" }],
  read_file: [{ field: "file_path" }],
  write_file: [{ field: "file_path" }],
  crypto: [{ field: "secret", when: (d) => str(d, "action") === "hmac" }],
  rename_keys: [{ field: "renames" }],
  split_out: [{ field: "field" }],
  summarize: [{ field: "aggregations" }],

  // -- Transform -------------------------------------------------------------
  compare_datasets: [{ field: "compare_with" }, { field: "key" }],
  xml_parse: [{ field: "source" }],
  html_extract: [{ field: "source" }, { field: "selector" }],
  rss_read: [{ field: "url" }],

  // -- Database --------------------------------------------------------------
  sqlite_query: [{ field: "db_path" }, { field: "query" }],
  sqlite_execute: [{ field: "db_path" }, { field: "query" }],

  // -- AI --------------------------------------------------------------------
  llm_chain: [{ field: "prompt" }, { field: "api_key", requirement: "ai", when: needsRemoteKey }],
  classifier: [{ field: "prompt" }, { field: "categories" }, { field: "api_key", requirement: "ai", when: needsRemoteKey }],
  information_extractor: [{ field: "prompt" }, { field: "schema" }, { field: "api_key", requirement: "ai", when: needsRemoteKey }],
  sentiment_analysis: [{ field: "prompt" }, { field: "api_key", requirement: "ai", when: needsRemoteKey }],
  ai_agent: [{ field: "api_key", requirement: "ai", when: needsRemoteKey }],

  // -- Flow control ----------------------------------------------------------
  sub_workflow: [{ field: "workflow_id" }],

  // -- Triggers --------------------------------------------------------------
  telegram_trigger: [{ field: "bot_token", requirement: "telegram" }],
  file_change: [{ field: "path" }],
  polling: [{ field: "url" }],
  rss_trigger: [{ field: "url" }],
  cron: [{ field: "schedule" }],
};

/**
 * Kinds that produce an item even when nothing came in, so `{{ $json.x }}`
 * resolves downstream.
 *
 * These are the only ones that guarantee it. A transform such as `filter` maps
 * the incoming list, so chaining one after a `set_var` yields an empty list, not
 * a payload — the distinction matters because `{{ $json.mensaje }}` against no
 * items interpolates to `""` and then trips a runner's "required" guard. Each
 * entry synthesises `vec![Value::Null]` when its input is empty
 * (`core_nodes.rs` for read_file/write_file/markdown/crypto) or ignores the
 * incoming list entirely (`sqlite_query`/`sqlite_execute` build items from the
 * result set, `rss_read` from the feed).
 *
 * Two more are conditional and resolved per node by the validator: `code`, when
 * its stdout parses as JSON, and `xml_parse`/`html_extract`, when their `source`
 * is a literal rather than a reference to an incoming item.
 */
export const ITEM_CREATORS: readonly string[] = [
  "read_file",
  "write_file",
  "markdown",
  "crypto",
  "sqlite_query",
  "sqlite_execute",
  "rss_read",
  // The four AI transform nodes attach their answer to the incoming items but
  // synthesise one when the list is empty (`ai_nodes.rs` guards each runner with
  // `if items.is_empty()`), so they can also start a chain from a plain
  // `set_var` or a form answer.
  "llm_chain",
  "classifier",
  "information_extractor",
  "sentiment_analysis",
  // The two parsers ignore the incoming list entirely (`_items`) and build
  // their items from `source`, so they can start a chain from an HTTP response.
  "xml_parse",
  "html_extract",
];

/**
 * Kinds that consume items and produce none of their own when the list is
 * empty. Listing them is what stops a template from putting `{{ $json.x }}`
 * after a `set_var`.
 */
export const ITEM_CONSUMERS: readonly string[] = [
  "filter", "sort", "limit", "aggregate", "edit_fields", "date_time",
  "remove_duplicates", "compare_datasets", "split_out", "summarize",
  "rename_keys", "write_file", "excel_local",
];

/** Kinds whose `source` may be satisfied by a literal instead of an item. */
export const LITERAL_SOURCE_KINDS: readonly string[] = ["xml_parse", "html_extract"];

/**
 * Kinds that reach outside the process. Derived, never declared: a template
 * cannot be trusted to remember that `http_request` needs the network.
 */
export const RUNTIME_TRAITS: Partial<Record<FlowNodeType, RuntimeRequirement[]>> = {
  click: ["desktop"], type: ["desktop"], scroll: ["desktop"], hotkey: ["desktop"],
  open_app: ["desktop"], close_app: ["desktop"], screenshot: ["desktop"],
  run_cmd: ["desktop"], wait_image: ["desktop"],
  http_request: ["network"], rss_read: ["network"], rss_trigger: ["network"],
  polling: ["network"], webhook: ["network"],
  telegram: ["network"], telegram_trigger: ["network"], whatsapp: ["network"],
  slack_webhook: ["network"], discord_webhook: ["network"], send_email: ["network"],
  notion: ["network"], airtable: ["network"],
  google_sheets: ["network"], google_docs: ["network"],
  ai_agent: ["network"], llm_chain: ["network"], classifier: ["network"],
  information_extractor: ["network"], sentiment_analysis: ["network"],
  code: ["node"],
  sqlite_query: ["database"], sqlite_execute: ["database"],
};

/**
 * Kinds whose runner needs a secret, mapped to the requirement a template must
 * declare when it uses them. Checked for consistency so a template cannot ship
 * a Telegram step while claiming it needs nothing.
 */
export const KIND_REQUIREMENTS: Partial<Record<FlowNodeType, CredentialRequirement>> = {
  google_sheets: "google",
  google_docs: "google",
  send_email: "smtp",
  slack_webhook: "slack",
  discord_webhook: "discord",
  telegram: "telegram",
  telegram_trigger: "telegram",
  whatsapp: "whatsapp",
  notion: "notion",
  airtable: "airtable",
  ai_agent: "ai",
  llm_chain: "ai",
  classifier: "ai",
  information_extractor: "ai",
  sentiment_analysis: "ai",
};

/**
 * Kinds a template may use. Verified against `buildAddedEvents` by the
 * validator, which calls it for every one of these and fails if it seeds
 * nothing — so this list cannot drift away from the seeder.
 */
export const TEMPLATE_NODE_TYPES: readonly FlowNodeType[] = [
  "trigger", "webhook", "cron", "startup", "file_change", "hotkey_trigger",
  "polling", "rss_trigger", "telegram_trigger", "whatsapp_trigger",
  "form", "click", "type", "scroll", "hotkey", "delay", "wait", "open_app",
  "close_app", "screenshot", "run_cmd", "set_var", "code", "condition", "loop",
  "split_batches", "switch", "merge", "error_handler", "noop", "end",
  "http_request", "excel_local", "google_sheets", "google_docs", "send_email",
  "slack_webhook", "discord_webhook", "notion", "airtable", "telegram",
  "whatsapp", "filter", "sort", "limit", "aggregate", "edit_fields", "date_time",
  "remove_duplicates", "compare_datasets", "xml_parse", "html_extract",
  "rss_read", "split_out", "summarize", "rename_keys", "markdown", "crypto",
  "read_file", "write_file", "sqlite_query", "sqlite_execute", "ai_agent",
  "llm_chain", "classifier", "information_extractor", "sentiment_analysis",
];

/**
 * Kinds the engine walks as flow entry points. A chain is inserted after the
 * previous node, so only the first step of a chain may be one of these.
 */
export const ENTRY_KINDS: readonly FlowNodeType[] = [
  "trigger", "webhook", "cron", "startup", "file_change", "hotkey_trigger",
  "polling", "rss_trigger", "telegram_trigger", "whatsapp_trigger",
];

/**
 * Variables the trigger daemon publishes before the graph runs, per trigger
 * kind (`trigger_service/handlers.rs` seeds these when it fires). They are how a
 * trigger's payload reaches the steps after it: there are no items yet at that
 * point, so `{{ $json.… }}` would resolve to nothing and `{{ rss.body }}` is the
 * only way to read the feed.
 */
export const TRIGGER_VARS: Partial<Record<FlowNodeType, readonly string[]>> = {
  trigger: ["trigger.kind"],
  webhook: ["trigger.kind", "webhook.method", "webhook.path", "webhook.query", "webhook.body"],
  polling: ["trigger.kind", "polling.body", "polling.status", "polling.url"],
  rss_trigger: ["trigger.kind", "rss.body"],
  telegram_trigger: ["trigger.kind", "telegram.updates"],
  cron: ["trigger.kind"],
  startup: ["trigger.kind"],
  hotkey_trigger: ["trigger.kind"],
  file_change: ["trigger.kind"],
  whatsapp_trigger: ["trigger.kind"],
};

