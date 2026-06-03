#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_LOG="$ROOT_DIR/backend.log"
FRONTEND_LOG="$ROOT_DIR/frontend.log"
BACKEND_PORT="${BACKEND_PORT:-4000}"
FRONTEND_PORT="${FRONTEND_PORT:-3001}"
BACKEND_URL="${BACKEND_URL:-http://localhost:$BACKEND_PORT}"
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--use-system-ca"

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

wait_for_url() {
  local url="$1"
  local max_attempts="${2:-20}"

  for ((i=1; i<=max_attempts; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  return 1
}

echo "[agro-local] Limpando processos Node antigos..."
if command -v taskkill >/dev/null 2>&1; then
  taskkill //F //IM node.exe >/dev/null 2>&1 || true
else
  pkill -f "node" >/dev/null 2>&1 || true
fi

echo "[agro-local] Instalando dependências do backend..."
cd "$BACKEND_DIR"
npm install --silent --no-audit

echo "[agro-local] Instalando dependências do frontend..."
cd "$FRONTEND_DIR"
npm install --silent --no-audit

echo "[agro-local] Iniciando backend na porta $BACKEND_PORT..."
cd "$BACKEND_DIR"
npm start >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

echo "[agro-local] Iniciando frontend na porta $FRONTEND_PORT (BACKEND_URL=$BACKEND_URL)..."
cd "$FRONTEND_DIR"
PORT="$FRONTEND_PORT" BACKEND_URL="$BACKEND_URL" npm start >"$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

if ! wait_for_url "http://localhost:$BACKEND_PORT/health"; then
  echo "[agro-local] ERRO: backend não respondeu em http://localhost:$BACKEND_PORT/health"
  tail -n 40 "$BACKEND_LOG" || true
  exit 1
fi

if ! wait_for_url "http://localhost:$FRONTEND_PORT/api/health"; then
  echo "[agro-local] ERRO: frontend não respondeu em http://localhost:$FRONTEND_PORT/api/health"
  tail -n 60 "$FRONTEND_LOG" || true
  exit 1
fi

echo "[agro-local] Validações rápidas:"
echo "----- http://localhost:$BACKEND_PORT/health -----"
curl -fsS "http://localhost:$BACKEND_PORT/health" || true
echo
echo "----- http://localhost:$FRONTEND_PORT/api/health -----"
curl -fsS "http://localhost:$FRONTEND_PORT/api/health" || true
echo
echo "----- http://localhost:$FRONTEND_PORT/ -----"
root_headers="$(curl -sSI "http://localhost:$FRONTEND_PORT/" || true)"
printf '%s\n' "$root_headers" | head -n 5

echo
if ! printf '%s\n' "$root_headers" | grep -q " 200 "; then
  echo "[agro-local] AVISO: raiz do frontend não retornou 200. Diagnóstico:"
  echo "----- http://localhost:$FRONTEND_PORT/index.html -----"
  curl -sSI "http://localhost:$FRONTEND_PORT/index.html" | head -n 5 || true
  echo
  echo "----- Assinatura esperada no frontend/server.js -----"
  grep -n "agro-frontend" "$FRONTEND_DIR/server.js" || true
  echo
  echo "----- Últimas linhas do frontend.log -----"
  tail -n 40 "$FRONTEND_LOG" || true
fi

echo "[agro-local] Frontend: http://localhost:$FRONTEND_PORT"
echo "[agro-local] Logs: $BACKEND_LOG e $FRONTEND_LOG"
echo "[agro-local] Pressione Ctrl+C para encerrar backend e frontend."

wait "$BACKEND_PID" "$FRONTEND_PID"
