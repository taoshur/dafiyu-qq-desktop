@echo off
node "%~dp0growth-report.mjs" >> "%~dp0..\state\growth-report.log" 2>&1
