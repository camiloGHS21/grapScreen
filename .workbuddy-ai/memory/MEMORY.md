# grapScreen — project essentials

Windows desktop automation: Tauri 2 / Rust (`src-tauri/src/`) + React 18 / TypeScript / Vite 6 (`src/`). Detailed history: daily logs; node registration: `grapscreen-add-node-type` skill.

## User intent / UX
- One EditorTopBar, no AI selector or duplicate Run button. Run lives on canvas. Keep rename/export/delete/re-record in menu.
- Right catalog hidden, logs collapsed by default; + toggles catalog; selecting a node inserts directly, not another add modal.
- IMPORTANT clarification 2026-09-13: "segundo plano" means EXECUTING a recorded automation without taking mouse/keyboard while the user works elsewhere. Recording controls must remain visible. The recently added hide_app / invisible-recording feature was a mistaken interpretation, not a requirement. Restore the existing bgMode selector removed with StatsHeader; do not replace playback mode with hiding the recorder.
- Use theme CSS variables, light theme. Search duplicate selectors before changes; later hardcoded dark rules have overridden the + button. Same trap hit .n8n-node-title/.n8n-node-sub: a later duplicate block re-set max-width. Node text needs white-space:nowrap + overflow:hidden + text-overflow:ellipsis + max-width:100% or it spills outside the card.

## Graph invariants
- Shared geometry: `features/flowchart/utils/nodePorts.ts` (getNodeHeight, portY, PORT_SPACING, resolvePortIndex). Node wrappers and wire endpoints must use dynamic height (switch 140, base 96). Never clamp missing ports to 0.
- Preserve event data.id and layout positions through saves; onAddStep accepts optional fourth position argument. Date-based IDs are stable only once assigned, not deterministic across fresh inputs.
- NEVER stamp one shared id across events. buildNodes derives node ids from e.data.id (`form-${id}`, `click-${id}`...), so a shared id collapses nodes into duplicates. Layout keys are the FULL node id (`form-…`), not the raw data id; use the newNodeId returned by computeAddStepEvents.
- Adding a node: canvas `+` and node `+` both open the right-side catalogue panel (node `+` anchors source node+port in panelSource so the pick is wired straight onto that port). The StepAddMenu modal is only for canvas double-click and the empty-canvas CTA.
- Controls inside `.n8n-node` (the `+`, the pencil) MUST stopPropagation on BOTH mousedown and click. The node body listens to both; stopping only one lets the other action through (the `+` opened the panel on mousedown and the trailing click closed it again).
- `app` is ENTRY but NOT PASSTHROUGH: it owns the recorded event range, replayed by exec_range. Adding it to passthrough silently breaks recordings.
- Register kinds in engine ITEM_AWARE_KINDS / TRANSFORM_KINDS and node_runners dispatch as appropriate. Registry tests protect invariants.
- Items wrapped as {json:...}; unwrap_item before path navigation. GraphNode has no label; visible name is event data.name.
- Reset expression thread-locals per run, preserve trigger payload on graph entry and credential scope around subflows.

## Services
- useExecution.bgMode dispatches execute_automation_background vs execute_automation. Background replay skips global-input backend and window focus; does not mean hiding windows.
- HTTP centralized in application/http_client.rs, rustls, deliberate no_proxy; node headers override credential headers; non-2xx fails.
- Vault import: application::vault_service::service::get_vault_service.
- SQLite uses bound params, relative paths under Documents/automateScreen/databases. XML parser drops root; scalar item json wrapped in value.

## Validation
- Cargo PATH: /c/Users/Administrator/.cargo/bin. Check --all-targets; frontend tsc + vite. i18n has known missing packages/locales; do not report tsc clean without reading actual errors.
- Windows Rust tests: compile --no-run, embed src-tauri/comctl.manifest using SDK mt.exe, run exact patched binary via Bash. See windows-rust-test-manifest skill. Empty PowerShell output/null exit is NOT proof tests ran.
- Nested `powershell -File x.ps1` from the PowerShell tool is silently dropped (no output, no side effects). Dot-source instead: `. .\scripts\patch-manifest.ps1`. `[Diagnostics.Process]::Start` is blocked inline but allowed inside a .ps1 file.
- Git previously reported not a repository; avoid stash/reset. Static previews do not prove native interactions.
