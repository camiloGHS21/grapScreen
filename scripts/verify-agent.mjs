/**
 * Acceptance check for the single agent node.
 *
 * Builds a flow the way the palette does — the AI Agent from the catalogue,
 * with a chat model wired to its Model port — and asserts the three things the
 * agent has to satisfy:
 *
 *   1. it is created as the `ai_agent` engine kind, which is what the Rust
 *      runner can execute, while carrying n8n's identity (`n8n_key: "Agent"`);
 *   2. its ports are n8n's: Chat Model (required), Memory, Tool, Output Parser;
 *   3. saving translates n8n's parameters into the fields the runner reads, and
 *      the wired chat model picks the provider.
 *
 * Run with: node scripts/verify-agent.mjs
 */
import { createServer } from "vite";

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

try {
  const { buildAddedEvents } = await server.ssrLoadModule("/src/features/flowchart/utils/eventModifiers.ts");
  const { buildNodes, getNodePorts } = await server.ssrLoadModule("/src/features/flowchart/buildNodes.ts");
  const { applyAgentParity } = await server.ssrLoadModule("/src/features/flowchart/utils/agentParity.ts");

  console.log("== Puertos del agente ==");
  const ports = getNodePorts("ai_agent");
  const ids = ports.inputs.map((p) => p.id);
  check("Chat Model, obligatorio", ids.includes("model") && ports.inputs.find((p) => p.id === "model").required === true);
  check("Memory", ids.includes("memory"));
  check("Tool", ids.includes("tool"));
  check("Output Parser", ids.includes("outputParser"));
  check("sin puerto de credenciales", !ids.some((id) => /cred|auth|api_?key/i.test(id)), ids.join(", "));

  console.log("\n== Creación desde la paleta ==");
  const agentEvent = buildAddedEvents("ai_agent", 0, [], 0, { n8nKey: "Agent", n8nLabel: "AI Agent" })[0];
  check("kind del motor = ai_agent", agentEvent.kind === "ai_agent", agentEvent.kind);
  check("identidad n8n conservada", agentEvent.data.n8n_key === "Agent", String(agentEvent.data.n8n_key));

  const modelEvent = buildAddedEvents("n8n_node", 1, [], 1, { n8nKey: "LmChatOpenAi", n8nLabel: "OpenAI Chat Model" })[0];

  const events = [
    { at_ms: 0, kind: "trigger", data: { id: "t1", schedule: "manual" } },
    agentEvent,
    modelEvent,
    {
      at_ms: 9,
      kind: "layout_metadata",
      data: {
        positions: {},
        notes: [],
        disabledNodeIds: [],
        // The chat model feeds the agent's Model port, exactly as the canvas
        // writes it.
        connections: [
          { id: "c1", sourceNodeId: "n8n_node-2", sourcePortId: "out", targetNodeId: "ai_agent-1", targetPortId: "model" },
        ],
      },
    },
  ];
  events[1] = { ...events[1], data: { ...events[1].data, id: "1" } };
  events[2] = { ...events[2], data: { ...events[2].data, id: "2" } };

  const nodes = buildNodes(events);
  const agent = nodes.find((n) => n.type === "ai_agent");
  check("el canvas muestra un solo nodo de agente", nodes.filter((n) => n.type === "ai_agent").length === 1);
  check("el nodo conserva la clave n8n", agent?.n8nKey === "Agent", String(agent?.n8nKey));
  check("la etiqueta es la de n8n", agent?.label === "AI Agent", String(agent?.label));

  console.log("\n== Guardado: parámetros n8n → runner ==");
  const configured = events.map((e, i) =>
    i === 1
      ? {
          ...e,
          data: {
            ...e.data,
            n8n_config: {
              promptType: "define",
              text: "={{ $json.chatInput }}",
              options: { systemMessage: "Eres un asistente útil", maxIterations: 7 },
            },
          },
        }
      : e,
  );
  const saved = applyAgentParity(configured);
  const data = saved[1].data;
  check("prompt ← text", data.prompt === "={{ $json.chatInput }}", String(data.prompt));
  check("system_prompt ← options.systemMessage", data.system_prompt === "Eres un asistente útil", String(data.system_prompt));
  check("max_iterations ← options.maxIterations", data.max_iterations === 7, String(data.max_iterations));
  check("proveedor desde el chat model conectado", data.provider === "openai", String(data.provider));

  console.log("\n== Migración de flujos antiguos ==");
  const legacy = [
    { at_ms: 0, kind: "n8n_node", data: { id: "9", n8n_key: "Agent", n8n_name: "AI Agent", prompt: "hola" } },
  ];
  const migrated = applyAgentParity(legacy);
  check("un agente guardado como n8n_node pasa a ai_agent", migrated[0].kind === "ai_agent", migrated[0].kind);
  check("su prompt propio se conserva", migrated[0].data.prompt === "hola", String(migrated[0].data.prompt));

  console.log(`\n${failures === 0 ? "TODO OK" : `${failures} COMPROBACIONES FALLIDAS`}`);
} finally {
  await server.close();
}

process.exit(failures === 0 ? 0 : 1);
