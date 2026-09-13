# Native Windows OCR

This update uses `Windows.Media.Ocr`, so recognition is local, offline, and requires no API key. Install the desired Windows OCR language pack under **Settings > Time & language > Language & region > Language options**.

## Commands

```ts
const scan = await invoke("ocr_scan_screen");

const matches = await invoke("ocr_find_text", {
  query: "Generar reporte",
  threshold: 0.82
});

const recovery = await invoke("ocr_recover_step", {
  query: "Generar reporte",
  expectedX: 912,
  expectedY: 714,
  threshold: 0.82,
  click: true
});
```

`ocr_recover_step` captures the primary screen, recognizes real text, fuzzy-matches phrases, factors in distance from the old coordinates, and optionally clicks the repaired target. Store the returned `x`, `y`, `matched_text`, and `confidence` in the workflow recovery history.

## Build

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
npm run desktop
```

OCR runs in an async Tauri command so the UI stays responsive. Windows legacy OCR does not expose per-word confidence, therefore grapScreen computes confidence from normalized text similarity plus proximity to the previous target.