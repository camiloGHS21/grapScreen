import React from "react";
import {
  PlayCircle, StopCircle, MousePointer, Keyboard, Move, Clock, Command, GitBranch,
  Repeat, AppWindow, XCircle, ScanEye, Variable, Camera, Terminal, CircleDot,
  Globe, GitMerge, Pause, AlertTriangle, StickyNote, Zap, Route, Code2, Play,
  FolderOpen, FileSpreadsheet, Layers, ListFilter, ArrowUpDown, Hash, Sigma,
  CalendarClock, Braces, ShieldCheck, Merge, GitCompare, FileJson, MessageSquare,
  MessageSquareCode, Send, Database, Radio, Rss, CodeXml, FileSearch, Mail,
  Slack, MessageCircle, NotebookPen, Table2, OctagonX, CircleSlash, Split,
  PenLine, FileCode, Fingerprint, FileInput, FileOutput, Blocks, Webhook, Sparkles, Bot,
} from "lucide-react";
import { FlowNodeType } from "../../../types";

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
    case "ai_agent": return React.createElement(Bot, { size });
    case "form": return React.createElement(Globe, { size });
    case "trigger": return React.createElement(Zap, { size });
    case "webhook": return React.createElement(Globe, { size });
    case "cron": return React.createElement(Clock, { size });
    case "startup": return React.createElement(Play, { size });
    case "file_change": return React.createElement(FolderOpen, { size });
    case "hotkey_trigger": return React.createElement(Command, { size });
    case "polling": return React.createElement(Radio, { size });
    case "whatsapp_trigger": return React.createElement(MessageSquareCode, { size });
    case "telegram_trigger": return React.createElement(Send, { size });
    case "email_trigger": return React.createElement(Mail, { size });
    case "rss_trigger": return React.createElement(Rss, { size });
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
    case "split_out": return React.createElement(Split, { size });
    case "summarize": return React.createElement(Sigma, { size });
    case "rename_keys": return React.createElement(PenLine, { size });
    case "markdown": return React.createElement(FileCode, { size });
    case "crypto": return React.createElement(Fingerprint, { size });
    case "read_file": return React.createElement(FileInput, { size });
    case "write_file": return React.createElement(FileOutput, { size });
    case "n8n_node": return React.createElement(Blocks, { size });
    case "n8n_trigger": return React.createElement(Webhook, { size });
    default: return React.createElement(CircleDot, { size });
  }
}
