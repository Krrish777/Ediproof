#!/usr/bin/env bash
# Ediproof — one-shot setup + launch for macOS / Linux
# Usage:  bash start.sh     (or ./start.sh after chmod +x)

set -e
cd "$(dirname "$0")"

BLUE='\033[36m'; GREEN='\033[32m'; YELLOW='\033[33m'; RED='\033[31m'; RESET='\033[0m'
ok()    { echo -e "${GREEN}[OK]${RESET}   $1"; }
info()  { echo -e "${BLUE}[--]${RESET}   $1"; }
warn()  { echo -e "${YELLOW}[WARN]${RESET} $1"; }
fail()  { echo -e "${RED}[ERROR]${RESET} $1"; exit 1; }

echo
echo "============================================================"
echo "   EDIPROOF — The ledger of verified learning"
echo "   Automatic setup and launch"
echo "============================================================"
echo

# 1. Check Node.js
command -v node >/dev/null 2>&1 || fail "Node.js is not installed. Install Node 22 LTS from https://nodejs.org"
ok "Node.js $(node --version) detected"

# 2. Backend dependencies
if [ ! -d "backend/node_modules" ]; then
  info "Installing backend dependencies, please wait..."
  (cd backend && npm install --loglevel=error) || fail "Backend install failed"
  ok "Backend dependencies installed"
else
  ok "Backend dependencies already installed"
fi

# 3. Frontend dependencies
if [ ! -d "frontend/node_modules" ]; then
  info "Installing frontend dependencies, please wait..."
  (cd frontend && npm install --loglevel=error) || fail "Frontend install failed"
  ok "Frontend dependencies installed"
else
  ok "Frontend dependencies already installed"
fi

# 4. Check for backend/.env
if [ ! -f "backend/.env" ]; then
  echo
  warn "backend/.env was not found."
  warn "PDF uploads to IPFS will fail until you create it."
  warn "See CREDENTIALS_NEEDED.md for setup instructions."
  echo
fi

# 5. Launch servers + open browser
info "Starting backend on http://localhost:8787 ..."
(cd backend && npm start) >/tmp/ediproof-backend.log 2>&1 &
BACKEND_PID=$!

info "Starting frontend on http://localhost:3000 ..."
(cd frontend && npm run dev) >/tmp/ediproof-frontend.log 2>&1 &
FRONTEND_PID=$!

# Clean shutdown on Ctrl+C
trap 'echo; info "Stopping servers..."; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0' INT TERM

info "Waiting 10 seconds for servers to boot..."
sleep 10

# Open browser (macOS: open, Linux: xdg-open)
if command -v open  >/dev/null 2>&1; then open  http://localhost:3000
elif command -v xdg-open >/dev/null 2>&1; then xdg-open http://localhost:3000
fi

echo
echo "============================================================"
echo "   Ediproof is running."
echo "     Frontend:  http://localhost:3000"
echo "     Backend:   http://localhost:8787"
echo "     Logs:      /tmp/ediproof-{backend,frontend}.log"
echo
echo "   Press Ctrl+C to stop both servers."
echo "============================================================"
echo

wait $BACKEND_PID $FRONTEND_PID
