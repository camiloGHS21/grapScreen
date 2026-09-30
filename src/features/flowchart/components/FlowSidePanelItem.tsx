import React, { useState } from "react";
import { Plus } from "lucide-react";
import { NODE_COLORS } from "../../../Flowchart";
import { itemIdentity, n8nCategoryLabel, type CatalogItem } from "../utils/nodeCatalog";

// Re-exported so the panels that key their lists by identity keep importing it
// from the item they render; the definition lives with `CatalogItem`.
export { itemIdentity };

interface PanelItemProps {
  item: CatalogItem;
  onPick: (item: CatalogItem) => void;
  showCategory?: boolean;
}

export function PanelItem({ item, onPick, showCategory }: PanelItemProps) {
  const accent = item.accent || NODE_COLORS[item.type] || "var(--muted)";
  const logo = item.n8nIcon
    ? `${import.meta.env.BASE_URL}n8n-icons/${item.n8nIcon}`
    : null;
  const initial = item.n8nInitial;
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <button
      type="button"
      className="fsp-item"
      disabled={item.comingSoon}
      style={{ "--accent": accent } as React.CSSProperties}
      onClick={() => onPick(item)}
      title={
        item.comingSoon
          ? `${item.label}: no disponible — ${item.comingSoonReason || "este motor no lo ejecuta"}`
          : item.desc
      }
    >
      <span className="fsp-item-icon">
        {logo && !imgFailed ? (
          <img
            src={logo}
            alt=""
            width={21}
            height={21}
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : initial ? (
          <span
            className="fsp-initial"
            style={{
              width: 21,
              height: 21,
              borderRadius: 6,
              background: accent,
              color: "#fff",
              font: "700 11px Manrope",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            {initial}
          </span>
        ) : (
          <item.icon size={21} />
        )}
      </span>
      <span className="fsp-item-text">
        <span className="fsp-item-title">
          {item.label}
          {item.comingSoon && <em className="fsp-soon">No disponible</em>}
          {!item.comingSoon && item.setupNote && (
            <em className="fsp-soon" title={item.setupNote}>
              {item.setupNote}
            </em>
          )}
          {showCategory && item.n8nCategory && (
            <em className="fsp-item-cat">{n8nCategoryLabel(item.n8nCategory)}</em>
          )}
        </span>
        <span className="fsp-item-desc">{item.desc}</span>
        {/* The reason a blocked node is blocked, written out in full.
            It used to live only in the `title` of a disabled button — the one
            element that never receives the pointer — and the description it was
            folded into is clipped with an ellipsis, so the half of the sentence
            that says *why* was the half that got cut. */}
        {item.comingSoon && (
          <span className="fsp-item-reason">
            {item.comingSoonReason || "este motor no puede ejecutar este nodo"}
          </span>
        )}
      </span>
      {!item.comingSoon && <Plus size={15} className="fsp-plus" />}
    </button>
  );
}
