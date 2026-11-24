# AGENTS.md

Reverse-engineered **OpenAPI 3.0.3** spec for the imoo Watch companion app (`com.imoo.watch.global`). It is a research reference, not a running service or a generated SDK. Personal research; not affiliated with imoo / BBK Electronics.

## Component guides

Repo-wide essentials stay here; directory-specific rules live in the linked guides, so each fact lives in one place:

- [prototype/AGENTS.md](prototype/AGENTS.md) — the executable Express prototype: commands, local state, captcha/environment flags.
- [tools/AGENTS.md](tools/AGENTS.md) — APK/native extraction and Frida triage: prerequisites, invocation, generated output.

`docs/` holds analysis, not local rules — see "Where deeper findings live" below. `history/` is a one-off lab note, not a guide. `native/` is large gitignored, extracted output; never commit or hand-edit it (see the tools guide).

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
- `openapi.yaml` has no build/test/lint config. The prototype is the only executable component; its commands and live/offline split are documented in [prototype/AGENTS.md](prototype/AGENTS.md).

## How the spec was built (and how to extend it)

Coverage came from static APK analysis, not a live API:

1. `adb pull` the installed APK for `com.imoo.watch.global`
2. Unzip the APK and extract the ~12 DEX files
3. Run `strings` over all DEX files and grep for URL/path constants
4. Classify the ~240 discovered endpoints into the 6 service groups

To add endpoints, repeat this pipeline and reconcile new paths against the existing tags. Prefer `strings` + grep over guessing — the APK is the ground truth, the spec is the map. The scripts that reproduce the extraction and crypto triage are described in [tools/AGENTS.md](tools/AGENTS.md).

## Where deeper findings live

`docs/` holds analysis that goes beyond what static analysis could confirm:

- [`docs/authentication.md`](docs/authentication.md) — login flows (SMS OTP + reCAPTCHA gate, password via `/app/loginV2`, token resume, QR research), session token shape, the admin/member access split, and the family-invite code.
- [`docs/signing-and-crypto.md`](docs/signing-and-crypto.md) — the request signature (MD5 over url + sorted `k=v` + per-appId secret), the recovered secrets, the AES/RSA envelope, and the full SSO header set. Verified live against `account-oz.okii.com`.
- [`docs/auth-protocol.md`](docs/auth-protocol.md) — end-to-end map of the two signed envelopes, SSO vs core API.
- [`docs/account-model.md`](docs/account-model.md) — identity is role-relative to a watch (`mobileaccount`/`watchaccount`/`geniusAccount`), not a profile page. Admin vs member is enforced server-side per endpoint; the invitation "Kopplungscode" is a binding reference, not a credential.
- [`docs/recaptcha-bridge.md`](docs/recaptcha-bridge.md) — why `sendRandCodeV2` requires a Google reCAPTCHA token minted by the official app, the Frida/adb bridge, its requirements, and failure modes.

Read these before asserting auth/role behavior in generated code or docs.

## Signing is no longer unknown

`/app/*` requests are signed (`sign` param) and encrypted (`EncryptType: 1` +
`EncryptKey` header). The secrets were recovered statically from
`librubbish.so` (the ABI split, not `base.apk`) via the extraction/triage scripts
in [tools/AGENTS.md](tools/AGENTS.md); the crypto itself is Java (`d.b.a.A1`)
reached through JNI trampolines. Do not re-introduce `Authorization: Bearer` —
this app never sends it.

The core API uses a different envelope: `Base-Request-Param` (AES key wrapped
to the `GET /rsa` public key in `Eebbk-Key`, signed with `Eebbk-Sign`). It is
verified live up to the token check — see `docs/signing-and-crypto.md`.
