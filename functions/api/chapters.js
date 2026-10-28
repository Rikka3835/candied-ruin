import { json, isAdmin, countChars } from "../_lib.js";

export async function onRequestGet({ request, env }) {
  try {
  const admin = await isAdmin(request, env);
  const sql = admin
    ? "SELECT n, vol, title, subtitle, [cast] AS cast, status, updated, length(body) AS size FROM chapters ORDER BY n"
    : "SELECT n, vol, title, subtitle, [cast] AS cast, 'published' AS status, updated, length(body) AS size FROM chapters WHERE status='published' ORDER BY n";
    const { results } = await env.DB.prepare(sql).all();
    return json({ chapters: results || [] });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message || e), where: "list" }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
  let d = {};
  try { d = await request.json(); } catch (e) { return json({ ok: false, error: "格式错误" }, 400); }
  const n = Number(d.n);
  if (!Number.isInteger(n) || n <= 0) return json({ ok: false, error: "章号必须是正整数" }, 400);
  if (!d.title || !String(d.title).trim()) return json({ ok: false, error: "标题不能空" }, 400);
  if (!d.body || !String(d.body).trim()) return json({ ok: false, error: "正文不能空" }, 400);
  const status = d.status === "published" ? "published" : "draft";
  const now = new Date().toISOString().slice(0, 10);
  await env.DB.prepare(
    `INSERT INTO chapters (n, vol, title, subtitle, [cast], body, status, updated)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
     ON CONFLICT(n) DO UPDATE SET vol=?2, title=?3, subtitle=?4, "cast"=?5, body=?6, status=?7, updated=?8`
  ).bind(n, String(d.vol || ""), String(d.title).trim(), String(d.subtitle || ""), String(d.cast || ""), String(d.body), status, now).run();
  return json({ ok: true, n, chars: countChars(String(d.body)), status });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message || e), where: "save" }, 500);
  }
}
