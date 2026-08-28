# AGENTS.md

Reverse-engineered **OpenAPI 3.0.3** spec for the imoo Watch companion app (`com.imoo.watch.global`). It is a research reference, not a running service or a generated SDK. Personal research; not affiliated with imoo / BBK Electronics.

## What an agent must not assume

- **HTTP methods are inferred**, not observed. They are guessed from endpoint naming (`get*`→GET, `add*`/`create*`→POST, `delete*`→DELETE). Treat any method as a hypothesis until confirmed against a live session.
- **Request/response schemas are placeholders.** Where the real shape is unknown, the spec uses empty or example objects. Do not trust field names/types as authoritative.
- **The token/auth header name is unconfirmed** (see `docs/authentication.md`). Static analysis alone can't prove it; it needs live session sniffing. Don't hardcode `Authorization` vs `token` as fact.

## Central artifact

- `openapi.yaml` (~2900 lines) is the single source of truth. Everything else supports it.
- 6 services are modelled as `servers` entries; location endpoints override `servers` per-operation with `https://location.watch.okii.com`.
- International region mirrors exist at `*-oz.okii.com` (e.g. `watch-oz.okii.com`).

**Verified host correction:** The documented core host `api.watch.okii.com` is **wrong** — the real base is `https://watch.okii.com` (confirmed by extracting `base.apk`, running `strings` over the 12 DEX files, and probing live; `api.watch.okii.com` returns 404 for all `/app/*` paths). `watchcdn.okii.com` is also wrong; use `watch.okii.com`. Other subdomains (`location`, `sport`, `chat`, `points`) do resolve. Most paths are also reachable on the bare `watch.okii.com` host.

## How to view / validate

- Swagger UI: the README's editor.swagger.io link renders the raw GitHub `openapi.yaml` — no local setup needed.
- Optional local validation (not preinstalled, verify before relying on it): `npx @redocly/cli lint openapi.yaml` or `npx @redocly/cli preview openapi.yaml`. There is no committed build/test/lint config.
- There are **no tests, no CI, no package manifest**. Don't invent verification steps; YAML validity is the only hard check.

## How the spec was built (and how to extend it)

Coverage came from static APK analysis, not a live API:

1. `adb pull` the installed APK for `com.imoo.watch.global`
2. Unzip the APK and extract the ~12 DEX files
3. Run `strings` over all DEX files and grep for URL/path constants
4. Classify the ~240 discovered endpoints into the 6 service groups

To add endpoints, repeat this pipeline and reconcile new paths against the existing tags. Prefer `strings` + grep over guessing — the APK is the ground truth, the spec is the map.

## Where deeper findings live

`docs/` holds analysis that goes beyond what static analysis could confirm:

- `docs/authentication.md` — login flows (SMS OTP, RSA password, token resume, QR), session token shape, and the admin/member access split.
- `docs/account-model.md` — identity is role-relative to a watch (`mobileaccount`/`watchaccount`/`geniusAccount`), not a profile page. Admin vs member is enforced server-side per endpoint.

Read these before asserting auth/role behavior in generated code or docs.
