// Sonda: ejecuta UN nodo y muestra la petición grabada, sin escribir el
// artefacto. Sirve para depurar el arnés de captura:
//   node scripts/n8n-runmap-probe.mjs Telegram
//   node scripts/n8n-runmap-probe.mjs Notion dataSource get

import { createNodeLoader } from "./n8n-node-loader.mjs";

const key = process.argv[2] ?? "Telegram";
const wantResource = process.argv[3];
const wantOperation = process.argv[4];

const descriptor = JSON.parse(await (await import("node:fs/promises")).readFile("./src/data/n8n-descriptors.json", "utf8"))
  .find((entry) => entry.key === key);
if (!descriptor) {
  console.error(`no existe el nodo '${key}' en el catálogo`);
  process.exit(1);
}

const loader = await createNodeLoader("./.n8n-cache/src", { concurrency: 1 });
try {
  const { captureNode } = await import("./n8n-runmap-capture.mjs");
  const result = await captureNode(loader, descriptor);
  const cases = result.cases ?? [];
  const picked = cases.filter(
    (c) =>
      (!wantOperation || c.operation === wantOperation) &&
      (!wantResource || (c.resource ?? "") === wantResource),
  );
  for (const c of (picked.length ? picked : cases).slice(0, 6)) {
    console.log(`\n== ${c.resource ?? "-"} / ${c.operation} [${c.status}]${c.error ? ` ${c.error}` : ""}`);
    for (const request of c.requests ?? []) {
      console.log(`  ${request.method} ${request.path}`);
      if (request.headers) console.log("  headers:", JSON.stringify(request.headers));
      if (request.qs) console.log("  qs:", JSON.stringify(request.qs));
      const payload = request.body ?? request.json;
      if (payload !== undefined) console.log("  body:", JSON.stringify(payload).slice(0, 300));
    }
  }
} finally {
  await loader.dispose();
}
