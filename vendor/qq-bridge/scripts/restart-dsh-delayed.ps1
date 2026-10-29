# 延迟重启 DSH：先等当前回合把消息存下来，再杀进程并重新拉起。
# 由计划任务 dsh-restart-once 以「计划任务服务」身份运行，因此不会被
# taskkill /T 连带杀掉（它不是 DSH 进程树的子进程）。
Start-Sleep -Seconds 25
taskkill /IM "DeepSeek Harness.exe" /T /F | Out-Null
Start-Sleep -Seconds 4
$exe = if ($env:DSH_EXE) { $env:DSH_EXE } else { Join-Path $env:LOCALAPPDATA "Programs\DeepSeek Harness\DeepSeek Harness.exe" }
Start-Process $exe
Start-Sleep -Seconds 5
schtasks /Delete /TN "dsh-restart-once" /F | Out-Null
