# Signing & Crypto

Everything here was recovered from the shipped artifacts (`base.apk` +
`split_config.arm64_v8a.apk` → `lib/arm64-v8a/librubbish.so`) and then verified
against the live SSO endpoint. No device instrumentation was needed.

## TL;DR

```
sign        = md5( url + "k1=v1##k2=v2" + secret ).toLowerCase()
              (keys sorted case-insensitively, url includes scheme + host)
body        = base64( AES-128-ECB/PKCS5( JSON(params) , aesKey ) )
EncryptKey  = base64( RSA-1024-PKCS1v1.5( aesKey , server_pubkey ) )
response    = base64( AES-128-ECB/PKCS5( json , aesKey ) )
aesKey      = 16 random ASCII chars, per request
```

`POST https://account.okii.com/app/<endpoint>` with
`Content-Type: application/x-www-form-urlencoded`, `Charset: utf-8`,
`EncryptType: 1`, `EncryptKey: <above>`, `Host: account.okii.com`.

`/app/rsakey` is itself signed but **not** encrypted: the body is the plain
`k=v&k=v` string and the response is JSON with `data` = base64 X.509 SPKI.

## Signing

`com.bbk.secureunisignon.common.request.Gabon.Iran(String url, Map params)`:

1. `String[] kv = params.map { "$k=$v" }`
2. `Arrays.sort(kv, String.CASE_INSENSITIVE_ORDER)`
3. `sb = url` ; `sb += kv.join("##")` — note: **no** separator between `url`
   and the first pair.
4. `sb += secret`
5. `md5(sb).toUpperCase()` in `com.xtc.watch.util.Uruguay.Gabon`, then
   `.toLowerCase(Locale.US)` in `Iran`.

`url` is the full request URL (`https://account.okii.com/app/...`), not the
path — the URL constants are built by `Gabon.Chad(prefix)` as
`prefix + host + path` and the same string is passed into `Iran`.

Common params added by `Gabon.Hawaii(hawaii, url, appId)`:

| param | value |
|---|---|
| `appId` | per-endpoint, default `11` for the imoo Watch build |
| `mac` | `com.bbk.secureunisignon.common.net.biz.Hawaii.Hawaii`, falling back to the constant `64ba24f2457d405dbf40346f96d80934` |
| `timestamp` | `SimpleDateFormat("yyyy-MM-dd kk:mm:ss")` — `kk` = 01..24, device local time |
| `sign` | the hash above |

## Secrets

Selected by `appId` in `Iran`; each is a native getter in `librubbish.so`
(`com.xtc.secret.Georgia.*`), registered dynamically from `JNI_OnLoad`.

| appId | secret | native | live check |
|---|---|---|---|
| 11 | `LKyF8jThHbZfUeTP` | `geta` → `get2` | ✅ `000001 success` |
| 31 | `CXy5qhZZ0qHkjvgh` | `getTeacherA` → `get9` | ✅ `000001 success` |
| 33 | `5sacCZns3z9sTcCX` | `geth` → `get12` | ✅ `000001 success` |
| 35 | `NQIiQkcCIGhfn2s9` | `getI` → `get13` | ✅ `000001 success` |
| 37 | `thqHjysVOkGETPoY` | `getJ` → `get14` | ✅ `000001 success` |
| 48 | `5sacCZns3z9sTcCX` (same as 33 per client code) | `geth` | ❌ server: `签名无效` — unresolved |

### How `get2`/`get9` are obfuscated

`get12`/`get13`/`get14` just load a 16-byte `.rodata` constant and return it
through `NewStringUTF`. `get2` (appId 11) and `get9` (appId 31) additionally
XOR with `keyXOR` (`.data:0x49028` = `{1,2,3,4,5}`) and rotate the string.

The rotation is a `std::reverse`-style sequence that the compiler split into
three loops — full reverse, then reverse `[0..3]`, then reverse `[4..n-1]` —
which composes to **rotate right by 4**. Miss this and you get a plausible but
wrong key (`FyKLPTeUfZbHhTj8`), which the server rejects.

* `get2`: XOR with `keyXOR[i % 5]` **then** rotate right 4.
* `get9`: rotate right 4 **then** XOR with `keyXOR[i % 5]`.

## Crypto

The five `XTCgetUtilWrapper` crypto natives are **trampolines**, not crypto code:
`code1/code2/code3/decode1/decode2` call
`CallStaticObjectMethod(clazz, "d/b/a/A1", e1|e2|pe|d1|d2, ...)`.

`d.b.a.A1.<clinit>` builds the algorithm strings by Base64-decoding index
arrays against the standard alphabet:

