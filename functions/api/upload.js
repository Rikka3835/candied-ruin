import { json, isAdmin } from "../_lib.js";

export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false, error: "未登录" }, 401);
  if (!env.ART) return json({ ok: false, error: "存储未绑定" }, 500);

  let body = {};
  try { body = await request.json(); } catch (e) {}
  const c = Number(body.c);
  if (!(c >= 1 && c <= 12)) return json({ ok: false, error: "人物编号不对" }, 400);

  const data = String(body.data || "");
  const m = data.match(/^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) return json({ ok: false, error: "只收 jpeg / png" }, 400);

  let bin;
  try { bin = Uint8Array.from(atob(m[2].replace(/\s/g, "")), (ch) => ch.charCodeAt(0)); }
  catch (e) { return json({ ok: false, error: "图片数据坏了" }, 400); }

  if (bin.byteLength > 1500000) return json({ ok: false, error: "图太大（上限 1.5MB）" }, 413);

  await env.ART.put(`cast/${c}/plate-1200.jpg`, bin, { metadata: { at: Date.now() } });
  return json({ ok: true, c, bytes: bin.byteLength, url: `/api/plate/${c}` });
}

export async function onRequestDelete({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false, error: "未登录" }, 401);
  const c = Number(new URL(request.url).searchParams.get("c"));
  if (!(c >= 1 && c <= 12)) return json({ ok: false, error: "人物编号不对" }, 400);
  await env.ART.delete(`cast/${c}/plate-1200.jpg`);
  return json({ ok: true });
}
