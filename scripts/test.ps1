param(
    [string]$Filter = ""
)

# Runs the Rust test suite on Windows.
#
# Why this wrapper exists
# -----------------------
# The `windows` crate enables `Win32_UI_WindowsAndMessaging`, so the linker
# emits a static `COMCTL32.dll` import. Rust test executables carry no resource
# section, so the Windows loader binds that import to the legacy comctl32 v5.82
# in `System32`, which does *not* export `TaskDialogIndirect`. The loader then
# aborts the process with `STATUS_ENTRYPOINT_NOT_FOUND` (0xC0000139) before
# `main` runs — `cargo test` prints nothing and reports exit code 127.
#
# Embedding a Common-Controls v6 manifest makes the loader redirect
# `COMCTL32.dll` to the side-by-side v6 assembly, which does export it. Cargo
# offers no hook that fires after test binaries are linked, so this script
# patches them in a second pass.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\test.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\test.ps1 -Filter sentiment
#
# NOTE: in WorkBuddy's Windows PowerShell tool, nested `powershell -File ...`
# invocations are silently dropped (the child never runs and the parent returns
# immediately), so the wrapper appears to do nothing. Dot-source it instead:
#   . .\scripts\patch-manifest.ps1
# scripts\patch-manifest.ps1 contains just the manifest-embedding half and can
# be re-run on its own after any `cargo test --no-run`.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$manifest = Join-Path $root "src-tauri\comctl.manifest"
$depsDir = Join-Path $root "src-tauri\target\debug\deps"

# Resolve cargo explicitly: a PowerShell session started outside the Rust
# toolchain shim may not have ~/.cargo/bin on PATH.
$cargo = (Get-Command cargo -ErrorAction SilentlyContinue).Source
if (-not $cargo) {
    $fallback = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
    if (Test-Path $fallback) { $cargo = $fallback }
}
if (-not $cargo) {
    Write-Error "cargo not found. Install Rust or add ~/.cargo/bin to PATH."
    exit 1
}

# Locate mt.exe in the newest installed Windows SDK.
# NOTE: ${env:ProgramFiles(x86)} can expand to an empty string in some hosts,
# which yields a bogus path like "\Windows Kits\10\bin". Probe known roots too.
$sdkRoots = @()
$pf86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
if ($pf86) { $sdkRoots += (Join-Path $pf86 "Windows Kits\10\bin") }
$sdkRoots += @(
    "C:\Program Files (x86)\Windows Kits\10\bin",
    "C:\Program Files\Windows Kits\10\bin"
)
$sdkRoots = $sdkRoots | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

$mt = $null
foreach ($sdkBin in $sdkRoots) {
    $mt = Get-ChildItem -Path $sdkBin -Filter mt.exe -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match '\\x64\\mt\.exe$' } |
        Sort-Object FullName -Descending |
        Select-Object -First 1
    if ($mt) { break }
}

if (-not $mt) {
    Write-Warning "mt.exe not found; test binaries importing COMCTL32 may fail to start with 0xC0000139."
}

# --- last-exit-code helper -------------------------------------------------
# NOTE: in some hosts $LASTEXITCODE is $null rather than 0 after a native
# command, and PowerShell evaluates `$null -ne 0` as $TRUE. A naive
# `if ($LASTEXITCODE -ne 0) { exit }` therefore aborts a perfectly successful
# run. Normalize explicitly instead of testing the raw automatic variable.
function Get-LastExitCode {
    if ($null -eq $LASTEXITCODE) { return 0 }
    return [int]$LASTEXITCODE
}

# 1. Compile the test binaries without running them.
Write-Host "==> cargo test --no-run" -ForegroundColor Cyan
& $cargo test --lib --manifest-path "src-tauri\Cargo.toml" --no-run
$code = Get-LastExitCode
if ($code -ne 0) { exit $code }

# 2. Patch each freshly built test executable with the v6 manifest.
if ($mt -and (Test-Path $depsDir)) {
    $bins = Get-ChildItem -Path $depsDir -Filter "grapscreen_lib-*.exe" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    foreach ($bin in $bins) {
        Write-Host "==> embedding Common-Controls manifest: $($bin.Name)" -ForegroundColor DarkGray
        # NOTE: mt.exe is a GUI-subsystem binary. Piping it (`& $mt ... | Out-Null`)
        # or capturing its output makes some hosts fail with
        # "No se puede ejecutar un documento en medio de una canalización"
        # (CantActivateDocumentInPipeline) and the manifest never gets embedded.
        #
        # `Start-Process` is not usable either: on hosts where the environment
        # carries both `http_proxy` and `HTTP_PROXY` (Windows env vars are
        # case-insensitive), it throws "Ya se ha agregado el elemento… 'http_proxy'".
        # Call the process through .NET directly instead — no pipeline, no
        # environment dictionary rebuild.
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = $mt.FullName
        $psi.Arguments = "-nologo -manifest `"$manifest`" -outputresource:`"$($bin.FullName);#1`""
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true
        $proc = [System.Diagnostics.Process]::Start($psi)
        $proc.WaitForExit()
        if ($proc.ExitCode -ne 0) {
            Write-Warning "could not embed manifest into $($bin.Name) (mt exit $($proc.ExitCode))"
        }
    }
}

# 3. Run the tests.
#    Run the patched binary directly rather than through `cargo test`. Cargo
#    re-links the test executable whenever it considers the artifact stale, and
#    a fresh link wipes the manifest embedded in step 2 — the loader then aborts
#    with 0xC0000139 again. Invoking the binary avoids that rebuild.
Write-Host "==> running tests" -ForegroundColor Cyan
$target = "src-tauri\target\debug\deps"
$bin = Get-ChildItem -Path $target -Filter "grapscreen_lib-*.exe" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if ($bin) {
    if ($Filter) {
        & $bin.FullName --exact $Filter
    } else {
        & $bin.FullName
    }
} else {
    Write-Warning "no patched test binary found; falling back to cargo test (may hit 0xC0000139 if cargo rebuilds)."
    if ($Filter) {
        & $cargo test --lib --manifest-path "src-tauri\Cargo.toml" -- --exact $Filter
    } else {
        & $cargo test --lib --manifest-path "src-tauri\Cargo.toml"
    }
}
exit (Get-LastExitCode)
