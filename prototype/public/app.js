const $ = (id) => document.getElementById(id);
const token = () => $("token").value.trim();
const authId = () => $("authId").value.trim();
// sendRandCodeV2 hands back a key that randcodeLogin must echo; the APK keeps
// it in the login presenter, so we keep it in memory too.
let randcodeKey = "";

async function postJson(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

function showPre(el, data) {
  el.classList.remove("hidden");
  el.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

function setStatus(el, ok, text) {
  el.className = `status ${ok ? "ok" : "bad"}`;
  el.textContent = text;
}

function unlockChat() {
  $("chatCard").classList.remove("hidden");
}

// ── Self-test ───────────────────────────────────────────────────────────────────
$("btnSelftest").onclick = async () => {
  $("selftestCard").classList.remove("hidden");
  $("selftestOut").textContent = "Running…";
  try {
    const r = await fetch("/api/selftest");
    showPre($("selftestOut"), await r.json());
  } catch (err) {
    showPre($("selftestOut"), String(err));
  }
};

// ── Login ───────────────────────────────────────────────────────────────────────
$("btnCode").onclick = async () => {
  const btn = $("btnCode");
  btn.disabled = true;
  setStatus($("codeStatus"), true, "Sending…");
  try {
    const r = await postJson("/api/login/code", {
      userName: $("userName").value.trim(),
      areaCode: $("areaCode").value.trim(),
      language: $("language").value.trim(),
    });
    if (r.ok) {
      randcodeKey = r.randcodeKey || "";
      setStatus($("codeStatus"), true, "Code sent. Check the SMS, then enter it below.");
    } else {
      setStatus($("codeStatus"), false, `${r.code || "error"} — ${r.desc || r.error || "send failed"}`);
    }
    if (r.raw) showPre($("codeRaw"), r.raw);
  } catch (err) {
    setStatus($("codeStatus"), false, String(err));
  } finally {
    btn.disabled = false;
  }
};

$("btnVerify").onclick = async () => {
  const btn = $("btnVerify");
  btn.disabled = true;
  setStatus($("loginStatus"), true, "Verifying…");
  try {
    const r = await postJson("/api/login/verify", {
      userName: $("userName").value.trim(),
      areaCode: $("areaCode").value.trim(),
      randcode: $("randcode").value.trim(),
      randcodeKey,
    });
    if (r.ok && r.token) {
      $("token").value = r.token;
      $("authId").value = r.authId || "";
      if (r.profile) showPre($("profileOut"), r.profile);
      setStatus($("loginStatus"), true, `Logged in — authId ${r.authId || "?"}`);
      unlockChat();
    } else {
      setStatus($("loginStatus"), false, `${r.code || "error"} — ${r.desc || r.error || "login failed"}`);
    }
    if (r.raw) showPre($("loginRaw"), r.raw);
  } catch (err) {
    setStatus($("loginStatus"), false, String(err));
  } finally {
    btn.disabled = false;
  }
};

$("btnAreaCodes").onclick = async () => {
  const btn = $("btnAreaCodes");
  btn.disabled = true;
  setStatus($("areaStatus"), true, "Fetching…");
  try {
    const r = await postJson("/api/area-codes", {});
    if (r.ok) {
      const sample = Array.isArray(r.codes) ? r.codes.slice(0, 8) : [];
      setStatus($("areaStatus"), true, `${r.count} area codes (live)`);
      showPre($("areaOut"), sample);
    } else {
      setStatus($("areaStatus"), false, `${r.code} — ${r.desc || r.error}`);
      if (r.raw) showPre($("areaOut"), r.raw);
    }
  } catch (err) {
    setStatus($("areaStatus"), false, String(err));
  } finally {
    btn.disabled = false;
  }
};

// ── Core API ───────────────────────────────────────────────────────────────────
async function coreGet(path) {
  const q = new URLSearchParams({ token: token(), authId: authId() });
  const r = await fetch(`/api/${path}?${q}`);
  return r.json();
}

async function runCore(btnId, fn) {
  const btn = $(btnId);
  btn.disabled = true;
  try {
    const r = await fn();
    const el = $("chatOut");
    el.innerHTML = "";
    const pre = document.createElement("pre");
    el.appendChild(pre);
    showPre(pre, r);
  } finally {
    btn.disabled = false;
  }
}

$("btnWatches").onclick = () =>
  runCore("btnWatches", () => coreGet("watches"));
$("btnGroups").onclick = () =>
  runCore("btnGroups", () => coreGet("groups"));
$("btnMembers").onclick = () =>
  runCore("btnMembers", () => coreGet("members"));

$("btnSend").onclick = async () => {
  const btn = $("btnSend");
  btn.disabled = true;
  try {
    let body = null;
    const raw = $("sendBody").value.trim();
    if (raw && raw !== "{}") body = JSON.parse(raw);
    const r = await postJson("/api/proxy", {
      method: $("sendMethod").value,
      host: $("sendHost").value,
      path: $("sendPath").value.trim(),
      token: token(),
      authId: authId(),
      body,
    });
    showPre($("sendOut"), r);
  } catch (err) {
    showPre($("sendOut"), String(err));
  } finally {
    btn.disabled = false;
  }
};

// Once a token is present, reveal the core panel.
if (token()) unlockChat();
