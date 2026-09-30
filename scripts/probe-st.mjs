import { createNodeLoader } from "./n8n-node-loader.mjs";
import { capturePollTrigger } from "./n8n-runmap-capture.mjs";
import fs from "node:fs";
const log = (...a) => fs.appendFileSync("probe-st.log", a.map(String).join(" ") + "\n");
const loader = await createNodeLoader("./.n8n-cache/src", { concurrency: 1 });
try {
  const d = JSON.parse(fs.readFileSync("./src/data/n8n-descriptors.json", "utf8")).find((e) => e.key === "SeaTableTrigger");
  log("loaded", d ? "ok" : "missing");
  const r = await capturePollTrigger(loader, d);
  log("status:", r.status, r.error || "");
  if (r.cases?.[0]) for (const q of r.cases[0].requests ?? []) log(`  ${q.method} ${q.path}`);
} finally { await loader.dispose(); }
