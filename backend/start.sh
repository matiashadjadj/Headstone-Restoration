#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$PROJECT_ROOT/.." && pwd)"

is_port_in_use() {
  local port="$1"
  python - "$port" <<'PY'
import errno
import socket
import sys

port = int(sys.argv[1])
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    rc = sock.connect_ex(("127.0.0.1", port))
in_use = rc == 0 or rc != errno.ECONNREFUSED
print("1" if in_use else "0")
PY
}

find_available_port() {
  local start_port="$1"
  local max_attempts="${2:-20}"
  local port="$start_port"
  local attempt=0

  while [[ "$attempt" -lt "$max_attempts" ]]; do
    if [[ "$(is_port_in_use "$port")" == "0" ]]; then
      echo "$port"
      return 0
    fi
    port=$((port + 1))
    attempt=$((attempt + 1))
  done

  return 1
}

resolve_frontend_dir() {
  local candidate
  for candidate in "$REPO_ROOT/frontent" "$REPO_ROOT/frontend"; do
    if [[ -d "$candidate" && -f "$candidate/index.html" ]]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

# Prefer a venv inside backend/, but fall back to repo-level venv.
if [[ -f "$PROJECT_ROOT/venv/bin/activate" ]]; then
  VENV_PATH="$PROJECT_ROOT/venv"
elif [[ -f "$REPO_ROOT/venv/bin/activate" ]]; then
  VENV_PATH="$REPO_ROOT/venv"
else
  VENV_PATH=""
fi

# Activate the virtualenv if found; otherwise, prompt the user.
if [[ -n "$VENV_PATH" ]]; then
  echo "Activating virtualenv at $VENV_PATH"
  source "$VENV_PATH/bin/activate"
else
  echo "venv not found at $PROJECT_ROOT/venv or $REPO_ROOT/venv. Activate your environment before running."
  exit 1
fi

# Use the default settings module unless the caller overrides it.
export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-backend.config.settings}"

# Print active DB target to avoid confusion when switching environments.
REPO_ROOT="$REPO_ROOT" python - <<'PY'
import os
import sys
from pathlib import Path

repo_root = Path(os.environ["REPO_ROOT"]).resolve()
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", os.environ.get("DJANGO_SETTINGS_MODULE", "backend.config.settings"))

from django.conf import settings  # noqa: E402

db = settings.DATABASES["default"]
engine = db.get("ENGINE", "")
if engine.endswith("sqlite3"):
    print(f"Using database: sqlite ({db.get('NAME')})")
else:
    host = db.get("HOST", "")
    name = db.get("NAME", "")
    print(f"Using database: postgres ({host}/{name})")
PY

# Run migrations unless explicitly skipped.
if [[ "${SKIP_MIGRATE:-0}" != "1" ]]; then
  python "$PROJECT_ROOT/manage.py" migrate
fi

# Start the frontend static server (served from /frontent) by default.
# Django also serves the built/static files; this helper keeps 5173 available for local dev.
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
AUTO_FRONTEND_PORT="${AUTO_FRONTEND_PORT:-1}"
if [[ "${START_FRONTEND:-1}" == "1" ]]; then
  if FRONTEND_DIR="$(resolve_frontend_dir)"; then
    FRONTEND_BIND_PORT="$FRONTEND_PORT"
    if [[ "$(is_port_in_use "$FRONTEND_BIND_PORT")" == "1" ]]; then
      if [[ "$AUTO_FRONTEND_PORT" == "1" ]]; then
        if ALT_PORT="$(find_available_port "$((FRONTEND_BIND_PORT + 1))")"; then
          FRONTEND_BIND_PORT="$ALT_PORT"
          echo "Frontend port ${FRONTEND_PORT} is in use; starting frontend on http://127.0.0.1:${FRONTEND_BIND_PORT}"
        else
          echo "Frontend port ${FRONTEND_PORT} is in use and no alternate port found; continuing with backend only."
          unset FRONTEND_PID
        fi
      else
        echo "Frontend port ${FRONTEND_PORT} is in use; skipping frontend server (set AUTO_FRONTEND_PORT=1 to auto-pick)."
        unset FRONTEND_PID
      fi
    fi

    if [[ -z "${FRONTEND_PID:-}" ]]; then
      if [[ "$(is_port_in_use "$FRONTEND_BIND_PORT")" == "0" ]]; then
        echo "Starting frontend dev server from $FRONTEND_DIR on http://127.0.0.1:${FRONTEND_BIND_PORT}"
        (cd "$FRONTEND_DIR" && python -m http.server "${FRONTEND_BIND_PORT}" --bind 127.0.0.1) &
        FRONTEND_PID=$!
        sleep 1
        if ! kill -0 "${FRONTEND_PID:-0}" 2>/dev/null; then
          echo "Frontend server failed to start; continuing with backend only."
          unset FRONTEND_PID
        fi
      fi
    fi
  else
    echo "Frontend directory with index.html not found at $REPO_ROOT/frontent or $REPO_ROOT/frontend; skipping frontend server."
  fi
fi

cleanup() {
  echo "Shutting down servers..."
  [[ -n "${FRONTEND_PID:-}" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

# Start Django in the foreground so logs stay visible; bind address/port configurable.
BIND_ADDR="${BIND_ADDR:-127.0.0.1}"
PORT="${PORT:-8000}"
RUNSERVER_ARGS="${RUNSERVER_ARGS:---noreload}"
echo "Starting Django at http://${BIND_ADDR}:${PORT}"
exec python "$PROJECT_ROOT/manage.py" runserver "${BIND_ADDR}:${PORT}" $RUNSERVER_ARGS
