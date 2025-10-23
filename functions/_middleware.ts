// functions/_middleware.ts
export const onRequest: PagesFunction = async ({ request, next }) => {
  const url = new URL(request.url);
  const path = url.pathname;

  // TEMP: allow the stamp endpoint unauthenticated for initial testing
  if (path === "/api/memberships/stamp") {
    return next();
  }

  // If using Cloudflare Access, enforce identity for everything else
  const email = request.headers.get("cf-access-authenticated-user-email");
  if (!email) {
    // Allow unauth on *.pages.dev during dev if you want:
    // if (url.hostname.endsWith(".pages.dev")) return next();
    return new Response("Unauthorized", { status: 401 });
  }
  return next();
};
