import { FlowNode, RecordedEvent } from "../../types";
import { getNodePorts } from "./utils/nodePorts";

export { getNodePorts, getNodeIcon } from "./utils/nodePorts";
export { getNodeCategory, CATEGORY_COLORS, CATEGORY_LABELS } from "./utils/nodeCategories";

function formatKeyPreview(events: RecordedEvent[], start: number, end: number) {
  let text = "";
  for (let k = start; k <= end; k++) {
    const key = events[k].data.key;
    if (key && key.startsWith("Key")) text += key.replace("Key", "").toLowerCase();
    else if (key === "Space") text += " ";
    else if (key === "Return") text += " [Enter] ";
    else text += ` [${key}] `;
  }
  return text;
}

function appDisplayName(app?: { exe: string; title: string; class: string } | null): string {
  if (!app) return "Aplicación";
  const exe = app.exe || "";
  const file = exe.split(/[\\/]/).pop() || "";
  const stem = file.replace(/\.exe$/i, "");
  const known: Record<string, string> = {
    cmd: "Símbolo del sistema",
    wt: "Windows Terminal",
    powershell: "PowerShell",
    explorer: "Explorador de archivos",
    chrome: "Google Chrome",
    explore: "Internet Explorer",
    msedge: "Microsoft Edge",
    calculator: "Calculadora",
    notepad: "Bloc de notas",
  };
  const key = stem.toLowerCase();
  if (known[key]) return known[key];
  if (stem) return stem.charAt(0).toUpperCase() + stem.slice(1);
  return app.title || exe || "Aplicación";
}

