@echo off
setlocal
rem Bootstrap only: never call a PATH-selected node or load a shell profile.
"C:\Users\me\AppData\Local\mise\installs\node\24.19.0\node.exe" "%~dp0tools\dev.mjs" %*
exit /b %errorlevel%
