// TEMP DEV MIDDLEWARE — allows unauthenticated access to session, stamp, and users endpoints
// Revert to strict Access once Cloudflare Access is enabled.

export const onRequest: PagesFunction = async ({ request, next }) => {
  const url = new URL(request.url);
  const path = url.pathname;

  // Allow these endpoints during UI build
  if (
    path === "/api/auth/session" ||
    path === "/api/memberships/stamp" ||
    path.startsWith("/api/slugs/") // TEMP: users endpoints below
  ) {
    return next();
  }

  // Strict mode (for later)
  // const email = request.headers.get("cf-access-authenticated-user-email");
  // if (!email) return new Response("Unauthorized", { status: 401 });

  return next();
};
