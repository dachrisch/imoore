#!/usr/bin/env bash
# Pull the installed imoo Watch splits (incl. the ABI split with librubbish.so)
# and extract every native library. No root required: /data/app split paths are
# readable through adb on a normal device.
#
#   tools/pull-native.sh [outdir]
#
# Requires: adb, unzip. USB debugging enabled and the device authorized.
set -euo pipefail

PKG="${IMOORE_PKG:-com.imoo.watch.global}"
OUT="${1:-native}"

mkdir -p "$OUT"

if ! adb get-state >/dev/null 2>&1; then
  echo "no device: connect the phone with USB debugging on (adb devices should list it)" >&2
  exit 1
fi

echo "== paths =="
adb shell pm path "$PKG" | tr -d '\r' | tee "$OUT/paths.txt"
echo

echo "== pulling =="
while IFS= read -r line; do
  p="${line#package:}"
  [ -n "$p" ] || continue
  adb pull "$p" "$OUT/" >/dev/null
  echo "  $p"
done < "$OUT/paths.txt"

echo
echo "== extracting libs =="
shopt -s nullglob
for apk in "$OUT"/*.apk; do
  name="$(basename "$apk" .apk)"
  mkdir -p "$OUT/$name"
  unzip -o -q "$apk" 'lib/*' -d "$OUT/$name" 2>/dev/null || true
done

echo
echo "== native libraries =="
find "$OUT" -name '*.so' -printf '%10s  %p\n' | sort -k2 || true
echo
echo "next: tools/inspect-native.sh <path to librubbish.so>"
