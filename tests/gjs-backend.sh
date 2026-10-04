#!/bin/sh
set -eu
runtime=$(mktemp -d)
trap 'rm -rf "$runtime"' EXIT HUP INT TERM
XDG_RUNTIME_DIR="$runtime" gjs -m tests/backend.js
