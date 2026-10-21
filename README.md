# imoo Watch API

Reverse-engineered REST API reference for the **imoo Watch** companion app (`com.imoo.watch.global`).

## View the Swagger UI

→ **[Open in Swagger Editor](https://editor.swagger.io/?url=https://raw.githubusercontent.com/dachrisch/imoo-watch-api/main/openapi.yaml)**

## Services

| Service | Base URL | Description |
|---|---|---|
| Core API | `https://watch.okii.com` | Auth, account, contacts, app store, settings, payments |
| Location API | `https://location.watch.okii.com` | Real-time tracking, trails, guard modes, geofencing |
| Health & Sport | `https://sport.watch.okii.com` | Health summary, sport data |
| Chat | `https://chat.watch.okii.com` | Messaging, voice, video calls |
| Points | `https://points.okii.com` | Points, reward tasks |
| CDN | `https://watch.okii.com` | Announcements, media assets |

International region mirrors exist at `*-oz.okii.com` (e.g. `watch-oz.okii.com`).
For the global package (`com.imoo.watch.global`) the mirror is the built-in
default: `AppUtil.getAddrApp()` returns `ImooAddrApp`, whose
`getFormalDefault()` is `https://watch-oz.okii.com` — the value
`DomainManager.serverUrl` is initialised from. The table above documents the
shared API surface; `api.watch.okii.com` appears only as
`HttpConstants.HOST_NAME_ARRAYS[1]` and is not a working base.

**Login (`/app/*`) does not run on the core host.** It uses
`https://account-oz.okii.com` for `com.imoo.watch.global`
(`account.okii.com` for the China/`xtc` cluster), requires an MD5 `sign`
built from a per-appId secret, and encrypts payloads with AES-128-ECB +
RSA-1024 (public key from `POST /app/rsakey`). The recovered secrets and the
full envelope are documented in
[`docs/signing-and-crypto.md`](docs/signing-and-crypto.md) — the prototype in
`prototype/` implements it and works against the live service.

## Prototype

`prototype/` is a small Express app + JS client that implements both envelopes
(SSO and core API).

```sh
cd prototype
npm install
npm start          # http://localhost:3000
npm test           # offline fixtures: sign vector, timestamps, token parsing
```

Endpoints worth knowing:

| Route | What it does |
|---|---|
| `GET /api/selftest` | Live checks: `/app/rsakey`, `/rsa`, `/app/areaCodeList`, core envelope |
| `POST /api/login/code` | `sendRandCodeV2` — sends a real SMS |
| `POST /api/login/verify` | `randcodeLogin` — returns `token` + `authId` |
| `POST /api/login/password` | `/app/loginV2` — password login, returns `token` + `authId` and the attempts-left counter on `010402` |
| `POST /api/area-codes` | Live `areaCodeList` (176 codes) |
| `GET /api/watches`, `/api/groups`, `/api/members`, `POST /api/proxy` | Authenticated core calls (`token` + `authId`) |

SMS is currently blocked at the provider for the test number
(`sendRandCodeV2` → `010106`, documented in
[`docs/authentication.md`](docs/authentication.md#live-status-2026-10-21)), so
the UI also exposes **password login** via `/app/loginV2` — the password is
plaintext inside the AES envelope, and `/app/login2` is legacy. Family-invite
"coupling codes" are not login credentials
([`docs/account-model.md`](docs/account-model.md#joining-a-family-invitation-code)).

Core calls need the token from a successful login; without one the gateway
answers `000004` (request parameter is invalid).


## Methodology

Static analysis of the Android APK (`com.imoo.watch.global`):

1. Pulled APK via `adb pull`
2. Unzipped APK, extracted 12 DEX files
3. Ran `strings` on all DEX files to extract URL and path constants
4. Filtered and classified ~240 endpoints across 6 services

**HTTP methods are inferred** from endpoint naming conventions (e.g. `get*` → GET, `add*`/`create*` → POST, `delete*` → DELETE) and may not be exact. Request/response schemas are placeholders.

## Coverage

| Tag group | Count |
|---|---|
| Authentication (all flows) | 31 |
| Watch Account & Device Binding | 17 |
| Contacts & Friends | 16 |
| Watch Settings (`/smartwatch/`) | 58 |
| Watch Functions & Class Mode | 20 |
| Location & Tracking | 8 |
| Guard Modes (5 types) | 31 |
| Indoor / 3D | 7 |
| Video Calls | 9 |
| App Store | 12 |
| Media & Files | 9 |
| Health & Sport | 3 |
| Payment | 6 |
| Notifications & Find Watch | 9 |
| … and more | |

## Interesting endpoints for extending functionality

| Endpoint | Notes |
|---|---|
| `/smartwatch/outdoorActivities/getDetail` | Richer activity data than the app shows |
| `/sport-service/health/i32/home` | Health summary — model suffix likely device-class |
| `/sport-service/health/nd01/home` | Alternative model endpoint |
| `/flutterSport` | Flutter-bridged sport data |
| `/app/myUpdates` | May expose a broader update feed |
| `/contrail/queryData` | Historical movement data with time range params |
| `/watchData/getData` | Raw sensor data |
| `/watch-func/habit/*` | Habit task management |

## Disclaimer

This is personal research for a device I own, intended to add features the official app doesn't expose. Not affiliated with or endorsed by imoo / BBK Electronics.
