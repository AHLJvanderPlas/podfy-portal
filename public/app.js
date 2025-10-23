// ---------- helpers ----------
const $ = (id) => document.getElementById(id);
function setCookie(name, value, days = 30) {
  const d = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${d}; path=/; SameSite=Lax`;
}
function getCookie(name) {
  return (document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)') || 0)[2] || null;
}

// read ?email= from the page (DEV mode fallback while Access is not enabled)
const DEV_QS = new URLSearchParams(window.location.search);
const DEV_EMAIL = DEV_QS.get("email") || null;

// small API url helper that preserves ?email in dev
function apiUrl(path) {
  const u = new URL(path, window.location.origin);
  if (DEV_EMAIL) u.searchParams.set("email", DEV_EMAIL);
  return u.toString();
}

// ---------- elements ----------
const emailEl = $("email");
const slugSelect = $("slugSelect");
const setSlugBtn = $("setSlugBtn");
const roleBadge = $("roleBadge");
const stampBtn = $("stampBtn");

const kvSlug = $("kvSlug");
const kvRole = $("kvRole");
const kvStatus = $("kvStatus");
const kvLast = $("kvLast");
const inactivityAlert = $("inactivityAlert");

const tabs = document.querySelectorAll(".tab");
const panels = {
  transactions: $("panel-transactions"),
  settings: $("panel-settings"),
  users: $("panel-users"),
};

// ---------- tabs ----------
tabs.forEach((t) => {
  t.addEventListener("click", async () => {
    tabs.forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    Object.values(panels).forEach((p) => (p.style.display = "none"));
    panels[t.dataset.tab].style.display = "";
    if (t.dataset.tab === "users") await loadUsers();
  });
});

// ---------- session fetch ----------
async function fetchSession() {
  const url = DEV_EMAIL
    ? `/api/auth/session?email=${encodeURIComponent(DEV_EMAIL)}`
    : `/api/auth/session`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("session failed");
  return res.json();
}

// ---------- render session ----------
function renderMembershipInfo(sess) {
  emailEl.textContent = sess.email || "(no email)";

  // build slug dropdown
  slugSelect.innerHTML = "";
  (sess.memberships || []).forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.slug;
    opt.textContent = m.brand_name ? `${m.slug} — ${m.brand_name}` : m.slug;
    slugSelect.appendChild(opt);
  });

  // active slug: cookie > api > first
  const cookieSlug = getCookie("_portal_active_slug");
  const activeSlug = cookieSlug || sess.active_slug || (sess.memberships?.[0]?.slug ?? "");
  if (activeSlug) slugSelect.value = activeSlug;

  const active = (sess.memberships || []).find((m) => m.slug === slugSelect.value) || null;

  roleBadge.textContent = active ? active.role : "";
  kvSlug.textContent = active ? active.slug : "-";
  kvRole.textContent = active ? active.role : "-";
  kvStatus.textContent = active ? active.status : "-";
  kvLast.textContent = active?.last_session_at ? new Date(active.last_session_at).toLocaleString() : "never";

  // inactivity banner
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

// ---------- init ----------
async function init() {
  try {
    const sess = await fetchSession();
    renderMembershipInfo(sess);
  } catch (e) {
    emailEl.textContent = "session error";
    console.error(e);
  }
}

// ---------- slug selection ----------
setSlugBtn.addEventListener("click", async () => {
  const slug = slugSelect.value;
  if (!slug) return;
  setCookie("_portal_active_slug", slug, 180);
  const sess = await fetchSession();
  renderMembershipInfo(sess);
  if (document.querySelector(".tab.active")?.dataset.tab === "users") {
    await loadUsers();
  }
});

// ---------- stamp session ----------
stampBtn.addEventListener("click", async () => {
  const slug = slugSelect.value;
  if (!slug) return alert("Select a slug first");
  const url = new URL("/api/memberships/stamp", window.location.origin);
  url.searchParams.set("slug", slug);
  if (DEV_EMAIL) url.searchParams.set("email", DEV_EMAIL); // dev fallback
  const res = await fetch(url.toString());
  if (res.ok) {
    const sess = await fetchSession();
    renderMembershipInfo(sess);
  } else {
    const txt = await res.text().catch(() => "");
    alert("Stamp failed" + (txt ? `: ${txt}` : ""));
  }
});

// ---------- Users tab wiring ----------
const usersTableBody = $("usersTable").querySelector("tbody");
const newUserEmail = $("newUserEmail");
const newUserRole = $("newUserRole");
const addUserBtn = $("addUserBtn");

async function loadUsers() {
  const slug = slugSelect.value;
  if (!slug) return;
  usersTableBody.innerHTML = `<tr><td colspan="4" class="small">Loading…</td></tr>`;
  try {
    const res = await fetch(apiUrl(`/api/slugs/${encodeURIComponent(slug)}/users`));
    const txt = await res.text();
    let json = {};
    try { json = JSON.parse(txt); } catch {}
    if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status} ${txt}`);
    const rows = (json.items || []).map((r) => {
      const last = r.last_session_at ? new Date(r.last_session_at).toLocaleString() : "never";
      return `<tr data-id="${r.id}">
        <td>${r.email}</td>
        <td>${r.role}</td>
        <td>${r.status}</td>
        <td>${last}</td>
      </tr>`;
    }).join("");
    usersTableBody.innerHTML = rows || `<tr><td colspan="4" class="small">No users yet</td></tr>`;
  } catch (e) {
    console.error("users.load error:", e);
    usersTableBody.innerHTML = `<tr><td colspan="4" class="small">Failed to load users</td></tr>`;
  }
}

addUserBtn?.addEventListener("click", async () => {
  const slug = slugSelect.value;
  if (!slug) return alert("Select a slug first");
  const email = (newUserEmail.value || "").trim().toLowerCase();
  const role = newUserRole.value === "admin" ? "admin" : "user";
  if (!email) return alert("Enter an email");
  try {
    const res = await fetch(apiUrl(`/api/slugs/${encodeURIComponent(slug)}/users`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const txt = await res.text();
    let json = {};
    try { json = JSON.parse(txt); } catch {}
    if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status} ${txt}`);
    newUserEmail.value = "";
    await loadUsers();
  } catch (e) {
    console.error("users.add error:", e);
    alert("Add failed: " + e.message);
  }
});

// row click -> quick action prompt
$("panel-users").addEventListener("click", async (e) => {
  const tr = e.target.closest("tr[data-id]");
  if (!tr) return;
  const slug = slugSelect.value;
  const id = tr.getAttribute("data-id");

  const choice = prompt("Action: promote, demote, pause, activate, delete");
  if (!choice) return;

  try {
    if (choice === "delete") {
      const res = await fetch(apiUrl(`/api/slugs/${encodeURIComponent(slug)}/users/${id}`), { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } else if (["promote","demote","pause","activate"].includes(choice)) {
      const res = await fetch(apiUrl(`/api/slugs/${encodeURIComponent(slug)}/users/${id}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: choice }),
      });
      const txt = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} ${txt}`);
    } else {
      alert("Unknown action");
      return;
    }
    await loadUsers();
  } catch (e) {
    console.error("users.row action error:", e);
    alert("Update failed: " + e.message);
  }
});

init();
