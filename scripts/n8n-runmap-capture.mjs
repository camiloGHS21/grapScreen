// Derives, for every n8n node, the HTTP request(s) it would really issue.
//
// The problem this solves
// -----------------------
// n8n implements its app nodes as *code*: the request path, the query string and
// the body are built inside `execute()`, often conditionally. A per-node Rust
// reimplementation of 297 integrations is not maintainable, and a naive
// "baseUrl + node parameters as body" guess produces 400s (see the Notion case).
//
// So the request is *captured* instead of guessed: the real node class is loaded
// (same loader the parameter form uses), `execute()` is called with a mocked
// `IExecuteFunctions` whose parameters carry unique sentinels, and every HTTP
// helper call is recorded. Sentinels are then rewritten into `{{$parameter.x}}`
// placeholders, which turns the captured request into a template the Rust engine
// can evaluate natively — no JavaScript at runtime, so the same artifact works on
// Windows, Linux and macOS.
//
// What it does not do
// -------------------
// A node that computes a body from dynamic UI (Notion's property mapper, for
// instance) cannot be captured faithfully: the captured case is marked
// `partial` and the palette keeps it out until a hand-written mapping covers it.
// Nodes that make no HTTP call on a path (local file work, WebSocket
// subscribers, brokers) produce zero requests and are reported as `none`.

import fs from "node:fs";
import path from "node:path";
import { createNodeLoader } from "./n8n-node-loader.mjs";

const SRC = "./.n8n-cache/src";
// The palette catalogue (`n8n-catalog.json`) carries no source path on purpose —
// it is the file the editor ships. The paths live in the descriptor artifact.
const SOURCES = "./src/data/n8n-descriptors.json";
const OUT = "./src/data/n8n-runmap.json";

/** How many helper calls a single case may record before we assume a loop. */
const MAX_REQUESTS = 6;

/** Thrown internally to stop a node that pages forever against the mock. */
const CAPTURE_LIMIT = Symbol("runmap.capture-limit");

/**
 * Nodes whose `execute()` never returns under the mock.
 *
 * A synchronous loop inside the node's own code cannot be interrupted from the
 * same process — not by a timer, not by a promise race — so these are excluded
 * by name. They are not silently dropped: the artifact records them as
 * `skipped` with the reason, and the palette keeps them out.
 *
 * `Phantombuster` spins when it reads its own `execute()` output: the mock
 * answers every property with a sentinel, `Object.keys()` of a sentinel is
 * empty and its loop condition never becomes false.
 */
const SKIP = {
  Phantombuster: "el bucle del nodo no termina con respuestas simuladas",
};

/**
 * Keys that decide whether a `while (has_more) { … }` loop stops.
 *
 * The mock answers every property with another sentinel, which is truthy, so a
 * pagination loop would never end. These names answer `undefined` instead, which
 * is what a "no more pages" response looks like to node code.
 */
const LOOP_TERMINATORS = new Set([
  "has_more",
  "hasMore",
  "next_cursor",
  "nextCursor",
  "next_page_token",
  "nextPageToken",
  "nextPage",
  "pageToken",
  "nextLink",
  "continuation",
  "syncToken",
  "more",
  "last",
  "done",
]);

/** A value that behaves like "some object/array" without ever being one. */
function magic(label = "value") {
  const fn = function () {
    return magic(label);
  };
  const injected = new Map();
  return new Proxy(fn, {
    get(_target, prop) {
      if (prop === "then") return undefined;
      if (prop === Symbol.iterator) return function* () {};
      if (prop === Symbol.toPrimitive) return () => "";
      if (prop === "toString") return () => "";
      if (prop === "valueOf") return () => 0;
      if (prop === "length") return 0;
      if (prop === "toJSON") return () => ({});
      if (typeof prop === "string" && LOOP_TERMINATORS.has(prop)) return undefined;
      if (injected.has(prop)) return injected.get(prop);
      return magic(`${label}.${String(prop)}`);
    },
    set(_target, prop, value) {
      injected.set(prop, value);
      return true;
    },
    has() {
      return true;
    },
    apply() {
      return magic(label);
    },
    construct() {
      return magic(label);
    },
  });
}

/** Unique sentinels, so a captured value can be traced back to its parameter. */
function makeSentinels() {
  let seq = 0;
  const numbers = new Map();
  return {
    text: (name) => `__gs_${name}__`,
    number(name) {
      if (!numbers.has(name)) numbers.set(name, 900000 + ++seq);
      return numbers.get(name);
    },
    entries: () => [...numbers.entries()],
  };
}

