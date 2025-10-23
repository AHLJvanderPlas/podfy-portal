type Env = { DB: D1Database };

const AUTO_PAUSE_AFTER_DAYS = 90;
const daysBetween = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / 86400000);

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);

  // Use Access header if present; otherwise allow ?email= (DEV ONLY)
  const accessEmail = request.headers.get("cf-access-authenticated-user-email");
  const qEmail = url.searchParams.get("email");
  const email = (accessEmail || qEmail || "").trim().toLowerCase();

  if (!email) {
    return new Response(
      JSON.stringify({ ok: true, email: null, active_slug: null, memberships: [] }),
      { headers: { "content-type": "application/json" } }
    );
  }

  const { results } = await env.DB
    .prepare(`
      SELECT su.slug, su.email, su.role, su.status, su.last_session_at, t.brand_name
      FROM slug_users su
      LEFT JOIN themes t ON t.slug = su.slug
      WHERE su.email = ?
      ORDER BY su.slug ASC
    `)
    .bind(email)
    .all<any>();

  const now = new Date();
  const memberships = (results ?? []).map((r: any) => {
    const last = r.last_session_at ? new Date(r.last_session_at) : null;
    const days_since_last_session = last ? daysBetween(now, last) : null;
    const paused = r.status === "paused";
    const over_threshold = last === null ? true : days_since_last_session! >= AUTO_PAUSE_AFTER_DAYS;
    return {
      slug: r.slug,
      brand_name: r.brand_name ?? null,
      role: r.role,
      status: r.status,
      last_session_at: r.last_session_at,
      inactive: over_threshold || paused,
      days_since_last_session,
      auto_pause_after_days: AUTO_PAUSE_AFTER_DAYS,
      will_be_paused_soon: !paused && over_threshold,
    };
  });

  const cookie = request.headers.get("Cookie") || "";
  const m = /(?:^|;\s*)_portal_active_slug=([^;]+)/.exec(cookie);
  const active_slug = m ? decodeURIComponent(m[1]) : null;

  return new Response(
    JSON.stringify({ ok: true, email, active_slug, memberships }),
    { headers: { "content-type": "application/json" } }
  );
};
