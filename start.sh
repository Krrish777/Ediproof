#!/usr/bin/env bash
# Ediproof — one-shot setup + launch for macOS / Linux
# Usage:  bash start.sh     (or ./start.sh after chmod +x)

set -e
cd "$(dirname "$0")"

BLUE='\033[36m'; GREEN='\033[32m'; YELLOW='\033[33m'; RED='\033[31m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}[OK]${RESET}   $1"; }
info() { echo -e "${BLUE}[--]${RESET}   $1"; }
warn() { echo -e "${YELLOW}[WARN]${RESET} $1"; }
fail() { echo -e "${RED}[ERROR]${RESET} $1"; exit 1; }

echo
echo "============================================================"
echo "   EDIPROOF — The ledger of verified learning"
echo "   Automatic setup and launch"
echo "============================================================"
echo

command -v node >/dev/null 2>&1 || fail "Node.js is not installed. Install Node 22 LTS from https://nodejs.org"
ok "Node.js $(node --version) detected"

info "Installing/verifying backend dependencies (first run takes 2-5 min)..."
( cd backend && npm install --no-audit --no-fund --loglevel=error ) || fail "Backend install failed. Run 'cd backend && npm install' manually to see the error."
ok "Backend dependencies ready"

info "Installing/verifying frontend dependencies (first run takes 2-5 min)..."
( cd frontend && npm install --no-audit --no-fund --loglevel=error ) || fail "Frontend install failed. Run 'cd frontend && npm install' manually to see the error."
ok "Frontend dependencies ready"

if [ ! -f "backend/.env" ]; then
  echo
  warn "backend/.env was not found."
  warn "PDF uploads will not work until you create it."
  warn "See CREDENTIALS_NEEDED.md."
  echo
fi

info "Starting backend on http://localhost:8787 ..."
( cd backend && npm start ) >/tmp/ediproof-backend.log 2>&1 &
BACKEND_PID=$!

info "Starting frontend on http://localhost:3000 ..."
( cd frontend && npm run dev ) >/tmp/ediproof-frontend.log 2>&1 &
FRONTEND_PID=$!

trap 'echo; info "Stopping servers..."; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0' INT TERM

info "Waiting 12 seconds for servers to boot..."
sleep 12

if command -v open      >/dev/null 2>&1; then open http://localhost:3000
elif command -v xdg-open >/dev/null 2>&1; then xdg-open http://localhost:3000
fi

echo
echo "============================================================"
echo "   Ediproof is running!"
echo "     Frontend:  http://localhost:3000"
echo "     Backend:   http://localhost:8787/api/health"
echo "     Logs:      /tmp/ediproof-{backend,frontend}.log"
echo
echo "   Press Ctrl+C to stop both servers."
echo "============================================================"
echo

wait $BACKEND_PID $FRONTEND_PID
