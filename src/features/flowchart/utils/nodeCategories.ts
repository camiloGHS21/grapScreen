import { FlowNodeType, NodeCategory } from "../../../types";

export function getNodeCategory(type: FlowNodeType): NodeCategory {
  switch (type) {
    case "start":
    case "trigger":
    case "webhook":
    case "cron":
    case "startup":
    case "file_change":
    case "hotkey_trigger":
    case "polling":
      return "trigger";
    case "click":
    case "type":
    case "scroll":
    case "hotkey":
    case "form":
      return "interaction";
    case "app":
    case "open_app":
    case "close_app":
    case "wait_image":
      return "apps";
    case "condition":
    case "loop":
    case "split_batches":
    case "switch":
    case "wait":
    case "delay":
      return "control";
    case "run_cmd":
    case "screenshot":
    case "set_var":
    case "code":
      return "system";
    case "google_sheets":
    case "google_docs":
    case "http_request":
    case "excel_local":
      return "services";
    case "whatsapp":
    case "telegram":
      return "messaging";
    case "ai_agent":
    case "llm_chain":
    case "classifier":
    case "information_extractor":
    case "sentiment_analysis":
      return "ai";
    // Data transformation gets its own category so Filter/Sort/Aggregate read as
    // a distinct family rather than as generic "system" nodes.
    case "filter":
    case "sort":
    case "limit":
    case "aggregate":
    case "edit_fields":
    case "date_time":
    case "remove_duplicates":
    case "compare_datasets":
    case "sqlite_query":
    case "sqlite_execute":
    // Phase 11 — the parsing nodes replace the item list with what they read.
    case "rss_read":
    case "xml_parse":
    case "html_extract":
    // n8n Core — these all rewrite the item list too.
    case "split_out":
    case "summarize":
    case "rename_keys":
    case "markdown":
    case "crypto":
      return "transform";
    case "send_email":
    case "notion":
    case "airtable":
    // n8n Core — disk access reads as a service-style side effect.
    case "read_file":
    case "write_file":
      return "services";
    case "slack_webhook":
    case "discord_webhook":
      return "messaging";
    case "merge":
    case "error_handler":
    case "sub_workflow":
    case "stop_error":
      return "flow";
    case "noop":
      return "system";
    case "note":
      return "note";
    default:
      return "system";
  }
}

export const CATEGORY_COLORS: Record<NodeCategory, string> = {
  trigger: "#ff6d5a",
  interaction: "#3b82f6",
  apps: "#6366f1",
  control: "#ec4899",
  system: "#64748b",
  services: "#0f9d58",
  messaging: "#25d366",
  ai: "#a855f7",
  transform: "#06b6d4",
  flow: "#f97316",
  note: "#fbbf24",
};

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  trigger: "Trigger",
  interaction: "Acción",
  apps: "App",
  control: "Lógica",
  system: "Sistema",
  services: "Servicio",
  messaging: "Mensaje",
  ai: "IA",
  transform: "Transformar",
  flow: "Flujo",
  note: "Nota",
};
