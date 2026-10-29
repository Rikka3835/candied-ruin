import { json } from "../_lib.js";

/** 章节阅读计数：POST { ch: n } → KV 计数 +1。
 *  只记「第几章被打开」这一件事，不记 IP/UA/cookie，不做用户画像。 */
export async function onRequestPost({ request, env }) {
  try {
    let d = {};
    try { d = await request.json(); } catch (e) { /* 允许空 body */ }
    const n = Number(d.ch);
    if (!Number.isInteger(n) || n < 1 || n > 999) return json({ ok: false, error: "ch 必须是 1–999" }, 400);
    if (!env.ART) return json({ ok: false, error: "未绑定 ART" }, 500);

    const key = `hits:ch:${n}`;
    const cur = Number(await env.ART.get(key)) || 0;
    const next = cur + 1;
    await env.ART.put(key, String(next));
    return json({ ok: true, ch: n, count: next });
  } catch (e) {
    return json({ ok: false, error: String((e && e.message) || e), where: "hit" }, 500);
  }
}

export async function onRequestGet({ env }) {
  return json({ ok: false, error: "用 POST" }, 405);
}
