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
      if (params.dataPropertyName || params.binaryPropertyName) {
        out.data_property_name = String(params.dataPropertyName || params.binaryPropertyName);
      }
      if (params.asBinary || params.readBinary || params.is_binary) {
        out.is_binary = true;
      }
      break;
    }
    case "write_file":
      out.description = nodeName || "Escribir archivo";
      out.file_path = String(params.filePath || params.file_path || params.fileName || params.filename || "");
      out.content = String(params.content || params.data || params.value || "");
      if (params.dataPropertyName || params.binaryPropertyName) {
        out.data_property_name = String(params.dataPropertyName || params.binaryPropertyName);
      }
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
      if (params.combinationMode) out.combinationMode = String(params.combinationMode);
      if (params.joinMode) out.joinMode = String(params.joinMode);
      if (params.outputType) out.outputType = String(params.outputType);
      if (params.output) out.output = String(params.output);
      if (params.propertyName1 || params.field1) out.field1 = String(params.propertyName1 || params.field1);
      if (params.propertyName2 || params.field2) out.field2 = String(params.propertyName2 || params.field2);
      break;
    case "http_request":
      out.description = nodeName || "HTTP Request";
      out.method = String(params.method || params.httpMethod || "GET").toUpperCase();
      out.url = String(params.url || params.uri || "");
      out.headers = typeof params.headers === "object" ? JSON.stringify(params.headers) : String(params.headers || "{}");
      out.body = typeof params.body === "object" ? JSON.stringify(params.body) : String(params.body || "");
      out.output_var = String(params.output_var || "http_response");
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
    case "edit_fields": {
      out.description = nodeName || "Editar campos";
      const fields: Record<string, unknown> = {};
      if (params.values && typeof params.values === "object") {
        for (const list of Object.values(params.values as Record<string, unknown[]>)) {
          if (Array.isArray(list)) {
            for (const item of list as Array<{ name?: string; value?: unknown }>) {
              if (item?.name) fields[item.name] = item.value;
            }
          }
        }
      }
      if (params.assignments && typeof params.assignments === "object") {
        const ass = (params.assignments as { assignments?: Array<{ name?: string; value?: unknown }> }).assignments;
        if (Array.isArray(ass)) {
          for (const item of ass) {
            if (item?.name) fields[item.name] = item.value;
          }
        }
      }
      if (typeof params.set_fields === "string") {
        out.set_fields = params.set_fields;
      } else {
        out.set_fields = JSON.stringify(fields, null, 2);
      }
      out.keep_only = String(params.keepOnly || params.keep_only || "");
      break;
    }
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
