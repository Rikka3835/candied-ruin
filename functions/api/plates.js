import { json } from "../_lib.js";

export async function onRequestGet({ env }) {
  const slots = [];
  if (env.ASSETS) {
    try {
      const list = await env.ASSETS.list({ prefix: "cast/", limit: 200 });
      for (const k of list.keys) {
        const m = k.name.match(/^cast\/(\d+)\/plate-1200\.jpg$/);
        if (m) slots.push(Number(m[1]));
      }
    } catch (e) {}
  }
  slots.sort((a, b) => a - b);
  return json({ slots });
}
