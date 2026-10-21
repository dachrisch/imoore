import crypto from "node:crypto";

// ── Hosts ──────────────────────────────────────────────────────────────────────
// SSO/auth endpoints live on the account host, not the core API host.
// The app defaults to account.okii.com; the international mirror is
// account-oz.okii.com (see docs/signing-and-crypto.md).
const SSO_HOST = (process.env.IMOORE_SSO_HOST || "https://account.okii.com").replace(/\/$/, "");
// Core API (Base-Request-Param auth) — global build defaults to the -oz mirror.
const API_HOST = (process.env.IMOORE_API_HOST || "https://watch-oz.okii.com").replace(/\/$/, "");
const CHAT_HOST = (process.env.IMOORE_CHAT_HOST || "https://chat.watch.okii.com").replace(/\/$/, "");

// ── Signing ────────────────────────────────────────────────────────────────────
// Recovered from librubbish.so (`com.xtc.secret.XTCgetUtilWrapper`) — see
// docs/signing-and-crypto.md. appId selects which secret the server expects.
const SIGN_SECRETS = {
  "11": "LKyF8jThHbZfUeTP", // geta  → get2  (XOR {1..5} then right-rotate 4)  ✓ live
  "31": "CXy5qhZZ0qHkjvgh", // getTeacherA → get9 (rotate 4 then XOR {1..5}) ✓ live
  "33": "5sacCZns3z9sTcCX", // geth  → get12 (plain constant)               ✓ live
  "35": "NQIiQkcCIGhfn2s9", // getI  → get13 (plain constant)               ✓ live
  "37": "thqHjysVOkGETPoY", // getJ  → get14 (plain constant)               ✓ live
  "48": "5sacCZns3z9sTcCX", // geth — client uses this, server rejected it  ✗ unverified
};
const APP_ID = process.env.IMOORE_APP_ID || "11";
const MAC = process.env.IMOORE_MAC || "64ba24f2457d405dbf40346f96d80934";

function secretFor(appId) {
  const s = SIGN_SECRETS[String(appId)];
  if (!s) throw new Error(`no recovered sign secret for appId ${appId}`);
  return s;
}

// Java: SimpleDateFormat("yyyy-MM-dd kk:mm:ss") — kk is 01..24, not 00..23.
function ssoTimestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  const hour = d.getHours() === 0 ? 24 : d.getHours();
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(hour)}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// md5(url + "k=v" sorted case-insensitively, joined by "##" + secret).toLowerCase()
export function buildSign(url, params, appId = APP_ID) {
  const kv = Object.keys(params)
    .map((k) => `${k}=${params[k]}`)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  return crypto
    .createHash("md5")
    .update(url + kv.join("##") + secretFor(appId), "utf8")
    .digest("hex")
    .toLowerCase();
}

// ── Crypto ─────────────────────────────────────────────────────────────────────
// AES/ECB/PKCS5Padding with a 16-char UTF-8 key; RSA/ECB/PKCS1Padding (X.509 SPKI).
function aesEncrypt(plain, aesKey) {
  const c = crypto.createCipheriv("aes-128-ecb", Buffer.from(aesKey, "utf8"), null);
  return Buffer.concat([c.update(Buffer.from(plain, "utf8")), c.final()]);
}

function aesDecrypt(buf, aesKey) {
  const d = crypto.createDecipheriv("aes-128-ecb", Buffer.from(aesKey, "utf8"), null);
  return Buffer.concat([d.update(buf), d.final()]).toString("utf8");
}

function rsaEncryptAesKey(aesKey, spkiDer) {
  const key = crypto.createPublicKey({ key: spkiDer, format: "der", type: "spki" });
  return crypto
    .publicEncrypt({ key, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(aesKey, "utf8"))
    .toString("base64");
}

function newAesKey() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.randomBytes(16);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

// ── SSO transport ──────────────────────────────────────────────────────────────
let cachedPubKey = null; // raw DER buffer

async function httpPost(url, body, headers) {
  const res = await fetch(url, { method: "POST", headers, body });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} on ${url}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return text;
}

