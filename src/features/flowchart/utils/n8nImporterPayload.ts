import { n8nAgentRunnerFields } from "./agentParity";
import { calculateWaitSeconds, formatSchedule } from "./n8nImporterTypes";

export function populateCoreNodeData(
  rawKind: string,
  nodeName: string,
  params: Record<string, unknown>,
  eventData: Record<string, unknown>,
): { kind: string; eventData: Record<string, unknown> } {
  let kind = rawKind;
  const out = { ...eventData };

  switch (kind) {
    case "condition":
    case "filter":
      out.description = nodeName || "Condición";
      out.condition = "true";
      break;
    case "switch":
      out.description = nodeName || "Switch";
      out.field = String(params.field || "enrutar");
      break;
    case "code":
      out.description = nodeName || "Código";
      out.code = String(params.jsCode || params.pythonCode || params.code || "");
      out.language = params.language === "python" ? "python" : "js";
      break;
    case "run_cmd":
      out.description = nodeName || "Ejecutar comando";
      out.command = String(params.command || params.cmd || "");
      out.args = String(params.args || params.arguments || "");
      out.continueOnFail = Boolean(params.continueOnFail || false);
      break;
    case "read_file": {
      const isWriteOp = String(params.operation || "").toLowerCase() === "write";
      if (isWriteOp) {
        kind = "write_file";
        out.description = nodeName || "Escribir archivo";
        out.content = String(params.content || params.data || params.value || "");
      } else {
        out.description = nodeName || "Leer archivo";
      }
      out.file_path = String(params.filePath || params.file_path || params.fileName || params.filename || "");
      break;
    }
    case "write_file":
      out.description = nodeName || "Escribir archivo";
      out.file_path = String(params.filePath || params.file_path || params.fileName || params.filename || "");
      out.content = String(params.content || params.data || params.value || "");
      break;
    case "excel_local":
      out.description = nodeName || "Archivo Excel/CSV";
      out.file_path = String(params.filePath || params.file_path || params.fileName || params.filename || "");
      out.operation = String(params.operation || "fromFile");
      out.format = String(params.fileFormat || params.format || "xlsx");
      break;
    case "merge":
      out.description = nodeName || "Merge";
      out.mode = String(params.mode || "append");
      break;
    case "wait":
      out.description = nodeName || "Esperar";
      out.seconds = calculateWaitSeconds(params);
      break;
    case "split_batches":
      out.description = nodeName || "Por cada item";
      out.batch_size = Number(params.batchSize) || 1;
      out.array_var = "items";
      break;
    case "cron":
      out.description = nodeName || "Cron";
      out.schedule = formatSchedule(params);
      break;
    case "webhook":
      out.description = nodeName || "Webhook";
      out.path = String(params.path || "/webhook");
      out.method = String(params.httpMethod || "POST").toUpperCase();
      break;
    case "ai_agent":
      return {
        kind,
        eventData: {
          ...out,
          n8n_key: "Agent",
          n8n_name: nodeName || "Agente IA",
          ...n8nAgentRunnerFields(params),
        },
      };
    case "mysql":
      out.description = nodeName || "MySQL";
      out.query = String(params.query || params.sql || "");
      out.operation = String(params.operation || "executeQuery");
      break;
    case "redis":
      out.description = nodeName || "Redis";
      out.operation = String(params.operation || params.action || "get");
      out.key = String(params.key || params.propertyName || "");
      out.value = String(params.value || "");
      break;
    case "mongodb":
      out.description = nodeName || "MongoDB";
      out.operation = String(params.operation || params.action || "find");
      out.collection = String(params.collection || "items");
      out.query = String(params.query || params.filter || "{}");
      break;
    case "google_docs":
      out.description = nodeName || "Google Docs";
      out.operation = String(params.operation || "get");
      out.documentId = String(params.documentId || params.document_id || "");
      out.title = String(params.title || "");
      break;
    case "google_slides":
      out.description = nodeName || "Google Slides";
      out.operation = String(params.operation || "get");
      out.presentationId = String(params.presentationId || params.presentation_id || "");
      out.title = String(params.title || "");
      break;
    case "google_chat":
      out.description = nodeName || "Google Chat";
      out.operation = String(params.operation || "createMessage");
      out.space = String(params.space || params.spaceId || "");
      out.message = String(params.message || params.text || "");
      break;
    case "google_drive":
      out.description = nodeName || "Google Drive";
      out.operation = String(params.operation || "listFiles");
      out.fileId = String(params.fileId || params.file_id || "");
      out.query = String(params.query || params.q || "");
      break;
    default:
      out.description = nodeName;
      break;
  }

  return { kind, eventData: out };
}
