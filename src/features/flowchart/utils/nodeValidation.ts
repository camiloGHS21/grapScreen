import type { RecordedEvent } from "../../../types";
import n8nCatalog from "../../../data/n8n-catalog.json";

interface N8nEntry {
  key: string;
  credentialName: string | null;
}

const CHAT_TRIGGER_KEYS = new Set(["chat", "chattrigger", "manualchattrigger"]);

const CREDENTIAL_REQUIRED_KEYS = new Set<string>(
  (n8nCatalog as unknown as N8nEntry[])
    .filter((e) => Boolean(e.credentialName) && !CHAT_TRIGGER_KEYS.has(e.key.toLowerCase()))
    .map((e) => e.key.toLowerCase())
);

/**
 * Determines whether a flow node is missing required configuration or credentials,
 * mirroring n8n's warning badge behaviour on unconfigured nodes.
 */
export function checkNodeWarning(event: RecordedEvent): boolean {
  if (!event || !event.data) return false;
  const d = event.data;

  // Explicit flags
  if (d.has_warning === true) return true;
  if (d.configured === false) return true;

  // Declarative n8n node or trigger
  if (event.kind === "n8n_node" || event.kind === "n8n_trigger") {
    const key = (d.n8n_key || "").toString().toLowerCase();
    const name = (d.n8n_name || "").toString().toLowerCase();
    if (CHAT_TRIGGER_KEYS.has(key)) {
      return false;
    }
    const isAgent = key.includes("agent") || name.includes("agent");
    if (isAgent) {
      const hasModel = Boolean(d.model && d.model.toString().trim());
      const hasCred = Boolean(d.credential_id && d.credential_id !== "none" && d.credential_id.toString().trim());
      const hasKey = Boolean(d.api_key && d.api_key.toString().trim());
      if (!hasModel && !hasCred && !hasKey) {
        return true;
      }
    }
    if (CREDENTIAL_REQUIRED_KEYS.has(key)) {
      const credId = d.credential_id;
      if (!credId || credId === "none" || (typeof credId === "string" && !credId.trim())) {
        return true;
      }
    }
    return false;
  }

  // Built-in action & trigger nodes
  switch (event.kind) {
    case "http_request":
      return !d.url || !d.url.toString().trim();
    case "sqlite_query":
    case "sqlite_execute":
      return !d.query || !d.query.toString().trim();
    case "send_email":
      return !d.to_email || !d.to_email.toString().trim();
    case "read_file":
    case "write_file":
      return !d.file_path || !d.file_path.toString().trim();
    case "rss_read":
      return !d.url || !d.url.toString().trim();
    case "condition":
      return !d.condition || !d.condition.toString().trim();
    case "run_cmd":
      return !d.cmd || !d.cmd.toString().trim();
    case "open_app":
      return !d.path && !d.exe;
    case "ai_agent":
    case "llm_chain":
      return !d.model && !d.credential_id && !d.api_key;
    case "airtable":
      return !d.credential_id && !d.table;
    case "notion":
      return !d.credential_id;
    default:
      return false;
  }
}
