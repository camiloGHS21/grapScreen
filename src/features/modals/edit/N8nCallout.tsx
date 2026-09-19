import React, { useState } from "react";
import { Info, X } from "lucide-react";
import { N8nProperty } from "./n8nParamsUtils";
import { InlineHtml } from "./n8nInlineHtml";

/**
 * n8n's `callout` parameter type: the tinted box a node uses to explain itself
 * before the first field.
 *
 * The AI Agent opens with one — `aiAgentStarterCallout`, "Tip: Get a feel for
 * agents with our quick tutorial or see an example of how this node works" —
 * whose text carries two links. Rendering it as a plain field label (which is
 * what the panel used to do) printed the raw `<a href=…>` tags.
 *
 * It holds no value and is not saved: it is a dismissible hint, so the closed
 * state is local to the open panel and comes back the next time the node is
 * opened, exactly as in n8n.
 */
export function N8nCallout({ prop }: { prop: N8nProperty }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="ndv-callout" role="note">
      <span className="ndv-callout-icon" aria-hidden="true">
        <Info size={14} />
      </span>
      <p className="ndv-callout-text">
        <InlineHtml html={prop.displayName} />
      </p>
      <button
        type="button"
        className="ndv-callout-close"
        onClick={() => setDismissed(true)}
        title="Cerrar"
        aria-label="Cerrar aviso"
      >
        <X size={13} />
      </button>
    </div>
  );
}

export default N8nCallout;

