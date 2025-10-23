// functions/_middleware.ts
// Require Cloudflare Access identity for all Functions.
// If you still need to test on *.pages.dev without Access, uncomment the dev bypass.

export const onRequest: PagesFunction = async ({ request, next }) => {
  const url = new URL(request.url);

  // DEV BYPASS (optional): allow unauth on *.pages.dev
  // if (url.hostname.endsWith(".pages.dev")) return next();

  const email = request.headers.get("cf-access-authenticated-user-email");
  if (!email) return new Response("Unauthorized", { status: 401 });

  return next();
};
