// Throwaway probe v3: how many of the 565 wrapper nodes can we actually load?
import esbuild from "esbuild";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
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

const plugin = {
  name: "ext",
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === "entry-point") return undefined;
      if (args.path.startsWith("node:")) return { path: args.path, external: true };
      if (!args.path.startsWith(".")) return { path: args.path, external: true };
      const abs = path.resolve(args.resolveDir, args.path);
      return exists(abs) ? undefined : { path: args.path, external: true };
    });
  },
};

const work = await mkdtemp(path.join(tmpdir(), "n8n-cov-"));

async function loadOne(relPath) {
  const abs = path.join(SRC, relPath);
  if (!fs.existsSync(abs)) return { ok: false, why: "missing file" };
  const out = path.join(work, `${Buffer.from(relPath).toString("hex").slice(0, 40)}.cjs`);
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
    return { ok: false, why: `bundle: ${String(e.message).split("\n")[0].slice(0, 120)}` };
  }
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
    if (!cls) return { ok: false, why: "no description" };
    const desc = new cls().description;
    return { ok: true, props: (desc.properties || []).length, desc };
  } catch (e) {
    return { ok: false, why: `load: ${String(e.message).slice(0, 120)}` };
  }
}

const descriptors = JSON.parse(fs.readFileSync("src/data/n8n-descriptors.json", "utf8"));
const targets = descriptors.map((d) => ({ key: d.key, p: d.path }));

const results = [];
const CONC = 6;
let i = 0;
async function worker() {
  while (i < targets.length) {
    const t = targets[i++];
    const r = await loadOne(t.p);
    results.push({ ...t, ...r });
  }
}
await Promise.all(Array.from({ length: CONC }, worker));

const ok = results.filter((r) => r.ok);
const bad = results.filter((r) => !r.ok);
console.log(`loaded OK : ${ok.length}/${results.length}`);
console.log(`with params: ${ok.filter((r) => r.props > 0).length}`);
const reasons = {};
for (const b of bad) {
  const k = (b.why || "").split(":").slice(0, 2).join(":").slice(0, 60);
  reasons[k] = (reasons[k] || 0) + 1;
}
console.log("\nfailures by reason:");
for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(3)}  ${k}`);
}
console.log("\nsample failures:");
for (const b of bad.slice(0, 10)) console.log(`  ${b.key}: ${b.why}`);

await rm(work, { recursive: true, force: true });
