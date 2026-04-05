<#
  reset_port_8080.ps1
  - Terminates ALL processes listening on 127.0.0.1:8080
  - Starts the Flask app via venv python run.py
  - Waits for startup, then probes diagnostic endpoints
  - Prints summary so you see exactly which instance answered

  Usage:
    powershell -ExecutionPolicy Bypass -File .\scripts\reset_port_8080.ps1
#>

param(
  [int]$Port = 8080,
  [int]$StartupWaitMs = 1500,
  [switch]$Foreground
)

Write-Host "[reset] Scanning port $Port" -ForegroundColor Cyan
$netLines = netstat -ano | findstr ":$Port" | Select-Object -Unique
if ($netLines) {
  Write-Host "[reset] Found listeners:" -ForegroundColor Yellow
  $pids = @()
  foreach ($l in $netLines) {
    Write-Host "  $l"
    $parts = $l -split '\s+' | Where-Object { $_ -ne '' }
    $processId = $parts[-1]
    if ($processId -match '^[0-9]+$') { $pids += [int]$processId }
  }
  $pids = $pids | Sort-Object -Unique
  Write-Host "[reset] Killing PIDs: $($pids -join ', ')" -ForegroundColor Red
  foreach ($processId in $pids) {
    try { Stop-Process -Id $processId -Force -ErrorAction Stop; Write-Host "  Killed $processId" -ForegroundColor DarkRed } catch { Write-Host "  Failed $processId : $($_.Exception.Message)" -ForegroundColor DarkYellow }
  }
} else {
  Write-Host "[reset] No existing listeners" -ForegroundColor Green
}

Write-Host "[reset] Launching server..." -ForegroundColor Cyan
$py = Join-Path (Get-Location) '.venv/Scripts/python.exe'
if (-not (Test-Path $py)) { $py = 'python' }

if ($Foreground) {
  Write-Host "[reset] Foreground mode: press Ctrl+C to stop." -ForegroundColor Yellow
  Start-Process -FilePath $py -ArgumentList 'run.py' -WorkingDirectory (Get-Location) -WindowStyle Hidden
} else {
  # Ensure job starts IN workspace directory
  $workspace = Get-Location
  $serverJob = Start-Job -ScriptBlock {
    param($pyPath, $workspacePath)
    Set-Location $workspacePath
    & $pyPath run.py 2>&1 | ForEach-Object { "[server] $_" }
  } -ArgumentList $py, $workspace
  Start-Sleep -Milliseconds $StartupWaitMs
}

Write-Host "[reset] Probing endpoints" -ForegroundColor Cyan
function Probe($url) {
  try {
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
    return "OK $($resp.StatusCode) len=$($resp.Content.Length)"
  } catch {
    return "FAIL $url : $($_.Exception.Message)"
  }
}

$base = "http://127.0.0.1:$Port"
$results = [ordered]@{
  login = Probe("$base/login")
  diag_ping = Probe("$base/__diag__ping")
  routes1 = Probe("$base/__routes")
  routes2 = Probe("$base/debug/routes")
}

Write-Host "[reset] Results:" -ForegroundColor Yellow
foreach ($k in $results.Keys) { Write-Host ("  {0,-10} : {1}" -f $k, $results[$k]) }

Write-Host "[reset] Fetching first 30 server log lines..." -ForegroundColor Cyan
if (-not $Foreground) {
  if ($serverJob.State -eq 'Running') {
    $serverOut = Receive-Job $serverJob -Keep | Select-Object -First 30
    foreach ($line in $serverOut) { Write-Host $line }
    Write-Host "[reset] (Job continues; live output: Receive-Job -Id $($serverJob.Id))" -ForegroundColor DarkCyan
    Write-Host "[reset] Stop server: Stop-Job -Id $($serverJob.Id); Remove-Job -Id $($serverJob.Id)" -ForegroundColor DarkCyan
  } else {
    Write-Host "[reset] Server job state: $($serverJob.State) (check errors above)." -ForegroundColor Red
  }
} else {
  Write-Host "[reset] Server started in background process (Start-Process)." -ForegroundColor DarkCyan
}

Write-Host "[reset] Done" -ForegroundColor Green