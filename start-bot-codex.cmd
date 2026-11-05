@echo off
setlocal
cd /d "%~dp0shiori-work-v0.1.0"
call "%~dp0dev.cmd" npm run dev:codex
