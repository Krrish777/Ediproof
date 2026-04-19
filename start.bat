@echo off
setlocal enabledelayedexpansion
title Ediproof - Setup and Launch

echo.
echo ============================================================
echo    EDIPROOF - The ledger of verified learning
echo    Automatic setup and launch
echo ============================================================
echo.

REM Switch to the folder this script lives in (handles spaces in path)
cd /d "%~dp0"

REM -------------------------------------------------------------
REM 1. Verify Node.js is installed
REM -------------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed.
    echo.
    echo Please install Node.js 22 LTS from https://nodejs.org/en/download
    echo Then re-run this script.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VERSION=%%v
echo [OK]   Node.js %NODE_VERSION% detected
echo.

REM -------------------------------------------------------------
REM 2. Install backend dependencies
REM    We ALWAYS run npm install - if already installed, it exits in ~2 seconds
REM    This prevents the "ERR_MODULE_NOT_FOUND" issue from partial installs
REM -------------------------------------------------------------
echo [--] Installing/verifying backend dependencies...
echo        (first run takes 2-5 minutes, subsequent runs are fast)
pushd "%~dp0backend"
call npm install --no-audit --no-fund --loglevel=error
set BACKEND_INSTALL_CODE=!errorlevel!
popd
if not "%BACKEND_INSTALL_CODE%"=="0" (
    echo.
    echo [ERROR] Backend install failed (exit code %BACKEND_INSTALL_CODE%).
    echo         Try opening a terminal in the backend folder and running:
    echo             npm install
    echo         directly, to see the full error.
    echo.
    pause
    exit /b 1
)
echo [OK]   Backend dependencies ready
echo.

REM -------------------------------------------------------------
REM 3. Install frontend dependencies
REM -------------------------------------------------------------
echo [--] Installing/verifying frontend dependencies...
echo        (first run takes 2-5 minutes, subsequent runs are fast)
pushd "%~dp0frontend"
call npm install --no-audit --no-fund --loglevel=error
set FRONTEND_INSTALL_CODE=!errorlevel!
popd
if not "%FRONTEND_INSTALL_CODE%"=="0" (
    echo.
    echo [ERROR] Frontend install failed (exit code %FRONTEND_INSTALL_CODE%).
    echo         Try opening a terminal in the frontend folder and running:
    echo             npm install
    echo         directly, to see the full error.
    echo.
    pause
    exit /b 1
)
echo [OK]   Frontend dependencies ready
echo.

REM -------------------------------------------------------------
REM 4. Verify the backend .env exists (contains Pinata JWT)
REM -------------------------------------------------------------
if not exist "%~dp0backend\.env" (
    echo.
    echo ============================================================
    echo   WARNING: backend\.env was not found.
    echo ============================================================
    echo.
    echo   PDF uploads to IPFS will not work without it, but you can
    echo   still VIEW and VERIFY existing certificates.
    echo.
    echo   To enable uploads, create backend\.env with these lines:
    echo     PINATA_JWT=your-pinata-jwt-here
    echo     PINATA_GATEWAY=https://your-gateway.mypinata.cloud
    echo     PORT=8787
    echo     DB_PATH=./ediproof.db
    echo.
    echo   Press any key to continue anyway, or close this window.
    pause >nul
)

REM -------------------------------------------------------------
REM 5. Launch backend and frontend in separate windows.
REM    Double-quote every path so spaces like "Punit Kumar" don't break cd.
REM -------------------------------------------------------------
echo [--] Starting backend on http://localhost:8787 ...
start "Ediproof Backend"  cmd /k "pushd \"%~dp0backend\"  && echo === BACKEND LOG === && echo. && npm start"

echo [--] Starting frontend on http://localhost:3000 ...
start "Ediproof Frontend" cmd /k "pushd \"%~dp0frontend\" && echo === FRONTEND LOG === && echo. && npm run dev"

echo.
echo [--] Waiting 12 seconds for both servers to boot...
timeout /t 12 /nobreak >nul

echo [--] Opening http://localhost:3000 in your browser...
start "" "http://localhost:3000"

echo.
echo ============================================================
echo   Ediproof is running!
echo     Frontend:  http://localhost:3000
echo     Backend:   http://localhost:8787/api/health
echo.
echo   IMPORTANT - DO NOT CLOSE the two black windows that
echo   just opened ("Ediproof Backend" and "Ediproof Frontend").
echo   Those are the servers. Closing them stops the app.
echo.
echo   To stop everything, close those two windows.
echo   You CAN close THIS window safely.
echo ============================================================
echo.
pause
