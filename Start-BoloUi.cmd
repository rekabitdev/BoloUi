@echo off
setlocal
cd /d "%~dp0"
title BoloUi Development

if not exist "node_modules\electron\package.json" (
  echo [BoloUi] Installing dependencies for the first run...
  call bun install --frozen-lockfile
  if errorlevel 1 goto :error
)

rem Clear only Vite's generated cache after an interrupted/crashed run.
if exist "node_modules\.vite" rmdir /s /q "node_modules\.vite"

echo [BoloUi] Starting application...
call bun run dev
if errorlevel 1 goto :error
exit /b 0

:error
echo.
echo [BoloUi] Failed to start. Keep this window open and copy the error above.
pause
exit /b 1
