# Runs the Rust unit tests on Windows.
#
# The lib test harness imports TaskDialogIndirect (via rfd/comctl32 code),
# which only exists in Common-Controls v6. tauri-build embeds the v6 manifest
# into the app binaries but NOT into the lib test harness, so the plain
# `cargo test` binary fails to load with 0xc0000139 (entry point not found).
# This script builds the test binary, embeds the manifest with mt.exe and
# then runs the harness directly.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$env:CARGO_TARGET_DIR = "target-test"

Write-Host "==> Building tests..."
cargo test --lib --no-run
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$exe = Get-ChildItem "target-test\debug\deps\grapscreen_lib-*.exe" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

$mt = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\mt.exe"
if (Test-Path $mt) {
  Write-Host "==> Embedding Common-Controls manifest into $($exe.Name)..."
  & $mt -manifest "$PSScriptRoot\comctl.manifest" "-outputresource:$($exe.FullName);#1" | Out-Null
} else {
  Write-Warning "mt.exe not found; if the harness fails with 0xc0000139, install the Windows SDK."
}

Write-Host "==> Running tests..."
& $exe.FullName $args
exit $LASTEXITCODE