/**
 * The credentials n8n would decrypt for the node, field by field.
 *
 * Every field reads back as a sentinel, so a request that embeds the token in
 * its URL (`/bot<token>/getChat`) is captured as
 * `/bot{{$credentials.accessToken}}/getChat` and the Rust engine fills it from
 * the vault at run time. Without this the token rendered empty and nodes like
 * Telegram produced a request that could never authenticate.
 */
function credentialProxy(sentinels) {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== "string") return magic("credential");
        return sentinels.text(`c_${prop}`);
      },
      has() {
        return true;
      },
    },
  );
}

/** Flattens a node description into `name -> property`, including nested ones. */
function indexProperties(description) {
  const byName = new Map();
  const walk = (list) => {
    for (const prop of list ?? []) {
      if (!prop || typeof prop !== "object") continue;
      if (typeof prop.name === "string" && prop.type && !byName.has(prop.name)) {
        byName.set(prop.name, prop);
      }
      if (Array.isArray(prop.options)) {
        walk(prop.options);
        for (const option of prop.options) walk(option?.values);
      }
      walk(prop.values);
    }
  };
  walk(description.properties);
  return byName;
}

/** The value n8n would hand a node for one parameter, sentinel included. */
function valueFor(def, name, sentinels, opts = {}) {
  const text = sentinels.text(name);
  if (!def) return text;
  if (opts.extractValue && def.type === "resourceLocator") return text;

  switch (def.type) {
    case "resourceLocator":
      return {
        __rl: true,
        mode: def.default?.mode ?? def.modes?.[0]?.name ?? "id",
        value: text,
      };
    case "options": {
      if (def.default !== undefined && def.default !== null && def.default !== "") return def.default;
      return (def.options ?? [])[0]?.value;
    }
    case "multiOptions": {
      if (Array.isArray(def.default) && def.default.length) return def.default;
      const first = (def.options ?? [])[0]?.value;
      return first === undefined ? [] : [first];
    }
    case "boolean":
      return typeof def.default === "boolean" ? def.default : false;
    case "number":
      return sentinels.number(name);
    case "fixedCollection":
      return { values: [syntheticGroup(def.options?.[0]?.values, sentinels)] };
    case "collection":
      return syntheticGroup(def.options, sentinels);
    case "json":
      return "{}";
    case "notice":
    case "credentials":
    case "callout":
      return undefined;
    default:
      return text;
  }
}

/** Builds `{field: sentinel}` for a collection/fixedCollection group. */
function syntheticGroup(fields, sentinels) {
  const out = {};
  for (const field of fields ?? []) {
    if (!field?.name) continue;
    const value = valueFor(field, field.name, sentinels);
    if (value !== undefined) out[field.name] = value;
  }
  return out;
}

/** Every `resource` × `operation` pair the node declares. */
function combinationsFor(description) {
  const props = description.properties ?? [];
  const resourceProp = props.find((p) => p.name === "resource");
  const operationProps = props.filter((p) => p.name === "operation");
  const resources = resourceProp?.options?.length ? resourceProp.options.map((o) => o.value) : [undefined];
  const out = [];
  for (const resource of resources) {
    for (const opProp of operationProps) {
      const shown = opProp.displayOptions?.show?.resource;
      if (Array.isArray(shown) && resource !== undefined && !shown.includes(resource)) continue;
      for (const option of opProp.options ?? []) {
        if (option?.value === undefined) continue;
        out.push({ resource, operation: option.value });
      }
    }
  }
  return out;
}

