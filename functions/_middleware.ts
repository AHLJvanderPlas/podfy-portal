// TEMP DEV MIDDLEWARE — allows unauthenticated access to session + stamp
// Revert to strict mode once Cloudflare Access is enabled.

export const onRequest: PagesFunction = async ({ request, next }) => {
  const url = new URL(request.url);
  const path = url.pathname;

  // Allow these endpoints unauthenticated during UI build
  if (path === "/api/auth/session" || path === "/api/memberships/stamp") {
    return next();
  }

  // Everything else would require Access (commented for now)
  // const email = request.headers.get("cf-access-authenticated-user-email");
  // if (!email) return new Response("Unauthorized", { status: 401 });

  return next();
};
