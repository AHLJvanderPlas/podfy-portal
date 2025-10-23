// functions/api/slugs/[slug]/users.ts
// GET: list users for slug
// POST: create/invite membership { email, role } -> upsert active
// RBAC: only slug admins (active) can manage

type Env = { DB: D1Database };

function normalizeEmail(v: unknown) {
  return String(v || "").trim().toLowerCase();
}
function ok(data: any, status = 200) {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function err(message: string, status = 400, extra: any = {}) {
  return new Response(JSON.stringify({ ok: false, error: message, ...extra }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function requireAdmin(env: Env, slug: string, email: string) {
  const q = await env.DB.prepare(
    `SELECT role, status FROM slug_users WHERE slug = ? AND email = ?`
  ).bind(slug, email).get<{ role: string; status: string }>();
  if (!q) return { allowed: false, reason: "not_a_member" };
  if (q.status !== "active") return { allowed: false, reason: "membership_paused" };
  if (q.role !== "admin") return { allowed: false, reason: "not_admin" };
  return { allowed: true };
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { env, request, params } = ctx;
  const slug = String((params as any)?.slug || "").trim();

  if (!slug) return err("missing_slug", 400);

  // Identity: Access header OR ?email= fallback (DEV)
  const url = new URL(request.url);
  const accessEmail = request.headers.get("cf-access-authenticated-user-email");
  const qEmail = url.searchParams.get("email");
  const actor = normalizeEmail(accessEmail || qEmail);

  // Only admins may read/manage
  const auth = await requireAdmin(env, slug, actor);
  if (!auth.allowed) return err(`forbidden:${auth.reason}`, 403);

  if (request.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT id, email, role, status, last_session_at, created_at, updated_at
       FROM slug_users
       WHERE slug = ?
       ORDER BY email`
    ).bind(slug).all();
    return ok({ items: results ?? [] });
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const role = (body.role === "admin" ? "admin" : "user");

    if (!email) return err("missing_email");
    // Upsert membership to active
    await env.DB.prepare(
      `INSERT INTO slug_users (slug, email, role, status, last_session_at)
       VALUES (?, ?, ?, 'active', NULL)
       ON CONFLICT(slug, email) DO UPDATE SET
         role = excluded.role,
         status = 'active'`
    ).bind(slug, email, role).run();

    const row = await env.DB.prepare(
      `SELECT id, email, role, status, last_session_at, created_at, updated_at
       FROM slug_users WHERE slug = ? AND email = ?`
    ).bind(slug, email).get();

    return ok({ item: row }, 201);
  }

  return err("method_not_allowed", 405);
};
