# Authentication

## Base URLs

| Service | Value |
|---|---|
| Core API (this package's default) | `https://watch-oz.okii.com` |
| Core API (shared/`xtc` variant) | `https://watch.okii.com` |
| SSO / login (`/app/*`) | `https://account-oz.okii.com` for this package; `account.okii.com` for the China/`xtc` cluster |

The global (imoo) build defaults to the international mirror.
`AppUtil.getAddrApp()` selects `ImooAddrApp` when the APK type is `imoo` (true
for `com.imoo.watch.global`): `ImooAddrApp.getFormalDefault()` returns
`https://watch-oz.okii.com` and its account host is `https://account-oz.okii.com`.
`DomainManager.serverUrl` is initialised from the former at class-init.
The `xtc`/`okii` variant (`XtcAndOkiiAddrApp`) uses the plain hosts instead.

`api.watch.okii.com` is not the core base: it only appears as
`HttpConstants.HOST_NAME_ARRAYS[1]` (a host lookup table), while
`HOST_NAME_ARRAYS[0]` is `watch.okii.com`.

**Login endpoints do not run on the core host.** `/app/*` lives on the
account host (`account-oz.okii.com` for `com.imoo.watch.global`).
`com.bbk.secureunisignon.common.request.Gabon` holds both hosts; the active one
is set from `DomainManager.getSsoAddr()` via `RequestParamsFactory.setServerIp`.
See `docs/signing-and-crypto.md`.


## Login Methods

| Method | Endpoints | Notes |
|---|---|---|
| SMS OTP | `POST /app/sendRandCodeV2` → `POST /app/randcodeLogin` | Easiest; no password needed |
| Password | `POST /app/loginV2` | Password inside the AES envelope; fallback when SMS is unavailable |
| Token resume | `POST /app/tokenLogin` | Reuse an existing session token |
| QR code | `POST /app/qrcode/token` → `POST /app/qrcode` → `POST /app/qrcode/scan` | `xtc` builds only (see below) |
| One-click | `POST /app/oneClick/login` / `POST /app/oneClick/loginV2` | Chinese carrier SSO |
| Third-party | `POST /app/third/login` | Social account binding |

### Live status (2026-10-21)

| Path | Result |
|---|---|
| SMS OTP | `sendRandCodeV2` → `010106` for **every** number tested (real +49, reserved US/UK numbers, invalid 86 numbers) and every `codeType` — client attestation, not per-number |
| Password | `/app/loginV2` → `010402` on a wrong password; the same reply comes for a random number, so it does not prove account existence. **Verified end-to-end:** a freshly registered account returns `000001` with the token. |
| Coupling code | `/d/<code>` is a `302` to the app-download page, not a credential |
| QR login | endpoints answer live, but the scanner branch is `xtc`-only (see below) |

## Recommended Flow — SMS OTP

Every `/app/*` call is signed, and every call with a payload is AES-encrypted
(see `docs/signing-and-crypto.md` for the exact algorithm and secrets).

### Step 1: Request OTP

```http
POST https://account-oz.okii.com/app/sendRandCodeV2
Content-Type: application/x-www-form-urlencoded
Device-Name: samsung-SM-G935F
Charset: utf-8
App-Brand: imoo
Accept-Language: en_US
dataCenterCode: <empty on a fresh install>
APPGlobeZoneTime: Europe/Berlin
ApkType: imoo
version: A_9.36.71
nDeviceId: <32-hex device id>
timestamp: <epoch millis>
Host: account-oz.okii.com
EncryptType: 1
EncryptKey: <base64 RSA(aesKey)>

<base64 AES-ECB-PKCS5({"userName":"13612345678","areaCode":"86","language":"en_US","codeType":"3","appId":"11","mac":"…","timestamp":"2026-10-21 15:49:29","sign":"…"})>
```

The header set is built by
`com.bbk.secureunisignon.common.net.Georgia.Uganda()`
(`RequestParamsFactory.initConnection`). Values come from
`AppFunSupportUtil.getApkType()` (`imoo`), `VersionUtil.getVersionForHttpHeader()`
(`A_` + version), `SystemLanguageUtil.getFinalLanguageValue()`,
`TimeZone.getDefault().getID()`, and `DeviceDataTool`.

The APK also sends `App-Checksum` = `getf(String.valueOf(System.currentTimeMillis()))`
from `librubbish.so`: uppercase hex MD5 of the app-signing certificate DER,
concatenated with the millis string, then MD5'd again as ASCII and lowercased.
The live gateway answers `010314 app校验码无效` for every value we derive, so the
prototype omits the header; every endpoint we call works without it.

Wire param names come from `Gabon.Venezuela`, called by
`com.bbk.secureunisignon.common.net.biz.Hawaii.HongKong` and
`SSONetServiceImpl.K4`:

| param | notes |
|---|---|
| `userName` | the mobile number — **not** `mobilePhone`; the server errors `000002` without it |
| `areaCode` | numeric country code without `+` |
| `language` | `Locale.toString()` from the device, e.g. `en_US`, `de_DE` |
| `codeType` | int in the APK, sent as its decimal string: `0` = register/resend, `2` = reset password, `3` = login |
| `captchaId`, `validate`, `userKey` | optional, empty for plain SMS |
| `appId`, `mac`, `timestamp`, `sign` | common envelope params |

`codeType` sources: `RegisterNumberActivity`/`RegisterVerifyActivity` → 0,
`ForgetNumberActivity` → 2, `AccountVerifyLoginActivity` → 3.
`AccountVerifyLoginRegisterTipActivity` (one-click/register tip) → 0.

`data` in a success response is the **randcodeKey**; `randcodeLogin` must echo
it back. (The client treats it as opaque; the app forwards the same string.)

`areaCode` lookup uses `/app/areaCodeList` (POST, same envelope).

**Live status (2026-10-21):** `sendRandCodeV2` accepts our signed/encrypted
request but answers `010106 Failed to send the verification code` for a real
+49 number, reserved US/UK numbers, invalid 86 numbers, and `codeType` 0
(register), 2 and 3, on both hosts. Since the reply is identical for every
number and the same client gets `000001` from `/app/areaCodeList`, `010106` is
a client-attestation/anti-fraud rejection (the missing `App-Checksum`, or a
captcha the risk engine wants), not a per-number delivery failure. It also
blocks self-registration, because `/app/regist` needs an SMS `randcode`. If an
SMS does arrive, the prototype still submits `randcodeLogin` with an empty
`randcodeKey` (unverified fallback, since `data` is null on the failed send).

In the meantime the prototype exposes **password login** (`/app/loginV2`,
below), which is verified live to validate credentials for these numbers.

### Step 2: Submit OTP

```http
POST https://account-oz.okii.com/app/randcodeLogin
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

The 9.36.71 global build logs in with a password via **`/app/loginV2`**
(`Gabon.Israel`, reached from `MobileService.SolomonIslands` →
`SSONetServiceImpl.K3` → `Germany.Fc` → `biz.Hawaii.Vietnam`). `/app/login2`
still exists as a URL constant in the SSO request class but this build's account
service never calls it, so the older "RSA-encrypted password" description does
not apply here.

The password travels as plaintext **inside the AES-encrypted request body** —
the same envelope as every other `/app/*` call. There is no per-field RSA step.

### Request

```http
POST https://account-oz.okii.com/app/loginV2
```

Same signed/AES envelope as `sendRandCodeV2`, params from `Gabon.Israel`:

| param | notes |
|---|---|
| `userName` | the mobile number |
| `password` | account password, plain inside the encrypted body |
| `days` | `"-1"` (hardcoded by the app) |
| `deviceId` | 32-hex device id |
| `appId` | `11` |
| `areaCode` | numeric country code without `+` |
| `nDeviceId` | 32-hex device id |
| `deviceToken` | NetEase Yidun captcha token; empty is accepted |

**Live result (2026-10-21):** a probe with a deliberately wrong password
returned

```json
{"code":"010402","desc":"账号名或密码错误","data":2}
```

`010402` means wrong account/password — but a random, almost certainly
unregistered number returns the same shape, so it does **not** prove that the
account exists; the server does not disclose that. `data` is the attempts-left
counter (`LoginActivity$Hawaii` parses it as an int and toasts
`sso_password_invalid_remain_times`; 0 shows the "count 0" dialog). Treat
password attempts as limited and do not guess.

**Verified end-to-end (2026-10-21):** after registering a fresh account in the
official app on a connected phone (where `sendRandCodeV2` succeeds and returns
`000001`, unlike our client's `010106`), the prototype logged in with
`POST /app/loginV2` and received `000001` plus the token. Password login needs
no SMS and no `App-Checksum`. Core API calls then answer `000017 temp.` until a
watch is bound to the fresh account.

### Family-member accounts

Admin vs member is a role on the `mobilewatch` relationship, not a separate
login namespace: members use the same `/app/*` login endpoints once their
number is a login account. The SMS answer `010106` and the password answer
`010402` are both generic and tell us nothing about the role. If neither path
works for a member's number, the open question is whether that number is
registered as a `mobileaccount`/`geniusAccount` at all (e.g. an invitation that
was never completed) — confirm with the official app on the same number before
changing the protocol. Role restrictions only apply to what the token can do
afterwards (`docs/account-model.md`).

## QR Login (endpoint research)

The SSO layer carries a four-endpoint QR login used to authorize another
device. None of it bypasses the login problem for a phone in this build:

| Endpoint | Params (`Gabon` method) | Role |
|---|---|---|
| `POST /app/qrcode/token` | `appId`, `deviceId`, `expire`, `machineId` (`Indonesia`) | new device creates a `ssoc…` token |
| `POST /app/qrcode` | `token`, `deviceId`, `appId`, `expire` (`Hungary`) | resolve token to the QR payload |
| `POST /app/qrcode/scan` | `appId`, `deviceId`, `accountId`, `targetApp`, `targetDevice`, `login`, `auth` (`Chile`) | logged-in device authorizes |
| `POST /app/qrcode/login` | `appId`, `deviceId`, `token`, `days` (`Honduras`) | token-for-session exchange |

**Live probes (2026-10-21):**

```
POST /app/qrcode/token {deviceId,machineId,expire:"300"}
  -> {"code":"000001","data":"ssoc0cbnbt00ycihddo00paaaugnoasl"}   (new token each call)

POST /app/qrcode {token:"", …}              -> 010802 二维码登陆token无效
POST /app/qrcode {token:<random 32-hex>, …} -> 010801 二维码登陆token过期
POST /app/qrcode {token:<fresh token>, …}   -> 000001
  data = "auth=ssoc…&targetApp=11&targetDevice=<deviceId>"
```

The payload is the query string the app's scanner parses in
`account/activity/bind/utils/Germany` (`auth`, `targetApp`, `targetDevice`,
`deadLine`), and `AuthorizedOtherToLoginActivity` confirms it with
`/app/qrcode/scan` (`login: "true"`).

**This is not a phone-to-phone escape hatch.** The scanner only enters the
`qrcode` branch when `AppFunSupportUtil.isXtc()` is true, i.e.
`ApkType == "xtc"`. The global imoo package sends `ApkType: imoo`, so its
scanner treats such a code as a normal URL instead of authorizing a session.
`targetApp` values seen in the code (`33`, `35`, `37`) are TV / OPPO-watch /
HD-app targets, so this flow belongs to the `xtc` device family.

## Family Invitation Code

The "Kopplungscode" on the family-invite screen is **not a login
credential**. See [`account-model.md`](account-model.md#joining-a-family-invitation-code)
for the endpoint detail and the live redirect check.

## Session Token

A successful `randcodeLogin` (or `/app/loginV2`) returns `{"code":"000001","desc":"success","data":"<json string>"}`.
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