| field | decoded |
|---|---|
| `A` | `AES` |
| `B` | `RSA` |
| `C` | `AES/ECB/PKCS5Padding` |
| `D` | `RSA/ECB/PKCS1Padding` |

| wrapper | A1 method | meaning |
|---|---|---|
| `codea` | `e1` | AES encrypt String → Base64 |
| `codeb` | `e2` | AES encrypt byte[] → Base64 |
| `codec` | `pe` | RSA encrypt with public key (`gp` = X.509 SPKI) |
| `decodea` | `d1` | AES decrypt String → String |
| `decodeb` | `d2` | AES decrypt String → byte[] |

Key length is 16 bytes (`SecretKeySpec(key.getBytes("UTF-8"), "AES")`), no IV →
ECB. The server key is 1024-bit RSA.

## Hosts

| constant | value |
|---|---|
| `Gabon.Gabon` / `Gabon.Hawaii` (default SSO host) | `account.okii.com` |
| `Gabon.Gambia` (international mirror) | `account-oz.okii.com` |
| core API (`DomainManager.serverUrl`) | `https://watch-oz.okii.com` for this package |

`Gabon.Colombia(isOfficial, serverIp)` sets `Hawaii` then rebuilds every URL
with `Chad(prefix)`. `serverIp` comes from `DomainManager.getSsoAddr()`, which
`com.xtc.settings.appconfig.Germany.Gabon` fills from the remote domain
config's `SsoDomain`. Before that config arrives, the default is
`account.okii.com`.

## Verification

```
POST https://account.okii.com/app/rsakey   (signed, plain)
  → {"code":"000001","desc":"success","data":"MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQ..."}

POST https://account.okii.com/app/areaCodeList   (signed, AES+RSA)
  → base64 ciphertext → decrypts to
    {"code":"000001","desc":"success","data":"[{\"areaCode\":\"86\",...}]"}
```

The prototype (`prototype/src/imooClient.js`) implements exactly this and
fetches 176 area codes live.

## SSO request headers

`com.bbk.secureunisignon.common.net.Georgia.Uganda()`
(`RequestParamsFactory.initConnection`) sets them for every `/app/*` call:

| header | value / source |
|---|---|
| `Device-Name` | `URLEncoder.encode(Build.BRAND + "-" + Build.MODEL)` |
| `Charset` | `utf-8` |
| `EncryptType` / `EncryptKey` | `1` / `base64(RSA(aesKey))` when encrypted |
| `Host` | active account host |
| `App-Brand` | `imoo` for this package, `xtc` otherwise (`AppFunSupportUtil.isImoo`) |
| `Accept-Language` | `SystemLanguageUtil.getFinalLanguageValue()` (`Locale.toString()`, e.g. `en_US`) |
| `dataCenterCode` | `AccountUtil.getDataCenterCode()` — empty on a fresh install |
| `APPGlobeZoneTime` | `TimeZone.getDefault().getID()`, e.g. `Europe/Berlin` |
| `ApkType` | `AppFunSupportUtil.getApkType()` → `imoo` |
| `version` | `"A_" + VersionUtil.getVersionName(versionName())` → `A_9.36.71` |
| `nDeviceId` | `com.xtc.http.Gambia.Iceland()` (persisted device id) |
| `App-Checksum` | see below |
| `timestamp` | `String.valueOf(System.currentTimeMillis())` |

`App-Checksum` is the only non-obvious one. Java calls
`com.xtc.secret.Georgia.HongKong(String)`, which returns a cached value if set,
otherwise `XTCgetUtilWrapper.getf(String)`. In `librubbish.so`, `getf` is JNI
entry 5 → `get7` (0x100d8), which:

1. `getSignArray()`: `ActivityThread.currentApplication()` → `getPackageManager()`
   → `getPackageInfo(pkg, GET_SIGNATURES)` → `Signature[0].toByteArray()` →
   `CertificateFactory("X.509").generateCertificate(...)` →
   `Certificate.getEncoded()` (the signing certificate DER, 703 bytes here).
2. MD5s those bytes and hex-encodes them with the uppercase table at 0x2d130.
3. `strcat`s the millis argument and calls `get8`, which **SHA-256s** the
   resulting ASCII string (the `SHA256` literal at `.rodata` 0x2cb52), hex-encodes
   it, and returns it.
4. The Java caller lowercases the result.

For `base.apk` (signer `CN=xtc`, cert SHA-256 `f4f0…4979`) that derivation is

```
uppercase hex SHA-256( uppercase hex MD5(certDER) + decimal millis )
```

then lowercased. The prototype derives it with the **same millisecond value**
that goes into the `timestamp` header (the app uses one `Date` for both), via
`IMOORE_SSO_CERT_DER=/path/to/cert.der`.

