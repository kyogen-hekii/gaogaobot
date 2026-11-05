@echo off
setlocal
pushd "%~dp0shiori-work-v0.1.0" || exit /b 1
call "%~dp0dev.cmd" npm start
set "BOT_EXIT=%ERRORLEVEL%"
popd
exit /b %BOT_EXIT%
