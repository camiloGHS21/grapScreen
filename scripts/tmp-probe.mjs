// Throwaway probe v2: load a real n8n node class without its dependency tree.
//
// Reading `description.properties` only needs the module to *load*, never to run
// its execute logic. So every import that cannot be resolved on disk is left
// external, and at require time anything unknown is answered with a deep Proxy
// that returns callables for any property. That satisfies `import { x } from
// 'lodash'` and `import { helper } from '../../utils/utilities'` alike.
import esbuild from "esbuild";
import fs from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const require_ = createRequire(import.meta.url);

function deepStub(name) {
  const fn = function () {
    return deepStub(name);
  };
  return new Proxy(fn, {
    get(_t, prop) {
      if (prop === "then") return undefined; // not a thenable
      if (prop === Symbol.toPrimitive || prop === "toString") return () => name;
      if (prop === "__esModule") return true;
      return deepStub(`${name}.${String(prop)}`);
    },
    apply() {
      return deepStub(name);
    },
    construct() {
      return deepStub(name);
    },
  });
}

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  try {
    return origLoad.call(this, request, parent, isMain);
  } catch (e) {
    if (e && e.code === "MODULE_NOT_FOUND") return deepStub(request);
    throw e;
  }
};

const NODE =
  ".n8n-cache/src/packages/nodes-base/nodes/WhatsApp/WhatsAppTrigger.node.ts";

const dir = await mkdtemp(path.join(tmpdir(), "n8n-probe2-"));
const out = path.join(dir, "node.cjs");

await esbuild.build({
  entryPoints: [NODE],
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node20",
  outfile: out,
  logLevel: "silent",
  plugins: [
    {
      name: "externalise-what-is-missing",
      setup(build) {
        // NOTE: never call `build.resolve` from inside `onResolve` — it re-enters
        // this same callback and recurses forever (the process just hangs with no
        // output). Resolve relative paths by hand instead.
        const exists = (p) => {
          for (const c of [
            p,
            `${p}.ts`,
            `${p}.js`,
            `${p}.json`,
            path.join(p, "index.ts"),
            path.join(p, "index.js"),
          ]) {
            if (fs.existsSync(c) && fs.statSync(c).isFile()) return true;
          }
          return false;
        };
        build.onResolve({ filter: /.*/ }, (args) => {
          if (args.kind === "entry-point") return undefined;
          if (args.path.startsWith("node:")) return { path: args.path, external: true };
          if (!args.path.startsWith(".")) return { path: args.path, external: true };
          const abs = path.resolve(args.resolveDir, args.path);
          return exists(abs) ? undefined : { path: args.path, external: true };
        });
      },
    },
  ],
});

const mod = require_(out);
// `description` is an *instance* field (assigned in the constructor), not a
// prototype member, so it cannot be detected without instantiating.
const cls = Object.values(mod).find((v) => {
  if (typeof v !== "function" || !v.prototype) return false;
  try {
    return !!new v().description;
  } catch {
    return false;
  }
});
if (!cls) {
  console.log("exports:", Object.keys(mod));
  throw new Error("no INodeType class found");
}
const desc = new cls().description;
console.log("displayName :", desc.displayName);
console.log("credentials :", JSON.stringify(desc.credentials));
console.log("properties  :", desc.properties.length);
console.log(JSON.stringify(desc.properties, null, 1).slice(0, 1500));