/** The `this` a node's `execute()` sees: permissive, recording, parameter-aware. */
function makeExecuteContext({ description, index, sentinels, forced, requests }) {
  const record = (kind, options, credentialType) => {
    requests.push(normaliseRequest(kind, options, credentialType));
    if (requests.length >= MAX_REQUESTS) throw CAPTURE_LIMIT;
    return magic(`response#${requests.length}`);
  };

  const helpers = {
    request: async (options) => record("request", options),
    requestWithAuthentication: async function (credentialType, options) {
      return record("requestWithAuthentication", options, credentialType);
    },
    httpRequest: async (options) => record("httpRequest", options),
    httpRequestWithAuthentication: async function (credentialType, options) {
      return record("httpRequestWithAuthentication", options, credentialType);
    },
    requestOAuth1: async (options) => record("requestOAuth1", options),
    requestOAuth2: async function (credentialType, options) {
      return record("requestOAuth2", options, credentialType);
    },
    returnJsonArray: (json) => (Array.isArray(json) ? json : [json]),
    // Every second node in the catalogue ends with this call; without it the
    // capture stops right after the request was recorded, which would look like
    // a node that only ever makes one call.
    constructExecutionMetaData: (items, extra) =>
      (Array.isArray(items) ? items : [items]).map((item, index) => ({
        ...(item && typeof item === "object" ? item : { json: item }),
        pairedItem: extra?.itemData ?? { item: index },
      })),
    prepareBinaryData: async () => magic("binary"),
    assertBinaryData: () => magic("binary"),
    getBinaryDataBuffer: async () => Buffer.from(""),
    getBinaryStream: async () => magic("stream"),
    // Resolves a workspace-relative path; under the capture it is the path
    // itself, which is what the recorded request should carry.
    resolvePath: (filePath) => filePath,
  };

  const base = {
    helpers,
    getNodeParameter(name, _itemIndex, fallback, opts) {
      if (Object.prototype.hasOwnProperty.call(forced, name)) return forced[name];
      const def = index.get(name);
      // A parameter the description does not declare still reaches node code:
      // answering with the sentinel keeps the execution on its normal path
      // (and out of a TypeError about `.includes` of `undefined`).
      if (!def) return sentinels.text(name);
      const value = valueFor(def, name, sentinels, opts ?? {});
      return value === undefined ? fallback : value;
    },
    getCredentials: async () => credentialProxy(sentinels),
    getNode: () => ({
      name: description.displayName ?? "node",
      typeVersion: 1,
      parameters: {},
      position: [0, 0],
    }),
    getInputData: () => [magic("item")],
    getInputConnectionData: async () => magic("connection"),
    getWorkflow: () => ({ id: "capture", name: "capture" }),
    getWorkflowStaticData: () => ({}),
    getMode: () => "manual",
    getExecutionId: () => "capture",
    getRestApiUrl: () => "http://localhost",
    getNodeWebhookUrl: () => "http://localhost/webhook",
    getContext: () => "capture",
    evaluateExpression: (expression) => expression,
    isExecuting: true,
    continueOnFail: () => false,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    getNodeOutput: () => magic("output"),
  };

  // Unknown members return a callable sentinel instead of `undefined`: nodes
  // reach for helpers this harness does not know about, and an `undefined` there
  // aborts the capture with a TypeError instead of a recorded request.
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === "string" && LOOP_TERMINATORS.has(prop)) return undefined;
      return magic(`ctx.${String(prop)}`);
    },
  });
}

/**
 * Rewrites sentinels back into `{{$parameter.name}}` placeholders.
 *
 * A sentinel that occupies a whole value becomes a whole-value expression, which
 * is what keeps its JSON type (the Rust interpolator returns the raw number for
 * `{{$parameter.limit}}` instead of the string `"900001"`). A sentinel inside a
 * larger string becomes an inline expression, which is how paths such as
 * `/users/«p:userId»` turn into `/users/{{$parameter.userId}}`. Credential
 * fields (`__gs_c_accessToken__`) become `{{$credentials.accessToken}}`, which
 * the engine resolves from the vault at run time.
 */
function templateize(value, sentinels) {
  if (typeof value === "string") {
    const whole = /^__gs_([A-Za-z0-9_$.[\]()]+)__$/.exec(value);
    if (whole) return placeholderFor(whole[1]);
    return value.replace(/__gs_([A-Za-z0-9_$.[\]()]+)__/g, (_match, name) => placeholderFor(name));
  }
  if (typeof value === "number") {
    for (const [name, sentinel] of sentinels.entries()) {
      if (sentinel === value) return `{{$parameter.${name}}}`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => templateize(v, sentinels));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = templateize(v, sentinels);
    return out;
  }
  return value;
}

/** The expression a sentinel name stands for. */
function placeholderFor(name) {
  if (name.startsWith("c_")) return `{{$credentials.${name.slice(2)}}}`;
  return `{{$parameter.${name}}}`;
}

/** `<name>` for every whole-value `{{$parameter.name}}` the template references. */
function collectNeeds(requests) {
  const needs = new Set();
  const scan = (value) => {
    if (typeof value === "string") {
      for (const m of value.matchAll(/\{\{\$parameter\.([A-Za-z0-9_$.]+)\}\}/g)) needs.add(m[1]);
      return;
    }
    if (Array.isArray(value)) return value.forEach(scan);
    if (value && typeof value === "object") Object.values(value).forEach(scan);
  };
  scan(requests);
  return [...needs].sort();
}

/**
 * The object whose `execute()` is the real runner.
 *
 * A versioned node (`VersionedNodeType`) keeps one class per version under
 * `nodeVersions` and has no `execute()` of its own, so the newest version is the
 * one whose code n8n would run today.
 */
