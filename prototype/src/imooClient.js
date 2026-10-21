import crypto from "node:crypto";
import fs from "node:fs";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

// ── Hosts ──────────────────────────────────────────────────────────────────────
// SSO/auth endpoints live on the account host. The imoo global package
// (com.imoo.watch.global) resolves ImooAddrApp.getAccountHost() to the -oz
// mirror; the plain host is the China-facing cluster.
const SSO_HOST = (process.env.IMOORE_SSO_HOST || "https://account-oz.okii.com").replace(/\/$/, "");
// Core API (Base-Request-Param auth) — global build defaults to the -oz mirror.
const API_HOST = (process.env.IMOORE_API_HOST || "https://watch-oz.okii.com").replace(/\/$/, "");
const CHAT_HOST = (process.env.IMOORE_CHAT_HOST || "https://chat.watch.okii.com").replace(/\/$/, "");

// ── Signing (SSO) ──────────────────────────────────────────────────────────────
// Recovered from librubbish.so — see docs/signing-and-crypto.md.
const SIGN_SECRETS = {
  "11": "LKyF8jThHbZfUeTP", // geta  → get2  (XOR {1..5} then right-rotate 4)  ✓ live
  "31": "CXy5qhZZ0qHkjvgh", // getTeacherA → get9 (rotate 4 then XOR {1..5}) ✓ live
  "33": "5sacCZns3z9sTcCX", // geth  → get12 (plain constant)               ✓ live
  "35": "NQIiQkcCIGhfn2s9", // getI  → get13 (plain constant)               ✓ live
  "37": "thqHjysVOkGETPoY", // getJ  → get14 (plain constant)               ✓ live
};
const APP_ID = process.env.IMOORE_APP_ID || "11";
const MAC = process.env.IMOORE_MAC || "64ba24f2457d405dbf40346f96d80934";

function secretFor(appId) {
  const s = SIGN_SECRETS[String(appId)];
  if (!s) throw new Error(`no recovered sign secret for appId ${appId}`);
  return s;
}

// Java: SimpleDateFormat("yyyy-MM-dd kk:mm:ss") — kk is 01..24, not 00..23.
export function ssoTimestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  const hour = d.getHours() === 0 ? 24 : d.getHours();
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(hour)}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Java: SimpleDateFormat("yyyy-MM-dd HH:mm:ss") for the core API (00..23).
export function coreTimestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
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
  return Buffer.concat([d.update(buf), d.final()]);
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

// Response bodies are gzip-compressed before AES encryption; decode defensively
// because some server errors come back uncompressed.
function decodeResponse(payload, aesKey) {
  let plain = aesDecrypt(Buffer.from(payload, "base64"), aesKey);
  if (plain[0] === 0x1f && plain[1] === 0x8b) plain = zlib.gunzipSync(plain);
  return plain.toString("utf8");
}

// ── Device identity ────────────────────────────────────────────────────────────
// The APK derives these from the Android device/account (DeviceDataTool). We
// persist random equivalents so one prototype install looks like one device.
const DEVICE_FILE = process.env.IMOORE_DEVICE_FILE || fileURLToPath(new URL("../.device.json", import.meta.url));

function uuidHex() {
  return crypto.randomUUID().replace(/-/g, "");
}

export function deviceProfile() {
  if (process.env.IMOORE_DEVICE_ID) {
    return {
      deviceId: process.env.IMOORE_DEVICE_ID,
      machineId: process.env.IMOORE_MACHINE_ID || process.env.IMOORE_DEVICE_ID,
      nDeviceId: process.env.IMOORE_NDEVICE_ID || process.env.IMOORE_DEVICE_ID,
    };
  }
  try {
    const saved = JSON.parse(fs.readFileSync(DEVICE_FILE, "utf8"));
    if (saved.deviceId && saved.machineId && saved.nDeviceId) return saved;
  } catch {
    /* first run */
  }
  const profile = { deviceId: uuidHex(), machineId: uuidHex(), nDeviceId: uuidHex() };
  try {
    fs.writeFileSync(DEVICE_FILE, JSON.stringify(profile, null, 2));
  } catch {
    /* ephemeral is fine */
  }
  return profile;
}

