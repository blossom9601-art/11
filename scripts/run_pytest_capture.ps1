param(
    [string]$PythonExe = "C:/Users/ME/Desktop/blossom/.venv/Scripts/python.exe",
    [string]$OutFile = "pytest_full_latest.txt",
    [int]$Tail = 40,
    [string]$TestPath = "",
    [string]$Keyword = "",
    [string[]]$ExtraArgs = @(),
    [string[]]$PytestArgs = @("-m", "pytest", "-q", "-p", "no:warnings")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Ensure we run from repo root regardless of caller location.
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".."))
Set-Location $RepoRoot

if (-not (Test-Path $PythonExe)) {
    throw "Python executable not found: $PythonExe"
}

function Get-TimestampedOutFile([string]$AliasPath) {
    $ts = (Get-Date).ToString('yyyyMMdd_HHmmss')
    if (-not $AliasPath) {
        return "pytest_${ts}.txt"
    }
    $p = $AliasPath
    if ($p -match '_latest\.txt$') {
        return ($p -replace '_latest\.txt$', "_${ts}.txt")
    }
    if ($p -match '\.txt$') {
        return ($p -replace '\.txt$', "_${ts}.txt")
    }
    return "${p}_${ts}.txt"
}

# Build args in a friendly way.
$ArgsFinal = @()
$ArgsFinal += $PytestArgs

if ($TestPath -and $TestPath.Trim()) {
    $ArgsFinal += $TestPath.Trim()
}

if ($Keyword -and $Keyword.Trim()) {
    $ArgsFinal += @("-k", $Keyword.Trim())
}

if ($ExtraArgs -and $ExtraArgs.Count -gt 0) {
    $ArgsFinal += $ExtraArgs
}

# Run pytest and capture *all* output to a UTF-8 file.
$RunOutFile = Get-TimestampedOutFile -AliasPath $OutFile
& $PythonExe @ArgsFinal 2>&1 | Out-File -FilePath $RunOutFile -Encoding utf8 -Force

# Best-effort refresh the stable alias file so other tools can keep using it.
try {
    Copy-Item -Path $RunOutFile -Destination $OutFile -Force
} catch {
    Write-Warning "[pytest-capture] Could not refresh alias '$OutFile' (likely locked). Using '$RunOutFile'."
}

# Print a stable summary tail (prevents large output rendering issues).
if (Test-Path $RunOutFile) {
    Get-Content $RunOutFile -Tail $Tail
}

Write-Output "[pytest-capture] DONE -> $RunOutFile"
Write-Output "[pytest-capture] ALIAS -> $OutFile"