function pickExecuteTarget(instance) {
  if (instance && typeof instance.execute === "function") return instance;
  const versions = instance?.nodeVersions;
  if (!versions || typeof versions !== "object") return null;
  const keys = Object.keys(versions).sort((a, b) => Number(a) - Number(b));
  const preferred = keys[keys.length - 1];
  const target = versions[preferred];
  return target && typeof target.execute === "function" ? target : null;
}

/** Calls `execute()` once per `resource`/`operation` pair and records the calls. */
async function captureNode(loader, entry) {
  const loaded = await loader.load(entry.path);
  if (!loaded.ok) return { status: "load-failed", error: loaded.error };
  const description = loaded.description;
  const target = pickExecuteTarget(loaded.instance);
  if (!target) return { status: "no-execute" };

  const index = indexProperties(description);
  const cases = [];
  for (const combo of combinationsFor(description)) {
    const sentinels = makeSentinels();
    const requests = [];
    const forced = { operation: combo.operation };
    if (combo.resource !== undefined) forced.resource = combo.resource;
    const ctx = makeExecuteContext({ description, index, sentinels, forced, requests });

    let failure = null;
    try {
      await Promise.race([
        target.execute.call(ctx),
        new Promise((resolve) => setTimeout(resolve, 3000).unref?.()),
      ]);
    } catch (e) {
      if (e !== CAPTURE_LIMIT) failure = String(e?.message ?? e).slice(0, 200);
    }

    const base = { resource: combo.resource ?? null, operation: combo.operation };
    if (!requests.length) {
      cases.push({ ...base, status: failure ? "error" : "none", error: failure ?? undefined });
      continue;
    }
    const templated = requests.map((r) => templateize(r, sentinels));
    const partial = templated.some(hasSentinel);
    cases.push({
      ...base,
      status: partial ? "partial" : "ok",
      error: failure ?? undefined,
      needs: collectNeeds(templated),
      requests: templated,
    });
  }

  const ok = cases.filter((c) => c.status === "ok").length;
  const status = ok ? "ok" : cases.some((c) => c.status === "partial") ? "partial" : "none";
  return { status, cases };
}

export { captureNode };

/** True when a captured value still carries a sentinel the templater missed. */
function hasSentinel(value) {
  if (typeof value === "string") return value.includes("__gs_");
  if (Array.isArray(value)) return value.some(hasSentinel);
  if (value && typeof value === "object") return Object.values(value).some(hasSentinel);
  return false;
}

function normaliseRequest(kind, options, credentialType) {
  const opts = options && typeof options === "object" ? options : {};
  const url = opts.uri ?? opts.url ?? "";
  const base = typeof opts.baseURL === "string" ? opts.baseURL : "";
  const qs = opts.qs ?? opts.params ?? undefined;
  const method = String(opts.method ?? (opts.body ? "POST" : "GET")).toUpperCase();
  const out = { kind, method };
  if (credentialType) out.credentialType = credentialType;
  out.path =
    base && typeof url === "string"
      ? `${base}${url}`
      : typeof url === "string"
        ? url
        : String(url ?? "");
  if (qs && typeof qs === "object" && Object.keys(qs).length) out.qs = qs;
  if (opts.headers && typeof opts.headers === "object" && Object.keys(opts.headers).length) {
    out.headers = opts.headers;
  }
  // `body: true` / `json: true` are n8n's "encode/serialise this" flags, not
  // payloads. Recording them as a body would make the Rust runner send the
  // literal `true`.
  const isPayload = (v) => typeof v === "string" || (v && typeof v === "object");
  if (isPayload(opts.body)) out.body = opts.body;
  if (opts.json !== undefined && isPayload(opts.json)) out.json = opts.json;
  return out;
}

/** `--only=A,B`, `--limit=N`, `--out=path`, `--timeout=N` — all optional. */
function parseArgs(argv) {
  const out = { only: null, limit: 0, out: OUT, timeout: 10000, ai: false };
  for (const arg of argv) {
    const [key, value = ""] = arg.replace(/^--/, "").split("=");
    if (key === "only") out.only = value.split(",").map((s) => s.trim()).filter(Boolean);
    else if (key === "limit") out.limit = Number(value) || 0;
    else if (key === "timeout") out.timeout = Number(value) || out.timeout;
    else if (key === "ai") out.ai = value !== "false";
    else if (key === "out") out.out = value;
  }
  return out;
}

