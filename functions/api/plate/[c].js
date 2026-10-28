export async function onRequestGet({ params, env }) {
  const n = String(params.c || "").replace(/[^0-9]/g, "");
  if (!n) return new Response("bad request", { status: 400 });
  const key = `cast/${n}/plate-1200.jpg`;
  let buf = null;
  if (env.ASSETS) {
    try { buf = await env.ASSETS.get(key, "arrayBuffer"); } catch (e) {}
  }
  if (!buf) {
    return new Response(null, {
      status: 302,
      headers: { location: `/new/assets/cast/c${n}/plate-1200.jpg`, "cache-control": "no-store" }
    });
  }
  return new Response(buf, {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "public, max-age=60",
      "content-length": String(buf.byteLength)
    }
  });
}
