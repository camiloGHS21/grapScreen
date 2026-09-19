import React from "react";
import {
  Bell, ClipboardList, Clock, Database, FileSearch, FileSpreadsheet, FolderOpen,
  GitBranch, Globe, ListChecks, MousePointer, Sparkles, ShieldAlert,
} from "lucide-react";
import type { CredentialRequirement, RuntimeRequirement } from "../nodeContract";

import type { LucideIcon } from "lucide-react";

/** Lucide component for a category, by the name `categories.ts` stores. */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  ClipboardList, FileSpreadsheet, Bell, Sparkles, Globe, FileSearch,
  FolderOpen, Database, MousePointer, GitBranch, Clock, ListChecks,
};

export function categoryIcon(name: string, size = 15): React.ReactNode {
  const Icon = CATEGORY_ICONS[name] ?? ListChecks;
  return React.createElement(Icon, { size });
}

/**
 * The warning stamp on a card that needs something the user has to supply.
 *
 * Credentials and environmental needs are shown together but worded
 * differently: one is a secret to paste, the other is a capability the machine
 * either has or does not.
 */
export function RequirementBadge({
  credentials,
  runtime,
  labels,
  runtimeLabels,
}: {
  credentials: CredentialRequirement[];
  runtime: RuntimeRequirement[];
  labels: Record<string, string>;
  runtimeLabels: Record<string, string>;
}) {
  if (credentials.length === 0 && runtime.length === 0) {
    return <span className="tpl-badge ready">Funciona sin configurar nada</span>;
  }
  if (credentials.length > 0) {
    return (
      <span
        className="tpl-badge needs"
        title={`Necesita: ${credentials.map((c) => labels[c]).join(" · ")}`}
      >
        <ShieldAlert size={11} /> Requiere credenciales ({credentials.length})
      </span>
    );
  }
  return (
    <span className="tpl-badge env" title={`Necesita: ${runtime.map((r) => runtimeLabels[r]).join(" · ")}`}>
      {runtime.map((r) => runtimeLabels[r]).join(" · ")}
    </span>
  );
}
