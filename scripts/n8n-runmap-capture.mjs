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
const OUT_TRIGGERS = "./src/data/n8n-trigger-runmap.json";

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

// Array-like method fallbacks on String.prototype so node code calling .join(), .map(),
// .filter(), etc. directly on string sentinels does not throw TypeError.
for (const method of ["join", "map", "filter", "unshift", "forEach", "find", "some", "every"]) {
  if (!String.prototype[method]) {
    if (method === "join") {
      String.prototype.join = function (_sep = ",") {
        return String(this);
      };
    } else if (method === "map") {
      String.prototype.map = function (fn) {
        return [fn(String(this), 0, [String(this)])];
      };
    } else if (method === "filter") {
      String.prototype.filter = function (fn) {
        return [String(this)].filter(fn);
      };
    } else if (method === "unshift") {
      String.prototype.unshift = function () {
        return 1;
      };
    } else if (method === "forEach") {
      String.prototype.forEach = function (fn) {
        [String(this)].forEach(fn);
      };
    } else if (method === "find") {
      String.prototype.find = function (fn) {
        return fn(String(this), 0, [String(this)]) ? String(this) : undefined;
      };
    } else if (method === "some") {
      String.prototype.some = function (fn) {
        return Boolean(fn(String(this), 0, [String(this)]));
      };
    } else if (method === "every") {
      String.prototype.every = function (fn) {
        return Boolean(fn(String(this), 0, [String(this)]));
      };
    }
  }
}

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
      if (prop === Symbol.toStringTag) return "grapscreen-sentinel";
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
  const shapes = [];
  return {
    text: (name) => `__gs_${name}__`,
    number(name) {
      if (!numbers.has(name)) numbers.set(name, 900000 + ++seq);
      return numbers.get(name);
    },
    entries: () => [...numbers.entries()],
    // A field answered with a valid-looking value is remembered so the templater
    // can put the user's own value back where it was.
    remember(placeholder, value) {
      shapes.push({ placeholder, value });
    },
    shapes: () => [...shapes].sort((a, b) => b.value.length - a.value.length),
  };
}

/**
 * The declared fields of every credential type, from the extracted artifact.
 *
 * `getCredentials` uses this to answer a *string primitive* for scalar fields
 * and a descentable proxy for containers: node code does both
 * (`credentials.url.replace(…)` and `credentials.oauthTokenData.instance_url`),
 * and `typeof` cannot be talked out of an object.
 */
let credentialFieldTypes = null;
let credentialDefaultsMap = null;
function credentialTypes() {
  if (credentialFieldTypes) return credentialFieldTypes;
  credentialFieldTypes = new Map();
  credentialDefaultsMap = new Map();
  try {
    const raw = JSON.parse(fs.readFileSync("./src/data/n8n-credentials.json", "utf8"));
    for (const entry of raw) {
      const fields = new Map();
      for (const property of entry.properties ?? []) {
        if (property?.name) {
          fields.set(property.name, property.type ?? "string");
          if (
            property.default &&
            typeof property.default === "string" &&
            /^https?:\/\//i.test(property.default)
          ) {
            credentialDefaultsMap.set(
              `${entry.name}.${property.name}`,
              property.default.replace(/\/+$/, ""),
            );
          }
        }
      }
      credentialFieldTypes.set(entry.name, fields);
    }
    const KNOWN_ROOTS = {
      "anthropicApi.url": "https://api.anthropic.com",
      "baserowApi.host": "https://api.baserow.io",
      "githubApi.server": "https://api.github.com",
      "githubOAuth2Api.server": "https://api.github.com",
      "gitlabApi.server": "https://gitlab.com",
      "gitlabOAuth2Api.server": "https://gitlab.com",
      "gongApi.baseUrl": "https://api.gong.io",
      "googlePalmApi.host": "https://generativelanguage.googleapis.com",
      "koBoToolboxApi.URL": "https://kf.kobotoolbox.org",
      "ollamaApi.baseUrl": "http://localhost:11434",
      "postHogApi.url": "https://app.posthog.com",
      "telegramApi.baseUrl": "https://api.telegram.org",
      "microsoftOAuth2Api.graphApiBaseUrl": "https://graph.microsoft.com",
      "iterableApi.region": "https://api.iterable.com",
      "minimaxApi.url": "https://api.minimax.io/v1",
      "moonshotApi.url": "https://api.moonshot.ai/v1",
      "alibabaCloudApi.url": "https://dashscope-intl.aliyuncs.com",
      "s3.endpoint": "https://s3.amazonaws.com",
      "s3.region": "us-east-1",
    };
    for (const [k, v] of Object.entries(KNOWN_ROOTS)) {
      credentialDefaultsMap.set(k, v);
    }
  } catch {
    credentialFieldTypes = new Map();
    credentialDefaultsMap = new Map();
  }
  return credentialFieldTypes;
}

/** Types whose value node code treats as a plain string. */
const SCALAR_CREDENTIAL_TYPES = new Set([
  "string",
  "number",
  "boolean",
  "options",
  "password",
  "hidden",
  "color",
  "dateTime",
]);

/**
 * The credentials n8n would decrypt for the node, field by field.
 *
 * A field the credential type declares as a scalar answers a string primitive —
 * that is what `typeof credentials.apiKey === 'string'` and
 * `credentials.url.replace(…)` expect. A field it does not declare (the OAuth
 * runtime data `oauthTokenData` is the common one: n8n writes it after the token
 * exchange) answers a proxy that both descends and behaves like a string.
 */
