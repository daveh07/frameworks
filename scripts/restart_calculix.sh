#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_DIR="$ROOT/calculix-service"
PORT="${PORT:-8084}"
HOST="${HOST:-0.0.0.0}"
LOG_FILE="${CALCULIX_SERVICE_LOG:-/tmp/calculix-service.log}"
BIN_PATH="$SERVICE_DIR/target/release/calculix-service"

say() { echo "[restart_calculix] $*"; }

pids_from_port() {
  # Extract pids from ss output like: users:(("calculix-servic",pid=502980,fd=9))
  ss -ltnp 2>/dev/null | awk -v p=":$PORT" '$4 ~ p {print $0}' \
    | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' \
    | sort -u
}

pids_from_name() {
  # Matches compiled binary names and cargo-run processes.
  pgrep -f "(^|/)(calculix-service)(\s|$)" 2>/dev/null || true
}

kill_pids() {
  local pids=($*)
  if [[ ${#pids[@]} -eq 0 ]]; then
    return 0
  fi

  say "Stopping PIDs: ${pids[*]}"
  kill -TERM "${pids[@]}" 2>/dev/null || true

  # wait up to ~2s
  for _ in {1..10}; do
    sleep 0.2
    local still=()
    for pid in "${pids[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then
        still+=("$pid")
      fi
    done
    if [[ ${#still[@]} -eq 0 ]]; then
      return 0
    fi
  done

  say "Force killing remaining PIDs"
  kill -KILL "${pids[@]}" 2>/dev/null || true
}

say "Killing anything listening on :$PORT (and calculix-service processes)"
mapfile -t PORT_PIDS < <(pids_from_port)
mapfile -t NAME_PIDS < <(pids_from_name)

# merge unique
ALL_PIDS=($(printf "%s\n" "${PORT_PIDS[@]:-}" "${NAME_PIDS[@]:-}" | awk 'NF' | sort -u))
kill_pids "${ALL_PIDS[@]:-}"

say "Building calculix-service (release)"
cd "$SERVICE_DIR"
cargo build --release --bin calculix-service

say "Starting service on $HOST:$PORT"
# Use env vars to be explicit; ccx discovery is handled by resolve_ccx_path()
nohup env HOST="$HOST" PORT="$PORT" \
  CALCULIX_DEBUG_EXPORT="${CALCULIX_DEBUG_EXPORT:-$SERVICE_DIR/debug_export}" \
  RUST_LOG="${RUST_LOG:-calculix_service=debug,tower_http=info,axum=info}" \
  "$BIN_PATH" \
  >"$LOG_FILE" 2>&1 &

NEW_PID=$!
say "Started PID $NEW_PID"
say "Log: $LOG_FILE"

# quick health probe
sleep 0.2
if command -v curl >/dev/null 2>&1; then
  curl -sS "http://127.0.0.1:$PORT/health" || true
else
  say "curl not found; skipping health check"
fi
