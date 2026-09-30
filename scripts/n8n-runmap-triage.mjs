// Triage: por qué un nodo no produce ninguna petición.
//
//   node scripts/n8n-runmap-triage.mjs Jira GoogleDocs FacebookGraphApi
//   node scripts/n8n-runmap-triage.mjs --none        # todos los status none
//   node scripts/n8n-runmap-triage.mjs --no-execute  # los "sin execute()"
//
// Imprime, por nodo: estado, error y las últimas llamadas a `getNodeParameter`
// antes de quedarse quieto. Esas llamadas son la pista: un nodo que se detiene
// justo después de leer un parámetro booleano o de opciones tomó una rama que
// no construye la petición.

import fs from "node:fs";
import { createNodeLoader } from "./n8n-node-loader.mjs";
import { captureNode, capturePollTrigger } from "./n8n-runmap-capture.mjs";

const argv = process.argv.slice(2);
const map = JSON.parse(fs.readFileSync("./src/data/n8n-runmap.json", "utf8"));
const descriptors = JSON.parse(fs.readFileSync("./src/data/n8n-descriptors.json", "utf8"));

let keys = argv.filter((a) => !a.startsWith("--"));
if (argv.includes("--none")) {
  keys = Object.entries(map.nodes)
    .filter(([, v]) => v.status === "none")
    .map(([k]) => k);
}
if (argv.includes("--no-execute")) {
  keys = Object.entries(map.nodes)
    .filter(([, v]) => v.status === "no-execute")
    .map(([k]) => k);
}
if (!keys.length) {
  console.error("uso: node scripts/n8n-runmap-triage.mjs <Nodo>… | --none | --no-execute");
  process.exit(1);
}

/** Captura las líneas `[probe]` que el contexto simulado escribe en stderr. */
const calls = [];
const originalWrite = process.stderr.write.bind(process.stderr);
process.env.GS_PROBE = "1";
process.stderr.write = (chunk, ...rest) => {
  const text = String(chunk);
  if (text.startsWith("[probe]")) calls.push(text.replace("[probe] ", "").trim());
  return originalWrite(chunk, ...rest);
};

const loader = await createNodeLoader("./.n8n-cache/src", { concurrency: 2 });
const rows = [];
try {
  for (const key of keys) {
    const descriptor = descriptors.find((d) => d.key === key);
    if (!descriptor) {
      rows.push([key, "sin descriptor", "", ""]);
      continue;
    }
    calls.length = 0;
    const capture = descriptor.isTrigger ? capturePollTrigger : captureNode;
    let result;
    try {
      result = await capture(loader, descriptor);
    } catch (e) {
      result = { status: "throw", error: String(e?.message ?? e) };
    }
    const withRequests = (result.cases ?? []).filter((c) => (c.requests ?? []).length).length;
    const total = (result.cases ?? []).length;
    const statuses = [...new Set((result.cases ?? []).map((c) => c.status))].join("/") || "-";
    const last = calls.slice(-3).map((c) => c.split(" -> ")[0].replace("getNodeParameter(", "")).join(" · ");
    rows.push([
      key,
      `${result.status} [${statuses}]${withRequests ? ` (${withRequests}/${total} con petición)` : ""}`,
      (result.error ?? (result.cases ?? []).find((c) => c.error)?.error ?? "").slice(0, 60),
      last,
    ]);
  }
} finally {
  process.stderr.write = originalWrite;
  await loader.dispose();
}

const width = Math.max(...rows.map((r) => r[0].length));
for (const [key, status, error, last] of rows) {
  console.log(`${key.padEnd(width)}  ${status.padEnd(26)} ${error}`);
  if (last) console.log(`${" ".repeat(width)}  ↳ últimas llamadas: ${last}`);
}
