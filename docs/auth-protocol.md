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

## 3. The secret (appId-dependent, OBFUSCATED)

`Iran` picks the secret from `com.xtc.secret.Georgia` by `appId` value:
`31→Uganda`, `33→Venezuela`, `35→Greece`, `37→Guinea`, `48→Venezuela`, else→`Ukraine`.
These return strings that are **decrypted at runtime** from byte arrays via
`XTCgetUtilWrapper.codeb(bytes, key)` — no plain-text constant in the DEX.
→ The literal secret must be obtained by replicating `codeb` or via dynamic analysis (Frida).

## 4. Body encryption (every request)

In `com/bbk/secureunisignon/common/net/Georgia`:
1. `data = JSON.stringify(paramMap)` (via `utils.Uruguay.Germany`).
2. `aesKey = random 16-char string` (via `utils.Gabon.Hawaii(16)`).
3. `EncryptKey = RSA_encrypt(aesKey, serverRsaPublicKey)` — the server public key is
   fetched from `GET /app/rsakey` and cached (`Georgia.Gabon` sp field); `secret.Georgia.Georgia(aesKey, pubKey)`.
4. `body = AES_encrypt(data, aesKey)` — `secret.Georgia.Gabon(data, aesKey)`; sent as POST body.
5. Response is `AES_decrypt(body, aesKey)` (`secret.Georgia.Germany`).

The AES/RSA `Cipher` transforms carry **no string constants** in the DEX (obfuscated),
so the exact mode/padding (e.g. `AES/ECB/PKCS5Padding`, `RSA/ECB/PKCS1Padding`) must be
confirmed by replicating `XTCgetUtilWrapper.codea`/`codeb` or dynamic tracing.

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
3. **Enable console logging in-app**, then `adb logcat -b all` during a real login
   — the `preMd5` / `AES的Key` lines print in plaintext. Requires reaching the
   hidden debug toggle in the app UI (not exported, so must be tapped).

## Remaining unknowns to fully automate login
- exact AES `Cipher` transform + IV, and RSA padding
- the server public-key wire format from `/app/rsakey`
- the per-appId `secret` literal (obfuscated; see "How to actually extract" above)
- the app's `appId` integer
- (device) whether the Mars XLog is encrypted and where the decode key lives
