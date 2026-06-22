(() => {
  const CFG = window.CHIRP;
  if (!CFG || !window.supabase) return;

  const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  const $ = (q, root = document) => root.querySelector(q);
  const $$ = (q, root = document) => [...root.querySelectorAll(q)];
  const esc = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const VERIFIED_ICON_SRC = "/assets/img/icons/verified.svg";

  let settingsCache = null;
  let userCache = null;
  let profileCache = null;
  let badgeHydrateTimer = null;

  function isVerifiedProfile(profile) {
    if (!profile) return false;
    return Boolean(profile.is_verified)
      || profile.verification_status === "auto_verified"
      || profile.verification_status === "manual_verified";
  }

  function badgeHTML(label = "Verificado") {
    return `<span class="verification-badge" title="${esc(label)}" aria-label="${esc(label)}"><img src="${VERIFIED_ICON_SRC}" alt="" aria-hidden="true" loading="lazy" decoding="async"></span>`;
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

  async function getSettings() {
    if (settingsCache) return settingsCache;

    const { data, error } = await sb
      .from("verification_settings")
      .select("*")
      .eq("id", true)
      .maybeSingle();

    if (error) {
      console.warn("[Chirp verification] settings unavailable", error);
      settingsCache = {
        min_followers: 10000,
        badge_label: "Verificado",
        auto_verify_enabled: true
      };
      return settingsCache;
    }

    settingsCache = data || {
      min_followers: 10000,
      badge_label: "Verificado",
      auto_verify_enabled: true
    };

    return settingsCache;
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
      .select("id, username, display_name, followers_count, is_verified, verification_status, verification_badge, verified_at, verification_followers_threshold, verification_note")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.warn("[Chirp verification] current profile unavailable", error);
      return null;
    }

    profileCache = data;
    return profileCache;
  }

  async function fetchProfilesByUsernames(usernames = []) {
    const clean = [...new Set(
      usernames
        .map(x => String(x || "").trim().replace(/^@/, ""))
        .filter(Boolean)
    )];

    if (!clean.length) return new Map();

    const { data, error } = await sb
      .from("profiles")
      .select("id, username, display_name, followers_count, is_verified, verification_status, verification_badge, verified_at")
      .in("username", clean);

    if (error) {
      console.warn("[Chirp verification] profiles unavailable", error);
      return new Map();
    }

    return new Map((data || []).map(profile => [String(profile.username).toLowerCase(), profile]));
  }

  function ensureBadge(target, label) {
    if (!target || target.querySelector(".verification-badge")) return;
    target.insertAdjacentHTML("beforeend", badgeHTML(label));
  }

  async function hydrateProfileNameBadges(root = document) {
    const settings = await getSettings();
    const label = settings.badge_label || "Verificado";

    const targets = [];

    $$(".chirp__name[href], .user-row[href] b, .notification-row[href] b", root).forEach(node => {
      const link = node.matches("a") ? node : node.closest("a[href]");
      const username = usernameFromProfileURL(link?.getAttribute("href") || "");
      if (username) targets.push({ node, username });
    });

    $$(".profile-card", root).forEach(card => {
      const heading = $("h2", card);
      const username = usernameFromText(card.textContent || "");
      if (heading && username) targets.push({ node: heading, username });
    });

    const usernames = targets.map(item => item.username);
    const profileMap = await fetchProfilesByUsernames(usernames);

    targets.forEach(({ node, username }) => {
      const profile = profileMap.get(String(username).toLowerCase());
      if (isVerifiedProfile(profile)) ensureBadge(node, label);
    });

    const currentProfile = await getCurrentProfile();
    if (isVerifiedProfile(currentProfile)) {
      $$(".js-me-name", root).forEach(node => ensureBadge(node, label));
    }
  }

  async function renderVerificationPanel() {
    const box = $("#verificationPanel");
    if (!box) return;

    const [settings, profile] = await Promise.all([
      getSettings(),
      getCurrentProfile()
    ]);

    if (!profile) {
      box.innerHTML = `<div class="section-title"><div><h2>Verificación</h2><p>Iniciá sesión para ver tu estado.</p></div></div>`;
      return;
    }

    const min = Number(settings.min_followers || 10000);
    const followers = Number(profile.followers_count || 0);
    const remaining = Math.max(0, min - followers);
    const percent = min > 0 ? Math.min(100, Math.round((followers / min) * 100)) : 100;
    const verified = isVerifiedProfile(profile);

    box.classList.toggle("is-verified", verified);

    box.innerHTML = `<div class="section-title">
      <div>
        <h2>Verificación</h2>
        <p>Autoverificación al llegar a ${min.toLocaleString("es-AR")} seguidores.</p>
      </div>
      <span class="chip ${verified ? "" : "chip-muted"}">${verified ? `Verificado ${badgeHTML(settings.badge_label || "Verificado")}` : "Pendiente"}</span>
    </div>

    <div class="verification-card__body">
      <div class="verification-card__status">
        <strong>${verified ? "Tu cuenta ya está verificada." : `Te faltan ${remaining.toLocaleString("es-AR")} seguidores.`}</strong>
        <span>${followers.toLocaleString("es-AR")} / ${min.toLocaleString("es-AR")}</span>
      </div>

      <div class="verification-meter" aria-label="Progreso de verificación">
        <div class="verification-meter__bar" style="width:${verified ? 100 : percent}%"></div>
      </div>

      <div class="verification-card__numbers">
        <span>${percent}% completado</span>
        <span>${settings.auto_verify_enabled ? "Autoverificación activa" : "Autoverificación pausada"}</span>
      </div>

      <p class="verification-card__note">
        ${verified
          ? "La insignia aparece junto a tu nombre en perfiles, Chirps y listados."
          : "Cuando llegues al mínimo configurado, Supabase marca tu perfil como verificado automáticamente."}
      </p>
    </div>`;
  }

  function scheduleBadgeHydration() {
    clearTimeout(badgeHydrateTimer);
    badgeHydrateTimer = setTimeout(() => {
      hydrateProfileNameBadges(document).catch(error => {
        console.warn("[Chirp verification] hydrate failed", error);
      });
    }, 250);
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

    sb.channel("chirp-verification-ui")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => {
          profileCache = null;
          scheduleBadgeHydration();
          renderVerificationPanel().catch(() => null);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "verification_settings" },
        () => {
          settingsCache = null;
          scheduleBadgeHydration();
          renderVerificationPanel().catch(() => null);
        }
      )
      .subscribe();
  }

  document.addEventListener("DOMContentLoaded", () => {
    initVerificationUI().catch(error => {
      console.warn("[Chirp verification] init failed", error);
    });
  });
})();
