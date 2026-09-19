// Throwaway: why do specific nodes fail to load?
import esbuild from "esbuild";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const require_ = createRequire(import.meta.url);
const SRC = path.resolve(".n8n-cache/src");

function deepStub(name) {
  const fn = function () {
    return deepStub(name);
  };
  return new Proxy(fn, {
    get(_t, prop) {
      if (prop === "then") return undefined;
      if (prop === "__esModule") return true;
      if (prop === Symbol.toPrimitive || prop === "toString") return () => name;
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

const exists = (p) => {
  for (const c of [p, `${p}.ts`, `${p}.js`, `${p}.json`, path.join(p, "index.ts")]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return true;
  }
  return false;
};

const externals = [];
const plugin = {
  name: "ext",
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === "entry-point") return undefined;
      if (args.path.startsWith("node:")) return { path: args.path, external: true };
      if (!args.path.startsWith(".")) {
        externals.push(args.path);
        return { path: args.path, external: true };
      }
      const abs = path.resolve(args.resolveDir, args.path);
      if (exists(abs)) return undefined;
      externals.push(args.path);
      return { path: args.path, external: true };
    });
  },
};

const targets = process.argv.slice(2);
const work = await mkdtemp(path.join(tmpdir(), "n8n-dbg-"));

for (const t of targets) {
  const d = JSON.parse(fs.readFileSync("src/data/n8n-descriptors.json", "utf8")).find(
    (x) => x.key === t,
  );
  if (!d) {
    console.log(`--- ${t}: not in catalogue`);
    continue;
  }
  console.log(`\n=== ${t} ===`);
  console.log(`path: ${d.path}`);
  externals.length = 0;
  const out = path.join(work, `${t}.cjs`);
  try {
    await esbuild.build({
      entryPoints: [path.join(SRC, d.path)],
      bundle: true,
      format: "cjs",
      platform: "node",
      target: "node20",
      outfile: out,
      logLevel: "silent",
      plugins: [plugin],
    });
  } catch (e) {
    console.log("BUNDLE FAIL:", e.message);
    continue;
  }
  console.log("externalised:", [...new Set(externals)].slice(0, 12).join(", ") || "(none)");
  try {
    delete require_.cache[out];
    const mod = require_(out);
    const cls = Object.values(mod).find((v) => {
      if (typeof v !== "function" || !v.prototype) return false;
      try {
        return !!new v().description;
      } catch {
        return false;
      }
    });
    console.log("classes:", Object.keys(mod).join(", "));
    console.log("class with description:", cls ? cls.name : "NONE");
    if (cls) {
      const desc = new cls().description;
      console.log("props:", (desc.properties || []).length);
    }
  } catch (e) {
    console.log("LOAD FAIL:", e.constructor.name, String(e.message).slice(0, 200));
    console.log("stack head:", String(e.stack).split("\n").slice(1, 4).join(" | "));
  }
}
