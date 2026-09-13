# grapScreen

Windows desktop automation and screen recording built with Tauri 2, Rust, React, and TypeScript. The visual editor follows the n8n model: nodes wired through ports, executed as a real graph.

## Graph execution engine (n8n-style)

Automations saved from the flow editor carry a serialized graph (`graphNodes` + `connections` inside the automation JSON). The Rust engine walks that graph instead of replaying events linearly:

- **Condition** routes to the `true` / `false` branch. Evaluation modes: **expression with variables** (`{{ contador }} > 5`, `{{ nombre }} contains "ana"`, `==`, `!=`, `>=`, `<=`, `starts with`, `ends with`), text on screen (OCR) and image (template matching).
- **Switch** routes to `case0..2` or `default` comparing a variable against the configured cases.
- **Loop** re-runs its `body` branch N times (exposes `{{ loop.index }}`) and then continues through `done`.
- **Merge** joins branches; fan-out connections all execute.
- **Error handler** receives the flow when any node fails and gets `{{ error.message }}` / `{{ error.node }}`.
- **HTTP Request** performs the real call with the app's native HTTP client and stores the body in `http_response` (configurable) plus the status in `<var>_status`.
- **Code** runs JavaScript (`node`) or Python (`python`) and stores STDOUT in `code_output` (configurable).
- Disabled nodes are bypassed keeping the flow connected.
- While running, each node reports progress: the canvas highlights the active node and paints a green ✓ (or red ✗) badge per node.

Variables set with the **Variable** node are interpolated anywhere with `{{ nombre }}` (text typed, commands, URLs, headers, code, expressions...).

## Expressions and the item model (n8n-style)

Every string in every node config is a **template**: anything between `{{` and `}}`
is evaluated, the rest is literal text. This is what makes nodes chain with real
data instead of being a recording with wires.

### Item-based execution

Nodes pass **arrays of items**, exactly like n8n. Each item is a JSON payload
wrapped in an envelope (`{ "json": { ... } }`). A node that is *not* a control-flow
node runs **once per incoming item**; inside its config:

| Expression | Meaning |
|---|---|
| `{{ $json.field }}` | field of the **current item** |
| `{{ $index }}` / `{{ $runIndex }}` | 0-based position of the current item |
| `{{ $items() }}` | the full incoming array |
| `{{ $items().length }}` | number of items |
| `{{ $node["HTTP Request"].json.id }}` | output of a previously executed node (by its **name** or id) |
| `{{ $now }}`, `{{ $today }}`, `{{ $timestamp }}` | current date/time |
| `{{ $execution.id }}` | id of the running execution |
| `{{ $vars.myVar }}` | a variable set earlier in the flow |

Control-flow nodes (`condition`, `switch`, `loop`, `merge`, `wait`, `delay`,
`split_batches`, `error_handler`, `sub_workflow`, `end`) run **once** and manage
their own iteration, so they are excluded from per-item dispatch.

### Types are preserved

A value that is *entirely* one expression keeps its JSON type:

```
{{ $json.count }}        ->  42          (number, not "42")
{{ $json.name }}         ->  "ana"
total: {{ $json.count }}u ->  "total: 42u"  (mixed text -> string)
```

Whole numbers stay integers; only genuinely fractional results become floats
(`{{ 10 / 4 }}` → `2.5`, `{{ 100 * 1.21 }}` → `121`).

### Operators and helpers

- **Arithmetic** `+ - * / %`, **comparisons** `== != > < >= <=`, **logic** `&& || !`
- **Method calls** `toUpperCase()`, `toLowerCase()`, `trim()`, `length`,
  `includes(x)`, `startsWith(x)`, `endsWith(x)`, `replace(a, b)`, `toNumber()`, `toFixed(n)`
- **Bracket and dot paths** — `$json.a.b[0].c` and `$json["a"]["b"]` both work.
- **Legacy word operators** in conditions are preserved: `contains`,
  `not contains`, `starts with`, `ends with`.

Conditions accept both shapes, so existing flows keep working:

