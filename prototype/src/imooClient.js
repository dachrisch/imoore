import crypto from "node:crypto";

const API_HOST = process.env.IMOORE_API_HOST || "https://watch.okii.com";
const CHAT_HOST = process.env.IMOORE_CHAT_HOST || "https://chat.watch.okii.com";

// ── Reverse-engineered signing (see docs/auth-protocol.md) ──────────────────────
// The per-appId secret is obfuscated in the APK (decrypted at runtime). Supply it
// here once extracted. appId selects which secret the server expects (see doc §3).
const SIGN_SECRET = process.env.IMOORE_SIGN_SECRET || "";
const APP_ID = process.env.IMOORE_APP_ID || "11";
// AES/RSA transforms carry no string constants in the DEX — set once confirmed.
const AES_ALGO = process.env.IMOORE_AES_ALGO || "aes-128-ecb";
const RSA_PADDING = process.env.IMOORE_RSA_PADDING || "pkcs1";

const MAC = "64ba24f2457d405dbf40346f96d80934";

function authHeaders(token) {
  if (!token) return {};
  const h = process.env.IMOORE_AUTH_HEADER || "Authorization";
  const p = process.env.IMOORE_AUTH_PREFIX || "Bearer";
  return { [h]: p ? `${p} ${token}` : token };
}

function md5Sign(path, params) {
  const keys = Object.keys(params).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const joined = keys.map((k) => `${k}=${params[k]}`).join("##");
  const input = path + joined + SIGN_SECRET;
  return crypto.createHash("md5").update(input, "utf8").digest("hex").toLowerCase();
}

let rsaPublicKey = null;

async function getRsaPublicKey(host) {
  if (rsaPublicKey) return rsaPublicKey;
  const data = await call("GET", "/app/rsakey", host, null, null);
  // shape of /app/rsakey response is unconfirmed; cache whatever string it returns
  rsaPublicKey = typeof data === "string" ? data : JSON.stringify(data);
  return rsaPublicKey;
}

function aesEncrypt(plain, aesKey) {
  const iv = AES_ALGO.includes("ecb") ? null : Buffer.alloc(16, 0);
  const c = crypto.createCipheriv(AES_ALGO, Buffer.from(aesKey, "utf8"), iv);
  return Buffer.concat([c.update(Buffer.from(plain, "utf8")), c.final()]).toString("base64");
}

function rsaEncrypt(aesKey, pubKey) {
  const padding = RSA_PADDING === "oaep" ? crypto.constants.RSA_PKCS1_OAEP_PADDING : crypto.constants.RSA_PKCS1_PADDING;
  return crypto.publicEncrypt({ key: pubKey, padding }, Buffer.from(aesKey, "utf8")).toString("base64");
}

// Build + send a fully signed & encrypted request (the real client flow).
export async function signedPost(path, params, host = API_HOST, token = null) {
  const full = {
    ...params,
    mac: MAC,
    timestamp: String(Date.now()),
    appId: APP_ID,
  };
  full.sign = md5Sign(path, full);
  const data = JSON.stringify(full);
  const aesKey = crypto.randomBytes(8).toString("hex") + crypto.randomBytes(8).toString("hex"); // 16 chars
  const body = aesEncrypt(data, aesKey);
  const pub = await getRsaPublicKey(host);
  const encryptKey = rsaEncrypt(aesKey, pub);

  const headers = {
    "Content-Type": "text/plain;charset=UTF-8",
    Charset: "utf-8",
    EncryptType: "1",
    EncryptKey: encryptKey,
    Host: new URL(host).host,
    timestamp: full.timestamp,
  };
  if (token) Object.assign(headers, authHeaders(token));

  const url = `${host}${path}`;
  const resp = await fetch(url, { method: "POST", headers, body });
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { __raw__: text }; }
  if (!resp.ok) {
    const err = new Error(`HTTP ${resp.status} on ${path}`);
    err.status = resp.status; err.body = json;
    throw err;
  }
  return json;
}

async function call(method, path, host, token, body) {
  const url = `${host}${path}`;
  const headers = { "Content-Type": "application/json", Accept: "application/json", ...authHeaders(token) };
  const opts = { method, headers };
  if (body !== null && body !== undefined && method !== "GET") opts.body = JSON.stringify(body);
  const resp = await fetch(url, opts);
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { __raw__: text }; }
  if (!resp.ok) {
    const err = new Error(`HTTP ${resp.status} on ${method} ${url}`);
    err.status = resp.status; err.body = json; throw err;
  }
  return json;
}

// Legacy/plain proxy (no signing) — used by the chat composer for raw probing.
export async function requestSmsCode({ mobilePhone, areaCode }, host = API_HOST) {
  return signedPost("/app/sendRandCodeV2", { mobilePhone, areaCode }, host);
}
export async function loginWithSmsCode({ mobilePhone, areaCode, randcode }, host = API_HOST) {
  return signedPost("/app/randcodeLogin", { mobilePhone, areaCode, randcode }, host);
}
export async function proxy(method, path, host, token, body) {
  return call(method, path, host, token, body);
}
