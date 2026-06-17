#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18+ is required. Install Node.js first: https://nodejs.org/" >&2
  exit 1
fi

node src/scripts/setup.js "$@"