export function buildNodes(
  events: RecordedEvent[],
  target_app?: { exe: string; title: string; class: string; name?: string; rect: [number, number, number, number] } | null
): FlowNode[] {
  // Ensure every event has a persistent unique ID
  let seq = 0;
  events.forEach(e => {
    if (e.kind === "layout_metadata") return;
    if (!e.data) e.data = {};
    if (!e.data.id) {
      // Deterministic: the same event list must always produce the same node
      // ids, otherwise a freshly added node (whose layout entry is written
      // before the save round-trips) would be orphaned by a new random id.
      e.data.id = `n${Date.now().toString(36)}${(seq++).toString(36)}`;
    }
  });

  const list: FlowNode[] = [];

  if (target_app) {
    const name = target_app.name || appDisplayName(target_app);
    list.push({
      id: "app",
      type: "app",
      label: name,
      details: target_app.title || name,
      eventIndex: 0,
      start: 0,
      end: events.length - 1,
      app: target_app,
      ports: getNodePorts("app"),
    });
  } else {
    let lastTime = 0;
    let lastEvent: RecordedEvent | null = null;
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e.kind === "layout_metadata") continue;

      if (e.kind === "trigger" || e.kind === "start") {
        list.push({
          id: `trigger-${e.data.id || i}`,
          type: "start",
          label: e.data.description || "Inicio",
          details: "Comienza la ejecución",
          start: i,
          end: i,
          eventIndex: i,
          ports: getNodePorts("start"),
        });
      } else if (e.kind === "startup") {
        list.push({
          id: `startup-${e.data.id || i}`,
          type: "startup",
          label: "Al Iniciar",
          details: "Inicio de app",
          start: i,
          end: i,
          eventIndex: i,
          ports: getNodePorts("startup"),
        });
      }
      const delay = e.at_ms - lastTime;
      // Don't synthesise a delay node if the gap comes after a manually‑added event
      if (delay > 400 && !(lastEvent?.data?.__manual)) {
        list.push({ id: `delay-${e.data.id}`, type: "delay", label: "Esperar", details: `${(delay / 1000).toFixed(1)}s`, start: i, end: i, eventIndex: i, ports: getNodePorts("delay") });
      }
      lastTime = e.at_ms;
      lastEvent = e;

      if (e.kind === "delay") {
        list.push({ id: `delay-${e.data.id}`, type: "delay", label: "Esperar", details: `${e.data.seconds || 1}s`, start: i, end: i, eventIndex: i, ports: getNodePorts("delay") });
      } else if (e.kind === "button_press") {
        const btn = e.data.button === "Left" ? "Clic Izquierdo" : e.data.button === "Right" ? "Clic Derecho" : "Clic";
        let coordsStr = "";
        for (let j = i - 1; j >= 0; j--) {
          if (events[j].kind === "mouse_move") {
            coordsStr = ` (${Math.round(events[j].data.x)}, ${Math.round(events[j].data.y)})`;
            break;
          }
        }
        list.push({ id: `click-${e.data.id}`, type: "click", label: btn, details: coordsStr, start: i, end: i, eventIndex: i, ports: getNodePorts("click") });
      } else if (e.kind === "key_press") {
        const rangeStart = i;
        let j = i;
        while (j < events.length && events[j].kind === "key_press") j++;
        const rangeEnd = j - 1;
        i = j - 1;
        const text = formatKeyPreview(events, rangeStart, rangeEnd);
        list.push({ id: `type-${events[rangeStart].data.id}`, type: "type", label: "Escribir Texto", details: text.length > 38 ? text.slice(0, 38) + "..." : text || "Texto", start: rangeStart, end: rangeEnd, eventIndex: rangeStart, rangeStart, rangeEnd, ports: getNodePorts("type") });
      } else if (e.kind === "wheel") {
        list.push({ id: `scroll-${e.data.id}`, type: "scroll", label: "Scroll", details: `Y: ${e.data.y}`, start: i, end: i, eventIndex: i, ports: getNodePorts("scroll") });
      } else if (e.kind === "hotkey") {
        list.push({ id: `hotkey-${e.data.id}`, type: "hotkey", label: "Hotkey", details: String(e.data.keys || e.data.key || "Ctrl+?"), start: i, end: i, eventIndex: i, ports: getNodePorts("hotkey") });
      } else if (e.kind === "open_app") {
        list.push({ id: `open_app-${e.data.id}`, type: "open_app", label: "Abrir App", details: e.data.exe || e.data.name || "app", start: i, end: i, eventIndex: i, ports: getNodePorts("open_app") });
      } else if (e.kind === "close_app") {
        list.push({ id: `close_app-${e.data.id}`, type: "close_app", label: "Cerrar App", details: e.data.name || e.data.title || "app", start: i, end: i, eventIndex: i, ports: getNodePorts("close_app") });
      } else if (e.kind === "wait_image") {
        list.push({ id: `wait_image-${e.data.id}`, type: "wait_image", label: "Esperar Imagen", details: e.data.description || `${e.data.timeout || 10}s`, start: i, end: i, eventIndex: i, ports: getNodePorts("wait_image") });
      } else if (e.kind === "set_var") {
        list.push({ id: `set_var-${e.data.id}`, type: "set_var", label: "Variable", details: `${e.data.name || "var"} = ${e.data.value ?? ""}`, start: i, end: i, eventIndex: i, ports: getNodePorts("set_var") });
      } else if (e.kind === "screenshot") {
        list.push({ id: `screenshot-${e.data.id}`, type: "screenshot", label: "Captura", details: e.data.filename || "captura.png", start: i, end: i, eventIndex: i, ports: getNodePorts("screenshot") });
      } else if (e.kind === "run_cmd") {
        list.push({ id: `run_cmd-${e.data.id}`, type: "run_cmd", label: "Comando", details: (e.data.command || "cmd").slice(0, 32), start: i, end: i, eventIndex: i, ports: getNodePorts("run_cmd") });
      } else if (e.kind === "condition") {
        list.push({ id: `condition-${e.data.id}`, type: "condition", label: "Condición", details: e.data.description || "Si…", start: i, end: i, eventIndex: i, ports: getNodePorts("condition") });
      } else if (e.kind === "loop_start") {
        list.push({ id: `loop-${e.data.id}`, type: "loop", label: "Bucle", details: `${e.data.iterations || "∞"} veces`, start: i, end: i, eventIndex: i, ports: getNodePorts("loop") });
      } else if (e.kind === "split_batches") {
        list.push({ id: `split_batches-${e.data.id}`, type: "split_batches", label: "Por cada item", details: e.data.array_var || "items", start: i, end: i, eventIndex: i, ports: getNodePorts("split_batches") });
      } else if (e.kind === "google_sheets") {
        list.push({ id: `google_sheets-${e.data.id}`, type: "google_sheets", label: "Google Sheets", details: e.data.range || "Añadir fila", start: i, end: i, eventIndex: i, ports: getNodePorts("google_sheets") });
      } else if (e.kind === "google_docs") {
        list.push({ id: `google_docs-${e.data.id}`, type: "google_docs", label: "Google Docs", details: e.data.document_id ? `Doc: ${e.data.document_id.slice(0, 8)}…` : "Escribir Doc", start: i, end: i, eventIndex: i, ports: getNodePorts("google_docs") });
      } else if (e.kind === "whatsapp") {
        list.push({ id: `whatsapp-${e.data.id}`, type: "whatsapp", label: "WhatsApp", details: e.data.to ? `A: ${e.data.to}` : "Enviar mensaje", start: i, end: i, eventIndex: i, ports: getNodePorts("whatsapp") });
      } else if (e.kind === "telegram") {
        list.push({ id: `telegram-${e.data.id}`, type: "telegram", label: "Telegram", details: e.data.message ? e.data.message.slice(0, 20) + "…" : "Enviar alerta", start: i, end: i, eventIndex: i, ports: getNodePorts("telegram") });
      } else if (e.kind === "ai_agent") {
        list.push({ id: `ai_agent-${e.data.id}`, type: "ai_agent", label: "Agente IA", details: e.data.model || "gpt-4o-mini", start: i, end: i, eventIndex: i, ports: getNodePorts("ai_agent") });
      } else if (e.kind === "form") {
        list.push({ id: `form-${e.data.id}`, type: "form", label: "Formulario UI", details: `${e.data.fields?.length || 0} campos`, start: i, end: i, eventIndex: i, ports: getNodePorts("form") });
      } else if (e.kind === "excel_local") {
        list.push({ id: `excel_local-${e.data.id}`, type: "excel_local", label: "Excel / CSV", details: e.data.file_path || "Guardar fila", start: i, end: i, eventIndex: i, ports: getNodePorts("excel_local") });
      } else if (e.kind === "webhook") {
        list.push({ id: `webhook-${e.data.id}`, type: "webhook", label: "Webhook", details: e.data.path || "/webhook", start: i, end: i, eventIndex: i, ports: getNodePorts("webhook") });
      } else if (e.kind === "polling") {
        list.push({ id: `polling-${e.data.id}`, type: "polling", label: "Polling (API)", details: `${e.data.method || "GET"} ${e.data.url || "sin URL"}`.slice(0, 34), start: i, end: i, eventIndex: i, ports: getNodePorts("polling") });
      } else if (e.kind === "http_request") {
        list.push({ id: `http_request-${e.data.id}`, type: "http_request", label: "HTTP Request", details: `${e.data.method || "GET"} ${e.data.url || ""}`.slice(0, 30), start: i, end: i, eventIndex: i, ports: getNodePorts("http_request") });
      } else if (e.kind === "switch") {
        list.push({ id: `switch-${e.data.id}`, type: "switch", label: "Switch", details: e.data.field || "Enrutar", start: i, end: i, eventIndex: i, ports: getNodePorts("switch") });
      } else if (e.kind === "merge") {
        list.push({ id: `merge-${e.data.id}`, type: "merge", label: "Merge", details: e.data.mode || "Combinar", start: i, end: i, eventIndex: i, ports: getNodePorts("merge") });
      } else if (e.kind === "wait") {
        list.push({ id: `wait-${e.data.id}`, type: "wait", label: "Esperar", details: e.data.resume_on === "event" ? "Evento" : `${e.data.seconds || 5}s`, start: i, end: i, eventIndex: i, ports: getNodePorts("wait") });
      } else if (e.kind === "code") {
        list.push({ id: `code-${e.data.id}`, type: "code", label: "Código", details: e.data.language || "JS", start: i, end: i, eventIndex: i, ports: getNodePorts("code") });
      } else if (e.kind === "error_handler") {
        list.push({ id: `error_handler-${e.data.id}`, type: "error_handler", label: "Error Handler", details: e.data.action || "Capturar", start: i, end: i, eventIndex: i, ports: getNodePorts("error_handler") });
      } else if (e.kind === "sub_workflow") {
        list.push({ id: `sub_workflow-${e.data.id}`, type: "sub_workflow", label: "Sub-Flujo", details: e.data.workflow_name || e.data.workflow_id || "Ejecutar flujo", start: i, end: i, eventIndex: i, ports: getNodePorts("sub_workflow") });
      } else if (e.kind === "cron") {
        list.push({ id: `cron-${e.data.id}`, type: "cron", label: "Intervalo / Cron", details: e.data.schedule || "1h", start: i, end: i, eventIndex: i, ports: getNodePorts("cron") });
      } else if (e.kind === "file_change") {
        list.push({ id: `file_change-${e.data.id}`, type: "file_change", label: "Cambio Archivo", details: e.data.path || "Monitorear", start: i, end: i, eventIndex: i, ports: getNodePorts("file_change") });
      } else if (e.kind === "hotkey_trigger") {
        list.push({ id: `hotkey_trigger-${e.data.id}`, type: "hotkey_trigger", label: "Atajo Global", details: e.data.shortcut || "Ctrl+Alt+A", start: i, end: i, eventIndex: i, ports: getNodePorts("hotkey_trigger") });
      } else if (e.kind === "note") {
        list.push({ id: `note-${e.data.id}`, type: "note", label: "Nota", details: (e.data.text || "Nota").slice(0, 30), start: i, end: i, eventIndex: i, ports: getNodePorts("note") });
      } else if (e.kind === "filter") {
        list.push({ id: `filter-${e.data.id}`, type: "filter", label: "Filtrar", details: (e.data.condition || "true").slice(0, 30), start: i, end: i, eventIndex: i, ports: getNodePorts("filter") });
      } else if (e.kind === "sort") {
        list.push({ id: `sort-${e.data.id}`, type: "sort", label: "Ordenar", details: e.data.fields || "campo", start: i, end: i, eventIndex: i, ports: getNodePorts("sort") });
      } else if (e.kind === "limit") {
        list.push({ id: `limit-${e.data.id}`, type: "limit", label: "Limitar", details: `máx ${e.data.max_items ?? e.data.maxItems ?? "—"}`, start: i, end: i, eventIndex: i, ports: getNodePorts("limit") });
      } else if (e.kind === "aggregate") {
        list.push({ id: `aggregate-${e.data.id}`, type: "aggregate", label: "Agregar", details: `${e.data.mode || "list"}${e.data.field ? ` · ${e.data.field}` : ""}`, start: i, end: i, eventIndex: i, ports: getNodePorts("aggregate") });
      } else if (e.kind === "edit_fields") {
        list.push({ id: `edit_fields-${e.data.id}`, type: "edit_fields", label: "Editar campos", details: e.data.keep_only ? `conservar ${e.data.keep_only}` : "establecer campos", start: i, end: i, eventIndex: i, ports: getNodePorts("edit_fields") });
      } else if (e.kind === "date_time") {
        list.push({ id: `date_time-${e.data.id}`, type: "date_time", label: "Fecha y hora", details: `${e.data.operation || "format"} · ${e.data.field || "now"}`, start: i, end: i, eventIndex: i, ports: getNodePorts("date_time") });
      } else if (e.kind === "llm_chain") {
        list.push({ id: `llm_chain-${e.data.id}`, type: "llm_chain", label: "Cadena LLM", details: e.data.model || "gpt-4o-mini", start: i, end: i, eventIndex: i, ports: getNodePorts("llm_chain") });
      } else if (e.kind === "classifier") {
        list.push({ id: `classifier-${e.data.id}`, type: "classifier", label: "Clasificador", details: (e.data.categories || "").toString().slice(0, 30) || "categorías", start: i, end: i, eventIndex: i, ports: getNodePorts("classifier") });
      } else if (e.kind === "remove_duplicates") {
        list.push({ id: `remove_duplicates-${e.data.id}`, type: "remove_duplicates", label: "Eliminar duplicados", details: `${e.data.fields || "item completo"} · ${e.data.keep || "first"}`, start: i, end: i, eventIndex: i, ports: getNodePorts("remove_duplicates") });
      } else if (e.kind === "compare_datasets") {
        list.push({ id: `compare_datasets-${e.data.id}`, type: "compare_datasets", label: "Comparar datasets", details: `${e.data.mode || "all"} · ${e.data.key || "clave"}`, start: i, end: i, eventIndex: i, ports: getNodePorts("compare_datasets") });
      } else if (e.kind === "information_extractor") {
        list.push({ id: `information_extractor-${e.data.id}`, type: "information_extractor", label: "Extraer información", details: e.data.model || "gpt-4o-mini", start: i, end: i, eventIndex: i, ports: getNodePorts("information_extractor") });
      } else if (e.kind === "sentiment_analysis") {
        list.push({ id: `sentiment_analysis-${e.data.id}`, type: "sentiment_analysis", label: "Análisis de sentimiento", details: (e.data.labels || "").toString().slice(0, 30) || "sentimiento", start: i, end: i, eventIndex: i, ports: getNodePorts("sentiment_analysis") });
      } else if (e.kind === "sqlite_query") {
        list.push({ id: `sqlite_query-${e.data.id}`, type: "sqlite_query", label: "SQLite: Consulta", details: (e.data.query || "").toString().slice(0, 30) || "SELECT", start: i, end: i, eventIndex: i, ports: getNodePorts("sqlite_query") });
      } else if (e.kind === "sqlite_execute") {
        list.push({ id: `sqlite_execute-${e.data.id}`, type: "sqlite_execute", label: "SQLite: Ejecutar", details: (e.data.query || "").toString().slice(0, 30) || "INSERT", start: i, end: i, eventIndex: i, ports: getNodePorts("sqlite_execute") });
      } else if (e.kind === "xml_parse") {
        list.push({ id: `xml_parse-${e.data.id}`, type: "xml_parse", label: "Parsear XML", details: e.data.root ? `raíz: ${e.data.root}`.slice(0, 30) : "documento completo", start: i, end: i, eventIndex: i, ports: getNodePorts("xml_parse") });
      } else if (e.kind === "html_extract") {
        list.push({ id: `html_extract-${e.data.id}`, type: "html_extract", label: "Extraer de HTML", details: (e.data.selector || "").toString().slice(0, 30) || "selector CSS", start: i, end: i, eventIndex: i, ports: getNodePorts("html_extract") });
      } else if (e.kind === "rss_read") {
        list.push({ id: `rss_read-${e.data.id}`, type: "rss_read", label: "Leer RSS / Atom", details: (e.data.url || "sin URL").toString().slice(0, 34), start: i, end: i, eventIndex: i, ports: getNodePorts("rss_read") });
      } else if (e.kind === "send_email") {
        list.push({ id: `send_email-${e.data.id}`, type: "send_email", label: "Enviar email", details: (e.data.to_email || e.data.subject || "sin destinatario").toString().slice(0, 32), start: i, end: i, eventIndex: i, ports: getNodePorts("send_email") });
      } else if (e.kind === "slack_webhook") {
        list.push({ id: `slack_webhook-${e.data.id}`, type: "slack_webhook", label: "Slack", details: (e.data.channel || e.data.text || "mensaje").toString().slice(0, 30), start: i, end: i, eventIndex: i, ports: getNodePorts("slack_webhook") });
      } else if (e.kind === "discord_webhook") {
        list.push({ id: `discord_webhook-${e.data.id}`, type: "discord_webhook", label: "Discord", details: (e.data.content || "mensaje").toString().slice(0, 30), start: i, end: i, eventIndex: i, ports: getNodePorts("discord_webhook") });
      } else if (e.kind === "notion") {
        list.push({ id: `notion-${e.data.id}`, type: "notion", label: "Notion", details: `${e.data.operation || "query_database"}`.slice(0, 30), start: i, end: i, eventIndex: i, ports: getNodePorts("notion") });
      } else if (e.kind === "airtable") {
        list.push({ id: `airtable-${e.data.id}`, type: "airtable", label: "Airtable", details: `${e.data.operation || "list"}${e.data.table ? ` · ${e.data.table}` : ""}`.slice(0, 30), start: i, end: i, eventIndex: i, ports: getNodePorts("airtable") });
      } else if (e.kind === "stop_error") {
        list.push({ id: `stop_error-${e.data.id}`, type: "stop_error", label: "Detener y fallar", details: (e.data.message || "abortar").toString().slice(0, 30), start: i, end: i, eventIndex: i, ports: getNodePorts("stop_error") });
      } else if (e.kind === "noop") {
        list.push({ id: `noop-${e.data.id}`, type: "noop", label: "No hacer nada", details: "deja pasar los items", start: i, end: i, eventIndex: i, ports: getNodePorts("noop") });
      } else if (e.kind === "split_out") {
        list.push({ id: `split_out-${e.data.id}`, type: "split_out", label: "Dividir lista", details: (e.data.field || "sin campo").toString().slice(0, 30), start: i, end: i, eventIndex: i, ports: getNodePorts("split_out") });
      } else if (e.kind === "summarize") {
        const aggs = Array.isArray(e.data.aggregations) ? e.data.aggregations.length : 0;
        list.push({ id: `summarize-${e.data.id}`, type: "summarize", label: "Resumir", details: `${aggs} agregación(es)`, start: i, end: i, eventIndex: i, ports: getNodePorts("summarize") });
      } else if (e.kind === "rename_keys") {
        const rules = Array.isArray(e.data.renames) ? e.data.renames.length : 0;
        list.push({ id: `rename_keys-${e.data.id}`, type: "rename_keys", label: "Renombrar claves", details: `${rules} regla(s)`, start: i, end: i, eventIndex: i, ports: getNodePorts("rename_keys") });
      } else if (e.kind === "markdown") {
        const toMd = (e.data.mode || "").toString() === "html_to_markdown";
        list.push({ id: `markdown-${e.data.id}`, type: "markdown", label: "Markdown", details: toMd ? "HTML → Markdown" : "Markdown → HTML", start: i, end: i, eventIndex: i, ports: getNodePorts("markdown") });
      } else if (e.kind === "crypto") {
        const act = (e.data.action || "hash").toString();
        const algo = (e.data.algorithm || "").toString();
        list.push({ id: `crypto-${e.data.id}`, type: "crypto", label: "Criptografía", details: act === "random" ? "aleatorio" : `${act} ${algo}`.trim(), start: i, end: i, eventIndex: i, ports: getNodePorts("crypto") });
      } else if (e.kind === "read_file") {
        list.push({ id: `read_file-${e.data.id}`, type: "read_file", label: "Leer archivo", details: (e.data.file_path || "sin ruta").toString().slice(0, 34), start: i, end: i, eventIndex: i, ports: getNodePorts("read_file") });
      } else if (e.kind === "write_file") {
        list.push({ id: `write_file-${e.data.id}`, type: "write_file", label: "Escribir archivo", details: (e.data.file_path || "sin ruta").toString().slice(0, 34), start: i, end: i, eventIndex: i, ports: getNodePorts("write_file") });
      }
    }
  }

  // n8n-style custom node names: honor `custom_name` saved in the event data.
  list.forEach(n => {
    if (n.eventIndex != null) {
      const custom = events[n.eventIndex]?.data?.custom_name;
      if (typeof custom === "string" && custom.trim()) {
        n.label = custom.trim();
      }
    }
  });

  return list;
}
export default buildNodes;