// ── SSO transport ──────────────────────────────────────────────────────────────
const ssoKeys = new Map(); // host -> raw DER buffer

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
export async function getSsoPublicKey(host = SSO_HOST) {
  if (ssoKeys.has(host)) return ssoKeys.get(host);
  if (process.env.IMOORE_RSA_PUBKEY) {
    const der = Buffer.from(process.env.IMOORE_RSA_PUBKEY, "base64");
    ssoKeys.set(host, der);
    return der;
  }
  const url = `${host}/app/rsakey`;
  const at = new Date();
  const params = { appId: APP_ID, mac: MAC, timestamp: ssoTimestamp(at) };
  params.sign = buildSign(url, params, APP_ID);
  const body = Object.keys(params).map((k) => `${k}=${params[k]}`).join("&");
  const text = await httpPost(url, body, ssoHeaders(host, undefined, at));
  const json = JSON.parse(text);
  if (json.code !== "000001") throw new Error(`rsakey failed: ${json.code} ${json.desc}`);
  const der = Buffer.from(json.data, "base64");
  ssoKeys.set(host, der);
  return der;
}

// Optional App-Checksum derivation: the APK computes it with the same
// millisecond value it puts in the `timestamp` header, so it must be derived
// inside ssoHeaders() rather than supplied as a fixed environment value.
function derivedAppChecksum(millis) {
  const derPath = process.env.IMOORE_SSO_CERT_DER;
  if (!derPath) return null;
  const der = fs.readFileSync(derPath);
  // librubbish get7: inner = hexUpper(MD5(certDER)); then get8 uses SHA-256
  // (0x2cb52 in .rodata), not MD5: outer = hexUpper(SHA256(inner + millis)).
  const inner = crypto.createHash("md5").update(der).digest("hex").toUpperCase();
  return crypto
    .createHash("sha256")
    .update(inner + String(millis), "utf8")
    .digest("hex")
    .toLowerCase();
}

