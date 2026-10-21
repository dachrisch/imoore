# Request lifecycle

There are two distinct signed envelopes in this app. Details (parsers, secrets,
bytecode) live in [`signing-and-crypto.md`](signing-and-crypto.md); login flows
and token semantics live in [`authentication.md`](authentication.md). This page
is the end-to-end map.

## Two envelopes

| | SSO `/app/*` | Core API |
|---|---|---|
| host | `account-oz.okii.com` (this package; `account.okii.com` for `xtc`) | `watch-oz.okii.com` |
| signature | `sign` request **param**: md5(url + sorted `k=v` + appId secret) | `Eebbk-Sign` header: md5(url + Base-Request-Param + body + random key) |
| payload | whole body: `base64(AES(json))` | `Base-Request-Param`: `base64(AES(json))` |
| key transport | `EncryptKey` header: `base64(RSA(aesKey))` | `Eebbk-Key` header: `base64(RSA(key, /rsa pubkey))` |
| auth | none (login produces the token) | `authId` header + `token` field inside `Base-Request-Param` |
| response | plain JSON, or base64 ciphertext | JSON string literal holding base64 ciphertext |

## SSO call (`/app/*`)

1. `POST /app/rsakey` — signed but **not** encrypted; returns the 1024-bit
   X.509 SPKI that wraps every per-request AES key.
2. Build the endpoint params (e.g. `userName`, `areaCode`, `codeType`,
   `language` for `sendRandCodeV2`).
3. Add `appId`, `mac`, `timestamp` (`yyyy-MM-dd kk:mm:ss`), then compute
   `sign` (sorted keys, `##` separator, key appended to the URL).
4. `aesKey = 16 random chars`; body = `base64(AES-ECB-PKCS5(json))`;
   `EncryptKey = base64(RSA-PKCS1(aesKey, /app/rsakey))`.
5. `POST` with `Content-Type: application/x-www-form-urlencoded`,
   `Charset: utf-8`, `EncryptType: 1`, `EncryptKey`.
6. If the response body is a quoted base64 string, AES-decrypt it; otherwise it
   is already JSON.

## Core call

1. `GET /rsa` — unauthenticated; returns `{encSwitch, publicKey, modulus}`.
2. Build `BaseRequestParam`:
   `accountId`, `appId:"0"`, `deviceId`, `imFlag:"1"`, `machineId`,
   `nDeviceId`, `program:"android"`, `registId`,
   `timestamp` (`yyyy-MM-dd HH:mm:ss`), `token`.
   `token` is the **raw `data` string** from the SSO login; `accountId` is the
   `accountId` inside it (also sent as the `authId` header).
3. Encrypt the param JSON with a fresh 16-char key, wrap the key with the
   `/rsa` public key, and sign `url + encryptedParam + body + key`.
4. Send the headers listed in
   [`signing-and-crypto.md`](signing-and-crypto.md#core-api-envelope-verified-live)
   (`encrypted`, `Eebbk-Key`, `Eebbk-Sign`, `authId`, `program`, `Version`,
   `App-Checksum`, …).
5. Response: `base64 → AES → gunzip → JSON`.

## Where values come from

| value | source |
|---|---|
| `appId` (SSO) | `11` for this build |
| appId secret | native `librubbish.so` getters — recovered table in `signing-and-crypto.md` |
| `mac` | `Hawaii.Hawaii`, fallback `64ba24f2457d405dbf40346f96d80934` |
| `deviceId` | `DeviceDataTool.getDeviceId(mobileId)` |
| `machineId` / `nDeviceId` | `DeviceDataTool.getMachineId()` / `getNewDeviceId()` |
| session `token` | `randcodeLogin` response `data` (raw JSON string) |
| `authId` | `SSOLoginResult.accountId` |

## History of this document

This page originally recorded early hypotheses that later turned out to be
wrong: signing over the path only (it is the full URL), epoch-millis
timestamps (SSO uses `kk:mm:ss`, the core uses `HH:mm:ss`), and the assumption
that `librubbish.so` had to be fetched at runtime (it ships in the
`arm64-v8a` split). Those items were resolved by reversing the ABI split; see
`git log -- docs/` and [`signing-and-crypto.md`](signing-and-crypto.md).
