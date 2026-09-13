import React from "react";
import {
  PlayCircle,
  StopCircle,
  MousePointer,
  Keyboard,
  Move,
  Clock,
  Command,
  GitBranch,
  Repeat,
  AppWindow,
  XCircle,
  ScanEye,
  Variable,
  Camera,
  Terminal,
  CircleDot,
  Globe,
  GitMerge,
  Pause,
  AlertTriangle,
  StickyNote,
  Zap,
  Route,
  Code2,
  Play,
  FolderOpen,
  FileSpreadsheet,
  Layers,
  ListFilter,
  ArrowUpDown,
  Hash,
  Sigma,
  CalendarClock,
  Braces,
  ShieldCheck,
  Merge,
  GitCompare,
  FileJson,
  MessageSquare,
  Database,
  Radio,
  Rss,
  CodeXml,
  FileSearch,
  Mail,
  Slack,
  MessageCircle,
  NotebookPen,
  Table2,
  OctagonX,
  CircleSlash,
  Split,
  PenLine,
  FileCode,
  Fingerprint,
  FileInput,
  FileOutput,
} from "lucide-react";
import { FlowNodeType, FlowPort } from "../../../types";
import { NODE_H } from "../../../Flowchart";

const DEFAULT_IN: FlowPort[] = [{ id: "in", label: "Input" }];
const DEFAULT_OUT: FlowPort[] = [{ id: "out", label: "Output" }];

/** Vertical gap between two ports on the same side of a node. */
export const PORT_SPACING = 22;

/**
 * Height of a node box. Grows below the base height once a node has more than
 * two ports on one side (switch, merge, error_handler…).
 *
 * This is the single source of truth: the node box, the port dots and every
 * wire endpoint must all use it, or ports end up drawn in one place and wires
 * leaving from another.
 */
export function getNodeHeight(node: { type: FlowNodeType; ports?: { inputs: FlowPort[]; outputs: FlowPort[] } }): number {
  const ports = node.ports || getNodePorts(node.type);
  const maxPorts = Math.max(ports.inputs.length, ports.outputs.length);
  return maxPorts > 2 ? NODE_H + (maxPorts - 2) * PORT_SPACING : NODE_H;
}

/**
 * Vertical offset of a port inside its node box, relative to the box top.
 *
 * `index` is the port's position within its own side (inputs and outputs are
 * laid out independently), `nodeH` must come from `getNodeHeight`.
 */
export function portY(index: number, count: number, nodeH: number = NODE_H): number {
  if (count <= 1) return nodeH / 2;
  const totalH = (count - 1) * PORT_SPACING;
  return (nodeH - totalH) / 2 + index * PORT_SPACING;
}

/**
 * Resolves the index of a port id within `ports`, tolerating the id schemes
 * written by older recordings.
 *
 * Returns -1 when the port genuinely does not exist, so callers can decide
 * what to do instead of silently collapsing onto port 0 (which used to make a
 * multi-output switch draw every wire from its first output).
 */
export function resolvePortIndex(ports: FlowPort[] | undefined, portId: string | undefined): number {
  if (!ports || ports.length === 0) return -1;
  if (!portId) return ports.length === 1 ? 0 : -1;

  const exact = ports.findIndex((p) => p.id === portId);
  if (exact >= 0) return exact;

  // Legacy aliases: `true`/`false` were once `yes`/`no`; cases were `output0`.
  const ALIASES: Record<string, string[]> = {
    true: ["yes", "output0", "out0", "case0"],
    false: ["no", "output1", "out1"],
    case0: ["output0", "out0", "case_0"],
    case1: ["output1", "out1", "case_1"],
    case2: ["output2", "out2", "case_2"],
    default: ["fallback", "else", "output_default"],
    body: ["loop", "each"],
    done: ["end", "complete"],
  };
  const candidates = ALIASES[portId] || [];
  for (const candidate of candidates) {
    const idx = ports.findIndex((p) => p.id === candidate);
    if (idx >= 0) return idx;
  }

  // `output3` / `case4` style numeric suffixes map onto the positional index.
  const numeric = portId.match(/(\d+)$/);
  if (numeric) {
    const idx = Number(numeric[1]);
    if (idx >= 0 && idx < ports.length) return idx;
  }

  return -1;
}

export function getNodePorts(type: FlowNodeType): { inputs: FlowPort[]; outputs: FlowPort[] } {
  switch (type) {
    case "start":
    case "trigger":
    case "webhook":
    case "cron":
    case "startup":
    case "file_change":
    case "hotkey_trigger":
    case "polling":
      return { inputs: [], outputs: [{ id: "out", label: "Output" }] };
    case "end":
      return { inputs: [{ id: "in", label: "Input" }], outputs: [] };
    // `stop_error` aborts the flow, so nothing ever leaves it.
    case "stop_error":
      return { inputs: [{ id: "in", label: "Input" }], outputs: [] };
    case "condition":
      return {
        inputs: DEFAULT_IN,
        outputs: [
          { id: "true", label: "Verdadero", color: "#22c55e" },
          { id: "false", label: "Falso", color: "#ef4444" },
        ],
      };
    case "loop":
      return {
        inputs: DEFAULT_IN,
        outputs: [
          { id: "body", label: "Cuerpo", color: "#f97316" },
          { id: "done", label: "Fin", color: "#22c55e" },
        ],
      };
    case "split_batches":
      return {
        inputs: DEFAULT_IN,
        outputs: [
          { id: "body", label: "Por item", color: "#f97316" },
          { id: "done", label: "Fin", color: "#22c55e" },
        ],
      };
    case "switch":
      return {
        inputs: DEFAULT_IN,
        outputs: [
          { id: "case0", label: "Caso 1", color: "#3b82f6" },
          { id: "case1", label: "Caso 2", color: "#8b5cf6" },
          { id: "case2", label: "Caso 3", color: "#f59e0b" },
          { id: "default", label: "Default", color: "#64748b" },
        ],
      };
    case "merge":
      return {
        inputs: [
          { id: "in1", label: "Input 1" },
          { id: "in2", label: "Input 2" },
        ],
        outputs: DEFAULT_OUT,
      };
    case "error_handler":
      return {
        inputs: [
          { id: "main", label: "Principal" },
          { id: "error", label: "Error", color: "#ef4444" },
        ],
        outputs: DEFAULT_OUT,
      };
    case "note":
      return { inputs: [], outputs: [] };
    default:
      return { inputs: DEFAULT_IN, outputs: DEFAULT_OUT };
  }
}

