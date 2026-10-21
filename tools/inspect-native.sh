#!/usr/bin/env bash
# First-pass static triage of librubbish.so (or any JNI crypto lib).
# Looks for the three things the client prototype still needs:
#   1. the per-appId sign secret
#   2. the AES transform / IV
#   3. the RSA padding
#
#   tools/inspect-native.sh native/.../librubbish.so
#
# Requires only binutils (file, readelf, nm, strings, objdump).
set -euo pipefail

SO="${1:?usage: inspect-native.sh <lib.so>}"
[ -f "$SO" ] || { echo "not a file: $SO" >&2; exit 1; }

echo "== identity =="
file "$SO"
readelf -h "$SO" | sed -n '1,12p'
echo

echo "== sections (packing / obfuscation hints) =="
readelf -SW "$SO" | awk 'NR>5 {printf "%-22s %8s %8s %s\n", $2, $6, $7, $8}' | head -30
echo

echo "== JNI entry points =="
readelf -sW --dyn-syms "$SO" 2>/dev/null \
  | awk '$4=="FUNC" && $8!="" {print $8}' \
  | grep -E '^(JNI_OnLoad|Java_)' | sort -u | head -40
echo

echo "== imported crypto / codec =="
readelf -sW --dyn-syms "$SO" 2>/dev/null \
  | awk '$7=="UND" && $8!="" {print $8}' \
  | grep -iE 'EVP_|AES|RSA|MD5|SHA|BIO_|PKCS|CRYPTO|base64|zlib|inflate' \
  | sort -u | head -60
echo

echo "== literal crypto names =="
strings -n 4 "$SO" | grep -iE 'aes-|aes_|rsa|ecb|cbc|ctr|gcm|pkcs|oaep|md5|sha1|sha-1|sha256|base64|utf-?8' \
  | sort -u | head -60
echo

echo "== candidate secrets / keys (16+ chars, token-ish) =="
strings -n 12 "$SO" \
  | grep -E '^[A-Za-z0-9+/=_.~-]{12,}$' \
  | grep -vE '^(lib|java|android|com/|org/|Ljava|Lcom)' \
  | sort -u | head -60
echo

echo "== 32-hex / base64 blobs =="
strings -n 16 "$SO" | grep -E '^[0-9a-fA-F]{16,}$' | sort -u | head -30
strings -n 16 "$SO" | grep -E '^[A-Za-z0-9+/]{20,}={0,2}$' | sort -u | head -30
echo

echo "== disassembler availability =="
if command -v llvm-objdump >/dev/null 2>&1 && llvm-objdump -d --no-show-raw-insn "$SO" >/dev/null 2>&1; then
  echo "ok: llvm-objdump can disassemble this file"
  echo "    e.g. llvm-objdump -d --no-show-raw-insn '$SO' | less"
elif objdump -d "$SO" >/dev/null 2>&1; then
  echo "ok: objdump can disassemble this file"
else
  echo "no working disassembler (install llvm or use Ghidra)"
fi
