import test from "node:test";
import assert from "node:assert/strict";
import { buildSign, parseLoginResult, deviceProfile, ssoTimestamp, coreTimestamp, ssoHeaders, remainingPasswordAttempts } from "../src/imooClient.js";

test("buildSign matches the recovered appId 11 vector", () => {
  const url = "https://account.okii.com/app/areaCodeList";
  const params = {
    timestamp: "2026-10-21 14:00:00",
    appId: "11",
    mac: "64ba24f2457d405dbf40346f96d80934",
  };
  // md5(url + "appId=11##mac=…##timestamp=…" + secret), secret = LKyF8jThHbZfUeTP
  assert.equal(buildSign(url, params, "11"), "a72786ae241d629587c7ab89be302463");
});

test("buildSign sorts keys case-insensitively", () => {
  const url = "https://account.okii.com/app/x";
  const a = buildSign(url, { b: "2", A: "1" }, "11");
  const b = buildSign(url, { A: "1", b: "2" }, "11");
  assert.equal(a, b);
});

test("buildSign rejects an unknown appId instead of signing with the wrong key", () => {
  assert.throws(() => buildSign("https://x/y", {}, "999"), /no recovered sign secret/);
});

test("ssoTimestamp uses Java kk hours (midnight = 24)", () => {
  const d = new Date(2026, 0, 2, 0, 5, 6);
  assert.equal(ssoTimestamp(d), "2026-01-02 24:05:06");
  assert.equal(coreTimestamp(d), "2026-01-02 00:05:06");
});

test("parseLoginResult keeps the raw data string as the token", () => {
  const data = JSON.stringify({ accountId: "123456", ticket: "t", loginName: "u" });
  const parsed = parseLoginResult({ code: "000001", desc: "success", data });
  assert.equal(parsed.token, data);
  assert.equal(parsed.authId, "123456");
  assert.equal(parsed.profile.loginName, "u");
});

test("parseLoginResult ignores failures", () => {
  assert.equal(parseLoginResult({ code: "010105", desc: "验证码已失效", data: null }), null);
  assert.equal(parseLoginResult(null), null);
  assert.equal(parseLoginResult({ code: "000001", data: "" }), null);
});

test("remainingPasswordAttempts reads the loginV2 010402 counter", () => {
  assert.equal(remainingPasswordAttempts({ code: "010402", desc: "账号名或密码错误", data: 2 }), 2);
  assert.equal(remainingPasswordAttempts({ code: "010402", desc: "账号名或密码错误", data: "0" }), 0);
  assert.equal(remainingPasswordAttempts({ code: "000001", data: 2 }), null);
  assert.equal(remainingPasswordAttempts(null), null);
});

test("deviceProfile is stable and shaped like the APK's device ids", () => {
  const a = deviceProfile();
  const b = deviceProfile();
  assert.deepEqual(a, b);
  assert.match(a.deviceId, /^[0-9a-f]{32}$/);
  assert.match(a.machineId, /^[0-9a-f]{32}$/);
  assert.match(a.nDeviceId, /^[0-9a-f]{32}$/);
});

test("ssoHeaders mirrors RequestParamsFactory.initConnection", () => {
  const h = ssoHeaders("https://account-oz.okii.com");
  assert.equal(h.Host, "account-oz.okii.com");
  assert.equal(h.Charset, "utf-8");
  assert.equal(h["App-Brand"], "imoo");
  assert.equal(h.ApkType, "imoo");
  assert.equal(h.version, "A_9.36.71");
  assert.equal(h.nDeviceId, deviceProfile().nDeviceId);
  assert.match(h.timestamp, /^\d{13}$/);
  // The APK also sends App-Checksum, but its native derivation is tied to the
  // installed APK signature and the live gateway rejects our value (010314).
  assert.equal(h["App-Checksum"], undefined);
  assert.equal(h.EncryptType, undefined);
  assert.equal(ssoHeaders("https://account-oz.okii.com", "abc").EncryptType, "1");
});
