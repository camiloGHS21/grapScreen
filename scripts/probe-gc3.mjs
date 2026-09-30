// One-off diagnostic: capture GoogleCalendarTrigger's poll and print the
// recorded request.
import { createNodeLoader } from "./n8n-node-loader.mjs";
import { capturePollTrigger } from "./n8n-runmap-capture.mjs";
import fs from "node:fs";

const LOG = "probe-gc3.log";
fs.writeFileSync(LOG, "start\n");
const log = (...args) => fs.appendFileSync(LOG, args.map(String).join(" ") + "\n");

const loader = await createNodeLoader("./.n8n-cache/src", { concurrency: 1 });
log("loader ready");
try {
  const descriptor = JSON.parse(fs.readFileSync("./src/data/n8n-descriptors.json", "utf8")).find(
    (e) => e.key === "GoogleCalendarTrigger",
  );
  log("descriptor loaded");
  const result = await capturePollTrigger(loader, descriptor);
  log("status:", result.status, result.error || "");
  const c = result.cases?.[0];
  if (c) {
    for (const q of c.requests ?? []) log(`  ${q.method} ${q.path}`);
  }
} finally {
  await loader.dispose();
  log("done");
}
