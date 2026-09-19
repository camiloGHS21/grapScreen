# grapScreen — essentials

Tauri 2 / Rust (`src-tauri/src/`) + React 18 / TS / Vite 6 (`src/`).
Deep detail on the n8n catalogue, credentials and panel shape:
**`.workbuddy-ai/memory/reference/n8n-catalogue.md`**.
Skills: `grapscreen-add-node-type`, `n8n-node-catalog-extract`,
`n8n-typed-credential-editor`, `ui-visual-verify`, `windows-rust-test-manifest`.

## UX intent
- One EditorTopBar; Run lives on canvas; rename/export/delete/re-record in the menu. Publicar = arming triggers.
- Right catalogue hidden + logs collapsed; `+` toggles it, picking inserts. Node `+` sets `panelSource` so the wire lands on that port; `StepAddMenu` only for canvas double-click / empty-canvas CTA.
- "segundo plano" = run a recording without stealing mouse/keyboard; recorder controls stay visible (`bgMode`).
- Canvas node = n8n card: 8px radius, hairline border, soft shadow, no hover scale, colour rail on the left. Node text needs `nowrap + ellipsis + max-width:100%`. Light theme via CSS vars.

## Traps that have cost real debugging time
- **CSS duplicate-selector trap**: `.n8n-node` is defined ~5× (styles.css ~1650/3583/3933/4522/5093); later blocks silently win. Grep a selector before editing; append at EOF to win by order, not specificity.
- **Loose class names are global**: `.primary` (~240) styles the big CTAs and leaked onto `.ftb-btn.primary`. Fixed with `.primary:not(.ftb-btn)`.
- **`NODE_W` (`src/Flowchart.tsx`) is both canvas geometry and the card's inline `width`** — it must match the `.n8n-node` rule. Was 104 vs CSS 240px; inline won, so nodes collapsed to 1-char squares. Now 240. Wires/minimap/`findFreeSpot` derive from it; layouts saved at the old width may overlap.
- **Truncation needs `min-width: 0`**: a flex item defaults to `min-width: auto` and refuses to shrink below its content, so `nowrap` text overflows and paints over siblings instead of ellipsing.
- **Inline styles beat `!important`**: sidebar labels carry inline `font-size`, so `font-size: 0` does nothing — hide with `display: none`.
- **`onError` that only hides leaves a hole.** An `<img>` fallback must swap in another node (state flag → badge/glyph), not `display:none`.

## Graph invariants
- Geometry in `flowchart/utils/nodePorts.ts` (`getNodeHeight`/`portY`/`resolvePortIndex`); wrappers and wires both use dynamic height (switch 140, base 96). Never clamp missing ports to 0.
- Preserve event `data.id` + layout through saves. `onAddStep` takes optional position (4th) and `extra` (5th, n8n payload).
- Never stamp one id across events — `buildNodes` derives ids from `e.data.id`; sharing collapses nodes. Layout keys use the FULL id (`newNodeId`).
- Controls inside `.n8n-node` MUST `stopPropagation` on mousedown AND click.
- `app` is entry but NOT passthrough (owns the recorded range, replayed by `exec_range`). Items wrapped `{json:…}`; `unwrap_item` before path navigation. `GraphNode` has no label — the name is `data.name`.
- Reset expression thread-locals per run; trigger payload on graph entry, credential scope around subflows.

## Services & validation
- `useExecution.bgMode` picks `execute_automation_background` vs `execute_automation`; background skips global input and window focus.
- HTTP in `application/http_client.rs` (rustls, no_proxy); node headers override credential headers. Vault via `vault_service::service::get_vault_service`. SQLite bound params under `Documents/automateScreen/databases`.
- Cargo PATH `/c/Users/Administrator/.cargo/bin`. Verify with `tsc --noEmit` + `vite build`; **tsc is clean (0 errors)**. i18n is installed (`i18next`/`react-i18next`, empty `src/i18n/locales/{es,en}.json`) but NOT wired — nothing imports `src/i18n/i18n.ts`, so the switcher only persists `grap_lang`.
- **`vite build` cannot empty an existing `dist/`** (bulk-delete guard, and `dist/n8n-icons` alone trips it at 409 files). Empty it first under `dangerouslyDisableSandbox`: `find dist -type f -delete` then `find dist -depth -type d -exec rmdir {} \;`. Public assets with no `index.html` = an earlier build aborted and `tauri build` would ship a broken app.
- Windows Rust tests: compile `--no-run`, embed `src-tauri/comctl.manifest` with SDK `mt.exe` using ABSOLUTE paths. Empty PowerShell output ≠ tests ran. Nested `powershell -File x.ps1` is silently dropped; dot-source instead.

## Responsive layout (measured, not guessed)
- Breakpoints measured with a DOM probe, never estimated. Ladder: `1450px` → `.flow-topbar` wraps, `.ftb-tabs` to its own row; `980px` → `DURACIÓN/PASOS/VIDEO` readout hides; `900px` → sidebar collapses to an 86px icon rail (= window `minWidth`, so reachable).
- The icon-rail rules live at **EOF** — `.sidebar-section-title` and the settings buttons are redefined later, so an early equal-specificity rule loses. The rail also needs its own class (`.sidebar-user`) because that block had none.
- **Measuring the real app past the login gate**: auth is only `localStorage["gs_user"]`. A page served from `dist/` (same origin) can seed it and `location.replace("/")`, and headless Chrome screenshots the redirect target — the library view renders with no Tauri backend. The *editor* still needs the backend (creating a project invokes Rust), so verify the panel with a harness that loads the real compiled `styles.css` and is generated from the real sources.
- **Generate harness data, never hand-copy it.** `.workbuddy-ai/preview/gen-panel-categories.mjs` reads the real component maps, the real Lucide glyph files and the real catalogue JSON, and fails loudly on a coverage gap. Hand-copied fixtures drift.
