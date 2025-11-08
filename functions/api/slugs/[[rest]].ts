// functions/api/slugs/[...rest].ts
// Catch-all router for /api/slugs/:slug/users and /api/slugs/:slug/users/:id
// Dev-friendly: uses Cloudflare Access header if present, else ?email= fallback.

type Env = { DB: D1Database };

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const ok = (data: any, status = 200) => json({ ok: true, ...data }, status);
const err = (message: string, status = 400, extra: any = {}) =>
  json({ ok: false, error: message, ...extra }, status);

function normalizeEmail(v: unknown) {
  return String(v || "").trim().toLowerCase();
}

async function requireAdmin(env: Env, slug: string, email: string) {
  const row = await env.DB
    .prepare(`SELECT role, status FROM slug_users WHERE slug = ? AND email = ?`)
    .bind(slug, email)
    .get<{ role: string; status: string }>();
  if (!row) return { allowed: false, reason: "not_a_member" };
  if (row.status !== "active") return { allowed: false, reason: "membership_paused" };
  if (row.role !== "admin") return { allowed: false, reason: "not_admin" };
  return { allowed: true };
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const segments = url.pathname.split("/").filter(Boolean); // ["api","slugs",":slug", ...]
    // Expect at least: /api/slugs/:slug/...
    if (segments.length < 3) return err("invalid_path", 404);
    const slug = segments[2];

    // Normalize identity: Access header OR ?email= fallback (dev)
    const accessEmail = request.headers.get("cf-access-authenticated-user-email");
    const qEmail = url.searchParams.get("email");
    const actor = normalizeEmail(accessEmail || qEmail);

    // Route: /api/slugs/:slug/users
    if (segments.length === 4 && segments[3] === "users") {
      // RBAC: admin-only
      const auth = await requireAdmin(env, slug, actor);
      if (!auth.allowed) return err(`forbidden:${auth.reason}`, 403);

      if (request.method === "GET") {
        const { results } = await env.DB
          .prepare(
            `SELECT id, email, role, status, last_session_at, created_at, updated_at
             FROM slug_users
             WHERE slug = ?
             ORDER BY email`
          )
          .bind(slug)
          .all();
        return ok({ items: results ?? [] });
      }

      if (request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const email = normalizeEmail(body.email);
        const role = body.role === "admin" ? "admin" : "user";
        if (!email) return err("missing_email");

        await env.DB
          .prepare(
            `INSERT INTO slug_users (slug, email, role, status, last_session_at)
             VALUES (?, ?, ?, 'active', NULL)
             ON CONFLICT(slug, email) DO UPDATE SET
               role = excluded.role,
               status = 'active'`
          )
          .bind(slug, email, role)
          .run();

        const item = await env.DB
          .prepare(
            `SELECT id, email, role, status, last_session_at, created_at, updated_at
             FROM slug_users WHERE slug = ? AND email = ?`
          )
          .bind(slug, email)
          .get();
        return ok({ item }, 201);
      }

      return err("method_not_allowed", 405);
    }

    // Route: /api/slugs/:slug/users/:id
    if (segments.length === 5 && segments[3] === "users") {
      const id = Number(segments[4] || 0);
      if (!id) return err("invalid_id");

      const auth = await requireAdmin(env, slug, actor);
      if (!auth.allowed) return err(`forbidden:${auth.reason}`, 403);

      if (request.method === "PATCH") {
        const body = await request.json().catch(() => ({}));
        const action = String(body.action || "");
        let sql = "";
        if (action === "promote") sql = `UPDATE slug_users SET role = 'admin' WHERE id = ? AND slug = ?`;
        else if (action === "demote") sql = `UPDATE slug_users SET role = 'user' WHERE id = ? AND slug = ?`;
        else if (action === "pause") sql = `UPDATE slug_users SET status = 'paused' WHERE id = ? AND slug = ?`;
        else if (action === "activate") sql = `UPDATE slug_users SET status = 'active' WHERE id = ? AND slug = ?`;
        else return err("invalid_action");

        await env.DB.prepare(sql).bind(id, slug).run();

        const item = await env.DB
          .prepare(
            `SELECT id, email, role, status, last_session_at, created_at, updated_at
             FROM slug_users WHERE id = ? AND slug = ?`
          )
          .bind(id, slug)
          .get();
        return ok({ item });
      }

      if (request.method === "DELETE") {
        await env.DB.prepare(`DELETE FROM slug_users WHERE id = ? AND slug = ?`).bind(id, slug).run();
        return ok({ deleted: true });
      }

      return err("method_not_allowed", 405);
    }

    return err("not_found", 404);
  } catch (e: any) {
    // Never leak a Worker exception as HTML; always return JSON
    return err("exception:" + String(e?.message || e), 500);
  }
};
