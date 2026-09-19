// Loads a real n8n node class and returns its `description`.
//
// Why not parse the source? A node's `properties` array is TypeScript, not JSON:
// it contains spreads, imported constants, helper calls and `NodeConnectionTypes`
// references. Regex over it produces plausible-looking garbage, and the whole
// point here is to show the user the *same* configuration n8n shows.
//
// So the node is transpiled and executed instead. Two things make that possible
// without installing n8n's dependency tree:
//
//  1. Reading `description` only needs the module to *load*, never to run its
//     `execute()` logic. Every import that cannot be resolved on disk is left
//     external, and at require time anything unknown is answered with a deep
//     Proxy that returns callables for any property.
//  2. Type-only imports vanish during the transpile, so the handful of real
//     value imports from `n8n-workflow` are all that need stubbing.
//
// The result is the exact object n8n itself would build.

import esbuild from "esbuild";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const require_ = createRequire(import.meta.url);

/**
 * Marks every value `deepStub` hands out. Serialising a stub is a *silent*
 * corruption: `JSON.stringify` writes a function as `null` and a stubbed object
 * as `{}`, so the parameter file ends up claiming the node declares a field with
 * no name, and the form crashes on it. Consumers therefore need to *recognise*
 * a stub to drop it — and the marker has to survive the "any property returns a
 * stub" trap, so it is compared with `=== true`: the trap answers every unknown
 * key with a stub (never with `true`), which makes this check unambiguous.
 *
 * A `Symbol.for` key is used so the pruning code does not have to import this
 * module to agree on it.
 */
const STUB_MARK = Symbol.for("grapscreen.n8n-loader.stub");

/** True when `value` came from `deepStub` (an import the loader could not resolve). */
export function isLoaderStub(value) {
  if (value === null) return false;
  const t = typeof value;
  if (t !== "function" && t !== "object") return false;
  try {
    return value[STUB_MARK] === true;
  } catch {
    // A revoked proxy or a throwing getter: not worth failing the load for.
    return false;
  }
}

/** A module-shaped value that answers any property access with another stub. */
function deepStub(name) {
  const fn = function () {
    return deepStub(name);
  };
  // Statics planted on a stub (`VersionedNodeType`, `NodeConnectionTypes`) have to
  // read back. Without this the `get` trap shadows them, `class X extends
  // stub.VersionedNodeType` extends a *stub*, and `new X()` yields a proxy with no
  // own keys — every versioned node then reports an empty description. The
  // failure is silent: it looks like "node declares no properties", not an error.
  const injected = new Map();
  return new Proxy(fn, {
    get(_target, prop) {
      if (prop === "then") return undefined; // must not look like a promise
      if (prop === "__esModule") return true;
      if (prop === STUB_MARK) return true; // lets a consumer tell a stub from real data
      if (prop === Symbol.toPrimitive || prop === "toString") return () => name;
      if (injected.has(prop)) return injected.get(prop);
      return deepStub(`${name}.${String(prop)}`);
    },
    set(_target, prop, value) {
      injected.set(prop, value);
      return true;
    },
    // Transpiled class fields do not go through `set`. A node written as
    // `class Webhook extends Node { description = { … } }` reaches
    // `Object.defineProperty(this, "description", …)` when the parent stub is the
    // constructed object, and without this trap the value lands on the proxy
    // target where `get` never looks — the node then reads as having no
    // description at all.
    defineProperty(_target, prop, descriptor) {
      if (descriptor && "value" in descriptor) injected.set(prop, descriptor.value);
      return true;
    },
    apply() {
      return deepStub(name);
    },
    construct() {
      return deepStub(name);
    },
  });
}

let loadHookInstalled = false;

/**
 * Real values for `n8n-workflow`, read from the package's own source in the
 * cache. Filled by `primeWorkflowValues` before the hook is installed.
 */
let workflowValues = null;

