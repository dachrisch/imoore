# imoo Watch API — request signing & encryption (reverse-engineered)

Verified by analyzing `base.apk` (12 DEX files) with `androguard`. The auth/network
layer is the **`com.bbk.secureunisignon`** SDK (BBK = imoo's parent). Plain JSON does
not work — every request is signed and the body is AES-encrypted. This is what the
prototype must replicate to get past `{"code":"000007","desc":"request parameter is invalid."}`.

> Base host is `https://watch.okii.com` (NOT `api.watch.okii.com` — see `AGENTS.md`).

## 1. Common params (added to every request body map)

| param | value | source |
|---|---|---|
| `mac` | `64ba24f2457d405dbf40346f96d80934` | hard-coded constant in `RequestParamsFactory.addcommonParams` |
| `timestamp` | epoch millis (from `utils.Hawaii.Jamaica()`) | current time |
| `appId` | per-app integer (see §3) | app config |
| `sign` | see §2 | computed |

(plus the endpoint's own params, e.g. `mobilePhone`, `areaCode`, `randcode`)

## 2. The signature (`preMd5`)

In `com/bbk/secureunisignon/common/request/Gabon.Iran(String url, Map params)`:

1. Serialize the param map as `key=value` pairs.
2. Sort the pairs **case-insensitively by key**.
3. Join with `##`: `k1=v1##k2=v2##…`.
4. Prepend the request **path** (e.g. `/app/sendRandCodeV2`): `signInput = url + joined`.
5. Append the app **secret**: `signInput += secret`.
6. `sign = md5(signInput).hexdigest().toLowerCase()` — confirmed `MessageDigest("MD5")` → hex.

```
sign = md5( path + "k=v##k=v##…" + secret ).lower()
```

## 3. The secret (appId-dependent, OBFUSCATED — and NATIVE)

`Iran` picks the secret from `com.xtc.secret.Georgia` by `appId` value:
`31→Uganda`, `33→Venezuela`, `35→Greece`, `37→Guinea`, `48→Venezuela`, else→`Ukraine`.

These return strings that are produced by **`native` methods** in
`com.xtc.secret.XTCgetUtilWrapper` — `getDebugg()/getI()/getJ()/...` and the
`codea/codeb/codec/decodea/decodeb` ciphers are all `public static native`,
loaded via `System.loadLibrary("rubbish")` (i.e. `librubbish.so`).

**`librubbish.so` is NOT present in the APK we have** (only frida libs were added
during repackaging). It is almost certainly **downloaded at runtime** from a CDN.
So there is no plain-text constant and no DEX-resident byte array to replicate —
obtaining the secret requires either the native `.so` (fetched + reversed) or a
live, hooked run.

> **Conclusion (2026-08-28):** extracting the literal secret is a rabbit hole.
> The frida-gadget repackage native-crashes the app on launch (the native lib runs
> anti-tamper / `/proc/self/maps` frida checks and `abort()`s), and the lib isn't
> even in the APK. The prototype therefore takes the secret as a manual input
> (`IMOORE_SIGN_SECRET`); see §6.

## 4. Body encryption (every request)

In `com/bbk/secureunisignon/common/net/Georgia`:
1. `data = JSON.stringify(paramMap)` (via `utils.Uruguay.Germany`).
2. `aesKey = random 16-char string` (via `utils.Gabon.Hawaii(16)`).
3. `EncryptKey = RSA_encrypt(aesKey, serverRsaPublicKey)` — the server public key is
   fetched from `GET /app/rsakey` and cached (`Georgia.Gabon` sp field); `secret.Georgia.Georgia(aesKey, pubKey)`.
4. `body = AES_encrypt(data, aesKey)` — `secret.Georgia.Gabon(data, aesKey)`; sent as POST body.
5. Response is `AES_decrypt(body, aesKey)` (`secret.Georgia.Germany`).

The AES/RSA `Cipher` transforms are implemented by the **native** methods
`XTCgetUtilWrapper.codea/codeb/codec/decodea/decodeb` (see §3) — there are no
Java constants for the mode/padding, so the exact transform (e.g.
`AES/ECB/PKCS5Padding`, `RSA/ECB/PKCS1Padding`) lives in `librubbish.so` and must
be confirmed by reversing that native lib.

## 5. Request headers (`initConnection`)

`Content-Type: text/plain;charset=UTF-8`, `Charset: utf-8`, `EncryptType: 1`,
`EncryptKey: <RSA(aesKey)>`, `Host`, `Device-Name` (URLEncoder of `BRAND-MODEL`),
`App-Brand`, `Accept-Language`, `dataCenterCode`, `APPGlobeZoneTime`, `ApkType`,
`version`, `nDeviceId`, `App-Checksum` (`md5(currentDate).lower()`), `timestamp`.

## Device / dynamic analysis (USB-connected phone)

Verified on a live device `2C211FDH3000JA` running `com.imoo.watch.global`
(arm64-v8a). The device is **not rooted** and the app is **not debuggable**
(`ro.debuggable=0`, no `run-as`), which rules out Frida-server/attach and
`run-as` without first rooting or repackaging with frida-gadget.

- `LogUtil` (`com.xtc.log.LogUtil`) delegates to `com.xtc.log.ILogger`; the
  concrete backend is **Tencent Mars XLog** (`instanceof com.tencent.mars.xlog.IXlog`),
  reached through the **elvishew/XLog** Java wrapper. So the chatty crypto logs
  (`preMd5`, `AES的Key值：`, `RSA加密后AES的Key值`, `发送给服务器的内容为:加密前的data` /
  `加密后的data`, tag `HttpComponent` / `SSO`) do **not** go to logcat — they are
  written to an XLog file on disk.
- Log file location (readable via `adb pull` — the shell can read
  `/sdcard/Android/data/com.imoo.watch.global/` on this device):
  `files/xtcdata/imoo/logsDir/watch/ImooWatch_YYYYMMDD.xlog` (+ sibling `.mmap3`
  index files). They are ~3 MB and **Mars binary / encrypted** — no plaintext and
  no zlib/lzma at the head. Decoding needs the Mars RSA **private** key
  (`appenderOpen` is invoked from a native lib, not DEX, so the key is not
  recoverable from the APK). `adb pull` of the file alone is therefore not enough.
- Console (logcat) output is gated: `LogUtil` calls are suppressed on logcat while
  file logging is on. The switch exists (`setConsoleLogOpen`, `setLogSwitch`,
  `LogSwitch` bean `AppConfigInfo$LogSwitch`, `debugLogOpen`/`isDebugLogOpen`) but
  the debug UI (`com.xtc.settings.debug.DebugMainActivity`,
  `com.xtc.settings.log.LogUploadActivity`) is **not exported**, so it cannot be
  opened with `am start` — enabling it requires navigating the in-app UI or root.

### How to actually extract the secret/transforms
1. **Decode the on-disk XLog** — needs the Mars RSA private key (ask BBK/imoo, or
   extract it if the app ships one). Then `adb pull` + decode the `.xlog`.
2. **Root + Frida** (most reliable): hook `com.xtc.secret.Georgia.Ukraine()`
   (and siblings) for the per-appId `secret`; hook `javax.crypto.Cipher` /
   `MessageDigest` for the AES/RSA transforms; hook `XTCgetUtilWrapper.codea/codeb`.
   *Practical blocker (2026-08-28):* the app **cannot be rooted** on this S7
   (bootloader rejects custom BOOT even with OEM unlock ON), and the no-root
   **frida-gadget repackage native-crashes the app on launch** — `librubbish.so`
   runs anti-tamper that aborts when it sees frida in `/proc/self/maps`. The
   gadget *did* load once (port 27042 listened, `frida-ps` connected) but the
   process then dies; subsequent launches crash immediately. With no root, the
   tombstone can't be read to debug it.
3. **Enable console logging in-app**, then `adb logcat -b all` during a real login
   — the `preMd5` / `AES的Key` lines print in plaintext. Requires reaching the
   hidden debug toggle in the app UI (not exported, so must be tapped).

> **The native lib is not in the APK.** `librubbish.so` is loaded at runtime, so
> even static DEX analysis can't reach the secrets or transforms — they require
> fetching + reversing that `.so`. Considered a rabbit hole for this project.

## 6. Status & prototype usage

Full automation is **not achievable** without the literal secret (and, to encrypt
the body, the native AES/RSA transforms + the gated server public key). The
prototype (`prototype/src/imooClient.js`) implements everything that *is*
knowable from the DEX and takes the unknowns as inputs:

| Input | Env var | Notes |
|---|---|---|
| sign secret | `IMOORE_SIGN_SECRET` | the one piece that can't be derived; supply per appId |
| appId | `IMOORE_APP_ID` | default `11` |
| AES transform | `IMOORE_AES_ALGO` | default `aes-128-ecb` (unconfirmed) |
| RSA padding | `IMOORE_RSA_PADDING` | default `pkcs1` (unconfirmed) |
| RSA pubkey | fetched at runtime | **gated**: `GET /app/rsakey` returns `000007` without proper (signed) params, so a valid sign is needed first → circular; supply manually if required |

`/app/rsakey` is **not** a free GET — it returns
`{"code":"000007","desc":"request parameter is invalid."}` without the common
params/sign, confirming the pubkey is itself behind the auth gate.

## Remaining unknowns to fully automate login
- the per-appId `secret` literal (native `librubbish.so`; rabbit hole — see §3)
- exact AES `Cipher` transform + IV, and RSA padding (native `librubbish.so`)
- the server public-key wire format from `/app/rsakey` (and how to call it unsigned)
- the app's `appId` integer
- (device) rooting this S7 is impossible; no-root frida is blocked by native anti-tamper
