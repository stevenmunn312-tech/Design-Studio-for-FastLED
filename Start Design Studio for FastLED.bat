@echo off
rem Design Studio for FastLED launcher (Windows).
rem
rem Sets everything up on first run -- app dependencies, the Python upload
rem helper, a production build -- then serves the app and opens your browser.
rem Double-click it again any time; completed steps are skipped.
setlocal
cd /d "%~dp0"
title Design Studio for FastLED

rem ---- Node.js --------------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo !! Node.js is not installed.
  echo    Download the LTS installer from https://nodejs.org - keep the default
  echo    options during install - then run this file again.
  pause
  exit /b 1
)
set "NODEMAJOR=0"
for /f "delims=v." %%i in ('node --version') do set "NODEMAJOR=%%i"
if %NODEMAJOR% LSS 18 (
  echo.
  echo !! Node.js 18 or newer is required. Update at https://nodejs.org,
  echo    then run this file again.
  pause
  exit /b 1
)

rem ---- App dependencies (first run only) -------------------------------------
if not exist node_modules (
  echo.
  echo == First run: installing app dependencies - this can take a few minutes...
  call npm ci
  if errorlevel 1 call npm install
  if errorlevel 1 goto :npmfail
)

rem ---- Python upload helper (optional: only needed to flash a board) ---------
rem Plain `python --version` also filters out the Microsoft Store stub, which
rem exists on PATH but exits with an error until real Python is installed.
set "PY="
python --version >nul 2>nul
if not errorlevel 1 set "PY=python"
if not defined PY (
  py -3 --version >nul 2>nul
  if not errorlevel 1 set "PY=py -3"
)
if not defined PY (
  echo.
  echo Python 3 not found - the designer will run, but uploading to a board
  echo needs Python 3 from https://python.org ^(tick "Add python.exe to PATH"
  echo in its installer^), then run this file again.
  goto :build
)

if exist backend\.venv\Scripts\python.exe goto :venvready
echo.
echo == Setting up the upload helper ^(Python^)...
%PY% -m venv backend\.venv
if not exist backend\.venv\Scripts\python.exe (
  echo Could not create a Python environment - the designer still works;
  echo uploading to a board stays disabled.
  goto :build
)

:venvready
fc backend\requirements.txt backend\.venv\installed-requirements.txt >nul 2>nul
if not errorlevel 1 goto :venvpath
echo.
echo == Installing upload helper dependencies...
backend\.venv\Scripts\pip install -q -r backend\requirements.txt
if errorlevel 1 (
  echo Helper install failed - the designer still works; uploading to a board
  echo stays disabled.
  goto :venvpath
)
copy /y backend\requirements.txt backend\.venv\installed-requirements.txt >nul

:venvpath
rem The preview server auto-spawns the helper with plain `python`
rem (vite-plugin-upload-helper.ts); putting the venv first on PATH points that
rem spawn at the interpreter that has uvicorn installed.
set "PATH=%cd%\backend\.venv\Scripts;%PATH%"

rem ---- Build (first run, or when the checkout has changed) -------------------
:build
set "WANT=no-git"
for /f "delims=" %%i in ('git rev-parse HEAD 2^>nul') do set "WANT=%%i"
set "HAVE=none"
if exist dist\.build-stamp set /p HAVE=<dist\.build-stamp
set "NEEDBUILD="
if not exist dist\index.html set "NEEDBUILD=1"
if not "%WANT%"=="no-git" if not "%WANT%"=="%HAVE%" set "NEEDBUILD=1"
if not defined NEEDBUILD goto :run
echo.
echo == Building Design Studio for FastLED...
call npm run build
if errorlevel 1 goto :buildfail
>dist\.build-stamp echo %WANT%

rem ---- Run --------------------------------------------------------------------
:run
echo.
echo == Starting Design Studio for FastLED - your browser will open in a moment.
echo    Keep this window open while you use the app; close it to quit.
call npm run preview -- --open
pause
exit /b 0

:npmfail
echo.
echo !! Dependency install failed - check the messages above.
echo    ^(Is your internet connection up?^)
pause
exit /b 1

:buildfail
echo.
echo !! Build failed - check the messages above.
pause
exit /b 1
