@echo off
title Ediproof - Setup and Launch

cd /d "%~dp0"

echo.
echo ============================================================
echo    EDIPROOF - The ledger of verified learning
echo ============================================================
echo.

REM --- Check Node.js ------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed.
    echo Please install Node.js 22 LTS from https://nodejs.org
    echo Then re-run this script.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODE_VERSION=%%v
echo [OK] Node.js %NODE_VERSION% detected
echo.

REM --- Install backend deps -----------------------------------
echo [--] Installing backend dependencies...
echo      (first run takes 2-5 minutes, subsequent runs take seconds)
echo.
pushd "%~dp0backend"
call npm install --no-audit --no-fund
popd
echo.

REM --- Install frontend deps ----------------------------------
echo [--] Installing frontend dependencies...
echo      (first run takes 2-5 minutes, subsequent runs take seconds)
echo.
pushd "%~dp0frontend"
call npm install --no-audit --no-fund
popd
echo.

REM --- Warn if backend .env missing ---------------------------
if not exist "%~dp0backend\.env" (
    echo.
    echo ============================================================
    echo   WARNING: backend\.env is missing.
    echo   PDF uploads will not work. Verification still works.
    echo ============================================================
    echo.
    echo Press any key to continue anyway, or close this window.
    pause >nul
)

REM --- Launch servers in new windows --------------------------
REM     Use  start /D "path"  to set the working directory as a flag,
REM     not  cd /d "..."  inside the command string. That avoids the
REM     "filename, directory name, or volume label syntax is incorrect"
REM     error on paths containing spaces.
echo.
echo [--] Starting backend on http://localhost:8787 ...
start "Ediproof Backend" /D "%~dp0backend" cmd /k "echo === BACKEND LOG === && echo. && npm start"

echo [--] Starting frontend on http://localhost:3000 ...
start "Ediproof Frontend" /D "%~dp0frontend" cmd /k "echo === FRONTEND LOG === && echo. && npm run dev"

echo.
echo [--] Waiting 15 seconds for servers to boot...
timeout /t 15 /nobreak

echo [--] Opening http://localhost:3000 in your browser...
start "" "http://localhost:3000"

echo.
echo ============================================================
echo   Ediproof is running!
echo.
echo   IMPORTANT: Do NOT close the two black windows titled
echo   "Ediproof Backend" and "Ediproof Frontend". Those are
echo   the servers. Closing them stops the app.
echo.
echo   You CAN close this window safely.
echo ============================================================
echo.
pause
