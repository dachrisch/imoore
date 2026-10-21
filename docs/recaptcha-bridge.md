# reCAPTCHA bridge (SMS OTP send)

`sendRandCodeV2` is gated by **Google reCAPTCHA**. This page records why the
token cannot be re-implemented in the Node prototype, how the bridge works, and
what it needs.

## Why a bridge is necessary

The app uses the Android reCAPTCHA SDK:

```java
Recaptcha.fetchTaskClient(activity, "com.recaptcha.id.app.imoo")
    .executeTask(...)
    .addOnSuccessListener(token -> { ... });   // opaque token
```

The site key is public, but the token is produced by **Google Play Services**,
not by app code, and is bound to:

- the site key (`com.recaptcha.id.app.imoo`),
- the app **package name and signing certificate**,
- the device integrity signals Play Services collects,
- a short validity window; it is **single-use**.

There is no public HTTP endpoint that mints an Android reCAPTCHA token. A
different app (even with the same site key) fails the package/signature binding;
the original app's private signing key is not available. Replaying a captured
token fails because it is single-use and expires quickly.

The only practical ways to get a valid token are therefore:

1. run the original app (this bridge),
2. own an app with imoo's package **and** signing key (not possible),
3. use a different site key accepted by the server (not the case),
4. exploit reCAPTCHA (out of scope).

## Architecture

| piece | role |
|---|---|
| `prototype/tools/fetch-captcha.js` | Frida script: finds a live imoo Activity, calls `com.xtc.account.randcodevalideate.Gabon.Gabon(activity, callback)`, and `send()`s the token from `onSuccess`. |
| `prototype/tools/fetch-captcha.py` | Python Frida runner. The Python API does not inject the Java bridge, so it loads `frida_tools/bridges/java.js` explicitly, then prints `CAPTCHA_TOKEN=…`. |
| `prototype/src/captchaBridge.js` | Foregrounds the app, reads its PID, runs the Python helper, parses the token, retries once if the app restarted. |
| `POST /api/login/code` | When `IMOORE_CAPTCHA_BRIDGE=1`, fetches a token and calls `sendRandCodeV2` with `captchaId` + `validate`. |
| `prototype/tools/README.md` | Setup and troubleshooting for the phone side. |

## Requirements

- rooted Android phone with **Magisk** (the bridge attaches with Frida),
- `frida-server` matching the host Frida **major.minor** version,
- `adb` with the phone authorized,
- Python 3 with `frida` and `frida-tools`,
- the official imoo app installed and able to reach the login/change-phone UI.

## Usage

```sh
cd prototype
IMOORE_CAPTCHA_BRIDGE=1 PORT=3123 node server.js
```

`POST /api/login/code` with the number, area code and `codeType: 3` then returns
`{"ok":true,"code":"000001","captchaUsed":true,"randcodeKey":"…"}`. The SMS
arrives on the real phone; `POST /api/login/verify` with the code and
`randcodeKey` returns the session.

## Live evidence (2026-10-22)

- Without `captchaId`/`validate`: every number and `codeType` returns
  `010106 Failed to send the verification code`.
- With a token from the app: `codeType 3` returns `000001` and
  `data = randcode_11_49-<number>_3`.
- `randcodeLogin` with the SMS code and that key returns `000001` + the token
  (`accountId 1600525988`). Full prototype flow verified.

## Failure modes

- **`no activity`** — the app is backgrounded or was destroyed; the bridge
  foregrounds it with `monkey` and retries once.
- **Frida version mismatch** — `frida-server` must match the host `frida`
  major.minor (we used 17.17).
- **Token reuse** — never cache; a token is consumed by one send and expires.
- **Root detection** — the app warns about root; the bridge still works while
  an Activity exists, but behavior can change between builds.
- **App restart** — PID changes; the bridge re-reads it and retries.

## Alternatives

- **Manual hybrid**: send the code in the official app, then enter the code in
  the prototype's Verify screen (`randcodeLogin` needs no captcha).
- **Password login**: `/app/loginV2` has no captcha.
- **Persistent helper**: expose token minting over Frida `rpc.exports` +
  `adb forward` instead of spawning Frida per send (future work).

The bridge is a research tool, not part of the imoo protocol; the protocol
implementation itself (signing, AES/RSA, checksum, params) is complete.
