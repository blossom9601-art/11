# Quick diagnostic script for route visibility & port/process checks
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

Write-Host '== quick_diag start ==' -ForegroundColor Cyan
Write-Host "Working Dir: $(Get-Location)" -ForegroundColor DarkCyan

# 1. Check diag_routes.py presence
$diagPath = Join-Path (Get-Location) 'scripts/diag_routes.py'
if (Test-Path $diagPath) {
  Write-Host "[OK] Found diag_routes.py at $diagPath" -ForegroundColor Green
} else {
  Write-Host "[FAIL] Missing diag_routes.py at $diagPath" -ForegroundColor Red
  Write-Host 'Aborting (cannot proceed).' -ForegroundColor Red
  exit 10
}

# 2. Show first lines (avoid concatenation mistakes)
Write-Host '[SHOW] First 15 lines:' -ForegroundColor Yellow
Get-Content $diagPath -TotalCount 15 | ForEach-Object { Write-Host '  ' $_ }

# 3. Port 8080 ownership
Write-Host '[CHECK] Port 8080 listeners:' -ForegroundColor Yellow
$net = netstat -ano | findstr :8080
if (-not $net) { Write-Host '  (none listening)' -ForegroundColor DarkYellow } else { $net }

# 4. Python interpreter selection (prefer venv)
$venvPy = Join-Path (Get-Location) '.venv/Scripts/python.exe'
if (Test-Path $venvPy) {
  $py = $venvPy
  Write-Host "[PY] Using venv: $py" -ForegroundColor Green
} else {
  $py = 'python'
  Write-Host '[PY] Using system python (venv not found)' -ForegroundColor DarkYellow
}

Write-Host '[RUN] Executing diag_routes.py' -ForegroundColor Yellow
try {
  & $py $diagPath | ForEach-Object { Write-Host $_ }
} catch {
  Write-Host "[ERROR] diag_routes.py execution failed: $($_.Exception.Message)" -ForegroundColor Red
  exit 11
}

Write-Host '== quick_diag end ==' -ForegroundColor Cyan
exit 0