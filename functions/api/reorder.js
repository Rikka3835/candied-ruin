import { json, isAdmin } from "../_lib.js";

// POST /api/reorder  { order: [n1, n2, ...] }
// 按数组顺序把章节重编成 1..N。做法：先整体 +1000 偏移，避免主键冲突，再按新序写回。
export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ ok: false, error: "未登录" }, 401);

  let body = {};
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: "请求格式不对" }, 400); }
  const order = Array.isArray(body.order) ? body.order.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  if (!order.length) return json({ ok: false, error: "缺少顺序" }, 400);
  if (new Set(order).size !== order.length) return json({ ok: false, error: "顺序里有重复章号" }, 400);

  const rows = await env.DB.prepare("SELECT n FROM chapters").all();
  const have = (rows.results || []).map((r) => r.n).sort((a, b) => a - b);
  const same = have.length === order.length && have.every((n, i) => n === [...order].sort((a, b) => a - b)[i]);
  if (!same) return json({ ok: false, error: "顺序必须覆盖全部章节，不能多也不能少" }, 400);

  const stmts = [env.DB.prepare("UPDATE chapters SET n = n + 1000")];
  order.forEach((oldN, i) => {
    stmts.push(env.DB.prepare("UPDATE chapters SET n = ?1 WHERE n = ?2").bind(i + 1, oldN + 1000));
  });
  await env.DB.batch(stmts);

  const after = await env.DB.prepare("SELECT n, title FROM chapters ORDER BY n").all();
  return json({ ok: true, order: (after.results || []).map((r) => r.n), count: order.length });
}
