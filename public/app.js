// Minimal wiring for memberships + inactivity warning + slug selection (dev mode)
// Uses /api/auth/session (temp unauth) and /api/memberships/stamp

const $ = (id) => document.getElementById(id);
const emailEl = $("email");
const slugSelect = $("slugSelect");
const setSlugBtn = $("setSlugBtn");
const roleBadge = $("roleBadge");
const stampBtn = $("stampBtn");

const kvSlug = $("kvSlug");
const kvRole = $("kvRole");
const kvStatus = $("kvStatus");
const kvLast = $("kvLast");
const kvPolicy = $("kvPolicy");
const inactivityAlert = $("inactivityAlert");

const tabs = document.querySelectorAll(".tab");
const panels = {
  transactions: $("panel-transactions"),
  settings: $("panel-settings"),
  users: $("panel-users"),
};

tabs.forEach((t) => {
  t.addEventListener("click", () => {
    tabs.forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    Object.values(panels).forEach((p) => (p.style.display = "none"));
    panels[t.dataset.tab].style.display = "";
  });
});

function setCookie(name, value, days = 30) {
  const d = new Date(Date.now() + days*864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${d}; path=/; SameSite=Lax`;
}
function getCookie(name) {
  return (document.cookie.match('(^|;)\\s*'+name+'\\s*=\\s*([^;]+)')||0)[2] || null;
}

async function fetchSession() {
  const res = await fetch("/api/auth/session");
  if (!res.ok) throw new Error("session failed");
  return res.json();
}

function renderMembershipInfo(sess) {
  emailEl.textContent = sess.email || "(no email)";
  // Populate slug dropdown
  slugSelect.innerHTML = "";
  (sess.memberships || []).forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.slug;
    opt.textContent = m.brand_name ? `${m.slug} — ${m.brand_name}` : m.slug;
    slugSelect.appendChild(opt);
  });

  // Pick active slug: cookie > api > first
  const cookieSlug = getCookie("_portal_active_slug");
  const activeSlug = cookieSlug || sess.active_slug || (sess.memberships?.[0]?.slug ?? "");
  if (activeSlug) slugSelect.value = activeSlug;

  const active = (sess.memberships || []).find(m => m.slug === slugSelect.value) || null;

  // Badges + KV
  roleBadge.textContent = active ? active.role : "";
  kvSlug.textContent = active ? active.slug : "-";
  kvRole.textContent = active ? active.role : "-";
  kvStatus.textContent = active ? active.status : "-";
  kvLast.textContent = active?.last_session_at ? new Date(active.last_session_at).toLocaleString() : "never";

  // Inactivity warning
  if (active) {
    const days = active.days_since_last_session ?? null;
    const paused = active.status === "paused";
    const soon = active.will_be_paused_soon === true;

    if (paused) {
      inactivityAlert.className = "alert bad";
      inactivityAlert.style.display = "";
      inactivityAlert.textContent = `Access paused due to inactivity. Last session: ${kvLast.textContent}. Contact a Slug Admin to reactivate.`;
    } else if (soon) {
      inactivityAlert.className = "alert warn";
      inactivityAlert.style.display = "";
      const d = days ?? "90+";
      inactivityAlert.textContent = `Warning: inactivity policy will pause access after 90 days. Days since last session: ${d}.`;
    } else {
      inactivityAlert.className = "alert ok";
      inactivityAlert.style.display = "";
      inactivityAlert.textContent = `Active. Auto-pause after 90 days of inactivity.`;
    }
  } else {
    inactivityAlert.style.display = "none";
  }
}

async function init() {
  try {
    const sess = await fetchSession();
    renderMembershipInfo(sess);
  } catch (e) {
    emailEl.textContent = "session error";
    console.error(e);
  }
}

setSlugBtn.addEventListener("click", () => {
  const slug = slugSelect.value;
  if (!slug) return;
  setCookie("_portal_active_slug", slug, 180);
  // Re-render session so KV + warning update for selected slug
  fetchSession().then(renderMembershipInfo).catch(console.error);
});

stampBtn.addEventListener("click", async () => {
  const slug = slugSelect.value;
  if (!slug) return alert("Select a slug first");
  const res = await fetch(`/api/memberships/stamp?slug=${encodeURIComponent(slug)}`);
  if (res.ok) {
    // Refresh
    const sess = await fetchSession();
    renderMembershipInfo(sess);
  } else {
    alert("Stamp failed");
  }
});

init();
