const API_HOST = process.env.IMOORE_API_HOST || "https://watch.okii.com";

const AUTH_HEADER = process.env.IMOORE_AUTH_HEADER || "Authorization";
const AUTH_PREFIX = process.env.IMOORE_AUTH_PREFIX || "Bearer";

function authHeaders(token) {
  if (!token) return {};
  return { [AUTH_HEADER]: AUTH_PREFIX ? `${AUTH_PREFIX} ${token}` : token };
}

async function call(method, path, host, token, body) {
  const url = `${host}${path}`;
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    ...authHeaders(token),
  };
  const opts = { method, headers };
  if (body !== null && body !== undefined && method !== "GET") {
    opts.body = JSON.stringify(body);
  }
  const resp = await fetch(url, opts);
  const text = await resp.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { __raw__: text };
  }
  if (!resp.ok) {
    const err = new Error(`HTTP ${resp.status} on ${method} ${url}`);
    err.status = resp.status;
    err.body = json;
    throw err;
  }
  return json;
}

export async function requestSmsCode({ mobilePhone, areaCode }, host = API_HOST) {
  return call("POST", "/app/sendRandCodeV2", host, null, { mobilePhone, areaCode });
}

export async function loginWithSmsCode({ mobilePhone, areaCode, randcode }, host = API_HOST) {
  return call("POST", "/app/randcodeLogin", host, null, {
    mobilePhone,
    areaCode,
    randcode,
  });
}

export async function proxy(method, path, host, token, body) {
  return call(method, path, host, token, body);
}
