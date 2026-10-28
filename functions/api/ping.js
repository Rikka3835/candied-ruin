export async function onRequest(context) {
  return new Response(JSON.stringify({ ok: true, at: new Date().toISOString(), cf: !!context.request.cf }), {
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
