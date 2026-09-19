import React from "react";
import {
  ListChecks, MessageSquare, Megaphone, TrendingUp, Landmark, Database,
  Code2, BarChart3, Wrench, Boxes, UserCheck, SquareTerminal, Sparkles,
  FolderOpen, Zap, Bot, Workflow, BrainCircuit, Brain, Hammer, Network,
  Binary, FileText, Scissors, Braces, ListOrdered, Plug, Code, Globe,
  GitBranch, MousePointer, Layers,
  type LucideIcon,
} from "lucide-react";
import { n8nCategoryLabel } from "../utils/nodeCatalog";

export const CATEGORY_ICON: Record<string, LucideIcon> = {
  action: Globe,
  transform: Database,
  flow: GitBranch,
  core: Code2,
  ai: Sparkles,
  human: UserCheck,
  desktop: MousePointer,
  trigger: Zap,
  Productivity: ListChecks,
  Communication: MessageSquare,
  Marketing: Megaphone,
  Sales: TrendingUp,
  "Finance & Accounting": Landmark,
  "Data & Storage": Database,
  Development: Code2,
  Analytics: BarChart3,
  Utility: Wrench,
  Miscellaneous: Boxes,
  HITL: UserCheck,
  "Developer Tools": SquareTerminal,
  AI: Sparkles,
  ECM: FolderOpen,
  agents: Bot,
  chains: Workflow,
  llms: BrainCircuit,
  memory: Brain,
  tools: Hammer,
  vector_store: Network,
  embeddings: Binary,
  document_loaders: FileText,
  text_splitters: Scissors,
  output_parser: Braces,
  retrievers: Sparkles,
  rerankers: ListOrdered,
  mcp: Plug,
  code: Code,
};

export const CATEGORY_ACCENT: Record<string, string> = {
  action: "#0f9d58",
  transform: "#0ea5e9",
  flow: "#f59e0b",
  core: "#06b6d4",
  ai: "#8b5cf6",
  human: "#ec4899",
  desktop: "#3b82f6",
  trigger: "#ff6d5a",
  Productivity: "#7c5cff",
  Communication: "#2cb1ff",
  Marketing: "#ff7a59",
  Sales: "#22c55e",
  "Finance & Accounting": "#f5a524",
  "Data & Storage": "#0ea5e9",
  Development: "#64748b",
  Analytics: "#a855f7",
  Utility: "#94a3b8",
  Miscellaneous: "#8b8fa3",
  HITL: "#ec4899",
  "Developer Tools": "#475569",
  AI: "#6e58f2",
  ECM: "#14b8a6",
  agents: "#6e58f2",
  chains: "#8b5cf6",
  llms: "#f59e0b",
  memory: "#10b981",
  tools: "#f97316",
  vector_store: "#06b6d4",
  embeddings: "#3b82f6",
  document_loaders: "#84cc16",
  text_splitters: "#ef4444",
  output_parser: "#6366f1",
  retrievers: "#0ea5e9",
  rerankers: "#d946ef",
  mcp: "#14b8a6",
  code: "#334155",
};

export const INTEGRATED_CATEGORY = "__integrated__";
export const OTHER_CATEGORY = "__other__";
const NEUTRAL_ACCENT = "#8b8fa3";

export function categoryMeta(key: string): { label: string; icon: LucideIcon; accent: string } {
  if (key === INTEGRATED_CATEGORY) {
    return { label: "Integrados populares", icon: Layers, accent: "#6e58f2" };
  }
  if (key === OTHER_CATEGORY) {
    return { label: "Otros", icon: Boxes, accent: NEUTRAL_ACCENT };
  }
  return {
    label: n8nCategoryLabel(key),
    icon: CATEGORY_ICON[key] ?? Boxes,
    accent: CATEGORY_ACCENT[key] ?? NEUTRAL_ACCENT,
  };
}

export function CategoryGlyph({ categoryKey, size = 16 }: { categoryKey: string; size?: number }) {
  const { icon: Glyph, accent } = categoryMeta(categoryKey);
  return (
    <span
      className="fsp-row-icon"
      style={{
        background: `color-mix(in srgb, ${accent} 15%, transparent)`,
        color: accent,
      }}
    >
      <Glyph size={size} />
    </span>
  );
}

export function CategoryHeading({ categoryKey }: { categoryKey: string }) {
  const { icon: Glyph, accent } = categoryMeta(categoryKey);
  return (
    <span style={{ color: accent, display: "inline-flex", flexShrink: 0, marginRight: 6 }}>
      <Glyph size={14} />
    </span>
  );
}
