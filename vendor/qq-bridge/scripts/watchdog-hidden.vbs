' Hidden launcher for the qq-bridge watchdog.
' Run by Task Scheduler via wscript.exe, so no console window flashes.
' IMPORTANT: keep this file ASCII-only. VBScript reads .vbs as ANSI, and a
' UTF-8 Chinese comment here previously swallowed the "Set shell" line,
' which made wscript pop an error dialog every 5 minutes (800A01A8 'shell').
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = scriptDir & "\watchdog-bridge.ps1"
Set shell = CreateObject("WScript.Shell")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """", 0, False