/**
 * The `n8n-workflow` files node descriptions import *values* from.
 *
 * The module as a whole is stubbed — its real entry point pulls in the DI
 * container, the config system and the expression engine — but a blanket stub
 * answers `NodeConnectionTypes.AiTool` and `updateDisplayOptions(...)` with a
 * fresh stub too, and a stubbed `displayOptions` is a lost condition: the form
 * cannot tell a field apart from its siblings, so both render at once.
 *
 * Each of these three is safe to bundle for real:
 *   · `constants.ts`  — no imports at all (`CHAT_WAIT_USER_REPLY`, …)
 *   · `interfaces.ts` — type-only imports, so nothing survives the transpile
 *     except the values (`NodeConnectionTypes`)
 *   · `utils.ts`      — imports lodash/express helpers that are not installed;
 *     those become stubs, which is fine because the file only *defines*
 *     functions at module scope (`updateDisplayOptions` merges two plain
 *     objects, and a stubbed `lodash/merge` would only be reached if it ran)
 */
const WORKFLOW_VALUE_SOURCES = [
  "packages/workflow/src/constants.ts",
  "packages/workflow/src/interfaces.ts",
  "packages/workflow/src/utils.ts",
];

/** Bundles those files and collects their runtime exports. Missing or unbuildable sources are skipped, not fatal. */
async function primeWorkflowValues(srcRoot, work, plugin) {
  const values = {};
  for (const [i, rel] of WORKFLOW_VALUE_SOURCES.entries()) {
    const abs = path.join(srcRoot, rel);
    if (!fs.existsSync(abs)) continue;
    const out = path.join(work, `workflow-values-${i}.cjs`);
    try {
      await esbuild.build({
        entryPoints: [abs],
        bundle: true,
        format: "cjs",
        platform: "node",
        target: "node20",
        outfile: out,
        logLevel: "silent",
        plugins: [plugin],
      });
      const mod = require_(out);
      for (const [k, v] of Object.entries(mod)) {
        if (k !== "__esModule" && k !== "default") values[k] = v;
      }
    } catch {
      // A source that cannot be built or required here leaves its names stubbed,
      // which the pruning pass turns into a reported omission.
    }
  }
  return values;
}

function installLoadHook() {
  if (loadHookInstalled) return;
  loadHookInstalled = true;
  const original = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "n8n-workflow") {
      // Mirrors `packages/workflow/src/versioned-node-type.ts` exactly. The base
      // description carries `defaultVersion`, and the instance's own
      // `description` stays the *base* one — the fields n8n actually renders live
      // in `nodeVersions[currentVersion]`, which is what `getNodeType()` returns.
      class VersionedNodeType {
        constructor(nodeVersions, description) {
          this.nodeVersions = nodeVersions;
          this.currentVersion = description?.defaultVersion ?? this.getLatestVersion();
          this.description = description;
        }
        getLatestVersion() {
          return Math.max(...Object.keys(this.nodeVersions).map(Number));
        }
        getNodeType(version) {
          return this.nodeVersions[version ?? this.currentVersion];
        }
      }
      const stub = deepStub("n8n-workflow");
      // Seeded first so the real values win over the stub's "anything" answers…
      if (workflowValues) {
        for (const [key, value] of Object.entries(workflowValues)) stub[key] = value;
      }
      // …and the two entries that must be real even when nothing could be seeded,
      // because node classes extend and read them while loading. The check reads
      // the seeded map, never the stub: `stub.anything` is always truthy.
      stub.VersionedNodeType = VersionedNodeType;
      if (workflowValues?.NodeConnectionTypes === undefined) {
        stub.NodeConnectionTypes = { Main: "main", AiAgent: "ai_agent" };
      }
      if (workflowValues?.NodeConnectionType === undefined) {
        stub.NodeConnectionType = { Main: "main" };
      }
      return stub;
    }
    try {
      return original.call(this, request, parent, isMain);
    } catch (e) {
      if (e && e.code === "MODULE_NOT_FOUND") return deepStub(request);
      throw e;
    }
  };
}

/**
 * n8n's tsconfig path aliases. Resolving these to the real files matters: they
 * hold shared option lists and field descriptions, and a stubbed `@utils/...`
 * would hand `properties` a Proxy where an array of choices belongs.
 *
 * They are **package-relative**, not global: a LangChain node's `@utils/...`
 * means `packages/@n8n/nodes-langchain/utils/`, while a nodes-base node's means
 * `packages/nodes-base/utils/`. Resolving both against nodes-base pulls the
 * wrong module graph into LangChain nodes and breaks the build, so the package
 * is derived from the importing file.
 */
