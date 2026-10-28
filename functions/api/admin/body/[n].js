import { json, isAdmin } from "../../../_lib.js";

export async function onRequestGet({ params, request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false, error: "未登录" }, 401);
  const row = await env.DB.prepare("SELECT body FROM chapters WHERE n=?1").bind(Number(params.n)).first();
  return json({ ok: true, body: row ? row.body : "" });
}
