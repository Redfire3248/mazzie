@echo off
:: ═══════════════════════════════════════════════════════════════
::  MAZZIE — push to GitHub
::
::  Double-click           → asks for a short message, then pushes
::  push.bat fixed timer   → pushes with the message "fixed timer"
::  push.bat watch         → auto-pushes every time you save changes
::                           (checks every 30 s, Ctrl+C to stop)
:: ═══════════════════════════════════════════════════════════════
setlocal
title MAZZIE - push to GitHub
cd /d "%~dp0"

where git >nul 2>nul || (echo [X] Git is not installed: https://git-scm.com/download/win & pause & exit /b 1)
if not exist ".git" (echo [X] This folder is not a git repository. & pause & exit /b 1)

if /i "%~1"=="watch" goto watch

:: ── One-off push ─────────────────────────────────────────────
set "MSG=%*"
if not defined MSG (
  echo Changed files:
  git status --short
  echo.
  set /p "MSG=Describe your change (just press Enter for an automatic message): "
)
call :push
if errorlevel 1 (pause & exit /b 1)
echo.
echo Done. Live in about a minute: https://redfire3248.github.io/mazzie/
timeout /t 8 >nul
exit /b 0

:: ── Watch mode ───────────────────────────────────────────────
:watch
echo Watching for changes - every save gets pushed automatically.
echo Press Ctrl+C to stop.
echo.
:watchloop
set "MSG="
for /f %%c in ('git status --porcelain ^| find /c /v ""') do set "COUNT=%%c"
if not "%COUNT%"=="0" (
  rem wait a few seconds so half-saved files settle
  timeout /t 5 /nobreak >nul
  set "MSG=Auto-save"
  call :push
)
timeout /t 30 /nobreak >nul
goto watchloop

:: ── The actual work ──────────────────────────────────────────
:push
if not defined MSG for /f "delims=" %%t in ('powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm'"') do set "MSG=Update %%t"
if /i "%MSG%"=="Auto-save" for /f "delims=" %%t in ('powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm'"') do set "MSG=Auto-save %%t"

git add -A
git diff --cached --quiet
if errorlevel 1 (
  rem message goes through a file so quotes and symbols in it can't break anything
  powershell -NoProfile -Command "[IO.File]::WriteAllText((Join-Path $env:TEMP 'mazzie_msg.txt'), $env:MSG)"
  git commit -q -F "%TEMP%\mazzie_msg.txt"
  git log -1 --format="[+] Committed: %%s"
) else (
  echo [=] Nothing new to commit.
)

:: grab anything uploaded through the GitHub website first, so it is never overwritten
git pull -q --rebase --autostash origin main
if errorlevel 1 (
  echo.
  echo [X] Your changes clash with changes already on GitHub.
  echo     Nothing was pushed and nothing was lost. Ask Claude to sort it out.
  git rebase --abort >nul 2>nul
  exit /b 1
)

git push -q origin main
if errorlevel 1 (
  echo [X] Push failed - check your internet or GitHub sign-in, then try again.
  exit /b 1
)
echo [^>] Pushed to GitHub  %date% %time:~0,5%
exit /b 0
