import React from "react";
import { InlineHtml } from "./n8nInlineHtml";

export const label = (text: string) => {
  const isRequired = text.endsWith(" *") || text.includes("*");
  const cleanTitle = text.replace(/\s*\*+$/, "");
  return (
    <label className="ndv-n8n-field-label">
      <span>{cleanTitle}</span>
      {isRequired && <span className="ndv-required-asterisk"> *</span>}
    </label>
  );
};

export const hint = (text: string) => (
  <div className="ndv-n8n-field-hint">
    <InlineHtml html={text} />
  </div>
);

/**
 * A `notice` field: n8n's inline information block, shown under the condition
 * that makes it relevant ("Connect an output parser on the canvas…").
 *
 * It is an aside, not an error, so it uses the same quiet surface as the
 * callout rather than a coloured warning — which is also what keeps it from
 * competing with the required-field marker.
 */
export const notice = (text: string) => (
  <div className="ndv-n8n-notice">
    <InlineHtml html={text} />
  </div>
);

export const inputStyle: React.CSSProperties = {
  width: "100%",
  height: "32px",
  borderRadius: "5px",
  border: "1px solid var(--line)",
  background: "var(--s1)",
  color: "var(--text)",
  fontSize: "12.5px",
  padding: "0 9px",
  boxSizing: "border-box",
};
