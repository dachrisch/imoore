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

<base64 AES-ECB-PKCS5({"userName":"13612345678","areaCode":"86","language":"en","codeType":"0","appId":"11","mac":"…","timestamp":"2026-10-21 15:49:29","sign":"…"})>
```

Wire param names come from `Gabon.Venezuela`, called by
`com.bbk.secureunisignon.common.net.biz.Hawaii.HongKong` and
`SSONetServiceImpl.K4`:

| param | notes |
|---|---|
| `userName` | the mobile number — **not** `mobilePhone`; the server errors `000002` without it |
| `areaCode` | numeric country code without `+` |
| `language` | app locale, e.g. `en` |
| `codeType` | int in the APK, sent as its decimal string; `0` from the login screen |
| `captchaId`, `validate`, `userKey` | optional, empty for plain SMS |
| `appId`, `mac`, `timestamp`, `sign` | common envelope params |

`data` in a success response is the **randcodeKey**; `randcodeLogin` must echo
it back. (The client treats it as opaque; the app forwards the same string.)

`areaCode` lookup uses `/app/areaCodeList` (POST, same envelope).

### Step 2: Submit OTP

```http
POST https://account.okii.com/app/randcodeLogin
```

Same envelope, params from `Gabon.Portugal` (via `Germany.D5` →
`Hawaii.Panama`):

```json
{
  "deviceId": "<32-hex device id>",
  "userName": "13612345678",
  "areaCode": "86",
  "randcodeKey": "<data from sendRandCodeV2>",
  "randcode": "123456",
  "nDeviceId": "<32-hex device id>",
  "days": "-1"
}
```

`days = "-1"` is what the app passes (no expiry). The login screen calls this
with `userName`/`areaCode`/`randcode`/`randcodeKey`; `deviceId` and `nDeviceId`
come from `DeviceDataTool`.

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

A successful `randcodeLogin` returns `{"code":"000001","desc":"success","data":"<json string>"}`.
`data` is a **JSON string**, not an object; the app parses it as
`SSOLoginResult` and then stores the *raw string* as the ticket:

- `Germany$Ireland` (randcodeLogin callback): `SSOLoginResult gson(data)` then
  `setTicket(data)` — the ticket is the whole `data` string.
- `com.xtc.account.service.Gibraltar.Gabon(SSOLoginResult)`:
  `MobileAccount.token = result.getTicket()` and
  `authId = parseInt(result.getAccountId())`.

So the session token sent on later calls is exactly the `data` string, and
`authId` is `accountId` from inside it. The payload has this shape:

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
- `sign` — value returned inside the login result; the per-request `sign` is
  computed from the appId secret (`docs/signing-and-crypto.md`), not from this
  field
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