```
{{ $json.total > 100 }}   (whole expression inside braces)
{{ $json.total }} > 100   (comparison outside the braces)
5 < 3                     (bare expression, no braces)
```

### Implementation

- `src-tauri/src/application/expressions.rs` — the typed engine (`render`,
  `eval`, `eval_condition`, `truthy`, `get_path`) plus 15 unit tests.
- `src-tauri/src/application/replay_helpers/mod.rs` — thread-local
  `CURRENT_ITEMS` / `NODE_OUTPUTS` / `VARIABLES`, the per-run
  `reset_execution_state()`, and `eval_template` / `eval_template_at` /
  `eval_template_value`. `interpolate_variables` now delegates here.
- `src-tauri/src/application/graph_executor/walker.rs` — `walk_item_based()`
  runs a node once per item and publishes each node's output under both its id
  and its display name.

Run the engine tests with:

```bash
cd src-tauri && cargo test --lib
```

## Data transformation nodes (n8n-style)

These nodes consume the incoming item list and replace it with a new one. Unlike
action nodes they must see the **whole array at once** — you cannot sort or
aggregate a single item in isolation — so the engine runs them once, before any
per-item fan-out.

| Node | What it does | Key config |
|---|---|---|
| **Filtrar** | Keeps (or discards) items matching a condition | `condition` (`{{ $json.total }} > 100`), `mode` (`keep`/`discard`) |
| **Ordenar** | Multi-key sort | `fields` (`ciudad,nombre`, `-fecha` for descending) |
| **Limitar** | Samples the list | `skip`, `max_items` |
| **Agregar** | Collapses to a single item | `mode`: `list`, `count`, `sum`, `average`, `min`, `max`, `collect`, `concat`; plus `field` / `separator` |
| **Editar campos** | Adds, overwrites or projects fields | `set_fields` (JSON, values are templates), `keep_only` |
| **Fecha y hora** | Date parsing, formatting and arithmetic | `operation`: `format`, `add`, `subtract`, `diff`, `now`; `field`, `format`, `unit`, `amount`, `compare_to`, `result_field` |
| **Eliminar duplicados** | Keeps one item per distinct key | `fields` (comma-separated; empty = whole item), `keep` (`first`/`last`) |
| **Comparar datasets** | Diffs the items against a second list | `compare_with`, `key`, `compare_fields`, `mode` (`all`/`added`/`removed`/`changed`/`same`) |
| **SQLite: Consulta** | Runs a `SELECT`; each row becomes an item | `db_path` (relative to `Documents/automateScreen/databases` or absolute), `query`, `params` (JSON array or object) |
| **SQLite: Ejecutar** | Runs `INSERT`/`UPDATE`/`DELETE`/`DDL` | `db_path`, `query`, `params`. Returns `changes` and `last_insert_id` |

A few design decisions worth knowing:

- **Sorting is total.** Nulls always sink to the end, numbers compare numerically,
  booleans as `false < true`, and anything else falls back to a case-insensitive
  string comparison with a deterministic tie-break. Heterogeneous data never
  panics — n8n's most common sort failure.
- **Month arithmetic is calendar-aware.** `Jan 31 + 1 month` yields `Feb 28/29`
  because the day is clamped to the target month's length.
- **Unparseable dates are left untouched** rather than being replaced by an
  epoch or an empty string, so a bad value is visible instead of corrupted.
- **`keep_only` is applied before `set_fields`**, so a removed field can never be
  referenced by a newly computed one.
- **Deduplication preserves input order in both modes.** `keep: last` swaps the
  surviving *content* into the first occurrence's slot rather than moving it to
  the end, so downstream ordering stays stable.
- **`compare_datasets` tags every emitted item** with `change_type`, `key`,
  `current` and `previous`, which makes it trivial to route on: feed the output
  into a Filter on `{{ $json.change_type }} == "removed"` to alert on deletions.
  Matching is string-keyed, so `1` and `"1"` collapse to the same item — pass
  `compare_fields` to diff only specific columns instead of the whole payload.

