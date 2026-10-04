#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")/.."

python3 -m json.tool metadata.json > /dev/null
bash -n install.sh tools/check.sh tests/backend.sh tests/gjs-backend.sh
make check
printf 'Native backend, schema, metadata, JavaScript, preferences, installer, and shell checks passed.\n'
