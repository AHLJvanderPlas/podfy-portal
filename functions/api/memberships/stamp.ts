// functions/api/memberships/stamp.ts
// Purpose: Upsert slug membership and stamp last_session_at on successful auth.
// Works with Cloudflare Access (recommended): reads 'cf-access-authenticated-user-email'.
// For early testing (no Access yet), accepts ?email=... in query or JSON { email }.
// IMPORTANT: Once Access is on, ignore body/query email and rely solely on the header.

type Env = {
  DB: D1Database;
};

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  const url = new URL(request.url);

  // 1) Resolve email: prefer Cloudflare Access header
  const accessEmail = request.headers.get("cf-access-authenticated-user-email")?.trim().toLowerCase();
  let email = accessEmail || "";

  // For testing only (remove once Access is enforced)
  if (!email) {
    if (request.method === "POST") {
      try {
        const body = await request.json().catch(() => ({}));
        if (body?.email) email = String(body.email).trim().toLowerCase();
      } catch {}
    }
    if (!email) {
      const qEmail = url.searchParams.get("email");
      if (qEmail) email = String(qEmail).trim().toLowerCase();
    }
  }

  const slug =
    (request.method === "POST"
      ? (await request.clone().json().catch(() => ({}))).slug
      : url.searchParams.get("slug")) || "";

  if (!slug || !email) {
    return new Response(
      JSON.stringify({ ok: false, error: "missing_slug_or_email" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  // 2) Upsert membership and stamp last_session_at
  try {
    const stmt = env.DB.prepare(
      `INSERT INTO slug_users (slug, email, role, status, last_session_at)
       VALUES (?, ?, 'user', 'active', CURRENT_TIMESTAMP)
       ON CONFLICT(slug, email) DO UPDATE SET
         last_session_at = CURRENT_TIMESTAMP`
    ).bind(slug, email);

    await stmt.run();

    return new Response(
      JSON.stringify({ ok: true, slug, email, stamped: true }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
};