## AI nodes (n8n-style)

Every AI node speaks the OpenAI-compatible `/chat/completions` protocol, which is
what OpenAI, Azure, Groq, OpenRouter, Together, **Ollama** and **LM Studio** all
expose. There is no vendor SDK and no hidden service — just an HTTP call you can
point anywhere.

| Node | What it does | Key config |
|---|---|---|
| **Cadena LLM** | Sends a prompt and writes the reply onto each item | `prompt`, `system_prompt`, `model`, `temperature`, `max_tokens`, `result_field`, `output_var` |
| **Clasificador** | Picks one label from a fixed set, then attaches it | `prompt`, `categories`, `category_field`, `output_var` |
| **Extraer información** | Turns free text into a structured object | `prompt`, `schema` (JSON), `mode` (`merge`/`replace`), `output_var` |
| **Análisis de sentimiento** | Labels the tone and derives a numeric score | `prompt`, `labels`, `label_field`, `score_field`, `output_var` |

Notes:

- **The API key is optional for local servers.** A hosted provider without a key
  fails fast with a clear message; `localhost` / `127.0.0.1` endpoints are allowed
  through so Ollama and LM Studio work out of the box.
- **A vault credential can replace the inline key.** Pick one in the node's
  *Credencial del vault* selector and its secret takes priority, so no key is
  written into the workflow definition. The secret also becomes readable from
  expressions via `{{ $credentials.<field> }}`.
- **Prompts are templates**, so a chain in the middle of a flow can reference
  upstream data: `"Resume esto: {{ $json.body }}"`.
- **The Classifier is deterministic by design** — temperature is forced to `0` and
  the model's reply is mapped back onto the allowed categories
  (case-insensitively, stripping quotes and punctuation, then falling back to
  containment) so routing stays predictable.
- **The extractor survives messy replies.** Rather than trusting the whole
  response to parse, it locates the outermost balanced `{...}` — skipping braces
  inside strings and unwrapping markdown fences — so a model that adds a sentence
  before or after the JSON still works.
- **Sentiment scores are positional.** The first label scores `1`, the last `-1`,
  with the middle ones interpolated, so the default `positive, neutral, negative`
  yields `1 / 0 / -1` and a custom 4-label set spreads evenly. An unrecognised
  label scores `0` rather than failing, so downstream comparisons stay meaningful.
- **When a node receives no items** (e.g. straight after a trigger) it emits a
  single item carrying the answer, so the chain can continue.
- Wire a Classifier into a **Switch** to branch by category; wire a sentiment
  score into an If to react only to negative cases.

### Matching a credential to a node

`credential_id` is read from the node's config and resolved against the vault at
run time. The resolved secret is installed on a thread-local for the duration of
that node and restored afterwards, so a sub-workflow can never leak its parent's
credentials. `cred_type` decides how the secret is applied:

| `cred_type` | Effect |
|---|---|
| `bearer_token` | `Authorization: Bearer <token>` |
| `oauth2` | `Authorization: Bearer <access_token>` |
| `api_key` | `Authorization: Bearer <key>`, or `<header_name>: <prefix><key>` when configured |
| `basic_auth` | HTTP Basic (`user:password`) |
| `custom_header` | `<header_name>: <header_value>` |
| `database` | Connection fields, exposed to expressions only |

Node-level headers always win over credential headers on a name collision, so a
node can still override a single header without dropping the credential.

### Implementation

- `src-tauri/src/application/graph_executor/transform.rs` — the eight
  transformation runners plus unit tests.
- `src-tauri/src/application/graph_executor/ai_nodes.rs` — the four AI runners,
  provider-response normalisation, JSON extraction and unit tests.
- `src-tauri/src/application/graph_executor/db_nodes.rs` — the two SQLite
  runners, path resolution, parameter binding and 29 unit tests.
- `src-tauri/src/application/graph_executor/credentials.rs` — installs the
  vault credential for a node and restores the previous one.
- `src-tauri/src/application/expressions.rs` — the typed expression engine,
  including the `$credentials` token.
