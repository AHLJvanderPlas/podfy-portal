// functions/media/[[path]].js
// -----------------------------------------------------------------------------
// Serves any object from the R2 bucket through your Portal domain.
// Example: https://portal.podfy.net/media/furore/2025...jpg
// -----------------------------------------------------------------------------

export const onRequestGet = async ({ params, env }) => {
  try {
    // For [[path]], Cloudflare provides params.path as a string of the remainder.
    // In older/runtime variants it can be an array — normalize both.
    const p = params?.path;
    const key = Array.isArray(p) ? decodeURIComponent(p.join("/")) : decodeURIComponent(p || "");
    if (!key) return new Response("Not Found", { status: 404 });

    const obj = await env.PODFY_BUCKET.get(key);
    if (!obj) return new Response("Not Found", { status: 404 });

    const headers = new Headers();
    const meta = obj.httpMetadata || {};
    if (meta.contentType) headers.set("content-type", meta.contentType);
    if (meta.contentDisposition) headers.set("content-disposition", meta.contentDisposition);
    headers.set("cache-control", "public, max-age=604800, immutable"); // 7 days

    return new Response(obj.body, { headers });
  } catch (err) {
    console.error("Media route error:", err);
    return new Response("Internal Error", { status: 500 });
  }
};