**Live status (2026-10-21):** `POST /app/areaCodeList` and `GET /app/rsakey`
now accept this value — the earlier `010314 app校验码无效` was caused by using
MD5 for the outer digest instead of SHA-256. The SMS service still answers
`010106` for every number even with a valid `App-Checksum`, `A_9.36.80`, and
`dataCenterCode: DE_FRA` (see `docs/authentication.md`), so `App-Checksum` was
necessary but not sufficient for OTP delivery.

Consequence: `sendRandCodeV2` still answers `010106` for **every** number
(real +49, reserved US 555 / UK 7700 numbers, invalid 86 numbers) and for
`codeType` 0 (register), 2 and 3, on both account hosts, with and without the
valid checksum. That is an additional client risk/device check, not a
per-number or per-region SMS delivery problem, and it also blocks
self-registration (`/app/regist` needs an SMS `randcode`). The header stays
opt-in (`IMOORE_SSO_CERT_DER`), and the password path (`/app/loginV2`) is the
working login.

## Core API envelope (verified live)

The core API (`https://watch-oz.okii.com`) does **not** use the `/app/*` scheme.
It authenticates with a `Base-Request-Param` header plus `authId`, and encrypts
that header with a per-request key wrapped to a key fetched from `/rsa`.

```
GET /rsa   (unauthenticated, unsigned)
  → {"code":"000001","data":{"encSwitch":0,
                             "publicKey":"MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJB...",
                             "modulus":"0xBF,0x67,..."}}
```

`publicKey` is a 512-bit X.509 SPKI. `encSwitch` comes back `0`, and the app
honours it: `Germany.Ukraine()` is `(EncSwitch == 1) && !publicKey.isEmpty()`,
so on this deployment `Base-Request-Param` is the **plain JSON string** and the
`Eebbk-Key` / `encrypted` headers are omitted. Sending the encrypted form
anyway gets `000004 request parameter is invalid.`; with the plain form and a
real session token the same call reaches the business layer.

Headers, from `com.xtc.http.okhttp.Greece.Hawaii`:

| header | value |
|---|---|
| `program` | `android` |
| `Content-Type` | `application/json;charset=utf-8` |
| `Device-Name` | `BRAND-MODEL`, URL-encoded |
| `Version` | app version |
| `Accept-Language` | locale |
| `App-Brand` / `ApkType` | `imoo` |
| `Content-Encoding` | `gzip` (response decoding hint) |
| `App-Checksum` | md5 of the APK signing block (`Signature.toByteArray()`) |
| `Base-Request-Param` | plain JSON when `encSwitch = 0`; `base64(AES-128-ECB-PKCS5(json, key))` when `1` |
| `Eebbk-Key` | `base64(RSA-PKCS1(key, /rsa publicKey))` — only when `encSwitch = 1` |
| `encrypted` | `encrypted` |
| `Eebbk-Sign` | `md5(url + Base-Request-Param + body + key)` |
| `authId` | the account id |

`Base-Request-Param` fields (`com.xtc.http.bean.BaseRequestParam`, filled by
`com.xtc.http.Germany.Hawaii`):

```
accountId  appId("0")  deviceId  imFlag("1")  machineId  nDeviceId
program("android")  registId  timestamp("yyyy-MM-dd HH:mm:ss")  token
```

The response is gzip-compressed, AES-encrypted with the same per-request key,
base64-encoded and wrapped in a JSON string literal (`"<base64>"`); decode in
that order.

Live differential check (no account needed):

| request | response |
|---|---|
| no `Base-Request-Param` | `000007 request parameter is invalid.` |
| plain JSON `Base-Request-Param` + `Eebbk-Sign` | `100500 api gateway error` |
| encrypted BRP + `Eebbk-Key` + `Eebbk-Sign` | `000004 request parameter is invalid.` |

`000004` is the gateway-accepted state for an absent/expired token, i.e. the
envelope is correct and only the session is missing. At that stage a wrong
`Eebbk-Sign` value also returns `000004`, so the sign formula above comes from
the bytecode (`Germany.Uganda`), not from differential testing.


## Reproducing

```sh
tools/pull-native.sh                       # adb pull splits, extract lib/*
tools/inspect-native.sh <path>/librubbish.so
```

Static mapping aids:

- `JNI_OnLoad` (0xeebc) registers 18 natives with a `JNINativeMethod` table at
  `0x45a90` (18 × 24 bytes; names/signatures via `R_AARCH64_RELATIVE`,
  function pointers via `R_AARCH64_ABS64`).
- `JNI_OnLoad` also calls `ptrace(PTRACE_TRACEME)` and returns `-1` if it
  fails — that is the anti-debug behaviour, unrelated to the missing-library
  crash seen with the repackaged APK.
