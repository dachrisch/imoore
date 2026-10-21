import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// On-device bridge for Google reCAPTCHA tokens. The imoo app's SDK is the only
// thing that can mint a token for the site key com.recaptcha.id.app.imoo.
// A small Python helper uses Frida to load tools/fetch-captcha.js into the
// running app and prints the token the script sends back.
//
// Requires: rooted phone, frida-server, frida (Python), USB debugging, app.

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "../tools/fetch-captcha.js");
const RUNNER = join(__dirname, "../tools/fetch-captcha.py");
const SITE_KEY = "com.recaptcha.id.app.imoo";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function adb(args) {
  return execFileSync("adb", args, {
    encoding: "utf8",
    timeout: 15000,
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function foregroundApp() {
  try {
    adb([
      "shell",
      "monkey",
      "-p",
      "com.imoo.watch.global",
      "-c",
      "android.intent.category.LAUNCHER",
      "1",
    ]);
  } catch {
    /* best effort */
  }
}

function appPid() {
  try {
    const p = adb(["shell", "pidof", "com.imoo.watch.global"]).split(/\s+/)[0];
    if (p) return p;
  } catch {
    /* fall through */
  }
  try {
    const ps = execFileSync("adb", ["shell", "ps", "-A"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const line = ps.split("\n").find((l) => /com\.imoo\.watch\.global\s*$/.test(l));
    return line ? line.trim().split(/\s+/)[1] : null;
  } catch {
    return null;
  }
}

async function attempt({ timeoutMs, pid }) {
  const python = process.env.FRIDA_PYTHON || "python3";
  const proc = spawn(python, [RUNNER, String(pid), SCRIPT], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let out = "";
  let err = "";
  proc.stdout.on("data", (d) => {
    out += d.toString();
  });
  proc.stderr.on("data", (d) => {
    err += d.toString();
  });

  try {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await sleep(250);
      const m = out.match(/CAPTCHA_TOKEN=(\S+)/);
      if (m) return { token: m[1], siteKey: SITE_KEY };
      if (out.includes("CAPTCHA_ERROR=") || out.includes("CAPTCHA_TIMEOUT")) {
        throw new Error((out.trim() || err.trim() || "captcha failed").slice(0, 300));
      }
      if (proc.exitCode !== null) {
        throw new Error((out.trim() || err.trim() || `frida exited (${proc.exitCode})`).slice(0, 300));
      }
    }
    throw new Error("timed out waiting for a reCAPTCHA token");
  } finally {
    try {
      proc.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

/**
 * Ask the app for one reCAPTCHA token.
 * @returns {Promise<{token: string, siteKey: string}>}
 */
export async function fetchCaptchaToken({ timeoutMs = 30000 } = {}) {
  foregroundApp();
  await sleep(1500);

  const firstPid = appPid();
  if (!firstPid) throw new Error("imoo app is not running on the adb device");

  try {
    return await attempt({ timeoutMs, pid: firstPid });
  } catch (err) {
    // The app may have restarted (new PID) or been backgrounded; foreground and
    // retry once with a fresh PID.
    foregroundApp();
    await sleep(2000);
    const pid = appPid();
    if (!pid) throw err;
    return attempt({ timeoutMs, pid });
  }
}

export { SITE_KEY };
