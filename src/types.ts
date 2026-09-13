export type FlowNodeType =
  | "start" | "end" | "app"
  | "click" | "type" | "delay" | "scroll"
  | "hotkey" | "condition" | "loop"
  | "open_app" | "close_app" | "wait_image"
  | "set_var" | "screenshot" | "run_cmd"
  | "google_sheets" | "google_docs" | "whatsapp" | "telegram" | "ai_agent" | "form" | "excel_local"
  // New n8n-level node types
  | "trigger" | "webhook" | "http_request"
  | "switch" | "merge" | "wait" | "code"
  | "error_handler" | "note" | "split_batches" | "sub_workflow"
  | "cron" | "startup" | "file_change" | "hotkey_trigger" | "polling"
  // Data transformation (Phase 3)
  | "filter" | "sort" | "limit" | "aggregate" | "edit_fields" | "date_time"
  // AI (Phase 3)
  | "llm_chain" | "classifier"
  // Data transformation + AI (Phase 4)
  | "remove_duplicates" | "compare_datasets"
  | "information_extractor" | "sentiment_analysis"
  // Database (Phase 6)
  | "sqlite_query" | "sqlite_execute"
  // Parsing + integrations + flow control (Phase 11)
  | "rss_read" | "xml_parse" | "html_extract"
  | "send_email" | "slack_webhook" | "discord_webhook" | "notion" | "airtable"
  | "stop_error" | "noop"
  // n8n Core nodes
  | "split_out" | "summarize" | "rename_keys" | "markdown" | "crypto"
  | "read_file" | "write_file";

export type RecordedEvent = {
  at_ms: number;
  kind: string;
  data: any;
};

/** Extended state for the add-node menu (canvas-wide or port-level) */
export interface AddMenuState {
  id: string;
  x: number;
  y: number;
  mode?: "canvas" | "node";
  sourceType?: FlowNodeType;
  sourcePortId?: string;
  /**
   * When the node comes from the right-hand catalog panel we already know the
   * type: the menu opens pre-filtered so the user just confirms placement.
   * Kept for the right-click / wire flows that still use the inline menu.
   */
  presetType?: FlowNodeType;
  presetLabel?: string;
}

export type AutomationDetail = {
  id: string;
  name: string;
  created_at: number;
  duration_ms: number;
  generate_mp4: boolean;
  events: RecordedEvent[];
  /** Flexible connections between node ports */
  connections?: FlowConnection[];
  target_app?: {
    exe: string;
    title: string;
    class: string;
    name?: string;
    rect: [number, number, number, number];
  } | null;
};

export type AutomationSummary = {
  id: string;
  name: string;
  created_at: number;
  duration_ms: number;
  event_count: number;
  has_video: boolean;
  json_path: string;
  mp4_path: string | null;
};

export type Project = {
  name: string;
  automations: AutomationSummary[];
};

/* ───── Port & Connection system (n8n-style) ───── */

export interface FlowPort {
  id: string;
  label?: string;
  color?: string;
}

export interface FlowConnection {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

export interface StickyNoteData {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
  text: string;
}

export interface FlowLayoutMetadata {
  connections: FlowConnection[];
  positions: Record<string, { x: number; y: number }>;
  notes: StickyNoteData[];
  disabledNodeIds?: string[];
}

/* ───── Node categories ───── */

export type NodeCategory =
  | "trigger"
  | "interaction"
  | "apps"
  | "control"
  | "system"
  | "services"
  | "messaging"
  | "ai"
  | "transform"
  | "flow"
  | "note";

/* ───── FlowNode ───── */

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  label: string;
  details: string;
  eventIndex?: number;
  data_idx?: number;
  rangeStart?: number;

  rangeEnd?: number;
  start?: number;
  end?: number;
  /** Disable node (skip during execution) */
  disabled?: boolean;
  /** Sticky-note content */
  notes?: string;
  /** Multi-port configuration */
  ports?: {
    inputs: FlowPort[];
    outputs: FlowPort[];
  };
  /** Pin Data: mocked output payload */
  pinnedData?: any;
  /** Whether pinned mock data is enabled for execution */
  pinEnabled?: boolean;
  app?: {
    exe: string;
    title: string;
    class: string;
    name?: string;
    rect: [number, number, number, number];
  };
}

export interface NodeRunStatus {
  node_id: string;
  label: string;
  status: string; // "ok" | "error" | "running" | "skipped" | "stopped"
  detail?: string | null;
  input_data?: any;
  output_data?: any;
  duration_ms?: number;
}

export interface NodeDetailPayload {
  id: string;
  nodeId: string;
  status: string;
  input_data?: any;
  output_data?: any;
  duration_ms?: number;
}


/* ───── UI Builder types ───── */

export type UIElementType =
  | "container" | "label" | "button" | "input" | "textarea"
  | "select" | "checkbox" | "image" | "divider" | "spacer"
  | "header" | "menu" | "colorPicker" | "slider" | "progressBar";

export interface UIElement {
  id: string;
  type: UIElementType;
  /** Display label in the builder tree */
  name: string;
  /** Component-specific props */
  props: {
    text?: string;
    placeholder?: string;
    options?: string;        // comma-separated for select
    required?: boolean;
    defaultValue?: string;
    src?: string;            // image path or emoji for logo
    color?: string;          // text/accent color
    bgColor?: string;        // background color
    fontSize?: number;
    fontWeight?: number;
    align?: "left" | "center" | "right";
    width?: string;          // "100%", "auto", "200px"
    height?: string;
    padding?: number;
    borderRadius?: number;
    outputVar?: string;      // variable name to store the value
    menuItems?: string;      // comma-separated menu entries (each opens a sub-screen with the same title)
    gridColumns?: number;    // number of CSS grid columns (1 to 12)
    gridTemplate?: string;   // custom grid-template-columns value (e.g. "repeat(4, 1fr)", "1fr 2fr")
    justifyContent?: string; // CSS justify-content property
    alignItems?: string;     // CSS align-items property
    flexWrap?: "nowrap" | "wrap" | "wrap-reverse";
    flexDirection?: "row" | "column" | "row-reverse" | "column-reverse";
    flexGrow?: number;
  };
  /** Layout: children for containers */
  children?: UIElement[];
  /** Layout direction for containers */
  direction?: "vertical" | "horizontal" | "grid" | "grid2" | "grid3";
  /** Gap between children in px */
  gap?: number;
}

export interface UIScreen {
  title: string;
  width: number;
  height: number;
  bgColor: string;
  /** Optional CSS gradient (overrides bgColor when present) */
  bgGradient?: string;
  /** Stable id, used for sub-menu / sub-screen navigation */
  id?: string;
  elements: UIElement[];
  /** Sub-screens / sub-menus reachable from this screen */
  screens?: UIScreen[];
}

export type StopResult = { automation: AutomationSummary; video_error: string | null };