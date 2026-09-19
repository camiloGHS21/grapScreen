import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import Module, { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const SRC = './.n8n-cache/src';
const OUT = './src/data/n8n-credentials.json';

function deepStub(name) {
  const fn = function () { return deepStub(name); };
  return new Proxy(fn, {
    get(_t, p) {
      if (p === 'then') return undefined;
      if (p === '__esModule') return true;
      if (p === Symbol.toPrimitive || p === 'toString') return () => name;
      return deepStub(`${name}.${String(p)}`);
    },
    apply() { return deepStub(name); },
    construct() { return deepStub(name); },
  });
}

let hookInstalled = false;
function installHook() {
  if (hookInstalled) return;
  hookInstalled = true;
  const orig = Module._load;
  Module._load = function (req, parent, isMain) {
    try { return orig.call(this, req, parent, isMain); }
    catch (e) { if (e?.code === 'MODULE_NOT_FOUND') return deepStub(req); throw e; }
  };
}

function packageRootOf(file) {
  const m = file.split(path.sep).join('/').match(/^(.*?\/packages\/(?:@[^/]+\/)?[^/]+)\//);
  return m ? m[1] : null;
}

function makePlugin(srcRoot) {
  const isFile = (p) => {
    for (const c of [p, `${p}.ts`, `${p}.js`, `${p}.json`, path.join(p, 'index.ts'), path.join(p, 'index.js')]) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return true;
    }
    return false;
  };
  return {
    name: 'cred-loader',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point') return undefined;
        if (args.path.startsWith('node:')) return { path: args.path, external: true };
        if (!args.path.startsWith('.')) {
          const alias = args.path.match(/^@(utils|credentials|nodes|types)\/(.+)$/);
          if (alias) {
            const pkg = packageRootOf(args.resolveDir);
            if (pkg) {
              const abs = path.join(srcRoot, pkg, alias[1], alias[2]);
              if (isFile(abs)) return { path: abs };
            }
          }
          return { path: args.path, external: true };
        }
        const abs = path.resolve(args.resolveDir, args.path);
        return isFile(abs) ? undefined : { path: args.path, external: true };
      });
    },
  };
}

async function loadCredential(srcRoot, relPath, work) {
  const abs = path.join(srcRoot, relPath);
  if (!fs.existsSync(abs)) return null;
  const out = path.join(work, `c-${path.basename(relPath, '.credentials.ts')}.cjs`);
  try {
    await esbuild.build({
      entryPoints: [abs],
      bundle: true,
      format: 'cjs',
      platform: 'node',
      target: 'node20',
      outfile: out,
      logLevel: 'silent',
      plugins: [makePlugin(srcRoot)],
    });
  } catch (e) {
    return null;
  }
  try {
    const mod = require_(out);
    const cls = Object.values(mod).find((v) => {
      if (typeof v !== 'function' || !v.prototype) return false;
      try {
        const inst = new v();
        return inst.name && inst.displayName;
      } catch { return false; }
    });
    if (!cls) return null;
    const inst = new cls();
    return {
      name: inst.name,
      displayName: inst.displayName,
      documentationUrl: inst.documentationUrl,
      properties: (inst.properties || []).map(p => ({
        displayName: p.displayName,
        name: p.name,
        type: p.type,
        default: p.default,
        required: p.required,
        description: p.description,
        placeholder: p.placeholder,
        typeOptions: p.typeOptions,
        options: p.options,
      })),
    };
  } catch (e) {
    return null;
  }
}

async function main() {
  installHook();
  const src = path.resolve(SRC);
  const work = await mkdtemp(path.join(tmpdir(), 'n8n-creds-'));

  const credDirs = [
    'packages/nodes-base/credentials',
    'packages/@n8n/nodes-langchain/credentials',
  ];

  const files = [];
  for (const dir of credDirs) {
    const abs = path.join(src, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) {
      if (f.endsWith('.credentials.ts')) files.push(path.join(dir, f));
    }
  }

  console.log(`Found ${files.length} credential files`);

  const credentials = [];
  for (const f of files) {
    const cred = await loadCredential(src, f, work);
    if (cred) {
      credentials.push(cred);
    } else {
      try {
        const content = fs.readFileSync(path.join(src, f), 'utf8');
        const nameMatch = content.match(/name\s*=\s*['"]([^'"]+)['"]/);
        const displayMatch = content.match(/displayName\s*=\s*['"]([^'"]+)['"]/);
        if (nameMatch && displayMatch) {
          credentials.push({ name: nameMatch[1], displayName: displayMatch[1], properties: [] });
        }
      } catch {}
    }
  }

  await rm(work, { recursive: true, force: true });

  fs.writeFileSync(OUT, JSON.stringify(credentials, null, 2));
  console.log(`Wrote ${credentials.length} credentials to ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
