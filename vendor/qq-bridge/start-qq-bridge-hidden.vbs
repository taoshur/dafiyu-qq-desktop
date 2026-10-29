' Launch qq-bridge at logon without a visible console window.
' Task Scheduler calls wscript.exe with this file; the bridge supervisor keeps
' running in the background and writes state\bridge.log.
' ASCII only (VBScript reads .vbs as ANSI).
Set fso = CreateObject("Scripting.FileSystemObject")
proj = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = proj & "\start-qq-bridge-silent.cmd"
Set shell = CreateObject("WScript.Shell")
shell.Run "cmd /c """ & cmd & """", 0, False
