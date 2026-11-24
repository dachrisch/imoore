# AGENTS.md — prototype/

The only executable component in this repo: a small Express app + browser client
that implements the app's SSO (`/app/*`) and core-API envelopes against the live
okii.com service. It is a research harness, not the spec — keep `openapi.yaml`
and the invariants in [../AGENTS.md](../AGENTS.md) authoritative.

## Commands

Verified against `package.json`: private ESM package (`"type": "module"`),
Node **>= 18**, one runtime dependency (`express`).

```sh
cd prototype
npm install        # install dependencies (node_modules/ is gitignored)
npm test           # node --test; offline fixtures only, no phone or network
npm start          # node server.js -> http://localhost:3000
```

- `PORT` overrides the port (default `3000`); `GET /api/selftest` runs live checks.
- Keep `test/protocol.test.js` offline: it covers sign vectors, timestamps, token
  parsing and device-profile shape. Do not add live-service calls to it.
- `openapi.yaml` itself has no build/test/lint config; `npm test` here is the only
  automated verification in the repo.

## Local state and secrets

- `.device.json` is a per-install device identity generated on first run by
  `src/imooClient.js`; it is gitignored. Never commit it, captured tokens, or
  secrets. Override its path with `IMOORE_DEVICE_FILE`, or supply ids via
  `IMOORE_DEVICE_ID` (optionally `IMOORE_MACHINE_ID` / `IMOORE_NDEVICE_ID`).
- Password login via `/app/loginV2` works without a phone. SMS OTP send needs a
  reCAPTCHA token minted by the official app: set `IMOORE_CAPTCHA_BRIDGE=1` only
  when a rooted device with frida-server is attached; without it, that route is
  unavailable and password login is the fallback. Phone setup and manual
  invocation are in [tools/README.md](tools/README.md); the rationale is in
  [`../docs/recaptcha-bridge.md`](../docs/recaptcha-bridge.md).
- Never add an `Authorization: Bearer` header — the app never sends one.

## Layout

- `server.js` — Express routes and live proxy; `src/imooClient.js` — envelope,
  signing and device identity; `src/captchaBridge.js` — Frida bridge;
  `public/` — static client; `test/protocol.test.js` — offline fixtures;
  `tools/` — captcha helpers (own README, linked above).
