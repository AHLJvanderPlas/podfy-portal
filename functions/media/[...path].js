// functions/media/[...path].js
export const onRequestGet = async ({ params, env }) => {
  try {
    const key = decodeURIComponent((params.path || []).join("/"));
    if (!key) return new Response("Not Found", { status: 404 });

    const obj = await env.PODFY_BUCKET.get(key);
    if (!obj) return new Response("Not Found", { status: 404 });

    const headers = new Headers();
    const meta = obj.httpMetadata || {};
    if (meta.contentType) headers.set("content-type", meta.contentType);
    if (meta.contentDisposition) headers.set("content-disposition", meta.contentDisposition);
    headers.set("cache-control", "public, max-age=604800, immutable");

    return new Response(obj.body, { headers });
  } catch (err) {
    console.error("Media route error:", err);
    return new Response("Internal Error", { status: 500 });
  }
};
