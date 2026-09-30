// Why does a node have no execute()? Print the shape of the loaded instance.
//   node scripts/n8n-runmap-inspect.mjs Adalo AzureCosmosDb Gong
import fs from "node:fs";
import { createNodeLoader } from "./n8n-node-loader.mjs";

const keys = process.argv.slice(2);
if (!keys.length) {
  console.error("uso: node scripts/n8n-runmap-inspect.mjs <Nodo>…");
  process.exit(1);
}
const descriptors = JSON.parse(fs.readFileSync("./src/data/n8n-descriptors.json", "utf8"));
const loader = await createNodeLoader("./.n8n-cache/src", { concurrency: 2 });
try {
  for (const key of keys) {
    const d = descriptors.find((x) => x.key === key);
    if (!d) {
      console.log(`${key}: sin descriptor`);
      continue;
    }
    const r = await loader.load(d.path);
    if (!r.ok) {
      console.log(`${key}: load-failed — ${r.error}`);
      continue;
    }
    const inst = r.instance;
    const versions = inst?.nodeVersions;
    const versionKeys = versions ? Object.keys(versions) : [];
    const versionInfo = versionKeys
      .map((v) => {
        const target = versions[v];
        return `${v}:${target?.constructor?.name ?? "?"}(${typeof target?.execute})`;
      })
      .join(", ");
    console.log(
      `${key}: cls=${inst?.constructor?.name ?? "?"} execute=${typeof inst?.execute} versions=[${versionInfo}] | node=${r.description?.name} type=${typeof r.description?.version}`,
    );
  }
} finally {
  await loader.dispose();
}
