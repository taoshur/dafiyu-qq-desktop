# Restart qq-bridge with an explicit reason. ASCII-only (PS 5.1 + BOM-less UTF8).
param([string]$Reason = 'manual-restart')
$ErrorActionPreference = 'Stop'
$proj = if ($env:QQ_BRIDGE_ROOT) { $env:QQ_BRIDGE_ROOT } else { Split-Path -Parent $PSScriptRoot }
$log  = Join-Path $proj 'state\bridge.log'
$lock = Join-Path $proj 'state\bridge.lock'
$restartLog = Join-Path $proj 'state\restart-log.jsonl'

function Test-Port3100 {
  try {
    $c = New-Object Net.Sockets.TcpClient
    $ok = $c.ConnectAsync('127.0.0.1', 3100).Wait(1200)
    $c.Close()
    return $ok
  } catch { return $false }
}

$oldPid = 0
if (Test-Path $lock) { $raw = (Get-Content $lock -Raw).Trim(); if ($raw -match '^\d+$') { $oldPid = [int]$raw } }
$lenBefore = if (Test-Path $log) { (Get-Item $log).Length } else { 0 }
$stopAt = Get-Date

if ($oldPid -gt 0) {
  try {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    & taskkill /PID $oldPid /T /F 2>&1 | Out-Null
    $ErrorActionPreference = $prev
  } catch {}
}
$deadline = (Get-Date).AddSeconds(45)
while ((Test-Port3100) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
if (Test-Port3100) { throw 'port 3100 still listening after kill; aborting' }

Start-Process -FilePath 'wscript.exe' -ArgumentList ('"' + (Join-Path $proj 'start-qq-bridge-hidden.vbs') + '"') -WorkingDirectory $proj

$deadline = (Get-Date).AddSeconds(120)
$up = $false
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 800
  if (Test-Port3100) { $up = $true; break }
}
if (-not $up) { Write-Output 'FAILED: port 3100 not listening after 120s'; exit 1 }
Start-Sleep -Seconds 3

$downMs = [int](((Get-Date) - $stopAt).TotalMilliseconds)
$newPid = 0
if (Test-Path $lock) { $r2 = (Get-Content $lock -Raw).Trim(); if ($r2 -match '^\d+$') { $newPid = [int]$r2 } }
$entry = [pscustomobject]@{
  at = (Get-Date).ToString('o'); reason = $Reason
  fromPid = $oldPid; toPid = $newPid; downMs = $downMs; consoleUp = $true
} | ConvertTo-Json -Compress
Add-Content -Path $restartLog -Value $entry -Encoding UTF8
Write-Output ("RESTARTED pid=" + $newPid + " downMs=" + $downMs)
