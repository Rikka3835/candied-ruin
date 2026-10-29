import { json, isAdmin } from "../_lib.js";

/** 阅读计数汇总（只给后台）：GET → { counts: { "1": 12, "2": 5 } } */
export async function onRequestGet({ request, env }) {
  try {
    if (!(await isAdmin(request, env))) return json({ ok: false, error: "未登录" }, 401);
    if (!env.ART) return json({ ok: false, error: "未绑定 ART" }, 500);

    const counts = {};
    const list = await env.ART.list({ prefix: "hits:ch:" });
    for (const k of list.keys) {
      const n = k.name.slice("hits:ch:".length);
      counts[n] = Number(await env.ART.get(k.name)) || 0;
    }
    return json({ ok: true, counts });
  } catch (e) {
    return json({ ok: false, error: String((e && e.message) || e), where: "hits" }, 500);
  }
}
