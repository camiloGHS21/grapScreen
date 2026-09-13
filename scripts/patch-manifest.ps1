# Embeds the Common-Controls v6 manifest into the newest `grapscreen_lib-*.exe`
# test binary. Split out of scripts/test.ps1 so it can be invoked on its own
# without re-running `cargo test --no-run` (which re-links and wipes the
# manifest again).
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\patch-manifest.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$manifest = Join-Path $root "src-tauri\comctl.manifest"
$depsDir = Join-Path $root "src-tauri\target\debug\deps"
$log = Join-Path $root "patch-manifest.log"

$lines = @()
$lines += "manifest=$manifest exists=$(Test-Path $manifest)"
$lines += "depsDir=$depsDir exists=$(Test-Path $depsDir)"

# Locate mt.exe in the newest installed Windows SDK.
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
    $lines += "ERROR: mt.exe not found"
    $lines | Set-Content -Path $log -Encoding UTF8
    exit 1
}
$lines += "mt=$($mt.FullName)"

$bin = Get-ChildItem -Path $depsDir -Filter "grapscreen_lib-*.exe" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if (-not $bin) {
    $lines += "ERROR: no grapscreen_lib-*.exe found"
    $lines | Set-Content -Path $log -Encoding UTF8
    exit 1
}

$before = $bin.Length
$lines += "bin=$($bin.FullName) before=$before"

# mt.exe is a GUI-subsystem binary: piping it or capturing its output makes the
# host fail with CantActivateDocumentInPipeline. Start-Process throws on hosts
# whose environment carries both `http_proxy` and `HTTP_PROXY`. Use .NET
# directly, redirecting both streams so the child cannot block on a full pipe.
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $mt.FullName
$psi.Arguments = "-nologo -manifest `"$manifest`" -outputresource:`"$($bin.FullName);#1`""
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true

$proc = [System.Diagnostics.Process]::Start($psi)
$out = $proc.StandardOutput.ReadToEnd()
$err = $proc.StandardError.ReadToEnd()
$proc.WaitForExit()

$after = (Get-Item $bin.FullName).Length
$lines += "mt_exit=$($proc.ExitCode)"
$lines += "mt_stdout=$out"
$lines += "mt_stderr=$err"
$lines += "after=$after delta=$($after - $before)"

$lines | Set-Content -Path $log -Encoding UTF8
exit 0
