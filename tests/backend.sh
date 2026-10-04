#!/bin/sh
set -eu
runtime=$(mktemp -d)
trap 'rm -rf "$runtime"' EXIT HUP INT TERM
export XDG_RUNTIME_DIR="$runtime"
LD_PRELOAD="$PWD/build/libtouchpad-sensitivity.so" build/tests/gnome-shell
LD_PRELOAD="$PWD/build/libtouchpad-sensitivity.so" build/tests/other-process unchanged
