const enc = new TextEncoder();
export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra }
  });

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(payload, secret) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
}

export const COOKIE = "cr_admin";

export async function makeToken(secret, days = 30) {
  const exp = Date.now() + days * 864e5;
  return `${exp}.${await hmac(String(exp), secret)}`;
}

export async function isAdmin(request, env) {
  const raw = request.headers.get("cookie") || "";
  const m = raw.match(new RegExp(`(?:^|;\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [exp, sig] = decodeURIComponent(m[1]).split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const want = await hmac(String(exp), env.SESSION_SECRET || "x");
  return sig === want;
}

export const cookieHeader = (token, days = 30) =>
  `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${days * 86400}`;
export const clearCookie = `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

export function renderBody(md) {
  const out = [];
  for (const raw of md.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const block = raw.trim();
    if (!block) continue;
    if (/^-{3,}$/.test(block)) { out.push("<hr>"); continue; }
    if (block.startsWith("## ")) { out.push(`<h2>${inline(block.slice(3).trim())}</h2>`); continue; }
    if (block.startsWith("### ")) { out.push(`<h3>${inline(block.slice(4).trim())}</h3>`); continue; }
    if (block.startsWith("> ")) {
      const lines = block.split("\n").map((l) => l.replace(/^>\s?/, ""));
      out.push(`<blockquote><p>${inline(lines.join(" "))}</p></blockquote>`);
      continue;
    }
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    out.push(`<p>${lines.map(inline).join("<br>")}</p>`);
  }
  return out.join("\n");
}

export const countChars = (t) =>
  (t.match(/[\u4e00-\u9fa5]/g) || []).length + (t.match(/[A-Za-z0-9]+/g) || []).length;
