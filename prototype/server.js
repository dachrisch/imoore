import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  requestSmsCode,
  loginWithSmsCode,
  areaCodeList,
  parseLoginResult,
  coreRequest,
  getCorePublicKey,
  getSsoPublicKey,
  SSO_HOST,
  API_HOST,
  CHAT_HOST,
} from "./src/imooClient.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(join(__dirname, "public")));

// ── Login (SMS OTP) ────────────────────────────────────────────────────────────
app.post("/api/login/code", async (req, res) => {
  try {
    const { userName, mobilePhone, areaCode = "86", language = "en_US", codeType = 3 } = req.body || {};
    const phone = userName || mobilePhone;
    if (!phone) return res.status(400).json({ error: "userName (mobile number) required" });
    const raw = await requestSmsCode({ userName: phone, areaCode, language, codeType }, SSO_HOST);
    const ok = raw.code === "000001";
    res.json({
      ok,
      code: raw.code,
      desc: raw.desc,
      // sendRandCodeV2 returns the key that randcodeLogin must echo back.
      randcodeKey: ok && typeof raw.data === "string" ? raw.data : "",
      raw,
    });
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err) });
  }
});

app.post("/api/login/verify", async (req, res) => {
  try {
    const {
      userName,
      mobilePhone,
      areaCode = "86",
      randcode,
      randcodeKey = "",
    } = req.body || {};
    const phone = userName || mobilePhone;
    if (!phone || !randcode) {
      return res.status(400).json({ error: "userName and randcode are required" });
    }
    const raw = await loginWithSmsCode({ userName: phone, areaCode, randcode, randcodeKey }, SSO_HOST);
    const parsed = parseLoginResult(raw);
    res.json({
      ok: Boolean(parsed),
      code: raw.code,
      desc: raw.desc,
      token: parsed?.token ?? null,
      authId: parsed?.authId ?? null,
      profile: parsed?.profile ?? null,
      raw,
    });
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err) });
  }
});

// ── SSO helpers ────────────────────────────────────────────────────────────────
app.post("/api/area-codes", async (_req, res) => {
  try {
    const raw = await areaCodeList(SSO_HOST);
    let codes = null;
    if (raw.code === "000001") {
      try {
        codes = JSON.parse(raw.data);
      } catch {
        codes = raw.data;
      }
    }
    res.json({ ok: raw.code === "000001", code: raw.code, desc: raw.desc, count: Array.isArray(codes) ? codes.length : null, codes, raw });
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err) });
  }
});

// ── Convenience read endpoints (core API) ───────────────────────────────────────
function coreArgs(req) {
  return {
    token: req.body?.token || req.query.token || "",
    authId: req.body?.authId || req.query.authId || undefined,
  };
}

async function readCore(req, res, path) {
  try {
    const { token, authId } = coreArgs(req);
    const data = await coreRequest("GET", path, { token, authId, host: API_HOST });
    res.json({ ok: data.code === "000001", raw: data });
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err), raw: err?.body ?? null });
  }
}

app.get("/api/watches", (req, res) => readCore(req, res, "/smartwatch/mobilewatch"));
app.get("/api/groups", (req, res) => readCore(req, res, "/group-chat/familyGroup/groups"));
app.get("/api/members", (req, res) => readCore(req, res, "/group-chat/familyGroup/members"));

// ── Generic proxy (used by the chat composer) ─────────────────────────────────────
// There is no Authorization header in this app: auth travels inside
// Base-Request-Param, which coreRequest builds and encrypts.
app.post("/api/proxy", async (req, res) => {
  try {
    const { method = "GET", path, host, token = "", authId, body } = req.body || {};
    if (!path) return res.status(400).json({ error: "path is required" });
    const target = host === "chat" ? CHAT_HOST : API_HOST;
    const data = await coreRequest(method.toUpperCase(), path, { token, authId, body, host: target });
    res.json({ ok: data.code === "000001", raw: data });
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err), raw: err?.body ?? null });
  }
});

// ── Self-test: exercises the live protocol without needing an account ──────────
app.get("/api/selftest", async (_req, res) => {
  const out = {};
  try {
    const ssoKey = await getSsoPublicKey(SSO_HOST);
    out.ssoPublicKey = { ok: true, derBytes: ssoKey.length };
  } catch (err) {
    out.ssoPublicKey = { ok: false, error: String(err?.message || err) };
  }
  try {
    const coreKey = await getCorePublicKey(API_HOST);
    out.corePublicKey = { ok: true, derBytes: coreKey.length };
  } catch (err) {
    out.corePublicKey = { ok: false, error: String(err?.message || err) };
  }
  try {
    const raw = await areaCodeList(SSO_HOST);
    let count = null;
    if (raw.code === "000001") {
      try {
        count = JSON.parse(raw.data).length;
      } catch {
        /* ignore */
      }
    }
    out.areaCodeList = { ok: raw.code === "000001", code: raw.code, desc: raw.desc, count };
  } catch (err) {
    out.areaCodeList = { ok: false, error: String(err?.message || err) };
  }
  try {
    // No token: the correct envelope gets past the gateway and returns a
    // business error (000004 invalid token) instead of 000007/100500.
    const raw = await coreRequest("GET", "/smartwatch/mobilewatch", { token: "", authId: "0", host: API_HOST });
    out.coreEnvelope = { ok: true, code: raw.code, desc: raw.desc };
  } catch (err) {
    out.coreEnvelope = { ok: false, error: String(err?.message || err) };
  }
  res.json({ ok: Object.values(out).every((v) => v.ok), results: out });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`imoore prototype running at http://localhost:${PORT}`);
  console.log(`API host: ${API_HOST}`);
  console.log(`SSO host: ${SSO_HOST}`);
  console.log(`Chat host: ${CHAT_HOST}`);
});
