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

function renderDoc(block) {
  const lines = block.split("\n");
  const head = lines[0].replace(/^:::\s*/, "").trim();
  const body = lines
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => l && !/^:::\s*$/.test(l));
  const m = head.match(/^([a-z][a-z-]*)\b\s*(.*)$/);
  const kind = m ? m[1] : "notice";
  const label = (m ? m[2] : head).trim();
  const labelHtml = label ? `<p class="doc-card__label">${inline(label)}</p>` : "";
  const linesHtml = body.map((l) => `<p class="doc-card__line">${inline(l)}</p>`).join("");
  const aria = label ? ` aria-label="${esc(label)}"` : "";
  return `<aside class="doc-card doc-card--${kind}" role="note"${aria}>${labelHtml}${linesHtml}</aside>`;
}

export function renderBody(md) {
  const src = String(md || "").replace(/\r\n/g, "\n");
  const noteM = src.match(/<!--\s*note\s*-->([\s\S]*?)<!--\s*\/note\s*-->/i);
  const bodyMd = noteM ? src.replace(noteM[0], "") : src;
  const out = [];
  for (const raw of bodyMd.split(/\n{2,}/)) {
    const block = raw.trim();
    if (!block) continue;
    if (/^-{3,}$/.test(block)) { out.push("<hr>"); continue; }
    if (block.startsWith(":::")) { out.push(renderDoc(block)); continue; }
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
  if (noteM) {
    const paras = noteM[1]
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (paras.length) {
      out.push(
        '<aside class="author-note" aria-label="作者注">' +
          '<p class="author-note__label">作者注</p>' +
          paras.map((p) => `<p class="author-note__p">${inline(p)}</p>`).join("") +
          '<p class="author-note__sign">— Rikka</p>' +
          "</aside>"
      );
    }
  }
  return out.join("\n");
}

export const countChars = (t) =>
  (t.match(/[\u4e00-\u9fa5]/g) || []).length + (t.match(/[A-Za-z0-9]+/g) || []).length;
