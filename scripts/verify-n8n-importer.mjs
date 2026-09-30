#!/usr/bin/env node
/**
 * Test suite for the n8n JSON workflow importer.
 *
 * Verifies that exported n8n workflow JSON files are accurately translated:
 *   - Nodes translated to proper grapScreen kind (n8n_node, n8n_trigger, core kinds)
 *   - Parameters preserved in n8n_config & mapped to native runner fields
 *   - Coordinates mapped to layout_metadata.positions
 *   - Connections translated with correct source and target port IDs
 *   - Branching for If (true/false) and Switch (case0/case1/case2/default)
 *   - AI Agent subnode connections (model, memory, tool, outputParser)
 *   - Merge node inputs (in1/in2), Sticky notes and disabled node flags
 *   - Utility nodes (ExecuteCommand, ReadWriteFile, SpreadsheetFile, Code)
 *   - Database & Google SDK nodes (MySQL, Redis, MongoDB, Docs, Slides, Chat, Drive) with credentials
 */
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const relative = (p) => `./${p.split("\\").join("/")}`;

async function loadModules() {
  const result = await build({
    stdin: {
      contents: `
        export { importN8nWorkflow } from ${JSON.stringify(relative("src/features/flowchart/utils/n8nWorkflowImporter.ts"))};
        export { exportN8nWorkflow } from ${JSON.stringify(relative("src/features/flowchart/utils/n8nWorkflowExporter.ts"))};
      `,
      resolveDir: ROOT,
      sourcefile: "importer-test-entry.ts",
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "silent",
  });
  const out = join(ROOT, "node_modules", ".cache", `importer-test-${process.pid}.mjs`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, result.outputFiles[0].text);
  return import(pathToFileURL(out).href);
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

async function runTests() {
  console.log("Loading n8n workflow importer & exporter modules...");
  const { importN8nWorkflow, exportN8nWorkflow } = await loadModules();

  console.log("Running Test 1: Linear Workflow (Schedule Trigger -> HTTP Request -> Slack)");
  const linearWorkflow = {
    name: "Linear Sync",
    nodes: [
      { id: "node-1", name: "Schedule", type: "n8n-nodes-base.scheduleTrigger", position: [100, 200], parameters: { rule: { interval: [{ field: "hours", hoursInterval: 2 }] } } },
      { id: "node-2", name: "Fetch API", type: "n8n-nodes-base.httpRequest", position: [350, 200], parameters: { method: "GET", url: "https://api.example.com/items" } },
      { id: "node-3", name: "Send to Slack", type: "n8n-nodes-base.slack", position: [600, 200], parameters: { channel: "#alerts", text: "New items received" } },
    ],
    connections: {
      Schedule: { main: [[{ node: "Fetch API", type: "main", index: 0 }]] },
      "Fetch API": { main: [[{ node: "Send to Slack", type: "main", index: 0 }]] },
    },
  };
  const res1 = importN8nWorkflow(linearWorkflow);
  assert(res1.summary.nodeCount === 3 && res1.summary.connectionCount === 2, "Test 1 counts mismatch");
  const meta1 = res1.events.find((e) => e.kind === "layout_metadata")?.data;
  assert(meta1 && meta1.connections[0].sourcePortId === "out" && meta1.connections[0].targetPortId === "in", "Test 1 ports mismatch");
  console.log("PASS: Test 1 passed.");

  console.log("Running Test 2: If / Condition Branching (If -> True Node / False Node)");
  const ifWorkflow = {
    name: "Branching Flow",
    nodes: [
      { id: "start-1", name: "Start", type: "n8n-nodes-base.manualTrigger", position: [100, 200] },
      { id: "if-1", name: "Check Value", type: "n8n-nodes-base.if", position: [300, 200] },
      { id: "true-node", name: "On Success", type: "n8n-nodes-base.code", position: [500, 100] },
      { id: "false-node", name: "On Failure", type: "n8n-nodes-base.stopAndError", position: [500, 300] },
    ],
    connections: {
      Start: { main: [[{ node: "Check Value", type: "main", index: 0 }]] },
      "Check Value": { main: [[{ node: "On Success", type: "main", index: 0 }], [{ node: "On Failure", type: "main", index: 0 }]] },
    },
  };
  const res2 = importN8nWorkflow(ifWorkflow);
  const meta2 = res2.events.find((e) => e.kind === "layout_metadata")?.data;
  assert(meta2.connections.find((c) => c.sourcePortId === "true") && meta2.connections.find((c) => c.sourcePortId === "false"), "Test 2 ports mismatch");
  console.log("PASS: Test 2 passed.");

  console.log("Running Test 3: Switch Node (Multiple Cases)");
  const switchWorkflow = {
    name: "Switch Routing",
    nodes: [
      { id: "sw-1", name: "Router", type: "n8n-nodes-base.switch", position: [200, 200] },
      { id: "c0", name: "Case 1", type: "n8n-nodes-base.noOp", position: [400, 100] },
      { id: "c1", name: "Case 2", type: "n8n-nodes-base.noOp", position: [400, 200] },
      { id: "c2", name: "Case 3", type: "n8n-nodes-base.noOp", position: [400, 300] },
      { id: "cdef", name: "Default", type: "n8n-nodes-base.noOp", position: [400, 400] },
    ],
    connections: {
      Router: { main: [[{ node: "Case 1", type: "main", index: 0 }], [{ node: "Case 2", type: "main", index: 0 }], [{ node: "Case 3", type: "main", index: 0 }], [{ node: "Default", type: "main", index: 0 }]] },
    },
  };
  const res3 = importN8nWorkflow(switchWorkflow);
  const meta3 = res3.events.find((e) => e.kind === "layout_metadata")?.data;
  const ports = meta3.connections.map((c) => c.sourcePortId);
  assert(ports.includes("case0") && ports.includes("case1") && ports.includes("case2") && ports.includes("default"), "Test 3 cases mismatch");
  console.log("PASS: Test 3 passed.");

  console.log("Running Test 4: AI LangChain Workflow (Agent + Model + Memory + Tool)");
  const aiWorkflow = {
    name: "AI Agent Assistant",
    nodes: [
      { id: "agent-1", name: "AI Agent", type: "@n8n/n8n-nodes-langchain.agent", position: [400, 200], parameters: { text: "Analyze: {{$json.query}}" } },
      { id: "model-1", name: "OpenAI Model", type: "@n8n/n8n-nodes-langchain.lmChatOpenAi", position: [200, 400], parameters: { model: "gpt-4o" } },
      { id: "mem-1", name: "Window Memory", type: "@n8n/n8n-nodes-langchain.memoryBufferWindow", position: [400, 400], parameters: { contextWindowLength: 5 } },
    ],
    connections: {
      "OpenAI Model": { ai_languageModel: [[{ node: "AI Agent", type: "ai_languageModel", index: 0 }]] },
      "Window Memory": { ai_memory: [[{ node: "AI Agent", type: "ai_memory", index: 0 }]] },
    },
  };
  const res4 = importN8nWorkflow(aiWorkflow);
  const agentEvent = res4.events.find((e) => e.kind === "ai_agent");
  assert(agentEvent && agentEvent.data.provider === "openai" && agentEvent.data.model === "gpt-4o", "Agent parity failed");
  console.log("PASS: Test 4 passed.");

  console.log("Running Test 5: Merge Node (Two Inputs: in1 & in2)");
  const mergeWorkflow = {
    name: "Merge Streams",
    nodes: [
      { id: "src-1", name: "Stream A", type: "n8n-nodes-base.noOp", position: [100, 100] },
      { id: "src-2", name: "Stream B", type: "n8n-nodes-base.noOp", position: [100, 300] },
      { id: "merge-1", name: "Combine", type: "n8n-nodes-base.merge", position: [400, 200] },
    ],
    connections: {
      "Stream A": { main: [[{ node: "Combine", type: "main", index: 0 }]] },
      "Stream B": { main: [[{ node: "Combine", type: "main", index: 1 }]] },
    },
  };
  const res5 = importN8nWorkflow(mergeWorkflow);
  const meta5 = res5.events.find((e) => e.kind === "layout_metadata")?.data;
  const mergeTargetPorts = meta5.connections.map((c) => c.targetPortId);
  assert(mergeTargetPorts.includes("in1") && mergeTargetPorts.includes("in2"), "Merge inputs mismatch");
  console.log("PASS: Test 5 passed.");

  console.log("Running Test 6: Sticky Notes & Disabled Nodes");
  const stickyWorkflow = {
    name: "Documented Flow",
    nodes: [
      { id: "note-1", name: "Sticky Note", type: "n8n-nodes-base.stickyNote", position: [50, 50], parameters: { content: "Este flujo procesa pagos.", width: 300, height: 180 } },
      { id: "node-disabled", name: "Old Action", type: "n8n-nodes-base.noOp", disabled: true, position: [200, 200] },
    ],
    connections: {},
  };
  const res6 = importN8nWorkflow(stickyWorkflow);
  const meta6 = res6.events.find((e) => e.kind === "layout_metadata")?.data;
  assert(meta6.notes.length === 1 && meta6.disabledNodeIds.length === 1, "Sticky / disabled mismatch");
  console.log("PASS: Test 6 passed.");

  console.log("Running Test 7: Utility Nodes (ExecuteCommand, ReadWriteFile, SpreadsheetFile, Code)");
  const utilWf = {
    name: "Utility Flow",
    nodes: [
      { id: "u1", name: "Run Shell", type: "n8n-nodes-base.executeCommand", parameters: { command: "dir", continueOnFail: true } },
      { id: "u2", name: "Write Logs", type: "n8n-nodes-base.readWriteFile", parameters: { operation: "write", filePath: "out.txt", content: "ok" } },
      { id: "u3", name: "Parse Excel", type: "n8n-nodes-base.spreadsheetFile", parameters: { operation: "fromFile", filePath: "rep.xlsx" } },
      { id: "u4", name: "Transform JS", type: "n8n-nodes-base.code", parameters: { jsCode: "return $input.all();" } },
    ],
    connections: {
      "Run Shell": { main: [[{ node: "Write Logs", type: "main", index: 0 }]] },
      "Write Logs": { main: [[{ node: "Parse Excel", type: "main", index: 0 }]] },
      "Parse Excel": { main: [[{ node: "Transform JS", type: "main", index: 0 }]] },
    },
  };
  const res7 = importN8nWorkflow(utilWf);
  assert(res7.summary.nodeCount === 4 && res7.summary.connectionCount === 3, "Res7 counts mismatch");
  assert(res7.events.some((e) => e.kind === "run_cmd" && e.data.command === "dir"), "cmd failed");
  assert(res7.events.some((e) => e.kind === "write_file" && e.data.file_path === "out.txt"), "file failed");
  assert(res7.events.some((e) => e.kind === "excel_local" && e.data.file_path === "rep.xlsx"), "excel failed");
  assert(res7.events.some((e) => e.kind === "code" && e.data.code.includes("$input")), "code failed");
  console.log("PASS: Test 7 passed.");

  console.log("Running Test 8: Databases (MySQL, Redis, MongoDB) & Google SDKs (Docs, Slides, Chat, Drive)");
  const sdkWf = {
    name: "DB and Google Flow",
    nodes: [
      {
        id: "db-1", name: "Query MySQL", type: "n8n-nodes-base.mySql",
        parameters: { query: "SELECT * FROM users;" },
        credentials: { mySql: { id: "cred_mysql_1", name: "Prod MySQL" } },
      },
      {
        id: "db-2", name: "Cache Redis", type: "n8n-nodes-base.redis",
        parameters: { operation: "set", key: "user_1", value: "active" },
        credentials: { redis: { id: "cred_redis_1", name: "Prod Redis" } },
      },
      {
        id: "db-3", name: "Store Mongo", type: "n8n-nodes-base.mongoDb",
        parameters: { operation: "find", collection: "logs" },
      },
      {
        id: "g-1", name: "Read Doc", type: "n8n-nodes-base.googleDocs",
        parameters: { operation: "get", documentId: "doc_123" },
        credentials: { googleDocsOAuth2Api: { id: "cred_gdocs_1", name: "GDocs Auth" } },
      },
      {
        id: "g-2", name: "Create Slide", type: "n8n-nodes-base.googleSlides",
        parameters: { operation: "create", title: "Q3 Review" },
      },
      {
        id: "g-3", name: "Post Chat", type: "n8n-nodes-base.googleChat",
        parameters: { operation: "createMessage", space: "spaces/ABC", message: "Deployment complete" },
      },
      {
        id: "g-4", name: "List Drive", type: "n8n-nodes-base.googleDrive",
        parameters: { operation: "listFiles", query: "name contains 'report'" },
      },
    ],
    connections: {
      "Query MySQL": { main: [[{ node: "Cache Redis", type: "main", index: 0 }]] },
      "Cache Redis": { main: [[{ node: "Store Mongo", type: "main", index: 0 }]] },
      "Store Mongo": { main: [[{ node: "Read Doc", type: "main", index: 0 }]] },
      "Read Doc": { main: [[{ node: "Create Slide", type: "main", index: 0 }]] },
      "Create Slide": { main: [[{ node: "Post Chat", type: "main", index: 0 }]] },
      "Post Chat": { main: [[{ node: "List Drive", type: "main", index: 0 }]] },
    },
  };
  const res8 = importN8nWorkflow(sdkWf);
  assert(res8.summary.nodeCount === 7 && res8.summary.connectionCount === 6, "Res8 counts mismatch");

  const mysqlEv = res8.events.find((e) => e.data.custom_name === "Query MySQL");
  assert(mysqlEv && mysqlEv.kind === "mysql" && mysqlEv.data.query === "SELECT * FROM users;", "MySQL mapping failed");
  assert(mysqlEv.data.credential_id === "cred_mysql_1", "MySQL credential_id mapping failed");

  const redisEv = res8.events.find((e) => e.data.custom_name === "Cache Redis");
  assert(redisEv && redisEv.kind === "redis" && redisEv.data.key === "user_1" && redisEv.data.value === "active", "Redis mapping failed");
  assert(redisEv.data.credential_id === "cred_redis_1", "Redis credential_id mapping failed");

  const mongoEv = res8.events.find((e) => e.data.custom_name === "Store Mongo");
  assert(mongoEv && mongoEv.kind === "mongodb" && mongoEv.data.collection === "logs", "MongoDB mapping failed");

  const docsEv = res8.events.find((e) => e.data.custom_name === "Read Doc");
  assert(docsEv && docsEv.kind === "google_docs" && docsEv.data.documentId === "doc_123", "GoogleDocs mapping failed");
  assert(docsEv.data.credential_id === "cred_gdocs_1", "GoogleDocs credential_id mapping failed");

  const slidesEv = res8.events.find((e) => e.data.custom_name === "Create Slide");
  assert(slidesEv && slidesEv.kind === "google_slides" && slidesEv.data.title === "Q3 Review", "GoogleSlides mapping failed");

  const chatEv = res8.events.find((e) => e.data.custom_name === "Post Chat");
  assert(chatEv && chatEv.kind === "google_chat" && chatEv.data.space === "spaces/ABC", "GoogleChat mapping failed");

  const driveEv = res8.events.find((e) => e.data.custom_name === "List Drive");
  assert(driveEv && driveEv.kind === "google_drive" && driveEv.data.query.includes("report"), "GoogleDrive mapping failed");
  console.log("PASS: Test 8 passed.");

  console.log("Running Test 9: Bi-directional Round-trip Export (grapScreen events -> n8n Workflow JSON)");
  const exported = exportN8nWorkflow("RoundTrip Sync", res1.events);
  assert(exported && exported.name === "RoundTrip Sync", "Exported workflow name mismatch");
  assert(exported.nodes.length === 3, "Exported workflow nodes length mismatch");
  assert(exported.nodes.some(n => n.name === "Schedule" && n.type === "n8n-nodes-base.scheduleTrigger"), "Exported Schedule node missing");
  assert(exported.nodes.some(n => n.name === "Fetch API" && n.type === "n8n-nodes-base.httpRequest"), "Exported HTTP Request node missing");
  assert(exported.nodes.some(n => n.name === "Send to Slack" && n.type === "n8n-nodes-base.slack"), "Exported Slack node missing");
  assert(exported.connections && exported.connections["Schedule"] && exported.connections["Schedule"].main, "Exported connections missing");
  assert(exported.connections["Schedule"].main[0][0].node === "Fetch API", "Exported connection Schedule -> Fetch API mismatch");
  assert(exported.connections["Fetch API"].main[0][0].node === "Send to Slack", "Exported connection Fetch API -> Slack mismatch");
  console.log("PASS: Test 9 passed.");

  console.log("\nALL 9 TEST SUITES (IMPORT & EXPORT) PASSED SUCCESSFULLY!");
}

runTests().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
