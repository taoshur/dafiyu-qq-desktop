@echo off
chcp 65001 >nul
cd /d "%~dp0"
title qq-bridge (DSH relay + bridge)
rem Silent variant for the logon scheduled task: no pause, exit code is passed
rem through so Task Scheduler's RestartOnFailure can kick in.
node scripts\start-bridge.mjs
exit /b %errorlevel%