/**
 * The absolute n8n package a file belongs to, e.g.
 * `…/.n8n-cache/src/packages/@n8n/nodes-langchain`.
 *
 * The result is already absolute — `resolveDir` comes from esbuild that way —
 * so callers must join the alias onto it directly. Joining it onto the source
 * root as well yields `…/src/…/src/packages/…`, which never exists, and every
 * alias quietly falls back to a stub.
 */
function packageRootOf(file) {
  const m = file.split(path.sep).join("/").match(/^(.*?\/packages\/(?:@[^/]+\/)?[^/]+)\//);
  return m ? m[1] : null;
}

function resolveFile(p) {
  for (const c of [
    p,
    `${p}.ts`,
    `${p}.js`,
    `${p}.json`,
    path.join(p, "index.ts"),
    path.join(p, "index.js"),
  ]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

/**
 * Package *name* → directory under `packages/`, for the packages where the two
 * differ. They were published as standalone npm packages before the monorepo
 * layout settled, so a node imports `n8n-nodes-base/…` while the directory is
 * `nodes-base`. Names that are not listed here keep their own name as directory.
 */
const WORKSPACE_PACKAGE_DIRS = {
  "n8n-nodes-base": "nodes-base",
  "n8n-workflow": "workflow",
  "n8n-core": "core",
};

/**
 * Workspace package imports, e.g. `n8n-nodes-base/dist/utils/highlightedData`.
 *
 * Inside n8n's monorepo those are compiled-package specifiers, so they resolve
 * from `node_modules` — which does not exist here, and a stubbed field would
 * simply vanish from the form (see `deepStub`). The source layout maps cleanly
 * instead: `n8n-nodes-base/dist/<x>` is `packages/nodes-base/<x>`, with `dist`
 * being that package's build output. A handful of real fields come from these
 * imports (`autoSaveHighlightedDataProperty`, the send-and-wait descriptions).
 *
 * Packages that are not in the cache (`n8n-core`, `@langchain/*`) still fall
 * through to a stub on purpose: guessing at their contents would invent fields
 * n8n at this commit does not have.
 */
function resolveWorkspacePackage(specifier, srcRoot) {
  // Split into package name and subpath, honouring the `@scope/name` form.
  const m = specifier.match(/^((?:@[^/]+\/)?[^/]+)(?:\/(.+))?$/);
  if (!m) return null;
  const dir = WORKSPACE_PACKAGE_DIRS[m[1]] ?? m[1];
  const pkgDir = path.join(srcRoot, "packages", dir);
  if (!fs.existsSync(pkgDir)) return null;
  const rest = (m[2] ?? "").replace(/^dist\//, "");
  // Two conventions live in the monorepo: `nodes-base` keeps its sources at the
  // package root (`nodes-base/utils/…`), while the `@n8n/*` packages keep them
  // under `src/` (`@n8n/ai-utilities/utils/…` is really `src/utils/…`).
  const candidates = rest
    ? [path.join(pkgDir, rest), path.join(pkgDir, "src", rest)]
    : [path.join(pkgDir, "index"), path.join(pkgDir, "src/index")];
  for (const candidate of candidates) {
    const resolved = resolveFile(candidate);
    if (resolved) return resolved;
  }
  return null;
}

function makePlugin(srcRoot) {
  // NOTE: never call `build.resolve` from inside `onResolve` — it re-enters this
  // same callback and recurses forever, hanging the process with no output.
  return {
    name: "n8n-node-loader",
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === "entry-point") return undefined;
        if (args.path.startsWith("node:")) return { path: args.path, external: true };
        if (args.path === "n8n-workflow") return { path: "n8n-workflow", external: true };
        if (!args.path.startsWith(".")) {
          // `@utils/x` / `@credentials/x` / `@nodes/x`, relative to the importing
          // file's own package.
          const alias = args.path.match(/^@(utils|credentials|nodes|types)\/(.+)$/);
          if (alias) {
            const pkg = packageRootOf(args.resolveDir);
            if (pkg) {
              const abs = path.join(pkg, alias[1], alias[2]);
              const resolved = resolveFile(abs);
              if (resolved) return { path: resolved };
            }
          }
          const workspace = resolveWorkspacePackage(args.path, srcRoot);
          if (workspace) return { path: workspace };
          return { path: args.path, external: true };
        }
        const abs = path.resolve(args.resolveDir, args.path);
        const resolved = resolveFile(abs);
        return resolved ? { path: resolved } : { path: args.path, external: true };
      });
    },
  };
}

