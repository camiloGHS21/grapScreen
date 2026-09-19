import React from "react";

/**
 * The inline markup n8n puts inside `displayName` strings, rendered as React
 * elements instead of injected HTML.
 *
 * n8n writes emphasis and links straight into its labels — the AI Agent's
 * callout is
 *
 *   `Tip: … our quick <a href="https://docs.n8n.io/…">tutorial</a> or see an
 *    <a href="/workflows/templates/1954">example</a> …`
 *
 * — and renders them with `v-html`. `dangerouslySetInnerHTML` is the direct
 * equivalent and is deliberately not used: these strings come from JSON files
 * fetched at runtime, so injecting them would turn a bad payload into script
 * execution inside the app.
 *
 * The string is tokenised and rebuilt instead. A tag becomes an element only
 * when its name is on the allow-list below; anything else is dropped and its
 * text content kept — which is what `cleanText` already did for hints, plus the
 * emphasis n8n actually shows.
 */
const ALLOWED_TAGS = new Set(["a", "b", "strong", "em", "i", "code", "br"]);

/** Tags that never have a closing form, so `</br>` is not mistaken for a pair. */
const VOID_TAGS = new Set(["br"]);

/** The few entities worth decoding: without this, `&amp;` shows up verbatim. */
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": "\u00a0",
};

function decodeEntities(text: string): string {
  return text.replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);
}

type Token =
  | { kind: "text"; value: string }
  | { kind: "open"; name: string; attrs: Record<string, string> }
  | { kind: "close"; name: string };

type TextNode = { kind: "text"; value: string };
type ElementNode = {
  kind: "element";
  name: string;
  attrs: Record<string, string>;
  children: InlineNode[];
};
type InlineNode = TextNode | ElementNode;

/** `href="…"`, `href='…'` and the bare `data-action='…'` n8n also writes. */
function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    attrs[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? "";
  }
  return attrs;
}

function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m.index > last) {
      tokens.push({ kind: "text", value: decodeEntities(html.slice(last, m.index)) });
    }
    last = re.lastIndex;
    const name = m[2].toLowerCase();
    if (!ALLOWED_TAGS.has(name)) continue;
    if (m[1] === "/") {
      if (!VOID_TAGS.has(name)) tokens.push({ kind: "close", name });
    } else {
      tokens.push({ kind: "open", name, attrs: parseAttributes(m[3]) });
    }
  }
  if (last < html.length) tokens.push({ kind: "text", value: decodeEntities(html.slice(last)) });
  return tokens;
}

/** Builds the tag tree, so nesting is real rather than a flat run of elements. */
function nest(tokens: Token[]): InlineNode[] {
  const root: ElementNode = { kind: "element", name: "#root", attrs: {}, children: [] };
  const stack: ElementNode[] = [root];

  const top = () => stack[stack.length - 1];

  for (const token of tokens) {
    if (token.kind === "text") {
      top().children.push({ kind: "text", value: token.value });
      continue;
    }
    if (token.kind === "close") {
      // Only close a tag this pass opened, so a stray `</b>` cannot unbalance
      // what is already built.
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].name === token.name) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    if (VOID_TAGS.has(token.name)) {
      top().children.push({ kind: "element", name: token.name, attrs: token.attrs, children: [] });
      continue;
    }
    const element: ElementNode = {
      kind: "element",
      name: token.name,
      attrs: token.attrs,
      children: [],
    };
    top().children.push(element);
    stack.push(element);
  }

  return root.children;
}

/**
 * Is this URL safe to put in an `href`?
 *
 * Only absolute `http(s)` links become anchors. n8n also writes in-app targets
 * — `/workflows/templates/1954`, `data-action="openSelectiveNodeCreator"` —
 * which are canvas actions this app cannot perform; rendering them as links
 * would either do nothing or navigate the desktop shell away from the app, so
 * their text is kept without the anchor.
 */
function isExternalUrl(href: string | undefined): href is string {
  return typeof href === "string" && /^https?:\/\//i.test(href);
}

function renderNodes(nodes: InlineNode[], path: string): React.ReactNode[] {
  return nodes.map((node, i) => {
    const key = `${path}.${i}`;
    if (node.kind === "text") return node.value;
    if (node.name === "br") return React.createElement("br", { key });
    const props: Record<string, unknown> = { key };
    if (node.name === "a") {
      if (isExternalUrl(node.attrs.href)) {
        props.href = node.attrs.href;
        props.target = "_blank";
        props.rel = "noopener noreferrer";
      } else {
        // Kept as n8n renders it, but not as a link: hovering has to say why
        // clicking does nothing.
        props.className = "ndv-inline-dead-link";
        props.title = "Enlace de la aplicación n8n; no está disponible aquí";
      }
    }
    return React.createElement(node.name, props, renderNodes(node.children, key));
  });
}

/** The inline content of an n8n label, as React nodes. */
export function InlineHtml({ html }: { html: string }) {
  return React.createElement(React.Fragment, null, ...renderNodes(nest(tokenize(html)), "n"));
}

export default InlineHtml;
