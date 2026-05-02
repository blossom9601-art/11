# Blossom — blossom-ssh:// handler (no Electron). Spawns bundled putty.exe only.
param(
  [Parameter(Position = 0)]
  [string]$RawUrl
)
$ErrorActionPreference = 'Stop'
if (-not $RawUrl) { exit 1 }
$RawUrl = $RawUrl.Trim().Trim('"')
try {
  $uri = [Uri]$RawUrl
} catch {
  exit 1
}
if ($uri.Scheme -ne 'blossom-ssh') { exit 1 }
if ($uri.Host -ne 'open') { exit 1 }

$query = $uri.Query.TrimStart('?')
$pairs = @{}
foreach ($segment in $query -split '&') {
  if (-not $segment) { continue }
  $kv = $segment -split '=', 2
  $k = [uri]::UnescapeDataString($kv[0])
  $v = if ($kv.Length -gt 1) { [uri]::UnescapeDataString($kv[1]) } else { '' }
  $pairs[$k] = $v
}

$targetHost = $pairs['host']
if (-not $targetHost) { exit 1 }
if ($targetHost.Length -gt 253) { exit 1 }
if ($targetHost -match '[^\w.\[\]:+%-]') { exit 1 }

$port = 22
if ($pairs.ContainsKey('port') -and $pairs['port']) {
  $pn = 0
  [void][int]::TryParse($pairs['port'], [ref]$pn)
  if ($pn -ge 1 -and $pn -le 65535) { $port = $pn }
}

$user = $pairs['user']
if ($user) {
  do {
    $prev = $user
    if ($user.Length -ge 2 -and $user[0] -eq [char]34 -and $user[$user.Length - 1] -eq [char]34) {
      $user = $user.Substring(1, $user.Length - 2).Trim()
    } elseif ($user.Length -ge 2 -and $user[0] -eq [char]39 -and $user[$user.Length - 1] -eq [char]39) {
      $user = $user.Substring(1, $user.Length - 2).Trim()
    } else { break }
  } while ($user -ne $prev)
}
if ($user -and $user -notmatch '^[a-zA-Z0-9._@-]+$') { exit 1 }

$putty = Join-Path $PSScriptRoot 'putty.exe'
if (-not (Test-Path -LiteralPath $putty)) { exit 1 }

$pa = [System.Collections.ArrayList]@()
[void]$pa.Add('-ssh')
if ($user) {
  [void]$pa.Add('-l')
  [void]$pa.Add($user)
}
[void]$pa.Add($targetHost)
if ($port -ne 22) {
  [void]$pa.Add('-P')
  [void]$pa.Add([string]$port)
}

Start-Process -FilePath $putty -ArgumentList @($pa.ToArray()) -WindowStyle Normal
