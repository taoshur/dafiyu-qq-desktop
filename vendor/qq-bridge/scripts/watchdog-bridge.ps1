# qq-bridge watchdog: if the console port is closed, start the bridge again.
# ASCII-only on purpose (Windows PowerShell 5.1 reads BOM-less UTF-8 as ANSI).
#
# Safety rails:
#   - state\watchdog.disabled       -> do nothing (create this file to pause the watchdog)
#   - MinIntervalSec (default 120)  -> never restart twice in quick succession
#   - MaxPerHour   (default 3)      -> crash-loop guard
#   - -DryRun                       -> log what it would do, change nothing
param(
  [int]$Port = 3100,
  [int]$MinIntervalSec = 120,
  [int]$MaxPerHour = 3,
  [switch]$DryRun
)
$ErrorActionPreference = 'Continue'
$proj = if ($env:QQ_BRIDGE_ROOT) { $env:QQ_BRIDGE_ROOT } else { Split-Path -Parent $PSScriptRoot }
$stateDir = Join-Path $proj 'state'
$log = Join-Path $stateDir 'watchdog.log'
$stateFile = Join-Path $stateDir 'watchdog-state.json'
$restart = Join-Path $proj 'scripts\restart-bridge.ps1'

function Write-Log($msg) {
  try { Add-Content -Path $log -Value ((Get-Date).ToString('s') + ' ' + $msg) -Encoding UTF8 } catch {}
}
function Test-BridgePort($p) {
  try {
    $c = New-Object Net.Sockets.TcpClient
    $ok = $c.ConnectAsync('127.0.0.1', $p).Wait(1200)
    $c.Close()
    return $ok
  } catch { return $false }
}

if (Test-Path (Join-Path $stateDir 'watchdog.disabled')) { exit 0 }
if (Test-BridgePort $Port) { exit 0 }

$now = [int][DateTimeOffset]::Now.ToUnixTimeSeconds()
$lastAttempt = 0
$attempts = @()
if (Test-Path $stateFile) {
  try {
    $raw = Get-Content $stateFile -Raw | ConvertFrom-Json
    $lastAttempt = [int]$raw.lastAttempt
    $attempts = @($raw.attempts | ForEach-Object { [int]$_ })
  } catch {}
}
$recent = @($attempts | Where-Object { $_ -gt ($now - 3600) })

if (($now - $lastAttempt) -lt $MinIntervalSec) {
  Write-Log ("port " + $Port + " down, but last attempt was " + ($now - $lastAttempt) + "s ago; waiting")
  exit 0
}
if ($recent.Count -ge $MaxPerHour) {
  Write-Log ("port " + $Port + " down, but already " + $recent.Count + " restarts in the last hour; giving up")
  exit 1
}
if ($DryRun) {
  Write-Log ("DRYRUN would restart (recent=" + $recent.Count + ")")
  exit 0
}

Write-Log ("port " + $Port + " down -> restarting")
$state = @{ lastAttempt = $now; attempts = @($recent + $now) }
try { [IO.File]::WriteAllText($stateFile, ($state | ConvertTo-Json -Compress), [Text.Encoding]::UTF8) } catch {}

# -WindowStyle Hidden + -Wait：看门狗自己就是隐藏跑的，重启脚本也绝不能弹出控制台窗口
Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -Wait -ArgumentList @(
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $restart, '-Reason', 'watchdog'
)
if (Test-BridgePort $Port) {
  Write-Log 'restart OK'
  exit 0
}
Write-Log 'restart FAILED'
exit 1
