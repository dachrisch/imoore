# AGENTS.md — tools/

Static and dynamic reverse-engineering helpers. They produce evidence for
`openapi.yaml` and `docs/`; they are not application code, and this directory has
no build/test/lint config.

## Prerequisites and safety

- `inspect-native.sh` needs binutils only (`file`, `readelf`, `nm`, `strings`,
  `objdump` or `llvm-objdump`). No device, no network.
- Device scripts need `adb` (USB debugging enabled, device authorized) and
  `unzip`. Frida scripts need a **rooted** device, a `frida-server` whose
  major.minor matches the host Frida, and `frida-tools` on the host.
- These scripts touch a real phone and a live third-party service. Never commit
  pulled APKs, extracted `.so` files, `paths.txt`, device ids, tokens or captured
  secrets. `native/` is gitignored generated output — re-create it, do not
  hand-edit or track it.

## Scripts

- `pull-native.sh [outdir]` — outdir defaults to `native/`; package defaults to
  `com.imoo.watch.global` (override with `IMOORE_PKG`). Runs `adb shell pm path`,
  pulls every split, extracts `lib/*` from each APK and lists found `.so` files.
  Next step: `inspect-native.sh <path to librubbish.so>`.
- `inspect-native.sh <lib.so>` — first-pass triage: ELF identity and sections,
  JNI entry points, imported crypto/codec symbols, literal cipher names,
  candidate secrets/keys, and disassembler availability. Candidates are leads,
  not proof — confirm before asserting a secret or transform in docs.
- `frida/dump_crypto.js` — runtime capture of the per-appId sign secret, MD5
  preimage, AES/RSA transforms and keys, and the server RSA public key:
  `frida -U -f com.imoo.watch.global -l dump_crypto.js`, then trigger a login in
  the app. Output is tagged `[imoore]`. Requires root; see
  [`../docs/auth-protocol.md`](../docs/auth-protocol.md).

The captcha-bridge helpers live in
[`../prototype/tools/README.md`](../prototype/tools/README.md), not here.

## Where findings go

Recovered facts belong in `docs/signing-and-crypto.md`,
`docs/authentication.md` and `docs/auth-protocol.md` (linked from the root
[AGENTS.md](../AGENTS.md)), not in this folder.
