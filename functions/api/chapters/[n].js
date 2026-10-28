import { json, isAdmin, renderBody } from "../../_lib.js";

export async function onRequestGet({ params, env }) {
  const n = Number(params.n);
  const row = await env.DB.prepare("SELECT * FROM chapters WHERE n=?1 AND status='published'").bind(n).first();
  if (!row) return json({ ok: false, error: "没有这一章" }, 404);
  return json({ n: row.n, vol: row.vol, title: row.title, subtitle: row.subtitle, html: renderBody(row.body), updated: row.updated });
}

export async function onRequestDelete({ params, request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false, error: "未登录" }, 401);
  await env.DB.prepare("DELETE FROM chapters WHERE n=?1").bind(Number(params.n)).run();
  return json({ ok: true });
}