// GET /app/rsakey — signed, unencrypted. Response: {code,desc,data:<base64 SPKI>}
async function getRsaPublicKey(host = SSO_HOST) {
  if (cachedPubKey) return cachedPubKey;
  if (process.env.IMOORE_RSA_PUBKEY) {
    cachedPubKey = Buffer.from(process.env.IMOORE_RSA_PUBKEY, "base64");
    return cachedPubKey;
  }
  const url = `${host}/app/rsakey`;
  const params = { appId: APP_ID, mac: MAC, timestamp: ssoTimestamp() };
  params.sign = buildSign(url, params, APP_ID);
  const body = Object.keys(params).map((k) => `${k}=${params[k]}`).join("&");
  const text = await httpPost(url, body, ssoHeaders(host));
  const json = JSON.parse(text);
  if (json.code !== "000001") throw new Error(`rsakey failed: ${json.code} ${json.desc}`);
  cachedPubKey = Buffer.from(json.data, "base64");
  return cachedPubKey;
}

function ssoHeaders(host, encryptKey) {
  const h = {
    "Content-Type": "application/x-www-form-urlencoded",
    Charset: "utf-8",
    Host: new URL(host).host,
    "User-Agent": "okhttp/3.12.0",
  };
  if (encryptKey) {
    h.EncryptType = "1";
    h.EncryptKey = encryptKey;
  }
  return h;
}

/**
 * Signed + AES-encrypted SSO call.
 * Body: base64(AES-ECB-PKCS5(JSON(params))); header EncryptKey = base64(RSA(aesKey)).
 * Response: base64 ciphertext whose plaintext is the usual {code,desc,data} JSON.
 */
export async function ssoPost(path, params, host = SSO_HOST, appId = APP_ID) {
  const url = `${host}${path}`;
  const full = { ...params, appId, mac: MAC, timestamp: ssoTimestamp() };
  full.sign = buildSign(url, full, appId);

  const pub = await getRsaPublicKey(host);
  const aesKey = newAesKey();
  const body = aesEncrypt(JSON.stringify(full), aesKey).toString("base64");
  const encryptKey = rsaEncryptAesKey(aesKey, pub);

  const text = await httpPost(url, body, ssoHeaders(host, encryptKey));
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = JSON.parse(aesDecrypt(Buffer.from(text, "base64"), aesKey));
  }
  return json;
}

/** Signed, unencrypted call (used by endpoints that have no payload). */
export async function ssoPostPlain(path, params, host = SSO_HOST, appId = APP_ID) {
  const url = `${host}${path}`;
  const full = { ...params, appId, mac: MAC, timestamp: ssoTimestamp() };
  full.sign = buildSign(url, full, appId);
  const body = Object.keys(full).map((k) => `${k}=${full[k]}`).join("&");
  return JSON.parse(await httpPost(url, body, ssoHeaders(host)));
}

// ── Public helpers used by the prototype UI ────────────────────────────────────
export async function requestSmsCode({ mobilePhone, areaCode }, host = SSO_HOST) {
  return ssoPost("/app/sendRandCodeV2", { mobilePhone, areaCode }, host);
}

export async function loginWithSmsCode({ mobilePhone, areaCode, randcode }, host = SSO_HOST) {
  return ssoPost("/app/randcodeLogin", { mobilePhone, areaCode, randcode }, host);
}

export async function areaCodeList(host = SSO_HOST) {
  return ssoPost("/app/areaCodeList", {}, host);
}

// Core API: no Authorization header exists in this app. Auth travels inside
// `Base-Request-Param` (with authId + Eebbk-Sign); see docs/authentication.md.
export async function proxy(method, path, host, token, body) {
  const url = `${host}${path}`;
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (token) {
    headers["Base-Request-Param"] = JSON.stringify({ token, appId: APP_ID });
    if (process.env.IMOORE_AUTH_ID) headers.authId = process.env.IMOORE_AUTH_ID;
  }
  const opts = { method, headers };
  if (body !== null && body !== undefined && method !== "GET") opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { __raw__: text };
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} on ${method} ${url}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

export { SSO_HOST, API_HOST, CHAT_HOST, APP_ID };
