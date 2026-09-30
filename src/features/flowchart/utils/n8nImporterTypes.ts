export interface N8nWorkflowNode {
  id?: string;
  name: string;
  type: string;
  typeVersion?: number;
  position?: [number, number];
  parameters?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  disabled?: boolean;
  notes?: string;
  notesInFlow?: boolean;
  continueOnFail?: boolean;
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  alwaysOutputData?: boolean;
  executeOnce?: boolean;
  onError?: string;
}

export interface N8nConnectionItem {
  node: string;
  type: string;
  index: number;
}

export interface N8nWorkflowData {
  name?: string;
  nodes?: N8nWorkflowNode[];
  connections?: Record<string, Record<string, N8nConnectionItem[][]>>;
  pinData?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

export interface N8nImportResult {
  events: import("../../../types").RecordedEvent[];
  summary: {
    name: string;
    nodeCount: number;
    connectionCount: number;
    notesCount: number;
  };
}

export function cleanN8nType(rawType: string): string {
  const parts = rawType.split(".");
  return parts[parts.length - 1] || rawType;
}

export function formatSchedule(params?: Record<string, unknown>): string {
  if (!params) return "1h";
  const rule = params.rule as Record<string, unknown> | undefined;
  const interval = Array.isArray(rule?.interval) ? (rule?.interval[0] as Record<string, unknown>) : undefined;
  if (!interval) return "1h";
  const field = String(interval.field || "hours");
  if (field === "cronExpression") return String(interval.expression || "0 0 * * *");
  if (field === "minutes") return `${interval.minutesInterval || 15}m`;
  if (field === "hours") return `${interval.hoursInterval || 1}h`;
  if (field === "days") return `${interval.daysInterval || 1}d`;
  if (field === "seconds") return `${interval.secondsInterval || 30}s`;
  return "1h";
}

export function calculateWaitSeconds(params?: Record<string, unknown>): number {
  if (!params) return 5;
  const amount = Number(params.amount) || 5;
  const unit = String(params.unit || "seconds").toLowerCase();
  if (unit.startsWith("min")) return amount * 60;
  if (unit.startsWith("hour")) return amount * 3600;
  return amount;
}

export function resolveSourcePortId(sourceKind: string, outputIdx: number): string {
  if (sourceKind === "condition") return outputIdx === 0 ? "true" : "false";
  if (sourceKind === "switch") {
    if (outputIdx === 0) return "case0";
    if (outputIdx === 1) return "case1";
    if (outputIdx === 2) return "case2";
    return "default";
  }
  if (sourceKind === "split_batches" || sourceKind === "loop") {
    return outputIdx === 0 ? "body" : "done";
  }
  return "out";
}

export function resolveTargetPortId(targetKind: string, connectionCategory: string, inputIdx: number): string {
  if (connectionCategory === "ai_languageModel") return "model";
  if (connectionCategory === "ai_memory") return "memory";
  if (connectionCategory === "ai_tool") return "tool";
  if (connectionCategory === "ai_outputParser") return "outputParser";
  if (targetKind === "merge") return inputIdx === 1 ? "in2" : "in1";
  if (targetKind === "error_handler") return inputIdx === 1 ? "error" : "main";
  return "in";
}
