// functions/api/slugs/[slug]/users/[id].ts
// PATCH: { action: 'promote'|'demote'|'pause'|'activate' }
// DELETE: remove membership

type Env = { DB: D1Database };

function normalizeEmail(v: unknown) { return String(v || "").trim().toLowerCase(); }
function ok(data: any, status = 200) {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status, headers: { "content-type": "application/json" },
  });
}
function err(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status, headers: { "content-type": "application/json" },
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
  const slug = String((params as any)?.slug || "");
  const id = Number((params as any)?.id || 0);
  if (!slug || !id) return err("missing_params");

  const url = new URL(request.url);
  const accessEmail = request.headers.get("cf-access-authenticated-user-email");
  const qEmail = url.searchParams.get("email");
  const actor = normalizeEmail(accessEmail || qEmail);

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

    const row = await env.DB.prepare(
      `SELECT id, email, role, status, last_session_at, created_at, updated_at
       FROM slug_users WHERE id = ? AND slug = ?`
    ).bind(id, slug).get();

    return ok({ item: row });
  }

  if (request.method === "DELETE") {
    await env.DB.prepare(`DELETE FROM slug_users WHERE id = ? AND slug = ?`).bind(id, slug).run();
    return ok({ deleted: true });
  }

  return err("method_not_allowed", 405);
};
