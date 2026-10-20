import { Blocks, Webhook } from "lucide-react";
import type { FlowNodeType } from "../../../types";
import {
  N8N_ENTRIES,
  N8N_HIDDEN,
  OWN_HIDDEN,
  honestFlag,
  isN8nTrigger,
  type N8nCatalogEntry,
} from "./n8nParity";
import {
  CATALOG_GROUPS,
  N8N_GROUP_ACCENT,
  n8nCategoryLabel,
  n8nCategoryRank,
  type CatalogGroup,
  type CatalogItem,
  type NodeGroupId,
} from "./nodeCatalogTypes";
import { HAND_WRITTEN } from "./nodeCatalogHandwritten";

export * from "./nodeCatalogTypes";
export * from "./nodeCatalogHandwritten";

const N8N_TRIGGER_MODE_HINT: Record<string, string> = {
  webhook: "recibe un webhook",
  polling: "sondea la API",
  schedule: "por intervalo",
  event: "requiere un cliente externo",
};

function cleanTriggerName(name: string): string {
  return name.replace(/\s+Trigger$/i, "");
}

function initialBadge(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

function buildN8nItems(entries: N8nCatalogEntry[], groupId: NodeGroupId): CatalogItem[] {
  const seen = new Set<string>();
  return entries
    .filter((e) => !N8N_HIDDEN.has(e.key))
    .slice()
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .filter((e) => (seen.has(e.key) ? false : seen.add(e.key)))
    .map((e) => {
      const isTrigger = isN8nTrigger(e);
      const flag = honestFlag(e);
      const modeHint = isTrigger ? N8N_TRIGGER_MODE_HINT[e.triggerMode ?? ""] : undefined;
      const suffix = [modeHint, flag.note, flag.reason].filter(Boolean).join(" · ");
      const isAgent = e.key === "Agent";
      return {
        type: (isAgent ? "ai_agent" : isTrigger ? "n8n_trigger" : "n8n_node") as FlowNodeType,
        label: isTrigger ? cleanTriggerName(e.displayName) : e.displayName,
        desc: suffix ? `${e.description} · ${suffix}` : e.description,
        icon: isTrigger ? Webhook : Blocks,
        comingSoon: flag.comingSoon,
        comingSoonReason: flag.reason,
        setupNote: flag.note,
        n8nKey: e.key,
        n8nMode: e.triggerMode,
        n8nCategory: e.appCategory,
        n8nIcon: e.icon,
        n8nInitial: e.icon ? undefined : initialBadge(e.displayName),
        accent: N8N_GROUP_ACCENT[groupId],
      };
    });
}

const n8nBy = (category: string) => N8N_ENTRIES.filter((e) => e.category === category);

function ownItems(group: NodeGroupId): CatalogItem[] {
  const seen = new Set<string>();
  return HAND_WRITTEN[group].filter(
    (item) => !OWN_HIDDEN.has(item.type) && (seen.has(item.type) ? false : seen.add(item.type)),
  );
}

const OWN_ITEMS: Record<NodeGroupId, CatalogItem[]> = {
  trigger: ownItems("trigger"),
  ai: ownItems("ai"),
  action: ownItems("action"),
  transform: ownItems("transform"),
  flow: ownItems("flow"),
  core: ownItems("core"),
  human: ownItems("human"),
  desktop: ownItems("desktop"),
};

const AI_ENTRIES = n8nBy("AI");
const AI_TRIGGER_ITEMS = buildN8nItems(AI_ENTRIES.filter((e) => isN8nTrigger(e)), "trigger");
const AI_STEP_ITEMS = buildN8nItems(AI_ENTRIES.filter((e) => !isN8nTrigger(e)), "ai");

export const CATALOG_ITEMS: Record<NodeGroupId, CatalogItem[]> = {
  trigger: [
    ...OWN_ITEMS.trigger,
    ...AI_TRIGGER_ITEMS,
    ...buildN8nItems(n8nBy("Trigger"), "trigger"),
  ],
  ai: [...OWN_ITEMS.ai, ...AI_STEP_ITEMS],
  action: [
    ...OWN_ITEMS.action,
    ...buildN8nItems(n8nBy("App / Integration"), "action"),
  ],
  transform: OWN_ITEMS.transform,
  flow: OWN_ITEMS.flow,
  core: [...OWN_ITEMS.core, ...buildN8nItems(n8nBy("Core"), "core")],
  human: OWN_ITEMS.human,
  desktop: OWN_ITEMS.desktop,
};

export const INTEGRATED_ITEMS: Record<NodeGroupId, CatalogItem[]> = OWN_ITEMS;

export const integratedCount = (group: NodeGroupId) => OWN_ITEMS[group].length;

export function categorisedN8nItems(
  group: NodeGroupId,
): { category: string | null; label: string; items: CatalogItem[] }[] {
  const buckets = new Map<string, CatalogItem[]>();
  for (const item of CATALOG_ITEMS[group]) {
    if (!item.n8nKey) continue;
    const key = item.n8nCategory || "";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(item);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => {
      const rank = n8nCategoryRank(a) - n8nCategoryRank(b);
      return rank !== 0 ? rank : a.localeCompare(b);
    })
    .map(([category, items]) => ({
      category: category || null,
      label: category ? n8nCategoryLabel(category) : "Otros",
      items,
    }));
}

export const ALL_CATALOG_ITEMS: CatalogItem[] = CATALOG_GROUPS.flatMap(
  (g) => CATALOG_ITEMS[g.id],
);

export const itemIdentity = (item: CatalogItem) =>
  item.n8nKey ?? `${item.type}:${item.label}`;

const normalise = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export const SEARCHABLE_ITEMS: CatalogItem[] = (() => {
  const byIdentity = new Map<string, CatalogItem>();
  for (const item of ALL_CATALOG_ITEMS) {
    const id = itemIdentity(item);
    const seen = byIdentity.get(id);
    if (!seen || (seen.comingSoon && !item.comingSoon)) byIdentity.set(id, item);
  }
  return [...byIdentity.values()];
})();

export function matchesCatalogQuery(item: CatalogItem, query: string): boolean {
  const q = normalise(query.trim());
  if (!q) return false;
  const haystack = normalise(
    `${item.label} ${item.desc} ${item.type} ${item.n8nCategory ?? ""} ${item.n8nKey ?? ""}`,
  );
  return haystack.includes(q);
}

export const ADVANCED_NODE_TYPES: ReadonlySet<string> = new Set([
  "sub_workflow", "http_request", "code", "webhook", "switch", "merge",
  "google_sheets", "google_docs", "whatsapp", "telegram", "ai_agent",
  "form", "excel_local", "condition", "loop", "split_batches", "set_var",
  "error_handler", "cron", "startup", "file_change", "hotkey_trigger", "trigger", "polling",
  "whatsapp_trigger", "telegram_trigger", "email_trigger", "rss_trigger",
  "filter", "sort", "limit", "aggregate", "edit_fields", "date_time",
  "llm_chain", "classifier",
  "remove_duplicates", "compare_datasets",
  "information_extractor", "sentiment_analysis",
  "sqlite_query", "sqlite_execute",
  "xml_parse", "html_extract", "rss_read",
  "send_email", "slack_webhook", "discord_webhook", "notion", "airtable",
  "wait", "scroll", "noop", "stop_error",
  "click", "type", "delay", "hotkey", "open_app", "close_app", "wait_image", "screenshot", "run_cmd",
  "split_out", "summarize", "rename_keys", "markdown", "crypto",
  "read_file", "write_file",
  "n8n_node", "n8n_trigger",
]);

export function groupOfItem(item: CatalogItem): CatalogGroup | undefined {
  return CATALOG_GROUPS.find((g) => CATALOG_ITEMS[g.id].some((it) => it === item));
}