export function getNodeIcon(type: FlowNodeType, size = 18) {
  switch (type) {
    case "start": return React.createElement(PlayCircle, { size });
    case "end": return React.createElement(StopCircle, { size });
    case "click": return React.createElement(MousePointer, { size });
    case "type": return React.createElement(Keyboard, { size });
    case "scroll": return React.createElement(Move, { size });
    case "delay": return React.createElement(Clock, { size });
    case "hotkey": return React.createElement(Command, { size });
    case "condition": return React.createElement(GitBranch, { size });
    case "loop": return React.createElement(Repeat, { size });
    case "split_batches": return React.createElement(Layers, { size });
    case "open_app": return React.createElement(AppWindow, { size });
    case "close_app": return React.createElement(XCircle, { size });
    case "wait_image": return React.createElement(ScanEye, { size });
    case "set_var": return React.createElement(Variable, { size });
    case "screenshot": return React.createElement(Camera, { size });
    case "run_cmd": return React.createElement(Terminal, { size });
    case "google_sheets": return React.createElement(Globe, { size });
    case "excel_local": return React.createElement(FileSpreadsheet, { size });
    case "google_docs": return React.createElement(Globe, { size });
    case "whatsapp": return React.createElement(Globe, { size });
    case "telegram": return React.createElement(Globe, { size });
    case "ai_agent": return React.createElement(Globe, { size });
    case "form": return React.createElement(Globe, { size });
    case "trigger": return React.createElement(Zap, { size });
    case "webhook": return React.createElement(Globe, { size });
    case "cron": return React.createElement(Clock, { size });
    case "startup": return React.createElement(Play, { size });
    case "file_change": return React.createElement(FolderOpen, { size });
    case "hotkey_trigger": return React.createElement(Command, { size });
    case "polling": return React.createElement(Radio, { size });
    case "http_request": return React.createElement(Globe, { size });
    case "switch": return React.createElement(Route, { size });
    case "merge": return React.createElement(GitMerge, { size });
    case "wait": return React.createElement(Pause, { size });
    case "code": return React.createElement(Code2, { size });
    case "error_handler": return React.createElement(AlertTriangle, { size });
    case "sub_workflow": return React.createElement(GitMerge, { size });
    case "note": return React.createElement(StickyNote, { size });
    case "filter": return React.createElement(ListFilter, { size });
    case "sort": return React.createElement(ArrowUpDown, { size });
    case "limit": return React.createElement(Hash, { size });
    case "aggregate": return React.createElement(Sigma, { size });
    case "edit_fields": return React.createElement(Variable, { size });
    case "date_time": return React.createElement(CalendarClock, { size });
    case "llm_chain": return React.createElement(Braces, { size });
    case "classifier": return React.createElement(ShieldCheck, { size });
    case "remove_duplicates": return React.createElement(Merge, { size });
    case "compare_datasets": return React.createElement(GitCompare, { size });
    case "information_extractor": return React.createElement(FileJson, { size });
    case "sentiment_analysis": return React.createElement(MessageSquare, { size });
    case "sqlite_query": return React.createElement(Database, { size });
    case "sqlite_execute": return React.createElement(Database, { size });
    case "rss_read": return React.createElement(Rss, { size });
    case "xml_parse": return React.createElement(CodeXml, { size });
    case "html_extract": return React.createElement(FileSearch, { size });
    case "send_email": return React.createElement(Mail, { size });
    case "slack_webhook": return React.createElement(Slack, { size });
    case "discord_webhook": return React.createElement(MessageCircle, { size });
    case "notion": return React.createElement(NotebookPen, { size });
    case "airtable": return React.createElement(Table2, { size });
    case "stop_error": return React.createElement(OctagonX, { size });
    case "noop": return React.createElement(CircleSlash, { size });
    // n8n Core
    case "split_out": return React.createElement(Split, { size });
    case "summarize": return React.createElement(Sigma, { size });
    case "rename_keys": return React.createElement(PenLine, { size });
    case "markdown": return React.createElement(FileCode, { size });
    case "crypto": return React.createElement(Fingerprint, { size });
    case "read_file": return React.createElement(FileInput, { size });
    case "write_file": return React.createElement(FileOutput, { size });
    default: return React.createElement(CircleDot, { size });
  }
}
