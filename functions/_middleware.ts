// functions/_middleware.ts
export const onRequest: PagesFunction = async ({ request, next }) => {
  // Require Cloudflare Access identity for all Functions under this project.
  const email = request.headers.get("cf-access-authenticated-user-email");
  if (!email) {
    // Allow unauth for local/dev preview if needed:
    if (new URL(request.url).hostname.endsWith(".pages.dev")) {
      return next();
    }
    return new Response("Unauthorized", { status: 401 });
  }
  return next();
};
