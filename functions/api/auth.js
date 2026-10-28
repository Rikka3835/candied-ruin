import { json, isAdmin, makeToken, cookieHeader, clearCookie } from "../_lib.js";

export async function onRequestGet({ request, env }) {
  return json({ ok: await isAdmin(request, env) });
}

export async function onRequestPost({ request, env }) {
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const pass = String(body.password || "");
  if (!env.ADMIN_PASSWORD || pass !== env.ADMIN_PASSWORD) return json({ ok: false, error: "口令不对" }, 401);
  const token = await makeToken(env.SESSION_SECRET || "x");
  return json({ ok: true }, 200, { "set-cookie": cookieHeader(token) });
}

export async function onRequestDelete() {
  return json({ ok: true }, 200, { "set-cookie": clearCookie });
}
