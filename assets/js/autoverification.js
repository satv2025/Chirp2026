(() => {
  const CFG = window.CHIRP;
  if (!CFG || !window.supabase) return;

  const sb = window.__chirpSupabaseClient || (window.__chirpSupabaseClient = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }));

  const $ = (q, root = document) => root.querySelector(q);
  const $$ = (q, root = document) => [...root.querySelectorAll(q)];
  const esc = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const VERIFIED_ICON_SRC = "/assets/img/icons/verified.svg";
<<<<<<< HEAD
  const LEVELS = ["blue", "orange", "red", "gold"];
  const TIERS = [
    { level: "blue", label: "ChirpCheck", followers: 100000, description: "Se consigue al llegar a 100k seguidores." },
    { level: "orange", label: "ChirpCheck naranja", followers: 1000000, description: "Se consigue al llegar a 1 millón de seguidores." },
    { level: "red", label: "ChirpCheck roja", followers: 10000000, description: "Se consigue al llegar a 10 millones de seguidores." },
    { level: "gold", label: "ChirpCheck Gold", followers: null, description: "Para usuarios VIP con 1 año o más de uso, cuentas oficiales de Chirp o universo Sol Argentino TV Group." }
  ];

=======

  let settingsCache = null;
>>>>>>> a0cca3687e9914ca6257489999ed4dc7b407ca40
  let userCache = null;
  let profileCache = null;
  let badgeHydrateTimer = null;

  function oneYearVip(profile = {}) {
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    const vipMs = new Date(profile.vip_since || 0).getTime();
    const createdMs = new Date(profile.created_at || 0).getTime();
    return Boolean(profile.is_vip) && (
      (Number.isFinite(vipMs) && vipMs > 0 && Date.now() - vipMs >= oneYearMs) ||
      (Number.isFinite(createdMs) && createdMs > 0 && Date.now() - createdMs >= oneYearMs)
    );
  }