/** The n8n commit the cached sources came from, for the artifact header. */
function readSourceSha() {
  try {
    return JSON.parse(fs.readFileSync("./.n8n-cache/tree.json", "utf8")).sha ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const catalog = JSON.parse(fs.readFileSync(SOURCES, "utf8"));
  let entries = catalog.filter((e) => typeof e.path === "string" && e.path);
  if (args.only) entries = entries.filter((e) => args.only.includes(e.key));
  if (args.limit) entries = entries.slice(0, args.limit);
  if (!entries.length) {
    console.error("no hay nodos que capturar (¿--only con un nombre que no existe?)");
    process.exit(1);
  }

  const loader = await createNodeLoader(SRC, { concurrency: 4 });
  const nodes = {};
  const tally = { ok: 0, partial: 0, none: 0, timeout: 0, skipped: 0, "load-failed": 0, "no-execute": 0 };
  const caseTally = { ok: 0, partial: 0, none: 0, error: 0 };
  const failures = [];

  const payloadOf = () => ({
    generatedBy: "scripts/n8n-runmap-capture.mjs",
    source: { repo: "n8n-io/n8n", sha: readSourceSha() },
    nodes,
  });
  // Written as the run advances: a node whose bundle deadlocks cannot be
  // interrupted from inside the process, so the work already done must not be
  // lost when the run has to be stopped by hand.
  const persist = () => fs.writeFileSync(args.out, `${JSON.stringify(payloadOf(), null, 1)}\n`);

  /** Resolves to `null` when the promise does not settle in time. */
  const withTimeout = (promise, ms) =>
    Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);

  try {
    let done = 0;
    for (const entry of entries) {
      done++;
      // LangChain sub-nodes (chat models, memories, output parsers, tools) are
      // not steps: n8n wires them to an agent node and they never run on their
      // own. Capturing them is both meaningless and, for at least one of them,
      // an unkillable hang.
      const isSubnode = entry.category === "AI" && !entry.isTrigger && !/^Agent/i.test(entry.key);
      if (isSubnode && !args.ai) {
        nodes[entry.key] = { status: "skipped", error: "sub-nodo de agente: no es un paso" };
        tally.skipped++;
        continue;
      }
      if (SKIP[entry.key]) {
        nodes[entry.key] = { status: "skipped", error: SKIP[entry.key] };
        tally.skipped++;
        continue;
      }

      let result;
      try {
        result = await withTimeout(captureNode(loader, entry), args.timeout);
        if (result === null) result = { status: "timeout", error: `sin respuesta en ${args.timeout} ms` };
      } catch (e) {
        result = { status: "load-failed", error: String(e?.message ?? e).slice(0, 160) };
      }
      tally[result.status] = (tally[result.status] ?? 0) + 1;
      for (const c of result.cases ?? []) caseTally[c.status] = (caseTally[c.status] ?? 0) + 1;
      if (result.status !== "ok" && failures.length < 20) {
        failures.push(`${entry.key}: ${result.status}${result.error ? ` (${result.error})` : ""}`);
      }
      nodes[entry.key] = result;
      process.stdout.write(`[${done}/${entries.length}] ${entry.key} -> ${result.status}\n`);
      if (done % 20 === 0) persist();
    }
  } finally {
    await loader.dispose();
  }

  persist();

  const withCases = Object.entries(nodes).filter(([, n]) => (n.cases ?? []).some((c) => c.status === "ok"));
  const partialOnly = Object.entries(nodes).filter(
    ([, n]) => !(n.cases ?? []).some((c) => c.status === "ok") && (n.cases ?? []).some((c) => c.status === "partial"),
  );
  console.log("--------------------------------------------------");
  console.log(`nodos capturados      : ${entries.length}`);
  console.log(`  con petición real   : ${withCases.length}`);
  console.log(`  solo parcial        : ${partialOnly.length}`);
  console.log(`  sin petición        : ${tally.none}`);
  console.log(`  timeout             : ${tally.timeout}`);
  console.log(`  sub-nodos (saltados): ${tally.skipped}`);
  console.log(`  error de carga      : ${tally["load-failed"]}`);
  console.log(`  sin execute()       : ${tally["no-execute"]}`);
  console.log(`casos    ok ${caseTally.ok} · parciales ${caseTally.partial} · sin petición ${caseTally.none} · error ${caseTally.error}`);
  if (failures.length) {
    console.log("primeros no ejecutables:");
    for (const line of failures) console.log(`  ${line}`);
  }
  console.log(`salida               : ${args.out}`);
}

// Only run when invoked directly: importing this module (the probe does, to
// reuse `captureNode`) must not start a full capture pass.
import { fileURLToPath } from "node:url";
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