- `src-tauri/src/application/http_client.rs` — the native HTTP client shared by
  `http_request` and every AI node, plus pure header/credential helpers.
- `src-tauri/src/application/replay_helpers/executors.rs` — builds the
  `http_request` request and maps a credential to its headers.
- `src-tauri/src/application/graph_executor/node_runners.rs` — `exec_transform()`
  dispatches and publishes each node's output.
- `src-tauri/src/application/graph_executor/engine.rs` — `TRANSFORM_KINDS` marks
  them and `ITEM_AWARE_KINDS` keeps them out of per-item fan-out.
- Frontend: catalog entries live in `src/features/flowchart/utils/nodeCatalog.ts`
  and `addCategories.tsx`; config forms in
  `src/features/modals/edit/ControlForms.tsx`.

## Native HTTP client (n8n-style)

`http_request` and every AI node talk to the network through
`src-tauri/src/application/http_client.rs` instead of shelling out to the
system `curl`. Three things improved:

- **No external binary.** `curl` is present on Windows 10+, but not guaranteed
  in every environment. A missing binary used to break every AI node at once.
- **Real error messages.** The old code could only report an opaque exit code.
  The native client distinguishes a timeout, a refused connection and a DNS
  failure, and names the host it tried to reach.
- **Secrets stay out of argv.** A credential used to be passed on the `curl`
  command line, where any process on the machine can read it. Credentials are
  now only ever materialised as in-memory header values.

### Design decisions

- **Direct connections, no inherited proxy.** The client is built with
  `no_proxy()`. The previous `curl` invocation passed no `-x`, so flow traffic
  went direct. reqwest would otherwise pick up `http_proxy` / `HTTPS_PROXY` from
  the environment, silently routing automation traffic through a user's proxy and
  surfacing the proxy's error instead of the real one.
- **rustls, not native-tls**, so the build needs no system OpenSSL.
- **Non-2xx is not an automatic success.** The request still succeeds
  (`HttpResponse::is_success()` reports 2xx only); `http_request` fails the node
  but still exposes the body and status, matching the old behaviour.
- **Basic auth is a real header.** `Authorization: Basic <base64>` is built by
  `basic_auth_header()`. The old path smuggled `user:pass` through a `--user`
  marker, which no longer exists.
- **Pure helpers are unit-tested offline.** `parse_headers`, `merge_headers`,
  `basic_auth_header`, `credential_headers` and `header_from_str` take plain
  data, so header and credential behaviour is covered without opening a socket.
- **Node headers win over credential headers**, compared case-insensitively, so a
  flow can always override what the vault supplies.

Integrations that previously fired a `curl` and discarded the result
(`google_sheets`, `google_docs`, `telegram`, `whatsapp`) now check the response
and report the status, so a bad token no longer looks like success.

## Editor chrome (n8n-style)

The flow editor mirrors n8n's ergonomics while keeping grapScreen's own visual identity:

- **Top bar** — breadcrumb `Personal / <automation>` plus three tabs: **Editor**,
  **Executions** (real run history with per-node detail) and **Evaluations**
  (placeholder until evaluation datasets land). `Guardar` / `Publicar` on the right;
  publishing toggles the automation's triggers.
- **Right-hand contextual panel** — opens as *"¿Qué pasa después?"* on an empty
  canvas (category cards + trigger shortcuts) and becomes a searchable node
  explorer once the flow has nodes. Groups follow n8n's taxonomy: *Disparadores,
  IA, Acción en una app, Transformación de datos, Flujo, Núcleo, Revisión humana,
  Escritorio*. Nodes the engine cannot run yet are labelled **pronto** instead of
  being silently absent.
- **Central `Ejecutar Flujo` button** — floats under the canvas, turns into
  `Detener` while running.
- **Bottom logs console** — readable stream of `INFO / SUCCESS / WARN / ERROR`
  lines derived from the engine's progress and node-status events, with
  history and clear actions.
