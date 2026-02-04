#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -f "$PROJECT_ROOT/venv/bin/activate" ]]; then
  # Activate the local virtualenv if it exists.
  source "$PROJECT_ROOT/venv/bin/activate"
else
  echo "venv not found at $PROJECT_ROOT/venv. Activate your environment before running."
  exit 1
fi

# Use the default settings module unless the caller overrides it.
export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-backend.config.settings}"

# Run migrations unless explicitly skipped.
if [[ "${SKIP_MIGRATE:-0}" != "1" ]]; then
  python "$PROJECT_ROOT/manage.py" migrate
fi

python "$PROJECT_ROOT/manage.py" runserver 0.0.0.0:8000