// Header set built by com.bbk.secureunisignon.common.net.Georgia.Uganda()
// (RequestParamsFactory.initConnection). The endpoints we call work without
// most of these, but sending them keeps requests shaped like the APK's.
export function ssoHeaders(host, encryptKey, at = new Date()) {
  const profile = deviceProfile();
  const now = at.getTime();
  const h = {
    "Content-Type": "application/x-www-form-urlencoded",
    // URLEncoder.encode(Build.BRAND + "-" + Build.MODEL)
    "Device-Name": process.env.IMOORE_DEVICE_NAME || "samsung-SM-G935F",
    Charset: "utf-8",
    Host: new URL(host).host,
    "App-Brand": process.env.IMOORE_APP_BRAND || "imoo",
    "Accept-Language": process.env.IMOORE_LANGUAGE || "en_US",
    dataCenterCode: process.env.IMOORE_DATA_CENTER_CODE || "",
    // TimeZone.getDefault().getID()
    APPGlobeZoneTime: process.env.IMOORE_TIMEZONE || "Europe/Berlin",
    // AppFunSupportUtil.getApkType()
    ApkType: process.env.IMOORE_APK_TYPE || "imoo",
    // "A_" + VersionUtil.getVersionName(versionName())
    version: `A_${APP_VERSION}`,
    nDeviceId: profile.nDeviceId,
    timestamp: String(now),
    // Georgia.Uganda() does not set User-Agent (HttpURLConnection uses the
    // Dalvik default), so this is opt-in/overridable for risk-sensitive calls.
    ...(process.env.IMOORE_NO_UA === "1"
      ? {}
      : { "User-Agent": process.env.IMOORE_USER_AGENT || "okhttp/3.12.0" }),
  };
  if (encryptKey) {
    h.EncryptType = "1";
    h.EncryptKey = encryptKey;
  }
  // The APK sends App-Checksum from com.xtc.secret.Georgia.HongKong()
  // (native getf / cached value). Derived values were rejected with 010314,
  // so it is opt-in via env for experiments.
  if (process.env.IMOORE_SSO_APP_CHECKSUM) {
    h["App-Checksum"] = process.env.IMOORE_SSO_APP_CHECKSUM;
  } else if (process.env.IMOORE_SSO_CERT_DER) {
    const checksum = derivedAppChecksum(now);
    if (checksum) h["App-Checksum"] = checksum;
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
  const at = new Date();
  const full = { ...params, appId, mac: MAC, timestamp: ssoTimestamp(at) };
  full.sign = buildSign(url, full, appId);

  const pub = await getSsoPublicKey(host);
  const aesKey = newAesKey();
  const body = aesEncrypt(JSON.stringify(full), aesKey).toString("base64");
  const encryptKey = rsaEncryptAesKey(aesKey, pub);

  const text = await httpPost(url, body, ssoHeaders(host, encryptKey, at));
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  // Some endpoints answer with a JSON string literal holding base64 ciphertext.
  if (typeof json === "string") return JSON.parse(decodeResponse(json, aesKey));
  if (json != null) return json;
  return JSON.parse(decodeResponse(text, aesKey));
}

/** Signed, unencrypted call (used by endpoints that have no payload). */
export async function ssoPostPlain(path, params, host = SSO_HOST, appId = APP_ID) {
  const url = `${host}${path}`;
  const at = new Date();
  const full = { ...params, appId, mac: MAC, timestamp: ssoTimestamp(at) };
  full.sign = buildSign(url, full, appId);
  const body = Object.keys(full).map((k) => `${k}=${full[k]}`).join("&");
  return JSON.parse(await httpPost(url, body, ssoHeaders(host, undefined, at)));
}

// ── SSO endpoints ──────────────────────────────────────────────────────────────
/**
 * POST /app/sendRandCodeV2 — request an SMS OTP.
 * Wire params per Gabon.Venezuela / SSOLoginServiceImpl:
 *   userName, areaCode, language, codeType, appId (+ mac/timestamp/sign)
 * `codeType` is an int in the APK and is sent as its decimal string:
 *   0 = register / resend, 2 = reset password, 3 = login (existing account).
 * The typed-number login screen (AccountVerifyLoginActivity) passes 3; the
 * register screen passes 0. Default here is 3 because the prototype starts
 * from an existing account, like the normal login flow.
 * Returns the raw {code,desc,data}; `data` is the randcodeKey that the login
 * step must echo back.
 */
export async function requestSmsCode(
  { userName, areaCode = "86", language = "en_US", codeType = 3, captchaId, validate, userKey } = {},
  host = SSO_HOST
) {
  if (!userName) throw new Error("userName (mobile number) is required");
  const params = { userName, areaCode, language, codeType: String(codeType) };
  if (captchaId) params.captchaId = captchaId;
  if (validate) params.validate = validate;
  if (userKey) params.userKey = userKey;
  return ssoPost("/app/sendRandCodeV2", params, host);
}

/**
 * POST /app/randcodeLogin — exchange the SMS OTP for a session.
 * Wire params per Gabon.Portugal:
 *   deviceId, userName, areaCode, randcodeKey, randcode, nDeviceId, days, appId
 * The APK passes days = "-1" (no expiry).
 */
export async function loginWithSmsCode(
  { userName, areaCode = "86", randcode, randcodeKey = "", days = "-1" } = {},
  host = SSO_HOST
) {
  if (!userName || !randcode) throw new Error("userName and randcode are required");
  const { deviceId, nDeviceId } = deviceProfile();
  return ssoPost(
    "/app/randcodeLogin",
    { deviceId, userName, areaCode, randcodeKey, randcode, nDeviceId, days },
    host
  );
}

/**
 * POST /app/loginV2 — password login.
 * Wire params per Gabon.Israel (reached from MobileService.SolomonIslands ->
 * SSONetServiceImpl.K3 -> Germany.Fc -> Hawaii.Vietnam):
 *   userName, password, days, deviceId, appId, areaCode, nDeviceId, deviceToken
 * The password is plaintext inside the AES-encrypted payload; there is no
 * separate RSA layer (the older /app/login2 path is unused in this build).
 * `deviceToken` is the NetEase Yidun captcha token; an empty value is accepted
 * and the server still validates the password.
 */
export async function loginWithPassword(
  { userName, password, areaCode = "86", days = "-1", deviceToken = "" } = {},
  host = SSO_HOST
) {
  if (!userName || !password) throw new Error("userName and password are required");
  const { deviceId, nDeviceId } = deviceProfile();
  return ssoPost(
    "/app/loginV2",
    { userName, password, days, deviceId, nDeviceId, areaCode, deviceToken },
    host
  );
}

// 010402 = wrong account/password. `data` carries the number of attempts left:
// LoginActivity$Hawaii parses it as an int and toasts "remaining times", or
// shows the "count 0" dialog when it is 0.
export function remainingPasswordAttempts(raw) {
  if (!raw || raw.code !== "010402") return null;
  const n = Number.parseInt(raw.data, 10);
  return Number.isFinite(n) ? n : null;
}

export async function areaCodeList(host = SSO_HOST) {
  return ssoPost("/app/areaCodeList", {}, host);
}

// The SSO login response is `data` = a JSON string. The app parses it as
// SSOLoginResult and then stores the **raw string** as the ticket/token
// (Germany$Ireland -> SSOLoginResult.setTicket(data), Gibraltar.Gabon ->
// MobileAccount.token = ticket), while authId = parseInt(accountId).
export function parseLoginResult(raw) {
  if (!raw || raw.code !== "000001") return null;
  const data = raw.data;
  if (typeof data !== "string" || !data.trim()) return null;
  let profile = null;
  try {
    profile = JSON.parse(data);
  } catch {
    /* older builds may return an opaque token */
  }
  const authId = profile?.accountId != null ? String(profile.accountId) : null;
  return { token: data, authId, profile };
}

// ── Core API transport ─────────────────────────────────────────────────────────
// Verified live against watch-oz.okii.com:
//   GET /rsa -> {data:{encSwitch, publicKey:<base64 SPKI>}}
//   encSwitch = 0 (this deployment):
//     Base-Request-Param = plain JSON; no Eebbk-Key / encrypted headers
//   encSwitch = 1:
//     Base-Request-Param = base64(AES-128-ECB(json, key))
//     Eebbk-Key          = base64(RSA-PKCS1(key, /rsa publicKey))
//   Eebbk-Sign           = md5(url + Base-Request-Param + body + key)
//   response             = plain JSON, or base64(AES(gzip(json))) when encrypted
// Headers mirror com.xtc.http.okhttp.Greece.
const APP_VERSION = process.env.IMOORE_APP_VERSION || "9.36.71";
// md5 of META-INF/BNDLTOOL.RSA in the official base.apk (signer CN=xtc).
const APP_CHECKSUM = process.env.IMOORE_APP_CHECKSUM || "5e2f081103fb40b3d55a324ec93fb6fd";
const coreKeys = new Map(); // host -> { der, encSwitch }

export async function getCoreMeta(host = API_HOST) {
  if (coreKeys.has(host)) return coreKeys.get(host);
  if (process.env.IMOORE_CORE_RSA_PUBKEY) {
    const der = Buffer.from(process.env.IMOORE_CORE_RSA_PUBKEY, "base64");
    const meta = { der, encSwitch: Number(process.env.IMOORE_CORE_ENC_SWITCH ?? 0) };
    coreKeys.set(host, meta);
    return meta;
  }
  const res = await fetch(`${host}/rsa`, { headers: { Accept: "application/json" } });
  const json = await res.json();
  if (json.code !== "000001" || !json.data?.publicKey) {
    throw new Error(`core /rsa failed: ${json.code} ${json.desc}`);
  }
  const meta = {
    der: Buffer.from(json.data.publicKey, "base64"),
    encSwitch: Number(json.data.encSwitch ?? 0),
  };
  coreKeys.set(host, meta);
  return meta;
}

export async function getCorePublicKey(host = API_HOST) {
  return (await getCoreMeta(host)).der;
}

function authIdFromToken(token) {
  if (!token || typeof token !== "string" || !token.trim().startsWith("{")) return null;
  try {
    const v = JSON.parse(token);
    return v?.accountId != null ? String(v.accountId) : null;
  } catch {
    return null;
  }
}

/**
 * Authenticated core-API request.
 * @param {"GET"|"POST"|"PUT"|"DELETE"} method
 * @param {string} path  e.g. "/smartwatch/mobilewatch"
 * @param {{token?: string, authId?: string|number, body?: any, host?: string}} opts
 */
export async function coreRequest(method, path, { token = "", authId, body = null, host = API_HOST } = {}) {
  const url = `${host}${path}`;
  const profile = deviceProfile();
  const key = newAesKey();
  const accountId = authId != null && authId !== "" ? String(authId) : authIdFromToken(token) || "0";

  const brp = {
    accountId,
    appId: "0",
    deviceId: profile.deviceId,
    imFlag: "1",
    mac: MAC,
    machineId: profile.machineId,
    nDeviceId: profile.nDeviceId,
    program: "android",
    registId: 0,
    timestamp: coreTimestamp(),
    token,
  };
  const meta = await getCoreMeta(host);
  const encrypt = meta.encSwitch === 1;
  const brpJson = JSON.stringify(brp);
  const brpValue = encrypt ? aesEncrypt(brpJson, key).toString("base64") : brpJson;
  const bodyText = body == null ? "" : JSON.stringify(body);
  const sign = crypto
    .createHash("md5")
    .update(url + brpValue + bodyText + key, "utf8")
    .digest("hex");

  const headers = {
    "Base-Request-Param": brpValue,
    "Eebbk-Sign": sign,
    authId: accountId,
    program: "android",
    "Content-Type": "application/json;charset=utf-8",
    "Device-Name": process.env.IMOORE_DEVICE_NAME || "samsung-SM-G935F",
    Version: APP_VERSION,
    "Accept-Language": process.env.IMOORE_LANGUAGE || "en",
    "App-Brand": "imoo",
    ApkType: "imoo",
    Host: new URL(host).host,
    "App-Checksum": APP_CHECKSUM,
  };
  if (encrypt) {
    headers["Eebbk-Key"] = rsaEncryptAesKey(key, meta.der);
    headers.encrypted = "encrypted";
  }

  const opts = { method: method.toUpperCase(), headers };
  if (bodyText && opts.method !== "GET") opts.body = bodyText;

  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  // Core responses are a JSON string literal containing the base64 ciphertext
  // (i.e. "\"<b64>\""); unwrap it before decrypting.
  if (typeof json === "string") json = JSON.parse(decodeResponse(json, key));
  else if (json == null) json = JSON.parse(decodeResponse(text, key));
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} on ${method} ${url}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

// Kept for backwards compatibility with the old prototype API.
export async function proxy(method, path, host, token, body) {
  return coreRequest(method, path, { token, body, host });
}

/**
 * POST /smartwatch/watchaccount/bindnumber — look up/bind a watch by its
 * `bindNumber`, the 16-character code shown as "Kopplungscode" on the
 * family-invite screen (`WatchAccountHttpService.getByBindNumber`, reached
 * from BindNumberHelper -> Guinea.A2 -> http/Germany.Gabon).
 * Requires a real core session: anonymous calls are rejected at the gateway
 * (100500). `randcode` is optional and only sent when non-empty.
 */
export async function bindWithCode({ bindNumber, randcode = "", token, authId } = {}, host = API_HOST) {
  if (!bindNumber) throw new Error("bindNumber (coupling code) is required");
  if (!token) throw new Error("a session token is required to bind");
  const body = { bindNumber };
  if (randcode) body.randcode = randcode;
  return coreRequest("POST", "/smartwatch/watchaccount/bindnumber", { token, authId, body, host });
}

export { SSO_HOST, API_HOST, CHAT_HOST, APP_ID, MAC };
