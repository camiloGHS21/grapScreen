# grapScreen — declarative n8n catalogue & credentials (reference)

Detail moved out of `MEMORY.md` to keep that file injectable. Read this when
working on the n8n catalogue, the engine's n8n kinds, or credentials.

## Catalogue

- 565 nodes are **data, not code**: kinds `n8n_node` (action) / `n8n_trigger`
  (flow head); the specific node lives in `data.n8n_key`. Never one
  `FlowNodeType` per node.
- Runtime: `src-tauri/src/graph_executor/declarative/{descriptor,auth,runner}.rs`;
  descriptors `include_str!`'d from `src/data/n8n-descriptors.json`.
- `n8n_node` dispatches from `exec_action`, NOT in `ITEM_AWARE_KINDS`.
  `n8n_trigger` is in `PASSTHROUGH_KINDS` + `ENTRY_KINDS` (test-pinned).
- Source of truth: `scripts/n8n-extract-descriptors.mjs` over `.n8n-cache/src`.
  **Extraction must stay reproducible** — it scans through a concurrent
  `mapPool`, so there must be no shared-state mutation during the scan (collect
  candidates, then resolve in a sorted serial pass). This has bitten 3×:
  icon naming, credential choice, app category.
- Auth: a missing credential field OMITS the header. Trust only `baseURL:` keys
  and request-builder files.
- Frontend merges generated entries into the app's own groups; no label may say
  "n8n". One form (`DeclarativeN8nForm.tsx`) serves all nodes. `AddStepExtra` is
  the single type for the `n8nKey` payload across catalogue → panel →
  `handlePanelPickNode` → `computeAddStepEvents` → `buildAddedEvents`; one hop
  dropping it yields empty keys.
- Organisation = n8n's taxonomy: `appCategory` from each app's `.node.json`
  (12 ordered categories, `categorisedN8nItems` in `nodeCatalog.ts`). LangChain
  has no `.node.json`, so the 111 AI nodes derive their family from their
  directory (gated on category `AI`). Triggers bucket by `appCategory` too —
  forcing them into one "Triggers" bucket was a real bug.
- Logos: static `public/n8n-icons/` (409 files), `${BASE_URL}n8n-icons/<file>`,
  never bundled. `PanelItem` keeps `imgFailed` state → coloured initial badge
  (`n8nInitial`) → Lucide icon. `onError` doing only `display:none` leaves a
  blank hole. Audit: 525/565 declare an icon, 0 declared icons missing on disk.
  The other two icon renderers (canvas node, node drawer) self-style their
  fallback badges inline (`.n8n-initial-fallback`, `.ndv-initial-fallback`), so
  `PanelItem` was the only one with the hole.
- Triggers arm by the descriptor's `triggerMode` (from the node class, not
  catalogue flags); `event` needs a client library and is deliberately not
  armed. `start_triggers` reports `armed` separately from `descs` — never claim
  "active" for a trigger that cannot fire.
- Daemon runs on its own thread: resolves credentials via
  `runner::credential_for`, fetches with `poll_once`. Polling only fires when the
  response hash changes; the first poll seeds the watermark.

## Credentials

- `cred_type` IS the n8n credential type name (`whatsAppTriggerApi`), not the
  legacy kind. Legacy kinds still exist for pre-n8n nodes; both coexist.
  `CredentialSelect.filterType` = the node's `credentialName`.
- Rust `VaultCredential.cred_type` is `CredentialTypeField`, an **untagged
  enum** (`Kind(CredentialType)` | `Named(String)`). Serde rejects unknown
  variants, so a plain enum silently makes typed credentials unsaveable. Use
  `cred_type.as_str()`.
- `CredentialEditorModal` is **field-driven** from
  `src/data/n8n-credential-types.json` (keyed by credential name); password
  fields masked. Never hand-write fields per integration. It is a sibling of the
  node drawer with z-index 10050 (> the drawer's 9999).
- A credential's `baseUrl` is often an OAuth token exchange, not an API root —
  `TOKEN_ENDPOINT_URL` in the extractor rejects `…/oauth/access_token`.
- `test_vault_credential` is the real probe: it reuses `declarative::auth::apply`
  and keeps `reachable` and `authenticated` SEPARATE (401/403 = URL fine, secret
  wrong). The idle strip must say "Sin verificar" — green before a probe is a lie.
- `run_single_node` + "Probar paso" = n8n's "Execute step": ONE node (engine
  `only_node` short-circuits `run()`), blocking, always backgrounded, returns
  real `input_data`/`output_data` rendered as INPUT/OUTPUT panes. Delegates via
  the `ReplayUseCase` port.
- `N8nParamsForm` renders the real `public/n8n-params/<key>.json` properties;
  never invent them. **Many required fields legitimately have empty defaults**
  (57 `multiOptions` in the catalogue; WhatsApp Trigger's "Trigger On" is
  `default: []` in n8n's own source AND docs — verified, not an extraction bug).
  An unfilled required field shows "Selecciona…" + a red notice + a red dot on
  the Parámetros tab (only *visible* fields count).
- **Deliberate divergences from n8n go in `src/data/n8n-param-defaults.json`**
  (node key → field → value), applied by
  `src/features/modals/edit/paramDefaults.ts` via `applyAppDefaults`, **only
  where the effective value is still empty** — a saved choice always wins, and
  arrays are cloned so nodes don't share state. Today it pre-selects
  `WhatsAppTrigger.updates = ["messages"]` at the user's explicit request (n8n
  leaves it blank and forces a choice). Adding an override is one line;
  `paramDefaults.ts` is React-free on purpose so the merge can be tested by
  compiling it with tsc and running it under node.

## Panel shape

- Empty canvas → category rows (`Integrados` first, sentinel
  `"__integrated__"`) → drill-down + "Volver a categorías". Non-empty canvas →
  each group stacked with a capped categorized preview + "Ver todos".
- Category rows carry a coloured glyph: `CATEGORY_ICON` / `CATEGORY_ACCENT` in
  `FlowSidePanel.tsx`, keyed by the RAW slug, resolved through `categoryMeta()`
  (which also handles both sentinels). Check a Lucide name exists in
  `node_modules/lucide-react/dist/esm/icons/` before using it — some are
  re-export aliases (`Code2` → `code-xml.js`).
- `categorisedN8nItems` returns `category: null` for entries with no
  `appCategory`: 17 triggers, and they are the important ones (Cron, Schedule,
  Interval, Manual, Form, Chat, RSS, Local File, Execute Workflow, MCP Server).
  The panel maps that bucket to the sentinel `"__other__"` ("Otros", parked
  last). Building the row list with `.filter(c => !!c)` silently made all 17
  unreachable.