- **Node categories** — `src/features/flowchart/utils/nodeCatalog.ts` is the single
  source of truth for what the panel offers; adding a node there surfaces it in
  the panel immediately.

## Canvas shortcuts

| Shortcut | Action |
| --- | --- |
| Double-click canvas | Open node creator |
| `+` on a port | Add connected node |
| Click wire → `Supr` | Delete connection (or use the × at its midpoint) |
| `Ctrl + D` | Duplicate selected node(s) |
| `Ctrl + A` | Select all nodes |
| `Supr` / `Retroceso` | Delete selection |
| `Esc` | Clear selection |
| Right-click node | Duplicate / disable / delete |
| Toolbar | Zoom, fit view, auto-layout, sticky notes, minimap |

## Prerequisites

1. Windows 10/11.
2. Node.js 20+ and Rust stable with the MSVC toolchain.
3. Visual Studio Build Tools with **Desktop development with C++**.
4. WebView2 Runtime.
5. Download a Windows FFmpeg build and copy `ffmpeg.exe` to `src-tauri/resources/ffmpeg.exe`.
6. Optional: `node` or `python` in PATH for the Code node.

## Run

```powershell
npm install
npm run desktop
```

## Build installers

```powershell
npm run bundle
```

Installers are written under `src-tauri/target/release/bundle`.

## Tests

The suite is **155 unit tests** covering the expression engine, the
transformation and AI node runners, the credential vault, the HTTP client's
header/credential helpers, and the SQLite query/execute runners.

```powershell
# Rust
powershell -ExecutionPolicy Bypass -File scripts\test.ps1

# Rust, single test
powershell -ExecutionPolicy Bypass -File scripts\test.ps1 -Filter sentiment_default_labels_map_to_plus_one_zero_minus_one

# Frontend types + production build
npx tsc --noEmit
npx vite build
```

On Windows, always go through the script — a bare `cargo test` fails for a
reason unrelated to the code. See below.

### Why `scripts\test.ps1` instead of a bare `cargo test`

On Windows a plain `cargo test --lib` can fail with **exit code 127 and no
output at all**. The `windows` crate enables `Win32_UI_WindowsAndMessaging`, so
the linker emits a static `COMCTL32.dll` import. Rust test executables carry no
resource section, so the loader binds that import against the legacy comctl32
v5.82 in `System32` — which does **not** export `TaskDialogIndirect` — and the
process dies with `STATUS_ENTRYPOINT_NOT_FOUND` (0xC0000139) before `main` runs.

The script compiles the tests, embeds `src-tauri/comctl.manifest` (declaring the
Common-Controls **v6** assembly dependency) into the freshly built binary with
`mt.exe`, and then runs it. Cargo has no hook that fires after test binaries are
linked, which is why this needs a wrapper rather than a `build.rs` step.

### Why the script runs the binary directly

The final step invokes the patched test executable itself rather than
`cargo test`. Cargo re-links the test binary whenever it considers the artifact
stale, and a fresh link carries no resource section — so the embedded manifest
is lost and the loader aborts with 0xC0000139 again. Running the binary directly
avoids that rebuild. For the same reason, avoid editing or touching source files
between the patch step and the run.

Measured behaviour on a fresh build:

| Stage | Size | Result |
| --- | --- | --- |
| Before `mt.exe` embed | 5,429,760 B | exit `127`, no output |
| After `mt.exe` embed | 5,430,272 B | exit `0`, `92 passed; 0 failed` |

The ~512-byte growth is the added resource section.

## Data

Automations are stored in `%USERPROFILE%\Documents\automateScreen` as JSON and optional MP4 files. Temporary frame captures are deleted after encoding or cancellation.

## Windows permissions

The global input hook and playback run at the same integrity level as the app. To automate an elevated application, run grapScreen as administrator. Antivirus products can flag global hooks, so sign production installers and clearly disclose capture behavior.

## Notes

The recorder captures the primary screen at 10 FPS and uses FFmpeg H.264 encoding. Mouse and common keyboard keys are replayed with their original timing. The red overlay is click-through and does not block the desktop.