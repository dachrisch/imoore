# Authentication

## Base API URL

```
https://api.watch.okii.com
```

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

### Step 1: Request OTP

```http
POST /app/sendRandCodeV2
Content-Type: application/json

{
  "mobilePhone": "13612345678",
  "areaCode": "86"
}
```

`areaCode` is the numeric country code without `+`. Use `/app/areaCodeList` (GET) to look up codes.

### Step 2: Submit OTP

```http
POST /app/randcodeLogin
Content-Type: application/json

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
GET /app/rsakey
```

Response contains the server's RSA public key.

### Step 2: Login

```http
POST /app/login2
Content-Type: application/json

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

Pass the session token on subsequent requests. The header name is not confirmed from static analysis alone — sniffing a live session is needed for certainty. Candidates:

```http
Authorization: <token>
```

or

```http
token: <token>
```

## Checking Login State

```http
GET /app/verifyToken
GET /app/checkAccount
GET /mobileinit/authid
```

## Account Utilities

| Action | Endpoint |
|---|---|
| List available area codes | `GET /app/areaCodeList` |
| Check login modes supported | `GET /app/login/modes` |
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