function credentialProxy(sentinels, type = "", trail = "") {
  const prefix = trail ? `${trail}.` : "";
  const declared = trail ? null : credentialTypes().get(type);
  return new Proxy(
    {},
    {
      get(_target, prop) {
        // `Symbol.toPrimitive` must answer with a *primitive*: a proxy here
        // makes `String(credentials)` throw "Cannot convert object to
        // primitive value", which is how the Hive's URL landed as that error
        // instead of a captured request.
        if (prop === Symbol.toPrimitive) return () => "";
        if (prop === Symbol.toStringTag) return "grapscreen-credential";
        if (prop === "then") return undefined;
        if (typeof prop !== "string") return magic("credential");
        const path = `${prefix}${prop}`;
        const leaf = sentinels.text(`c_${path}`);
        // A declared scalar is a string, and node code checks `typeof` on it.
        if (declared && SCALAR_CREDENTIAL_TYPES.has(declared.get(prop) ?? "")) {
          if (credentialDefaultsMap && credentialDefaultsMap.has(`${type}.${prop}`)) {
            return credentialDefaultsMap.get(`${type}.${prop}`);
          }
          // Some credentials are shape-validated too (Mailchimp's key must carry
          // the data-centre suffix), so they answer a valid value and the
          // templater puts the user's own back.
          const shape = shapeFor(path);
          if (shape) {
            sentinels.remember(`{{$credentials.${path}}}`, shape);
            return shape;
          }
          return leaf;
        }
        // A nested path must itself descend, so the value keeps being
        // discoverable one level deeper (`oauthTokenData.instance_url`).
        return new Proxy(Object.assign(() => leaf, { valueOf: () => leaf }), {
          get: (_t, inner) => {
            // The symbol checks come first: Node's `Symbol.toPrimitive` is used
            // by every `` `${credentials.url}/…` `` template, and answering it
            // with a sentinel object throws "Cannot convert object to primitive
            // value" instead of building the URL.
            if (inner === Symbol.toPrimitive) return () => leaf;
            if (inner === Symbol.toStringTag) return "grapscreen-credential";
            if (typeof inner !== "string") return magic("credential");
            if (inner === "then") return undefined;
            // Node code treats a credential field as a string:
            // `credentials.url.replace(…)` / `.endsWith(…)` / `.includes(…)`
            // would throw "X is not a function" on a bare proxy. Binding the
            // real String methods to the leaf keeps those calls working.
            if (inner === "length") return leaf.length;
            if (typeof String.prototype[inner] === "function") {
              return String.prototype[inner].bind(leaf);
            }
            if (inner === "toString" || inner === "valueOf") return () => leaf;
            return sentinels.text(`c_${path}.${inner}`);
          },
          apply: () => leaf,
        });
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

/**
 * Valid values for fields whose node code checks the *shape* before it sends.
 *
 * The node aborts on `sendTo.includes('@')` or `apiKey.includes('-')` long
 * before any HTTP call, so a bare sentinel can never reach the request. The mock
 * answers a value that passes the check, and every occurrence of it is rewritten
 * back to its placeholder afterwards, so the map still says "the user's value".
 */
const FIELD_SHAPES = {
  // Mail: the address has to look like one.
  email: "test@example.com",
  toEmail: "test@example.com",
  fromEmail: "test@example.com",
  recipientEmail: "test@example.com",
  userEmail: "test@example.com",
  // Mailchimp: the key ends in the data-centre suffix, and the URL is built
  // from it, so the suffix is its own placeholder (`#suffix`).
  apiKey: "00000000000000000000000000000000-__gs_c_apiKey_suffix__",
  // Dates: n8n parses these before comparing.
  date: "2026-01-01T00:00:00.000Z",
  startDate: "2026-01-01T00:00:00.000Z",
  endDate: "2026-01-02T00:00:00.000Z",
  startTime: "2026-01-01T00:00:00.000Z",
  endTime: "2026-01-01T01:00:00.000Z",
  publishedAfter: "2026-01-01T00:00:00.000Z",
  publishedBefore: "2026-01-01T00:00:00.000Z",
  // SOQL: n8n checks the field against the object's own field list.
  fields: "Id",
  field: "Id",
  customObject: "Account",
  sobject: "Account",
  objectType: "Account",
  // Databricks: volume path must be catalog.schema.volume
  volumePath: "main.default.my_volume",
  volume: "main.default.my_volume",
  // Airtop profile & resolution
  profileId: "profile-123",
  browserProfileId: "profile-123",
  resolution: "1280x720",
  screenResolution: "1280x720",
  windowSize: "1280x720",
  // Site identifiers and endpoints with a fixed layout.
  site: "example.sharepoint.com,11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222",
  siteId: "example.sharepoint.com,11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222",
  webDavUrl: "https://cloud.example.com/remote.php/dav",
  // Freshdesk / identifiers expecting numeric format
  requesterId: "12345",
  // Signl4 file extension requirement
  filename: "test.png",
  attachment: "test.png",
  // Mattermost sort order
  sort: "last_activity_at",
  // Google Gemini supported models
  modelId: "gemini-1.5-flash",
  model: "gemini-1.5-flash",
  // GSuite query format
  query: "displayName:test",
  // Jira identifiers
  issueKey: "TEST-123",
  projectKey: "TEST",
  // JSON string parameters
  customFields: "{}",
  defaults: "{}",
  customValues: "{}",
  queryParameters: "[]",
  // AWS family shapes
  region: "us-east-1",
  queue: "https://sqs.us-east-1.amazonaws.com/123456789012/my-queue",
  tableName: "my-table",
  mediaFileUri: "s3://my-bucket/audio.mp3",
};

/**
 * Fields whose value the node *derives* something else from.
 *
 * Mailchimp's URL carries the data centre, which only exists inside the key, so
 * the recorded URL must ask for it instead of freezing the capture's value.
 */
const DERIVED = {
  __gs_c_apiKey_suffix__: "{{$credentials.apiKey#suffix}}",
};

/** The shape a named field answers with, if it has one. */
function shapeFor(name) {
  if (!name) return null;
  const leaf = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : name;
  return FIELD_SHAPES[leaf] ?? null;
}

/** The value n8n would hand a node for one parameter, sentinel included. */
function valueFor(def, name, sentinels, opts = {}) {
  const text = sentinels.text(name);
  if (!def) return text;
  // `extractValue` is n8n's "give me the ID, not the locator object": a
  // `resourceLocator` answered with its ID, no matter the field type.
  if (opts.extractValue) return text;

  switch (def.type) {
    case "resourceLocator": {
      // The URL mode parses the ID out of a pasted link; the sentinel is not a
      // link, so a capture defaulting to it would land in a validator that
      // reads "could not find block ID or page ID" and aborts the case.
      const shape = shapeFor(name);
      if (shape) {
        sentinels.remember(`{{$parameter.${name}}}`, shape);
        return {
          __rl: true,
          mode: "id",
          value: shape,
        };
      }
      return {
        __rl: true,
        mode: "id",
        value: text,
      };
    }
    case "options": {
      const options = (def.options ?? []).map((o) => o.value).filter((v) => v !== undefined);
      // `authentication` picks the flow: a service-account branch signs a JWT and
      // exchanges it for a token, which this engine does not do. The OAuth2
      // branch is the one a captured request can express (Bearer straight from
      // the vault), so the capture follows it whenever the node offers it —
      // n8n spells it both `oAuth2` and `oauth2`.
      if (/^auth(entication)?$/i.test(name)) {
        const oauth = options.find((v) => typeof v === "string" && /^oauth2$/i.test(v));
        if (oauth) return oauth;
      }
      if (
        def.default !== undefined &&
        def.default !== null &&
        def.default !== "" &&
        !(Array.isArray(def.default) && def.default.length === 0)
      ) {
        return def.default;
      }
      const first = options[0];
      if (first !== undefined) return first;
      const shape = shapeFor(name);
      if (shape) {
        sentinels.remember(`{{$parameter.${name}}}`, shape);
        return shape;
      }
      return text;
    }
    case "multiOptions": {
      if (Array.isArray(def.default) && def.default.length) return def.default;
      const first = (def.options ?? [])[0]?.value;
      return first === undefined ? [] : [first];
    }
    case "boolean":
      if (name === "replyToRecipientOnly" || name === "replyToSenderOnly") return false;
      return typeof def.default === "boolean" ? def.default : false;
    case "number":
      return sentinels.number(name);
    case "fixedCollection":
      return syntheticFixedCollection(def, name, sentinels);
    case "collection":
      // With `multipleValues` n8n returns the entries as an array, not as an
      // object. The hybrid answers both shapes: `.values` holds the entries
      // (what `fixedCollection` returns), and the array itself is iterable and
      // maps, which is how the node code reads it. Callers that go one level
      // deeper (`'group.matchingColumns'`) also work on a real array.
      if (def.typeOptions?.multipleValues) {
        return syntheticList(def.options, sentinels, name);
      }
      return syntheticGroup(def.options, sentinels, name);
    case "string":
      if (def.typeOptions?.validation?.some((v) => v.type === "email" || /email/i.test(v.properties?.regex ?? ""))) {
        return "test@example.com";
      }
      if (def.typeOptions?.validation?.some((v) => v.type === "url" || /https?:/i.test(v.properties?.regex ?? ""))) {
        return "https://example.com/x";
      }
      if (def.typeOptions?.validation?.some((v) => /uuid/i.test(v.type ?? "") || /uuid/i.test(v.properties?.regex ?? ""))) {
        return "11111111-1111-1111-1111-111111111111";
      }
      // A field whose node code validates its shape (an address, a date, a SOQL
      // field list) needs a value that passes, not a sentinel. The value is
      // remembered so the templater can swap it back for the placeholder.
      const shape = shapeFor(name);
      if (shape) {
        sentinels.remember(`{{$parameter.${name}}}`, shape);
        return shape;
      }
      if (/email/i.test(name)) return "test@example.com";
      if (/url$/i.test(name) || /^url/i.test(name)) return "https://example.com/x";
      return text;
    case "dateTime":
      return "2026-01-01T00:00:00.000Z";
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

/** Wraps a plain object so undeclared keys answer with a path sentinel. */
function withUnknownSentinels(target, name, sentinels, flavor = null) {
  return new Proxy(target, {
    get(inner, prop) {
      if (prop in inner) return inner[prop];
      if (prop === Symbol.toPrimitive) return () => "";
      if (prop === Symbol.toStringTag) return "grapscreen-group";
      if (prop === "then") return undefined;
      if (typeof prop !== "string") return undefined;
      if (prop === "values" && flavor === null) return [];
      if (prop === "headers") return [];
      if (prop === "internetMessageHeaders") return { headers: [] };
      if (prop === "length") return 1;
      return sentinels.text(`${name}.${prop}`);
    },
    has() {
      return true;
    },
  });
}

/** Builds `{field: sentinel}` for a collection/fixedCollection group. */
function syntheticGroup(fields, sentinels, name = "group") {
  const out = {};
  for (const field of fields ?? []) {
    if (!field?.name) continue;
    const value = valueFor(field, field.name, sentinels);
    if (value !== undefined) out[field.name] = value;
  }
  // A `collection` is open-ended in node code: Hubspot reads
  // `additionalFields.associations.companyIds`, an entry the description never
  // declares. Answering those with a sentinel for the full path keeps the node
  // building its request instead of dying on `undefined.includes(...)`.
  return withUnknownSentinels(out, name, sentinels, fields?.length ? null : "flat");
}

/**
 * The `flat` flavor is for mock-only structures — a group the node never
 * renders, where a plain object would be confused for a `fixedCollection`'s
 * `{ groupName: [...] }`. Its entries spread into the call directly and its
 * inner keys never leak into a body.
 */
function syntheticFlat(sentinels, name = "flat") {
  return withUnknownSentinels({}, name, sentinels, "flat");
}

/**
 * A `fixedCollection`, in both shapes node code reads it.
 *
 * n8n hands the entries back under the *group's* name (`customFields` →
 * `{ customFields: [...] }`), while other nodes use the classic
 * `{ values: [...] }`. Both keys point at the same entries, so either style
 * works and nothing is duplicated in the recorded request.
 */
function syntheticFixedCollection(def, name, sentinels) {
  const group = def.options?.[0] ?? { name: "values", values: [] };
  const entries = [syntheticGroup(group.values, sentinels, `${name}.${group.name}`)];
  const holder = {};
  Object.defineProperty(holder, group.name, { value: entries, enumerable: true, configurable: true });
  Object.defineProperty(holder, "values", { value: entries, enumerable: false, configurable: true });
  return withUnknownSentinels(holder, name, sentinels);
}

/**
 * An array of synthetic group objects for collections.
 */
function syntheticGroupArray(fields, sentinels, name = "group") {
  return [syntheticGroup(fields, sentinels, name)];
}

/**
 * An array the node code can read the two ways n8n nodes reach for a group:
 * as `.values` (the `fixedCollection` shape) and as the array itself (the
 * `collection` with `multipleValues` shape). The back-reference is a real
 * reference, so one entry exists once and never serialises twice.
 */
function syntheticList(fields, sentinels, name = "group") {
  const list = syntheticGroupArray(fields, sentinels, name);
  Object.defineProperty(list, "values", { value: [...list], enumerable: true, configurable: true });
  return list;
}

/** Navigates one node parameter, descending through dotted collection paths. */
function parameterByPath(index, name, sentinels, opts = {}) {
  const text = () => sentinels.text(name);
  if (!name.includes(".")) {
    const def = index.get(name);
    if (!def) return text();
    const value = valueFor(def, name, sentinels, opts);
    return value === undefined ? undefined : value;
  }

  // Dotted path traversal (e.g. 'additionalFields.eanUi.eanValues' or 'alertUpdateFields.matchingColumns')
  const parts = name.split(".");
  const rootName = parts[0];
  const def = index.get(rootName);
  if (!def) return text();

  let current = valueFor(def, rootName, sentinels, opts);
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (current === undefined || current === null) return text();
    if (typeof current === "object") {
      // 1. Direct property check: if current holds part and it's not a generated fallback sentinel string
      if (!Array.isArray(current) && part in current) {
        const direct = current[part];
        if (typeof direct !== "string" || !direct.startsWith("__gs_")) {
          current = direct;
          continue;
        }
      }
      // 2. Values array check
      if (Array.isArray(current.values)) {
        if (part === "values") {
          current = current.values;
          continue;
        }
        let foundInEntry = false;
        for (const entry of current.values) {
          if (entry && typeof entry === "object") {
            const entryVal = entry[part];
            if (entryVal !== undefined && (typeof entryVal !== "string" || !entryVal.startsWith("__gs_"))) {
              current = entryVal;
              foundInEntry = true;
              break;
            }
          }
        }
        if (foundInEntry) continue;
      }
      // 3. Current is an array of entries
      if (Array.isArray(current)) {
        let foundInEntry = false;
        for (const entry of current) {
          if (entry && typeof entry === "object") {
            const entryVal = entry[part];
            if (entryVal !== undefined && (typeof entryVal !== "string" || !entryVal.startsWith("__gs_"))) {
              current = entryVal;
              foundInEntry = true;
              break;
            }
          }
        }
        if (foundInEntry) continue;
      }
      // 4. If current group didn't hold this part (e.g. multi-operation groups like additionalFields where index had another variant),
      // check if part is itself in index as a declared property
      const partDef = index.get(part);
      if (partDef) {
        current = valueFor(partDef, part, sentinels, opts);
        continue;
      }
      // 5. Fallback to direct property even if it was a sentinel
      if (!Array.isArray(current) && part in current) {
        current = current[part];
        continue;
      }
    }
    return text();
  }
  return current;
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
    // `getBinaryDataBuffer` is the only binary surface the harness answers
    // with real bytes. Everything else only exists so node code that builds a
    // multipart body keeps walking instead of dying before the HTTP call.
    getBinaryData: () => magic("binary-item"),
    prepareBinaryData: async () => magic("binary"),
    assertBinaryData: () => magic("binary"),
    getBinaryDataBuffer: async () => Buffer.from(""),
    getBinaryStream: async () => magic("stream"),
    getBinaryMetadata: async () => ({ fileName: "file.png", mimeType: "image/png", fileSize: 100 }),
    binaryToBuffer: async () => Buffer.from(""),
    // Resolves a workspace-relative path; under the capture it is the path
    // itself, which is what the recorded request should carry.
    resolvePath: (filePath) => filePath,
  };

  const base = {
    helpers,
    // n8n splits the API surface: `getNodeParameter` answers the rendered
    // form, `getCurrentNodeParameter(s)` reads the same values by name from
    // anywhere (routers, validators). All three return the same mock values.
    getCurrentNodeParameter(name, opts) {
      if (Object.prototype.hasOwnProperty.call(forced, name)) return forced[name];
      const value = parameterByPath(index, name, sentinels, opts ?? {});
      return value === undefined ? sentinels.text(name) : value;
    },
    getCurrentNodeParameters() {
      // Every declared name, plus anything node code asks for anyway.
      const bag = {};
      for (const name of index.keys()) bag[name] = parameterByPath(index, name, sentinels);
      return withUnknownSentinels(bag, "params", sentinels);
    },
    getNodeParameter(name, _itemIndex, fallback, opts) {
      if (Object.prototype.hasOwnProperty.call(forced, name)) return forced[name];
      // `parameterByPath` knows the dotted collection routes (`'group.leaf'`)
      // and the sentinel answer for fields the description never declares, so
      // node code stays on its normal path instead of a TypeError about
      // `.includes` of `undefined`.
      const value = parameterByPath(index, name, sentinels, opts ?? {});
      if (process.env.GS_PROBE) {
        process.stderr.write(
          `[probe] getNodeParameter(${name}, extractValue=${Boolean(opts?.extractValue)}) -> ${typeof value} ${typeof value === "object" ? JSON.stringify(value).slice(0, 80) : String(value).slice(0, 40)}\n`,
        );
      }
      return value === undefined ? (fallback === undefined ? sentinels.text(name) : fallback) : value;
    },
    getCredentials: async (type) => credentialProxy(sentinels, type),
    getNode: () => ({
      name: description.displayName ?? "node",
      // `type` is read by helpers that branch on the node class
      // (`this.getNode().type.includes('Trigger')`), so a node without it
      // aborts the capture before the first request.
      type: description.name ?? description.displayName ?? "node",
      typeVersion: description.defaultVersion ?? description.version ?? 1,
      parameters: {},
      position: [0, 0],
    }),
    getInputData: () => [{
      json: withUnknownSentinels({ id: 1, name: "test", myField: "myValue" }, "input", sentinels),
      binary: {},
    }],
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
function templateize(value, sentinels, seen = new Set()) {
  if (typeof value === "string") {
    // A field that was answered with a valid-looking shape carries the user's
    // own value back: whole tokens only, so a shape never eats part of a path.
    let shaped = value;
    for (const { placeholder, value: shape } of sentinels.shapes?.() ?? []) {
      shaped = shaped.replace(
        new RegExp(`(^|[^\\w./-])${shape.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\w-])`, "g"),
        (_m, lead) => `${lead}${placeholder}`,
      );
    }
    // `__gs_this__` is the marker `normaliseRequest` writes where the node
    // stringified a resource locator object (`[object Object]`).
    if (shaped.includes("__gs_this__")) {
      return shaped.replace(/__gs_this__/g, "{{$parameter.this}}");
    }
    const whole = /^__gs_([A-Za-z0-9_$.[\]()]+?)__$/.exec(shaped);
    if (whole) return placeholderFor(whole[1]);
    return shaped
      .replace(/__gs_([A-Za-z0-9_$.[\]()]+?)__/g, (_match, name) => placeholderFor(name))
      .replace(/__gs_([A-Za-z0-9_$.[\]()]+?)__/g, (_match, name) => DERIVED[name] ?? _match);
  }
  if (typeof value === "number") {
    for (const [name, sentinel] of sentinels.entries()) {
      if (sentinel === value) return `{{$parameter.${name}}}`;
    }
    return value;
  }
    if (Array.isArray(value)) {
      // The hybrid group arrays carry `.values`, a real reference back to the
      // same entries — walk it once. The second walk would template the same
      // entries twice and, worse, turn the shared backing array into a nested
      // copy on `JSON.stringify`.
      if (seen.has(value)) return "{dupes}";
      seen.add(value);
      const out = value.map((v) => templateize(v, sentinels, seen));
      return out;
    }
    if (value && typeof value === "object") {
      if (seen.has(value)) return "{dupes}";
      seen.add(value);
    // A resource locator (`{__rl, mode, value: sentinel}`) never serialises to
    // anything a URL can use — it renders `[object Object]`. The value that
    // goes into the request is its `.value`, already a sentinel.
    if (value.__rl === true && typeof value.value === "string") {
      const whole = /^__gs_([A-Za-z0-9_$.[\]()]+?)__$/.exec(value.value);
      if (whole) return placeholderFor(whole[1]);
    }
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = templateize(v, sentinels, seen);
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
  // Some nodes implement the action themselves; versioned ones keep one class
  // per version and the newest is what n8n runs today.
  const anyExecute = (target) => target && typeof target.execute === "function";
  if (anyExecute(instance)) return instance;
  const versions = instance?.nodeVersions;
  if (!versions || typeof versions !== "object") return null;
  const keys = Object.keys(versions).sort((a, b) => Number(a) - Number(b));
  const preferred = keys[keys.length - 1];
  const target = versions[preferred];
  return anyExecute(target) ? target : null;
}

/**
 * A n8n expression with concatenated parts becomes a template.
 *
 * n8n's `routing.request.url` may be `={{"/api/alert/" + $parameter.alertId}}` —
 * a JS expression. In the capture we turn the concat of literals and parameter
 * references into our `{{$parameter.x}}` shape, which the Rust engine renders.
 */
function concatToTemplate(raw) {
  const t = typeof raw === "string" ? raw.trim() : raw;
  if (typeof t !== "string") return raw;
  let expr = t.startsWith("=") ? t.slice(1) : t;
  const m = /^\{\{([\s\S]*)\}\}$/.exec(expr);
  if (m) expr = m[1].trim();
  const parts = [];
  for (const chunk of expr.split("+")) {
    const c = chunk.trim();
    const lit = /^"(.*)"$/.exec(c) ?? /^'(.*)'$/.exec(c) ?? /^`(.*)`$/.exec(c);
    if (lit) { parts.push(lit[1]); continue; }
    const param = /^\$parameter\.([\w.]+)$/.exec(c);
    if (param) { parts.push(`{{$parameter.${param[1]}}}`); continue; }
    const cred = /^\$credentials\.([\w.]+)$/.exec(c);
    if (cred) { parts.push(`{{$credentials.${cred[1]}}}`); continue; }
    return null;
  }
  return parts.length ? parts.join("") : null;
}

/** Normalises n8n expression forms (`=…`, `{{$parameter["a"]}}`, concats). */
function normaliseExpression(raw) {
  if (typeof raw !== "string") return raw;
  let out = raw.startsWith("=") ? raw.slice(1) : raw;
  const asTemplate = concatToTemplate(raw);
  if (asTemplate !== null) out = asTemplate;
  out = out.replace(/\{\{\$parameter\["([^"]+)"\]\}\}/g, "{{$parameter.$1}}");
  out = out.replace(/\{\{\$credentials\["([^"]+)"\]\}\}/g, "{{$credentials.$1}}");
  // n8n strips a possible trailing slash off a credential root this way; the
  // request builder already trims the join, so the call itself drops out.
  out = out.replace(/\{\{\$credentials\.([\w.]+)\.(replace|trim|slice|substring)\(.*\)\}\}/g, "{{$credentials.$1}}");
  out = out.replace(/\{\{\$parameter\.([\w.]+)\.(replace|trim|slice|substring)\(.*\)\}\}/g, "{{$parameter.$1}}");
  return out;
}

/** Same shape as `pickExecuteTarget`, but for `poll()`. */
function pickPollTarget(instance) {
  if (instance && typeof instance.poll === "function") return instance;
  const versions = instance?.nodeVersions;
  if (!versions || typeof versions !== "object") return null;
  const keys = Object.keys(versions).sort((a, b) => Number(a) - Number(b));
  const preferred = keys[keys.length - 1];
  const target = versions[preferred];
  return target && typeof target.poll === "function" ? target : null;
}

/** Calls `execute()` once per `resource`/`operation` pair and records the calls. */
async function captureNode(loader, entry) {
  const loaded = await loader.load(entry.path);
  if (!loaded.ok) return { status: "load-failed", error: loaded.error };
  const description = loaded.description;
  const target = pickExecuteTarget(loaded.instance);
  // A declarative node has no `execute()` to run: the request lives in
  // `requestDefaults` + `routing`. n8n builds it from those, and so do we.
  if (!target) return captureDeclarative(description, entry);

  const index = indexProperties(description);
  const cases = [];
  // A node with no `resource`/`operation` pair runs one way (Facebook Graph
  // API, GraphQL, QuickChart…). It still needs a case, or the map records
  // nothing and the palette hides a node that works.
  const combos = combinationsFor(description);
  for (const combo of combos.length ? combos : [{ resource: undefined, operation: "" }]) {
    const sentinels = makeSentinels();
    const requests = [];
    const forced = { operation: combo.operation };
    if (combo.resource !== undefined) forced.resource = combo.resource;
    const ctx = makeExecuteContext({ description, index, sentinels, forced, requests });

    let failure = null;
    let trace = "";
    let hung = false;
    try {
      const done = { resolved: false };
      await Promise.race([
        target.execute.call(ctx, ctx).then(() => { done.resolved = true; }),
        new Promise((resolve) =>
          setTimeout(() => {
            hung = true;
            resolve(undefined);
          }, 3000).unref?.(),
        ),
      ]);
      hung = hung && !done.resolved;
    } catch (e) {
      if (e !== CAPTURE_LIMIT) {
        failure = String(e?.message ?? e).slice(0, 200);
        trace = String(e?.stack ?? "").slice(0, 600);
      }
    }

    const base = { resource: combo.resource ?? null, operation: combo.operation };
    if (!requests.length) {
      cases.push({
        ...base,
        // "hung" is its own outcome: the node never returned, so silence is not
        // the same as "this operation makes no HTTP call".
        status: failure ? "error" : hung ? "hung" : "none",
        error: failure ?? (hung ? "no devolvió en 3s (bucle síncrono con el mock)" : undefined),
        trace: trace || undefined,
      });
      continue;
    }
    const templated = requests.map((r) => templateize(r, sentinels));
    // A case whose request carries no URL is not sendable: the node handed the
    // engine a recipe (the AWS helper signs and addresses it itself), which
    // means this engine cannot replay it yet.
    const builtByHelper = requests.some((r) => r.builtByHelper);
    const partial = templated.some(hasSentinel) || builtByHelper;
    cases.push({
      ...base,
      status: partial ? "partial" : "ok",
      error:
        failure ??
        (builtByHelper
          ? "la URL la construye y firma el propio n8n (familia AWS); el motor aún no la reproduce"
          : undefined),
      needs: collectNeeds(templated),
      requests: templated,
    });
  }

  const ok = cases.filter((c) => c.status === "ok").length;
  const status = ok
    ? "ok"
    : cases.some((c) => c.status === "partial")
      ? "partial"
      : cases.some((c) => c.status === "hung")
        ? // Every case waited out the mock: silence is a hang, not an operation
          // that makes no HTTP call. The palette must not claim it runs.
          "hung"
        : "none";
  return { status, cases };
}

/**
 * Captures a polling trigger's `poll()`.
 *
 * Trigger nodes declare no `resource`/`operation`: they always watch the same
 * thing, so the case list carries one entry with an empty operation. The
 * capture records every helper call and keeps the *last* one: the final
 * request is the fetch that returns the data n8n diffs, while the ones before
 * it are watermarks (`GET /labels`, `GET /users`) the trigger only consults.
 */
async function capturePollTrigger(loader, entry) {
  const loaded = await loader.load(entry.path);
  if (!loaded.ok) return { status: "load-failed", error: loaded.error };
  const description = loaded.description;
  const target = pickPollTarget(loaded.instance);
  if (!target) return { status: "no-poll" };

  const index = indexProperties(description);
  const sentinels = makeSentinels();
  const requests = [];
  const ctx = makeExecuteContext({ description, index, sentinels, forced: {}, requests });
  // A trigger keeps its watermark in the node's static data.
  ctx.getWorkflowStaticData = () => magic("staticData");

  let failure = null;
  let trace = "";
  try {
    await Promise.race([
      target.poll.call(ctx),
      new Promise((resolve) => setTimeout(resolve, 3000).unref?.()),
    ]);
  } catch (e) {
    if (e !== CAPTURE_LIMIT) {
      failure = String(e?.message ?? e).slice(0, 200);
      trace = String(e?.stack ?? "").slice(0, 600);
    }
  }

  if (!requests.length) {
    return { status: failure ? "error" : "none", error: failure ?? undefined, trace: trace || undefined, cases: [] };
  }
  const templated = requests.map((r) => templateize(r, sentinels));
  const partial = templated.some(hasSentinel);
  return {
    status: partial ? "partial" : "ok",
    error: failure ?? undefined,
    cases: [
      {
        resource: null,
        operation: "",
        status: partial ? "partial" : "ok",
        needs: collectNeeds(templated),
        requests: templated,
      },
    ],
  };
}

/**
 * Capture for the declarative family: nodes with no `execute()` whose request
 * lives in `requestDefaults` + `routing` on the description itself.
 *
 * n8n's runtime builds the call from those two pieces; so does this. `preSend`
 * hooks (Adalo, Gong…) run against the same mock context, since they are the
 * node code that finalises the body.
 */
async function captureDeclarative(description, entry) {
  const index = indexProperties(description);
  const sentinels = makeSentinels();
  const defaults = description.requestDefaults ?? {};
  const baseURL = typeof defaults.baseURL === "string" ? normaliseExpression(defaults.baseURL) : "";
  const defaultHeaders = defaults.headers && typeof defaults.headers === "object" ? defaults.headers : {};
  const cases = [];
  // Same for the declarative family, whose routing may sit on the only flow.
  const declCombos = combinationsFor(description);
  for (const combo of declCombos.length ? declCombos : [{ resource: undefined, operation: "" }]) {
    const base = { resource: combo.resource ?? null, operation: combo.operation };

    // The operation option that carries this combo's routing.
    let routing = null;
    const findRouting = (props) => {
      for (const prop of props ?? []) {
        for (const opt of prop?.options ?? []) {
          if (opt?.routing?.request && opt.value === combo.operation) {
            const showRes = opt.displayOptions?.show?.resource ?? prop.displayOptions?.show?.resource;
            if (Array.isArray(showRes) && combo.resource !== undefined && !showRes.includes(combo.resource)) continue;
            routing = opt.routing;
            return;
          }
          findRouting(opt?.values);
          findRouting(opt?.options);
        }
      }
    };
    findRouting(description.properties);
    if (!routing) {
      cases.push({ ...base, status: "none" });
      continue;
    }

    const req = routing.request ?? {};
    const method = String(req.method ?? "GET").toUpperCase();
    let path = normaliseExpression(req.url ?? "");
    if (baseURL && path && !/^https?:\/\//i.test(path)) {
      path = `${baseURL.replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}`;
    } else if (baseURL && !path) {
      path = baseURL;
    }

    const headers = {};
    for (const [k, v] of Object.entries(defaultHeaders)) headers[k] = normaliseExpression(String(v));
    const qs = {};
    const body = {};

    // Parameter-level routing: each parameter declares where its value goes
    // (`routing.send: { property: 'details.host', type: 'body' }`).
    const applySend = (props) => {
      for (const prop of props ?? []) {
        if (prop?.routing?.send) {
          const send = prop.routing.send;
          const value = valueFor(prop, prop.name, sentinels, {});
          const target = (send.property ?? prop.name).split(".");
          if (send.type === "body" || send.type === "qs") {
            const bag = send.type === "body" ? body : qs;
            let cursor = bag;
            for (let i = 0; i < target.length - 1; i++) cursor = (cursor[target[i]] = cursor[target[i]] ?? {});
            cursor[target[target.length - 1]] = send.value !== undefined ? normaliseExpression(String(send.value)) : value;
          }
        }
        if (Array.isArray(prop?.options)) {
          for (const opt of prop.options) applySend(opt?.values);
        }
      }
    };
    applySend(description.properties);

    // preSend: node code that finalises the body/qs before the call. It runs
    // against the mock, because it is where the body is actually built.
    const options = { method, url: path, headers: { ...headers }, qs, body };
    let preSendError = null;
    for (const fn of routing.send?.preSend ?? []) {
      try {
        const singleCtx = makeExecuteContext({ description, index, sentinels, forced: {}, requests: [] });
        singleCtx.getInputData = () => ({ json: {} });
        const next = await fn.call(singleCtx, options, 0);
        if (next && typeof next === "object") Object.assign(options, next);
      } catch (e) {
        preSendError = String(e?.message ?? e).slice(0, 120);
      }
    }

    const out = normaliseRequest("routing", options);
    if (out.path) out.path = path;
    if (Object.keys(headers).length) out.headers = { ...headers, ...(out.headers ?? {}) };
    if (Object.keys(qs).length) out.qs = qs;
    if (Object.keys(body).length) out.body = body;

    const templated = templateize(out, sentinels);
    const partial = hasSentinel(templated) || Boolean(preSendError);
    cases.push({
      ...base,
      status: partial ? "partial" : "ok",
      error: preSendError ?? undefined,
      needs: collectNeeds([templated]),
      requests: [templated],
    });
  }

  const ok = cases.filter((c) => c.status === "ok").length;
  const status = ok ? "ok" : cases.some((c) => c.status === "partial") ? "partial" : "none";
  return { status, cases };
}

export { captureNode, capturePollTrigger, captureDeclarative };

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
  const rawPath =
    base && typeof url === "string"
      ? `${base}${url}`
      : typeof url === "string"
        ? url
        : String(url ?? "");
  // Node code often builds the path from a resource locator *object* directly:
  // `` `${base}` `` where `base` was `getNodeParameter('baseId')`. The mock
  // answers with `{__rl, mode, value: sentinel}`, which stringifies to
  // `[object Object]` (percent-encoded as `%5Bobject%20Object%5D` by n8n's
  // helper for the query, or verbatim in a template literal). Replace both
  // with `__gs_this__` so the templater resolves the locator's `.value`.
  const readablePath = rawPath
    .replace(/\[object Object\]/g, "__gs_this__")
    .replace(/%5Bobject%20Object%5D/gi, "__gs_this__");
  // The AWS family hands the engine a recipe instead of a URL
  // (`{ method, qs: { service, path } }` and the signature). A request with no
  // URL is not one the engine can send, and recording it as if it were is how a
  // node would look runnable in the palette and answer nothing at run time.
  if (readablePath.trim()) {
    out.path = readablePath;
  } else {
    out.builtByHelper = true;
  }
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
  const out = { only: null, limit: 0, out: OUT, timeout: 10000, ai: false, triggers: false };
  for (const arg of argv) {
    const [key, value = ""] = arg.replace(/^--/, "").split("=");
    if (key === "only") out.only = value.split(",").map((s) => s.trim()).filter(Boolean);
    else if (key === "limit") out.limit = Number(value) || 0;
    else if (key === "timeout") out.timeout = Number(value) || out.timeout;
    else if (key === "ai") out.ai = value !== "false";
    else if (key === "triggers") out.triggers = value !== "false";
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
  if (args.triggers && !process.argv.some((a) => a.startsWith("--out"))) {
    args.out = OUT_TRIGGERS;
  }
  const catalog = JSON.parse(fs.readFileSync(SOURCES, "utf8"));
  let entries = catalog.filter((e) => typeof e.path === "string" && e.path);
  if (args.triggers) {
    entries = entries.filter((e) => e.isTrigger);
  }
  if (args.only) entries = entries.filter((e) => args.only.includes(e.key));
  if (args.limit) entries = entries.slice(0, args.limit);
  if (!entries.length) {
    console.error("no hay nodos que capturar (¿--only con un nombre que no existe?)");
    process.exit(1);
  }

  const loader = await createNodeLoader(SRC, { concurrency: 4 });
  const nodes =
    args.only && fs.existsSync(args.out)
      ? JSON.parse(fs.readFileSync(args.out, "utf8")).nodes ?? {}
      : {};
  const tally = { ok: 0, partial: 0, none: 0, hung: 0, timeout: 0, skipped: 0, "load-failed": 0, "no-execute": 0, "no-poll": 0 };
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

      // Polling triggers watch data instead of acting on it: their code path is
      // `poll()`, not `execute()`.
      const captureThis = args.triggers && entry.isTrigger ? capturePollTrigger : captureNode;

      let result;
      try {
        result = await withTimeout(captureThis(loader, entry), args.timeout);
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
  console.log(`  colgados (3s)       : ${tally.hung}`);
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
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

