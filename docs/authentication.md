# Authentication

## Base URLs

| Service | Value |
|---|---|
| Core API (this package's default) | `https://watch-oz.okii.com` |
| Core API (shared/`xtc` variant) | `https://watch.okii.com` |
| SSO / login (`/app/*`) | `https://account.okii.com` (intl mirror: `account-oz.okii.com`) |

The global (imoo) build defaults to the international mirror.
`AppUtil.getAddrApp()` selects `ImooAddrApp` when the APK type is `imoo` (true
for `com.imoo.watch.global`), and `ImooAddrApp.getFormalDefault()` returns
`https://watch-oz.okii.com`; `DomainManager.serverUrl` is initialised from that
value at class-init. The `xtc`/`okii` variant (`XtcAndOkiiAddrApp`) reads
`HttpConstants$DefaultAppAddress.FORMAL_DEFAULT` instead.

`api.watch.okii.com` is not the core base: it only appears as
`HttpConstants.HOST_NAME_ARRAYS[1]` (a host lookup table), while
`HOST_NAME_ARRAYS[0]` is `watch.okii.com`.

**Login endpoints do not run on the core host.** `/app/*` lives on
`account.okii.com`. `com.bbk.secureunisignon.common.request.Gabon` holds the
default `account.okii.com` and the mirror `account-oz.okii.com`; the active host
is set from `DomainManager.getSsoAddr()` via `RequestParamsFactory.setServerIp`.
See `docs/signing-and-crypto.md`.


## Login Methods

| Method | Endpoints | Notes |
|---|---|---|
| SMS OTP | `POST /app/sendRandCodeV2` → `POST /app/randcodeLogin` | Easiest; no password needed |
| Password | `GET /app/rsakey` → `POST /app/login2` | Password must be RSA-encrypted |
| Token resume | `POST /app/tokenLogin` | Reuse an existing session token |
| QR code | `POST /app/qrcode` → `POST /app/qrcode/scan` → `GET /app/qrcode/token` | Scan from another device |
| One-click | `POST /app/oneClick/login` / `POST /app/oneClick/loginV2` | Chinese carrier SSO |
| Third-party | `POST /app/third/login` | Social account binding |

## Recommended Flow — SMS OTP

Every `/app/*` call is signed, and every call with a payload is AES-encrypted
(see `docs/signing-and-crypto.md` for the exact algorithm and secrets).

### Step 1: Request OTP

```http
POST https://account.okii.com/app/sendRandCodeV2
Content-Type: application/x-www-form-urlencoded
Charset: utf-8
EncryptType: 1
EncryptKey: <base64 RSA(aesKey)>

<base64 AES-ECB-PKCS5({"mobilePhone":"13612345678","areaCode":"86","appId":"11","mac":"…","timestamp":"2026-10-21 15:49:29","sign":"…"})>
```

`areaCode` is the numeric country code without `+`. Use `/app/areaCodeList`
(POST, same envelope) to look up codes.

### Step 2: Submit OTP

```http
POST https://account.okii.com/app/randcodeLogin
```

Same envelope, params:

```json
{
  "mobilePhone": "13612345678",
  "areaCode": "86",
  "randcode": "123456"
}
```

## Password Flow

Passwords are sent RSA-encrypted to avoid plaintext over the wire.

### Step 1: Fetch RSA public key

```http
POST https://account.okii.com/app/rsakey
```

Signed but not encrypted; body is the plain `k=v&k=v` string. The response is
`{"code":"000001","desc":"success","data":"<base64 X.509 SPKI>"}` — a
1024-bit RSA key.

### Step 2: Login

```http
POST https://account.okii.com/app/login2
```

Encrypted envelope, params:

```json
{
  "mobilePhone": "13612345678",
  "areaCode": "86",
  "password": "<RSA-encrypted password>"
}
```

## Session Token

A successful login returns a session token. The token payload (possibly Base64-encoded) has this shape:

```json
{
  "accountId": "84686",
  "appId": "11",
  "loginName": "136***906",
  "userName": "U10084686",
  "email": "",
  "mobilePhone": "86-136***906",
  "timestamp": "2019-05-07",
  "maxAge": -1,
  "ip": "",
  "sign": "67ed04612abbce5234069a5879f1d779",
  "deviceId": "02:00:00:00:00:00"
}
```

Key fields:
- `accountId` — numeric guardian account ID
- `appId` — always `"11"` for the imoo Watch app
- `sign` — MD5 hash used for request signing
- `maxAge: -1` — session does not expire automatically

## Using the Token

There is **no `Authorization` header** and no `token` header. The session token
is a JSON field named `token` inside `BaseRequestParam`, which travels in the
`Base-Request-Param` header (encrypted when the build enables request
encryption). Verified in `base.apk` with jadx 0.7.1:

| Path | Evidence | Where the token goes |
|---|---|---|
| Native (OkHttp) | `com.xtc.http.okhttp.Greece.Hawaii` | `com.xtc.http.Germany.Hawaii(String, AccountInfo)` builds `BaseRequestParam` and calls `setToken(accountInfo.getToken())`; the serialized JSON is sent as `Base-Request-Param`. |
| H5 / WebView | `com.xtc.h5.Gambia.Ukraine` | Same header map: `authId`, `program`, `Base-Request-Param`, `Eebbk-Sign`, `Version`, `Content-Encoding`, `Host`, `Grey`, `Eebbk-Key`, `encrypted`. |
| SSO / login | `com.bbk.secureunisignon.common.net.Georgia.Uganda` | `HttpURLConnection` headers: Content-Type, `DEVICE_NAME`, `SSO_CHARSET`, `SSO_ENCRYPT_TYPE`, `SSO_ENCRYPT_KEY`, Host, `BRAND`, `Accept-Language`, `DATA_CENTER_CODE`, `APP_GLOBE_ZONE_TIME`, `APK_TYPE`, `version`, `NDeviceId`, `SIGNATURE`, `timestamp` — no token. |

So an authenticated call carries:

```http
authId: <numeric auth id>
Base-Request-Param: <JSON or encrypted JSON containing "token": "<session token>">
Eebbk-Sign: <request signature>
```

`BaseRequestParam` fields (from the class itself): `accountId`, `appId`,
`deviceId`, `imFlag`, `mac`, `machineId`, `nDeviceId`, `program`, `registId`,
`timestamp`, `token`.

One special case: `com.xtc.http.Germany.Hawaii` sends an empty token for URLs
containing `/rsa` (the RSA public-key fetch must be unauthenticated).

## Checking Login State

```http
GET /app/verifyToken
GET /app/checkAccount
GET /mobileinit/authid
```

## Account Utilities

| Action | Endpoint |
|---|---|
| List available area codes | `POST /app/areaCodeList` |
| Check login modes supported | `POST /app/login/modes` |
| Verify password strength | `POST /app/verifyWeakPassword` |
| Check password set | `GET /app/passwordStatus` |
| Reset password | `POST /app/resetPassword` |
| Logout | `POST /app/logout` |

## Member vs. Admin — API Access After Login

After login you hold a `mobileaccount` token. The admin/member distinction is enforced server-side per endpoint, not in the token itself. As a **member** these read endpoints should be accessible:

| Endpoint | Description |
|---|---|
| `GET /smartwatch/mobilewatch` | Watches linked to this account |
| `GET /mobilewatch/watch/{watchId}` | Watch details |
| `GET /location/{watchId}` | Current location |
| `GET /smartwatch/notice/hasnew` | Pending notifications |
| `GET /mobileaccount` | Your own mobile account info |
| `GET /mobileaccount/id/{mobileId}` | Mobile account by ID |

Write/settings endpoints will return a permission error for non-admin accounts.
