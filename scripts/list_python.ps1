<#
  list_python.ps1
  Enumerate all running python.exe processes with their CommandLine, ParentProcessId, and attempt to detect scripts.
  Helps identify who is repeatedly binding 8080.

  Usage:
    powershell -ExecutionPolicy Bypass -File .\scripts\list_python.ps1
#>

Write-Host '== python process inventory ==' -ForegroundColor Cyan
$procs = Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^python(\.exe)?$' }
if (-not $procs) {
  Write-Host '[info] No python.exe processes running.' -ForegroundColor Yellow
  exit 0
}

$rows = $procs | Select-Object ProcessId, ParentProcessId, CommandLine
$rows | Format-Table -AutoSize

Write-Host '== netstat :8080 listeners (unique PIDs) ==' -ForegroundColor Cyan
$listeners = netstat -ano | findstr ':8080' | Select-Object -Unique
$pids = @()
foreach ($l in $listeners) {
  $parts = $l -split '\s+' | Where-Object { $_ -ne '' }
  if ($parts[-1] -match '^[0-9]+$') { $pids += [int]$parts[-1] }
}
$pids = $pids | Sort-Object -Unique
if ($pids) {
  Write-Host "PIDs: $($pids -join ', ')" -ForegroundColor Green
  foreach ($pid in $pids) {
    $cmd = ($rows | Where-Object { $_.ProcessId -eq $pid }).CommandLine
    Write-Host "  PID $pid -> $cmd" -ForegroundColor DarkGreen
  }
} else {
  Write-Host '[info] No 8080 listeners found.' -ForegroundColor Yellow
}

Write-Host 'Hint: If multiple identical CommandLine entries appear, a supervising tool may be spawning workers.' -ForegroundColor DarkCyan
Write-Host 'To terminate ALL python listeners on 8080:' -ForegroundColor Yellow
Write-Host '  netstat -ano | findstr :8080 | % { ($_ -split "\s+")[-1] } | % { Stop-Process -Id $_ -Force }' -ForegroundColor White

Write-Host '== done ==' -ForegroundColor Cyan