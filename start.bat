@echo off
setlocal enabledelayedexpansion
title Ediproof - Setup and Launch

echo.
echo ============================================================
echo    EDIPROOF - The ledger of verified learning
echo    Automatic setup and launch
echo ============================================================
echo.

cd /d "%~dp0"

REM -------------------------------------------------------------
REM 1. Verify Node.js is installed
REM -------------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed.
    echo.
    echo Please install Node.js 22 LTS first:
    echo   https://nodejs.org/en/download
    echo.
    echo Then re-run this script.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODE_VERSION=%%v
echo [OK]   Node.js %NODE_VERSION% detected
echo.

REM -------------------------------------------------------------
REM 2. Install backend dependencies if missing
REM -------------------------------------------------------------
if not exist "backend\node_modules" (
    echo [--] Installing backend dependencies, please wait...
    pushd backend
    call npm install --loglevel=error
    if errorlevel 1 (
        echo [ERROR] Backend install failed.
        popd
        pause
        exit /b 1
    )
    popd
    echo [OK]   Backend dependencies installed
) else (
    echo [OK]   Backend dependencies already installed
)
echo.

REM -------------------------------------------------------------
REM 3. Install frontend dependencies if missing
REM -------------------------------------------------------------
if not exist "frontend\node_modules" (
    echo [--] Installing frontend dependencies, please wait...
    pushd frontend
    call npm install --loglevel=error
    if errorlevel 1 (
        echo [ERROR] Frontend install failed.
        popd
        pause
        exit /b 1
    )
    popd
    echo [OK]   Frontend dependencies installed
) else (
    echo [OK]   Frontend dependencies already installed
)
echo.

REM -------------------------------------------------------------
REM 4. Verify the backend .env exists (contains Pinata JWT)
REM -------------------------------------------------------------
if not exist "backend\.env" (
    echo.
    echo ============================================================
    echo   WARNING: backend\.env was not found.
    echo ============================================================
    echo.
    echo   PDF uploads to IPFS will fail without it.
    echo   You can still VIEW and VERIFY existing certificates.
    echo.
    echo   To enable uploads, create backend\.env with:
    echo     PINATA_JWT=your-pinata-jwt-here
    echo     PINATA_GATEWAY=https://your-gateway.mypinata.cloud
    echo     PORT=8787
    echo     DB_PATH=./ediproof.db
    echo.
    echo   See CREDENTIALS_NEEDED.md for how to get a Pinata JWT.
    echo.
    pause
)

REM -------------------------------------------------------------
REM 5. Launch backend and frontend in separate windows
REM -------------------------------------------------------------
echo [--] Starting backend on http://localhost:8787 ...
start "Ediproof Backend"  cmd /k "cd /d %~dp0backend  && echo. && echo === BACKEND LOG === && echo. && npm start"

echo [--] Starting frontend on http://localhost:3000 ...
start "Ediproof Frontend" cmd /k "cd /d %~dp0frontend && echo. && echo === FRONTEND LOG === && echo. && npm run dev"

echo.
echo [--] Waiting 10 seconds for servers to boot...
timeout /t 10 /nobreak >nul

echo [--] Opening browser...
start "" "http://localhost:3000"

echo.
echo ============================================================
echo   Ediproof is running.
echo     Frontend:  http://localhost:3000
echo     Backend:   http://localhost:8787
echo.
echo   To stop everything, simply close the two black windows
echo   that opened (titled "Ediproof Backend" and "Ediproof
echo   Frontend").
echo.
echo   You can close THIS window now.
echo ============================================================
echo.
pause
