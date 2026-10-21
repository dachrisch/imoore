# 2026-08-28 — imoo sign secret extraction (concluded: rabbit hole)

## Problem
The imoo login prototype (`prototype/src/imooClient.js`) needs the per-appId
sign `secret` and the native AES/RSA transforms to produce a valid request.
Goal was to extract these at runtime via Frida on a USB-connected S7.

## What was attempted
1. **Root + Magisk** — impossible on this S7: bootloader accepts custom
   RECOVERY (TWRP) but rejects custom BOOT ("Verification failed") even with
   OEM unlock ON. Verified-boot on BOOT is enforced. Dropped.
2. **No-root frida-gadget (wrap.sh)** — repackaged `base.apk` with
   `libfrida-gadget.so` + `wrap.sh` (`LD_PRELOAD`) + `android:debuggable=true`.
   - Gadget loaded **once** (logcat `Frida : Listening on 0.0.0.0 TCP port 27042`;
     `frida-ps -H 127.0.0.1:27042` showed pid "Gadget"; `-n Gadget` attached).
   - On subsequent launches the app **native-crashes immediately** (tombstones,
     `crash_dump: Operation not permitted`). No root → can't read tombstone.
3. **Static DEX analysis** — found `com/xtc/secret/Georgia` + `XTCgetUtilWrapper`.
   Decisive finding: **all secret/crypto functions are `native`** in
   `librubbish.so` (`System.loadLibrary("rubbish")`). `librubbish.so` is **not in
   the APK** (downloaded at runtime). So DEX analysis cannot reach the secret.

## Root cause of the crash (high confidence)
`librubbish.so` runs anti-tamper / `/proc/self/maps` frida checks and `abort()`s
when it sees the injected gadget. Hence the native crash, and why the once-working
launch was a fluke (check fires later / intermittently).

## Conclusion
Extracting the literal secret (and the native AES/RSA transforms + gated server
pubkey) is a **rabbit hole**: native lib not in APK, anti-tamper blocks frida,
device can't be rooted. Abandoned runtime/static extraction.

## Files changed
- `docs/auth-protocol.md` — recorded native-lib finding, frida crash, gated
  `/app/rsakey` (returns `000007`), and §6 status + manual-input usage table.
- `prototype/src/imooClient.js` — added `IMOORE_RSA_PUBKEY` manual override and
  corrected the gated-pubkey comment. Syntax-checked OK (`node --check`).

## Verification
- `GET https://watch.okii.com/app/rsakey` → `{"code":"000007","desc":"request
  parameter is invalid."}` (gated, not a free GET).
- `node --check prototype/src/imooClient.js` → OK.

## Known issues / future
- The only missing literal is `IMOORE_SIGN_SECRET` (per appId). Supply manually
  once known; everything else in the scheme is implemented.
- If the secret is ever needed: fetch + reverse `librubbish.so` (wherever the app
  downloads it), or hook it on a rootable device / emulator.
- RSA pubkey also gated behind signing → may need manual `IMOORE_RSA_PUBKEY`.
