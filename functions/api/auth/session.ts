// functions/api/auth/session.ts
// Returns the authenticated user's email and their per-slug memberships,
// including last_session_at, role, status, and inactivity info for warnings.

type Env = { DB: D1Database };

const AUTO_PAUSE_AFTER_DAYS = 90;

function daysBetween(a: Date, b: Date) {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  // Identity is enforced by functions/_middleware.ts via Cloudflare Access
  const email = request.headers.get("cf-access-authenticated-user-email")?.trim().toLowerCase();
  if (!email) return new Response("Unauthorized", { status: 401 });

  // Fetch memberships for this email
  // Optional: join themes for brand name if present
  const sql = `
    SELECT su.slug, su.email, su.role, su.status, su.last_session_at,
           t.brand_name
    FROM slug_users su
    LEFT JOIN themes t ON t.slug = su.slug
    WHERE su.email = ?
    ORDER BY su.slug ASC
  `;
  const { results } = await env.DB.prepare(sql).bind(email).all<any>();

  const now = new Date();
  const memberships = (results || []).map((r: any) => {
    // Compute inactivity data
    const last = r.last_session_at ? new Date(r.last_session_at) : null;
    const days_since_last_session = last ? daysBetween(now, last) : null;

    const paused = r.status === "paused";
    const over_threshold =
      last === null ? true : days_since_last_session! >= AUTO_PAUSE_AFTER_DAYS;

    // If currently active but over threshold, Worker will pause on next run.
    const will_be_paused_soon = !paused && over_threshold;

    return {
      slug: r.slug,
      brand_name: r.brand_name ?? null,
      role: r.role,                         // "user" | "admin"
      status: r.status,                     // "active" | "paused"
      last_session_at: r.last_session_at,   // ISO or null
      inactive: over_threshold || paused,
      days_since_last_session,              // number | null
      auto_pause_after_days: AUTO_PAUSE_AFTER_DAYS,
      will_be_paused_soon,
    };
  });

  // (Optional) read active slug from a cookie _portal_active_slug (to be set in step 3)
  const cookie = request.headers.get("Cookie") || "";
  const m = /(?:^|;\s*)_portal_active_slug=([^;]+)/.exec(cookie);
  const active_slug = m ? decodeURIComponent(m[1]) : null;

  return new Response(
    JSON.stringify({
      ok: true,
      email,
      active_slug,
      memberships,
    }),
    { headers: { "content-type": "application/json" } }
  );
};
