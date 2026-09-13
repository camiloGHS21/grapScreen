# Visual template detection

The engine captures the primary Windows screen and performs local, multiscale normalized template matching. No cloud service or API key is used.

## Capture a template

The editor should let the user draw a rectangle around the target. Coordinates use physical pixels on the primary display.

```ts
await vision.captureTemplate("generate-report-button", 812, 680, 198, 62);
```

Templates are stored under `Documents/automateScreen/templates`.

## Find and recover

```ts
const match = await vision.find("generate-report-button", 912, 714, true);
if (match.found) {
  // Persist match.x, match.y, match.confidence and match.scale in recovery history.
}
```

The default matcher tests scales from 85% to 115%, computes normalized squared error, returns a 0..1 confidence, and can click the recovered center. Use an 0.86 threshold for normal controls and 0.92 for destructive actions.

## Recommended recovery chain

1. Retry the original coordinate after a short wait.
2. Match the saved visual template.
3. Fall back to Windows OCR when the control has readable text.
4. Pause and capture evidence if confidence remains low.

## Validate

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
npm run desktop
```

Template matching is CPU-intensive on 4K screens. Keep templates tight, usually 40 to 300 pixels wide, and narrow the scale list when the display DPI is known.