/** Creates a loader bound to a source tree and a scratch directory. */
export async function createNodeLoader(srcRoot, { concurrency = 6 } = {}) {
  const src = path.resolve(srcRoot);
  const work = await mkdtemp(path.join(tmpdir(), "n8n-nodes-"));
  const plugin = makePlugin(src);
  // Before the hook is installed: it needs the values to seed its stub with.
  if (!workflowValues) workflowValues = await primeWorkflowValues(src, work, plugin);
  installLoadHook();
  let seq = 0;

  /** Loads one node file and returns its `description`, or an error string. */
  async function load(relPath) {
    const abs = path.join(src, relPath);
    if (!fs.existsSync(abs)) return { ok: false, error: "missing file" };
    // Unique per path — a truncated hash collides and silently loads the wrong
    // node's bundle, which shows up as bizarre parse errors from unrelated files.
    const out = path.join(work, `n${seq++}.cjs`);
    try {
      await esbuild.build({
        entryPoints: [abs],
        bundle: true,
        format: "cjs",
        platform: "node",
        target: "node20",
        outfile: out,
        logLevel: "silent",
        plugins: [plugin],
      });
    } catch (e) {
      // Keep a couple of lines: the first line only says "Build failed with N
      // errors", the useful "could not resolve X from Y" is on the next one.
      const msg = String(e.message)
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(" ")
        .slice(0, 200);
      return { ok: false, error: `bundle: ${msg}` };
    }
    try {
      const mod = require_(out);
      // `description` is an *instance* field assigned in the constructor, so it
      // cannot be found on the prototype without instantiating.
      //
      // The shape check matters: an unresolved import is a stub, and a stub
      // answers every property with something truthy. Accepting it would let a
      // module that failed to link pass as "a node with no properties" instead of
      // reporting the failure. `properties` is a real array on a real node, and
      // `nodeVersions` is a real object on a versioned one.
      const cls = Object.values(mod).find((v) => {
        if (typeof v !== "function" || !v.prototype) return false;
        try {
          const inst = new v();
          const d = inst.description;
          if (d && typeof d === "object" && Array.isArray(d.properties)) return true;
          return !!inst.nodeVersions && typeof inst.nodeVersions === "object";
        } catch {
          return false;
        }
      });
      if (!cls) return { ok: false, error: "no description" };
      const inst = new cls();
      let description = inst.description;
      // A versioned node's own `description` is only the base one, so the fields
      // the editor renders — properties, credentials, defaults — come from the
      // version n8n defaults to. See `VersionedNodeType.getNodeType()`.
      if (inst.nodeVersions && typeof inst.getNodeType === "function") {
        const current = inst.getNodeType();
        if (current?.description && typeof current.description === "object") {
          description = { ...inst.description, ...current.description };
        }
      }
      if (!description || typeof description === "function" || !Array.isArray(description.properties)) {
        return { ok: false, error: "no properties" };
      }
      // The instance is handed back as well: the run-map capture has to *call*
      // `execute()` with a mocked `IExecuteFunctions` to learn which HTTP request
      // the node would really issue. Returning only the description was enough
      // while the only consumer was the parameter form.
      return { ok: true, description, instance: inst };
    } catch (e) {
      return { ok: false, error: `load: ${String(e.message).slice(0, 140)}` };
    }
  }

  /** Loads many nodes with bounded concurrency, preserving input order. */
  async function loadAll(relPaths) {
    const results = new Array(relPaths.length);
    let next = 0;
    const worker = async () => {
      while (next < relPaths.length) {
        const i = next++;
        results[i] = await load(relPaths[i]);
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
    return results;
  }

  async function dispose() {
    await rm(work, { recursive: true, force: true });
  }

  return { load, loadAll, dispose };
}
