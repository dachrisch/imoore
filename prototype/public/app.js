const $ = (id) => document.getElementById(id);
const token = () => $("token").value.trim();

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
  el.textContent = JSON.stringify(data, null, 2);
}

// ── Login ───────────────────────────────────────────────────────────────────────
$("btnCode").onclick = async () => {
  $("codeStatus").textContent = "Sending…";
  const r = await postJson("/api/login/code", {
    mobilePhone: $("mobilePhone").value.trim(),
    areaCode: $("areaCode").value.trim(),
  });
  $("codeStatus").textContent = r.ok ? "Code sent (check SMS)." : `Error: ${r.error}`;
  showPre($("codeStatus"), r);
};

$("btnVerify").onclick = async () => {
  $("loginStatus").textContent = "Verifying…";
  const r = await postJson("/api/login/verify", {
    mobilePhone: $("mobilePhone").value.trim(),
    areaCode: $("areaCode").value.trim(),
    randcode: $("randcode").value.trim(),
  });
  if (r.ok) {
    $("token").value = r.token || "";
    $("loginStatus").textContent = r.token
      ? "Logged in. Token captured below."
      : "Login responded but no token field found — see raw response.";
    $("chatCard").classList.remove("hidden");
  } else {
    $("loginStatus").textContent = `Error: ${r.error}`;
  }
  showPre($("loginStatus"), r);
};

// ── Chat reads ─────────────────────────────────────────────────────────────────
async function loadGet(url, target) {
  const r = await fetch(`${url}?token=${encodeURIComponent(token())}`);
  const data = await r.json();
  const el = $(target);
  el.innerHTML = "";
  const wrap = document.createElement("pre");
  wrap.textContent = JSON.stringify(data, null, 2);
  el.appendChild(wrap);
}

$("btnWatches").onclick = () => loadGet("/api/watches", "chatOut");
$("btnGroups").onclick = () => loadGet("/api/groups", "chatOut");
$("btnMembers").onclick = () => loadGet("/api/members", "chatOut");

// ── Chat send (generic proxy) ───────────────────────────────────────────────────
$("btnSend").onclick = async () => {
  let body;
  try {
    body = JSON.parse($("sendBody").value);
  } catch (e) {
    alert("Invalid JSON body");
    return;
  }
  const r = await postJson("/api/proxy", {
    method: $("sendMethod").value,
    path: $("sendPath").value,
    host: "chat",
    token: token(),
    body,
  });
  showPre($("sendOut"), r);
};