<<<<<<< HEAD
  function chirpCheckLevel(profile) {
    if (!profile) return "";
    const stored = String(profile.chirpcheck_level || profile.verification_badge || "").toLowerCase();
    if (LEVELS.includes(stored)) return stored;
    if (profile.is_chirp_official || profile.is_satv_group || oneYearVip(profile) || stored === "official" || stored === "vip") return "gold";

    const followers = Number(profile.followers_count || 0);
    if (followers >= 10000000) return "red";
    if (followers >= 1000000) return "orange";
    if (followers >= 100000 || profile.is_verified || profile.verification_status === "auto_verified" || profile.verification_status === "manual_verified") return "blue";
    return "";
  }

  function chirpCheckLabel(level = "blue") {
    return TIERS.find(t => t.level === level)?.label || "ChirpCheck";
  }

  function badgeHTML(level = "blue") {
    const label = chirpCheckLabel(level);
    return `<span class="verification-badge chirpcheck-badge chirpcheck-badge--${esc(level)}" title="${esc(label)}" aria-label="${esc(label)}"><img src="${VERIFIED_ICON_SRC}" alt="" aria-hidden="true" loading="lazy" decoding="async"></span>`;
=======
  function badgeHTML(label = "Verificado") {
    return `<span class="verification-badge" title="${esc(label)}" aria-label="${esc(label)}"><img src="${VERIFIED_ICON_SRC}" alt="" aria-hidden="true" loading="lazy" decoding="async"></span>`;
>>>>>>> a0cca3687e9914ca6257489999ed4dc7b407ca40
  }

  function usernameFromProfileURL(href = "") {
    try {
      const url = new URL(href, location.origin);
      const parts = url.pathname.split("/").filter(Boolean);
      const first = parts[0] || "";

      const reserved = new Set([
        "index.html", "login.html", "signin.html", "register.html", "signup.html",
        "reset.html", "update-password.html", "auth-callback.html", "home.html",
        "explore.html", "notifications.html", "bookmarks.html", "profile.html",
        "settings.html", "support.html", "messages.html", "chirpy.html",
        "chirp.html", "embed.html", "legal.html", "u.html", "404.html",
        "login", "signin", "register", "signup", "reset", "update-password",
        "auth", "home", "explore", "notifications", "bookmarks", "profile",
        "settings", "support", "messages", "chirpy", "chirp", "embed", "legal", "u",
        "assets", "api", "favicon.ico"
      ]);

      if (first === "u" && parts[1]) return decodeURIComponent(parts[1]).replace(/^@/, "");
      if (reserved.has(first)) return "";
      return decodeURIComponent(first).replace(/^@/, "");
    } catch {
      return "";
    }
  }

  function usernameFromText(text = "") {
    const match = String(text || "").match(/@([a-zA-Z0-9_]{3,30})/);
    return match ? match[1] : "";
  }

  async function getUser() {
    if (userCache !== null) return userCache;
    const { data } = await sb.auth.getSession();
    userCache = data?.session?.user || null;
    return userCache;
  }

  async function getCurrentProfile() {
    if (profileCache) return profileCache;
    const user = await getUser();
    if (!user) return null;

    const { data, error } = await sb
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.warn("[ChirpCheck] current profile unavailable", error);
      return null;
    }

    profileCache = data;
    return profileCache;
  }

  async function fetchProfilesByUsernames(usernames = []) {
    const clean = [...new Set(
      usernames
        .map(x => String(x || "").trim().replace(/^@/, "").toLowerCase())
        .filter(Boolean)
    )];

    if (!clean.length) return new Map();

    const { data, error } = await sb
      .from("profiles")
      .select("*")
      .in("username", clean);

    if (error) {
      console.warn("[ChirpCheck] profiles unavailable", error);
      return new Map();
    }

    return new Map((data || []).map(profile => [String(profile.username).toLowerCase(), profile]));
  }

  function ensureBadge(target, level) {
    if (!target || target.querySelector(".verification-badge")) return;
    target.insertAdjacentHTML("beforeend", badgeHTML(level));
  }

  async function hydrateProfileNameBadges(root = document) {
    const targets = [];

    $$(".chirp__name[href], .user-row[href] b, .notification-row[href] b, .dm-row[data-username] b", root).forEach(node => {
      const link = node.matches("a") ? node : node.closest("a[href]");
      const row = node.closest(".dm-row[data-username]");
      const username = row?.dataset.username || usernameFromProfileURL(link?.getAttribute("href") || "");
      if (username) targets.push({ node, username });
    });

    $$(".profile-card", root).forEach(card => {
      const heading = $("h2", card);
      const username = usernameFromText(card.textContent || "");
      if (heading && username) targets.push({ node: heading, username });
    });

    const dmPeer = $("#dmPeerName", root);
    const dmPeerUsername = usernameFromText($("#dmPeerUser", root)?.textContent || "");
    if (dmPeer && dmPeerUsername) targets.push({ node: dmPeer, username: dmPeerUsername });

    const currentProfile = await getCurrentProfile();
    const currentLevel = chirpCheckLevel(currentProfile);
    if (currentLevel) {
      $$(".js-me-name", root).forEach(node => ensureBadge(node, currentLevel));
    }

    const profileMap = await fetchProfilesByUsernames(targets.map(item => item.username));
    targets.forEach(({ node, username }) => {
      const profile = profileMap.get(String(username).toLowerCase());
      const level = chirpCheckLevel(profile);
      if (level) ensureBadge(node, level);
    });
  }

  function nextTierInfo(profile = {}) {
    const followers = Number(profile.followers_count || 0);
    if (followers < 100000) return { label: "ChirpCheck", target: 100000, remaining: 100000 - followers, percent: Math.round((followers / 100000) * 100) };
    if (followers < 1000000) return { label: "naranja", target: 1000000, remaining: 1000000 - followers, percent: Math.round((followers / 1000000) * 100) };
    if (followers < 10000000) return { label: "roja", target: 10000000, remaining: 10000000 - followers, percent: Math.round((followers / 10000000) * 100) };
    return { label: "máxima por seguidores", target: 10000000, remaining: 0, percent: 100 };
  }

  async function renderVerificationPanel() {
    const box = $("#verificationPanel");
    if (!box) return;

    const profile = await getCurrentProfile();
    if (!profile) {
      box.innerHTML = `<div class="section-title"><div><h2>ChirpCheck</h2><p>Iniciá sesión para ver tu insignia.</p></div></div>`;
      return;
    }

    const followers = Number(profile.followers_count || 0);
    const level = chirpCheckLevel(profile);
    const next = nextTierInfo(profile);
    const percent = Math.max(0, Math.min(100, next.percent));
    const currentLabel = level ? chirpCheckLabel(level) : "Sin insignia todavía";

    box.classList.toggle("is-verified", Boolean(level));
    box.dataset.chirpcheckLevel = level || "none";

    box.innerHTML = `<div class="section-title">
      <div>
        <h2>ChirpCheck</h2>
        <p>Insignias por seguidores, VIP u oficialidad.</p>
      </div>
      <span class="chip ${level ? "" : "chip-muted"}">${level ? `${esc(currentLabel)} ${badgeHTML(level)}` : "Pendiente"}</span>
    </div>

    <div class="verification-card__body">
      <div class="verification-card__status">
        <strong>${level ? `Tenés ${esc(currentLabel)}.` : `Te faltan ${next.remaining.toLocaleString("es-AR")} seguidores para ChirpCheck.`}</strong>
        <span>${followers.toLocaleString("es-AR")} seguidores</span>
      </div>

      <div class="verification-meter" aria-label="Progreso ChirpCheck">
        <div class="verification-meter__bar" style="width:${level === "gold" ? 100 : percent}%"></div>
      </div>

      <div class="verification-card__numbers">
        <span>${level === "gold" ? "Gold activo" : `${percent}% hacia ${esc(next.label)}`}</span>
        <span>${level ? "Insignia visible en todo Chirp" : "Todavía sin badge"}</span>
      </div>

      <div class="chirpcheck-tier-grid">
        ${TIERS.map(t => {
          const active = t.level === level;
          return `<div class="chirpcheck-tier ${active ? "is-active" : ""} chirpcheck-tier--${t.level}">
            <b>${esc(t.label)} ${badgeHTML(t.level)}</b>
            <small>${esc(t.description)}</small>
          </div>`;
        }).join("")}
      </div>

      <p class="verification-card__note">
        La insignia aparece junto al nick en Chirps, perfiles, respuestas, búsquedas, notificaciones, mensajes y listados.
      </p>
    </div>`;
  }

  function scheduleBadgeHydration() {
    clearTimeout(badgeHydrateTimer);
    badgeHydrateTimer = setTimeout(() => {
      hydrateProfileNameBadges(document).catch(error => {
        console.warn("[ChirpCheck] hydrate failed", error);
      });
    }, 220);
  }

  function observeDynamicContent() {
    const observer = new MutationObserver(scheduleBadgeHydration);
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  async function initVerificationUI() {
    await renderVerificationPanel();
    await hydrateProfileNameBadges(document);
    observeDynamicContent();

    sb.channel("chirpcheck-ui")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => {
          profileCache = null;
          scheduleBadgeHydration();
          renderVerificationPanel().catch(() => null);
        }
      )
      .subscribe();
  }

  document.addEventListener("DOMContentLoaded", () => {
    initVerificationUI().catch(error => {
      console.warn("[ChirpCheck] init failed", error);
    });
  });
})();
