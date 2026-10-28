#!/usr/bin/env sh
# OneGate Learning Lab launcher (Linux / macOS).
# Requires Python 3.8+. No pip installs, no Node.
set -eu
cd "$(dirname "$0")"

if command -v python3 >/dev/null 2>&1; then
  exec python3 start.py "$@"
elif command -v python >/dev/null 2>&1; then
  exec python start.py "$@"
else
  echo "Python 3 was not found on PATH." >&2
  echo "Install Python 3 from https://www.python.org/downloads/ and run this script again." >&2
  exit 1
fi
