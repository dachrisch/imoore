# AGENTS.md

Reverse-engineered **OpenAPI 3.0.3** spec for the imoo Watch companion app (`com.imoo.watch.global`). It is a research reference, not a running service or a generated SDK. Personal research; not affiliated with imoo / BBK Electronics.

## What an agent must not assume

- **HTTP methods are inferred**, not observed. They are guessed from endpoint naming (`get*`→GET, `add*`/`create*`→POST, `delete*`→DELETE). Treat any method as a hypothesis until confirmed against a live session.
- **Request/response schemas are placeholders.** Where the real shape is unknown, the spec uses empty or example objects. Do not trust field names/types as authoritative.
- **There is no token auth header.** The session token is a JSON field (`token`) inside `BaseRequestParam`, carried in the `Base-Request-Param` header (encrypted when request encryption is on) next to `authId` and `Eebbk-Sign`. `Authorization` is never set on the native, H5 or SSO paths — verified in `base.apk`; see `docs/authentication.md`.

## Central artifact

- `openapi.yaml` (~2900 lines) is the single source of truth. Everything else supports it.
- 6 services are modelled as `servers` entries; location endpoints override `servers` per-operation with `https://location.watch.okii.com`.
- International region mirrors exist at `*-oz.okii.com` (e.g. `watch-oz.okii.com`).

**Verified host correction:** The documented core host `api.watch.okii.com` is **wrong** — the real base is `https://watch.okii.com` (confirmed by extracting `base.apk`, running `strings` over the 12 DEX files, and probing live; `api.watch.okii.com` returns 404 for all `/app/*` paths). `watchcdn.okii.com` is also wrong; use `watch.okii.com`. Other subdomains (`location`, `sport`, `chat`, `points`) do resolve. Most paths are also reachable on the bare `watch.okii.com` host.

Bytecode agrees: `api.watch.okii.com` exists only as `HttpConstants.HOST_NAME_ARRAYS[1]` (a lookup table), while `HOST_NAME_ARRAYS[0]` is `watch.okii.com`. For the imoo global package (`com.imoo.watch.global`), `AppUtil.getAddrApp()` returns `ImooAddrApp` and `ImooAddrApp.getFormalDefault()` returns `https://watch-oz.okii.com`, which is what `DomainManager.serverUrl` is initialised to — so the `-oz` mirror, not the plain host, is this package's built-in core base.

## How to view / validate

- Swagger UI: the README's editor.swagger.io link renders the raw GitHub `openapi.yaml` — no local setup needed.
- Optional local validation (not preinstalled, verify before relying on it): `npx @redocly/cli lint openapi.yaml` or `npx @redocly/cli preview openapi.yaml`.
- The prototype is the only executable component: `cd prototype && npm install && npm test` (offline fixtures) and `npm start` (web UI at `http://localhost:3000`, `GET /api/selftest` for live checks). It implements the SSO envelope, SMS login, **password login via `/app/loginV2`**, and the core-API envelope. `sendRandCodeV2` currently answers `010106` for the test number, so password login is the live fallback. The spec itself still has no build/test/lint config.

## How the spec was built (and how to extend it)

Coverage came from static APK analysis, not a live API:

1. `adb pull` the installed APK for `com.imoo.watch.global`
2. Unzip the APK and extract the ~12 DEX files
3. Run `strings` over all DEX files and grep for URL/path constants
4. Classify the ~240 discovered endpoints into the 6 service groups

To add endpoints, repeat this pipeline and reconcile new paths against the existing tags. Prefer `strings` + grep over guessing — the APK is the ground truth, the spec is the map.

## Where deeper findings live

`docs/` holds analysis that goes beyond what static analysis could confirm:

- `docs/authentication.md` — login flows (SMS OTP, password via `/app/loginV2`, token resume, QR research), session token shape, the admin/member access split, and the family-invite code.
- `docs/signing-and-crypto.md` — the request signature (MD5 over url + sorted `k=v` + per-appId secret), the recovered secrets, the AES/RSA envelope, and the full SSO header set. Verified live against `account-oz.okii.com`.
- `docs/account-model.md` — identity is role-relative to a watch (`mobileaccount`/`watchaccount`/`geniusAccount`), not a profile page. Admin vs member is enforced server-side per endpoint; the invitation "Kopplungscode" is a binding reference, not a credential.

Read these before asserting auth/role behavior in generated code or docs.

## Signing is no longer unknown

`/app/*` requests are signed (`sign` param) and encrypted (`EncryptType: 1` +
`EncryptKey` header). The secrets were recovered statically from
`librubbish.so` (the ABI split, not `base.apk`) via `tools/pull-native.sh`; the
crypto itself is Java (`d.b.a.A1`) reached through JNI trampolines. Do not
re-introduce `Authorization: Bearer` — this app never sends it.

The core API uses a different envelope: `Base-Request-Param` (AES key wrapped
to the `GET /rsa` public key in `Eebbk-Key`, signed with `Eebbk-Sign`). It is
verified live up to the token check — see `docs/signing-and-crypto.md`.

