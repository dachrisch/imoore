import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { requestSmsCode, loginWithSmsCode, proxy } from "./src/imooClient.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(join(__dirname, "public")));

const API_HOST = process.env.IMOORE_API_HOST || "https://watch.okii.com";
const CHAT_HOST = process.env.IMOORE_CHAT_HOST || "https://chat.watch.okii.com";

// ── Login (SMS OTP) ────────────────────────────────────────────────────────────
app.post("/api/login/code", async (req, res) => {
  try {
    const { mobilePhone, areaCode = "86" } = req.body;
    if (!mobilePhone) return res.status(400).json({ error: "mobilePhone required" });
    const data = await requestSmsCode({ mobilePhone, areaCode }, API_HOST);
    res.json({ ok: true, raw: data });
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err) });
  }
});

app.post("/api/login/verify", async (req, res) => {
  try {
    const { mobilePhone, areaCode = "86", randcode } = req.body;
    if (!mobilePhone || !randcode) {
      return res.status(400).json({ error: "mobilePhone and randcode required" });
    }
    const data = await loginWithSmsCode({ mobilePhone, areaCode, randcode }, API_HOST);
    const token = extractToken(data);
    res.json({ ok: true, token, raw: data });
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err) });
  }
});

// ── Convenience read endpoints ───────────────────────────────────────────────────
app.get("/api/watches", async (req, res) => {
  try {
    const data = await proxy(
      "GET",
      "/mobilewatch",
      API_HOST,
      req.query.token,
      null
    );
    res.json({ ok: true, raw: data });
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err) });
  }
});

app.get("/api/groups", async (req, res) => {
  try {
    const data = await proxy(
      "GET",
      "/group-chat/familyGroup/groups",
      API_HOST,
      req.query.token,
      null
    );
    res.json({ ok: true, raw: data });
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err) });
  }
});

app.get("/api/members", async (req, res) => {
  try {
    const data = await proxy(
      "GET",
      "/group-chat/familyGroup/members",
      API_HOST,
      req.query.token,
      null
    );
    res.json({ ok: true, raw: data });
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err) });
  }
});

// ── Generic proxy (used by the chat composer) ─────────────────────────────────────
app.post("/api/proxy", async (req, res) => {
  try {
    const { method = "GET", path, host, token, body } = req.body;
    const target = host === "chat" ? CHAT_HOST : API_HOST;
    const data = await proxy(method.toUpperCase(), path, target, token, body ?? null);
    res.json({ ok: true, raw: data });
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`imoore prototype running at http://localhost:${PORT}`);
  console.log(`API host: ${API_HOST}`);
  console.log(`Chat host: ${CHAT_HOST}`);
  console.log(`Auth header: ${process.env.IMOORE_AUTH_HEADER || "Authorization"}`);
});

function extractToken(data) {
  const candidates = [data, data?.data, data?.result, data?.body];
  for (const obj of candidates) {
    if (!obj || typeof obj !== "object") continue;
    for (const key of ["token", "sessionToken", "session", "accessToken", "sign", "tokenId"]) {
      if (obj[key] && typeof obj[key] === "string") return obj[key];
    }
  }
  return null;
}
