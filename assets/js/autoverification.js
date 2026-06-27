/* autoverification.js */
(() => {
  const CFG = window.CHIRP;
  if (!CFG || !window.supabase) return;

  const sb =
    window.__chirpSupabaseClient ||
    (window.__chirpSupabaseClient = window.supabase.createClient(
      CFG.SUPABASE_URL,
      CFG.SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }
    ));

  const $ = (q, root = document) => root.querySelector(q);
  const $$ = (q, root = document) => [...root.querySelectorAll(q)];

  const esc = (value) =>
    String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');

  const VERIFIED_ICON_SRC = '/assets/img/icons/verified.svg';
  const VERIFIED_GOLD_ICON_SRC = '/assets/img/icons/verifiedgold.png';

  const CHIRPCHECK_LEVELS = [
    'pink',
    'blue',
    'purple',
    'orange',
    'red',
    'crimson',
    'turquoise',
    'silver',
    'indigo',
    'white',
    'black',
  ];

  const BADGE_LEVELS = [...CHIRPCHECK_LEVELS, 'gold'];

  const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

  const TIERS = [
    {
      level: 'pink',
      label: 'ChirpCheck Rosa',
      followers: 20000,
      description: 'Se consigue al llegar a 20k seguidores.',
    },
    {
      level: 'blue',
      label: 'ChirpCheck Azul',
      followers: 100000,
      description: 'Se consigue al llegar a 100k seguidores.',
    },
    {
      level: 'purple',
      label: 'ChirpCheck Violeta',
      followers: 500000,
      description: 'Se consigue al llegar a 500k seguidores.',
    },
    {
      level: 'orange',
      label: 'ChirpCheck Naranja',
      followers: 1000000,
      description: 'Se consigue al llegar a 1 millón de seguidores.',
    },
    {
      level: 'red',
      label: 'ChirpCheck Rojo',
      followers: 5000000,
      description: 'Se consigue al llegar a 5 millones de seguidores.',
    },
    {
      level: 'crimson',
      label: 'ChirpCheck Carmesí',
      followers: 10000000,
      description: 'Se consigue al llegar a 10 millones de seguidores.',
    },
    {
      level: 'turquoise',
      label: 'ChirpCheck Turquesa',
      followers: 50000000,
      description: 'Se consigue al llegar a 50 millones de seguidores.',
    },
    {
      level: 'silver',
      label: 'ChirpCheck Plateado',
      followers: 100000000,
      description: 'Se consigue al llegar a 100 millones de seguidores.',
    },
    {
      level: 'indigo',
      label: 'ChirpCheck Índigo',
      followers: 500000000,
      description: 'Se consigue al llegar a 500 millones de seguidores.',
    },
    {
      level: 'white',
      label: 'ChirpCheck Blanco',
      followers: 1000000000,
      description: 'Se consigue al llegar a 1.000 millones de seguidores.',
    },
    {
      level: 'black',
      label: 'ChirpCheck Black',
      followers: null,
      description:
        'Se otorga a usuarios veteranos/VIP con 2-3 años en Chirp. Ser de los primeros usuarios aumenta las chances.',
    },
    {
      level: 'gold',
      label: 'Chirp Gold',
      followers: null,
      description:
        'Insignia premium del universo Chirp. Se puede obtener pagando o por pertenecer al universo Sol Argentino TV Group.',
    },
  ];

  const FOLLOWER_TIERS = TIERS.filter((tier) =>
    Number.isFinite(tier.followers)
  ).sort((a, b) => a.followers - b.followers);

  const FOLLOWER_ORDER = FOLLOWER_TIERS.reduce((acc, tier, index) => {
    acc[tier.level] = index + 1;
    return acc;
  }, {});

  let userCache = null;
  let profileCache = null;
  let badgeHydrateTimer = null;

  function profileAgeMs(profile = {}) {
    const createdMs = new Date(profile.created_at || 0).getTime();
    if (!Number.isFinite(createdMs) || createdMs <= 0) return 0;
    return Date.now() - createdMs;
  }

  function isEarlyUser(profile = {}) {
    return Boolean(
      profile.is_early_user ||
        profile.early_user ||
        profile.is_founder ||
        profile.founder_user ||
        profile.early_access_user ||
        (Number(profile.user_number || 0) > 0 &&
          Number(profile.user_number || 0) <= 1000) ||
        Number(profile.joined_wave || 0) === 1
    );
  }

  function isVip(profile = {}) {
    return Boolean(
      profile.is_vip ||
        profile.vip_since ||
        profile.vip_level ||
        profile.role === 'vip'
    );
  }

  function blackEligible(profile = {}) {
    if (!profile) return false;

    const stored = String(
      profile.chirpcheck_level || profile.verification_badge || ''
    ).toLowerCase();

    if (
      stored === 'black' ||
      stored === 'vip' ||
      profile.is_chirp_black ||
      profile.is_black
    ) {
      return true;
    }

    const age = profileAgeMs(profile);
    const early = isEarlyUser(profile);

    return Boolean(
      profile.is_chirp_official ||
        age >= 3 * YEAR_MS ||
        (early && age >= 2 * YEAR_MS) ||
        (isVip(profile) && age >= 2 * YEAR_MS)
    );
  }

  function chirpGoldActive(profile = {}) {
    if (!profile) return false;

    const stored = String(
      profile.chirpcheck_level || profile.verification_badge || ''
    ).toLowerCase();

    const goldUntilMs = new Date(
      profile.gold_until || profile.gold_expires_at || 0
    ).getTime();

    const hasActiveGoldUntil =
      Number.isFinite(goldUntilMs) && goldUntilMs > Date.now();

    return Boolean(
      stored === 'gold' ||
        profile.is_satv_group ||
        profile.is_chirp_gold ||
        profile.is_gold ||
        profile.gold_active ||
        profile.paid_gold ||
        profile.has_gold ||
        profile.premium_tier === 'gold' ||
        profile.subscription_tier === 'gold' ||
        profile.paid_badge === 'gold' ||
        hasActiveGoldUntil
    );
  }

  function followerLevel(profile = {}) {
    const followers = Number(profile.followers_count || 0);
    let level = '';

    FOLLOWER_TIERS.forEach((tier) => {
      if (followers >= tier.followers) level = tier.level;
    });

    if (level) return level;

    if (
      profile.is_verified ||
      profile.verification_status === 'auto_verified' ||
      profile.verification_status === 'manual_verified'
    ) {
      return 'blue';
    }

    return '';
  }

  function storedFollowerLevel(profile = {}) {
    const stored = String(
      profile.chirpcheck_level || profile.verification_badge || ''
    ).toLowerCase();

    if (stored === 'pink' || stored === 'blue') return 'blue';

    if (CHIRPCHECK_LEVELS.includes(stored) && stored !== 'black') {
      return stored;
    }

    return '';
  }

  function strongerFollowerLevel(a = '', b = '') {
    if (!a) return b || '';
    if (!b) return a || '';

    return (FOLLOWER_ORDER[b] || 0) > (FOLLOWER_ORDER[a] || 0) ? b : a;
  }

  function chirpCheckLevel(profile) {
    if (!profile) return '';

    const stored = String(
      profile.chirpcheck_level || profile.verification_badge || ''
    ).toLowerCase();

    if (blackEligible(profile) || stored === 'official') {
      return 'black';
    }

    const byFollowers = followerLevel(profile);
    const byStored = storedFollowerLevel(profile);

    return strongerFollowerLevel(byStored, byFollowers);
  }

  function chirpCheckLabel(level = 'blue') {
    return TIERS.find((tier) => tier.level === level)?.label || 'ChirpCheck';
  }

  function badgeHTML(level = 'blue') {
    if (!BADGE_LEVELS.includes(level)) return '';

    const label = chirpCheckLabel(level);
    const iconSrc =
      level === 'gold' ? VERIFIED_GOLD_ICON_SRC : VERIFIED_ICON_SRC;

    return `<span class="verification-badge chirpcheck-badge chirpcheck-badge--${esc(level)}" data-chirp-badge-level="${esc(level)}" title="${esc(label)}" aria-label="${esc(label)}"><img src="${esc(iconSrc)}" alt="" aria-hidden="true" loading="lazy" decoding="async"></span>`;
  }

  function profileBadgeLevels(profile = {}) {
    // Gold tiene prioridad visual total: si está activo, no se muestran
    // otros ChirpChecks aunque el usuario también califique para Black
    // o para un tier por seguidores.
    if (chirpGoldActive(profile)) return ['gold'];

    const mainLevel = chirpCheckLevel(profile);

    return mainLevel ? [mainLevel] : [];
  }

  function usernameFromProfileURL(href = '') {
    try {
      const url = new URL(href, location.origin);
      const parts = url.pathname.split('/').filter(Boolean);
      const first = parts[0] || '';

      const reserved = new Set([
        'index.html',
        'login.html',
        'signin.html',
        'register.html',
        'signup.html',
        'reset.html',
        'update-password.html',
        'auth-callback.html',
        'home.html',
        'explore.html',
        'notifications.html',
        'bookmarks.html',
        'profile.html',
        'settings.html',
        'support.html',
        'messages.html',
        'chirpy.html',
        'chirp.html',
        'embed.html',
        'legal.html',
        'u.html',
        '404.html',
        'login',
        'signin',
        'register',
        'signup',
        'reset',
        'update-password',
        'auth',
        'home',
        'explore',
        'notifications',
        'bookmarks',
        'profile',
        'settings',
        'support',
        'messages',
        'chirpy',
        'chirp',
        'embed',
        'legal',
        'u',
        'assets',
        'api',
        'favicon.ico',
      ]);

      if (first === 'u' && parts[1]) {
        return decodeURIComponent(parts[1]).replace(/^@/, '');
      }

      if (reserved.has(first)) return '';

      return decodeURIComponent(first).replace(/^@/, '');
    } catch {
      return '';
    }
  }

  function usernameFromText(text = '') {
    const match = String(text || '').match(/@([a-zA-Z0-9_]{3,30})/);
    return match ? match[1] : '';
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
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.warn('[ChirpCheck] current profile unavailable', error);
      return null;
    }

    profileCache = data;
    return profileCache;
  }

  async function fetchProfilesByUsernames(usernames = []) {
    const clean = [
      ...new Set(
        usernames
          .map((username) =>
            String(username || '')
              .trim()
              .replace(/^@/, '')
              .toLowerCase()
          )
          .filter(Boolean)
      ),
    ];

    if (!clean.length) return new Map();

    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .in('username', clean);

    if (error) {
      console.warn('[ChirpCheck] profiles unavailable', error);
      return new Map();
    }

    return new Map(
      (data || []).map((profile) => [
        String(profile.username).toLowerCase(),
        profile,
      ])
    );
  }

  function syncBadges(target, profile) {
    if (!target || !profile) return;

    const levels = profileBadgeLevels(profile);

    target.querySelectorAll('.verification-badge').forEach((badge) => {
      const level = badge.dataset.chirpBadgeLevel || '';
      if (!level || !levels.includes(level)) badge.remove();
    });

    levels.forEach((level) => {
      if (
        target.querySelector(
          `.verification-badge[data-chirp-badge-level="${level}"]`
        )
      ) {
        return;
      }

      target.insertAdjacentHTML('beforeend', badgeHTML(level));
    });
  }

  async function hydrateProfileNameBadges(root = document) {
    const targets = [];

    $$(
      '.chirp__name[href], .user-row[href] b, .notification-row[href] b, .dm-row[data-username] b',
      root
    ).forEach((node) => {
      const link = node.matches('a') ? node : node.closest('a[href]');
      const row = node.closest('.dm-row[data-username]');

      const username =
        row?.dataset.username ||
        usernameFromProfileURL(link?.getAttribute('href') || '');

      if (username) targets.push({ node, username });
    });

    $$('.profile-card', root).forEach((card) => {
      const heading = $('h2', card);
      const username = usernameFromText(card.textContent || '');

      if (heading && username) targets.push({ node: heading, username });
    });

    const dmPeer = $('#dmPeerName', root);
    const dmPeerUsername = usernameFromText(
      $('#dmPeerUser', root)?.textContent || ''
    );

    if (dmPeer && dmPeerUsername) {
      targets.push({ node: dmPeer, username: dmPeerUsername });
    }

    const currentProfile = await getCurrentProfile();

    if (currentProfile) {
      $$('.js-me-name', root).forEach((node) =>
        syncBadges(node, currentProfile)
      );
    }

    const profileMap = await fetchProfilesByUsernames(
      targets.map((item) => item.username)
    );

    targets.forEach(({ node, username }) => {
      const profile = profileMap.get(String(username).toLowerCase());
      if (profile) syncBadges(node, profile);
    });
  }

  function nextTierInfo(profile = {}) {
    const followers = Number(profile.followers_count || 0);

    const nextTier = FOLLOWER_TIERS.find((tier) => followers < tier.followers);

    if (!nextTier) {
      const maxTier = FOLLOWER_TIERS[FOLLOWER_TIERS.length - 1];

      return {
        label: 'Máxima Por Seguidores',
        target: maxTier.followers,
        remaining: 0,
        percent: 100,
      };
    }

    return {
      label: nextTier.label.replace('ChirpCheck ', ''),
      target: nextTier.followers,
      remaining: nextTier.followers - followers,
      percent: Math.round((followers / nextTier.followers) * 100),
    };
  }

  function currentBadgeHTML(profile = {}) {
    const levels = profileBadgeLevels(profile);

    if (!levels.length) return 'Pendiente';

    return levels
      .map((level) => `${esc(chirpCheckLabel(level))} ${badgeHTML(level)}`)
      .join(' ');
  }

  async function renderVerificationPanel() {
    const box = $('#verificationPanel');
    if (!box) return;

    const profile = await getCurrentProfile();

    if (!profile) {
      box.innerHTML = `<div class="section-title"><div><h2>ChirpCheck</h2><p>Iniciá sesión para ver tu insignia.</p></div></div>`;
      return;
    }

    const followers = Number(profile.followers_count || 0);
    const level = chirpCheckLevel(profile);
    const goldActive = chirpGoldActive(profile);
    const next = nextTierInfo(profile);
    const percent = Math.max(0, Math.min(100, next.percent));

    const maxFollowerTier = FOLLOWER_TIERS[FOLLOWER_TIERS.length - 1];
    const isMaxFollowers = followers >= maxFollowerTier.followers;

    const currentLabel = goldActive
      ? 'Chirp Gold'
      : level
        ? chirpCheckLabel(level)
        : 'Sin Insignia Todavía';

    const hasAnyBadge = Boolean(level || goldActive);

    box.classList.toggle('is-verified', hasAnyBadge);
    box.dataset.chirpcheckLevel = goldActive ? 'none' : level || 'none';
    box.dataset.chirpgold = goldActive ? '1' : '0';

    const statusText = goldActive
      ? 'Tenés Chirp Gold.'
      : level
        ? `Tenés ${currentLabel}.`
        : `Te faltan ${next.remaining.toLocaleString('es-AR')} seguidores para ChirpCheck.`;

    const meterWidth =
      goldActive || level === 'black' || isMaxFollowers ? 100 : percent;

    const leftNumber = goldActive
      ? 'Gold Activo'
      : level === 'black'
        ? 'Black Activo'
        : isMaxFollowers
          ? 'Máximo Por Seguidores'
          : `${percent}% hacia ${next.label}`;

    const rightNumber = goldActive
      ? 'Insignia Gold Visible En Todo Chirp'
      : hasAnyBadge
        ? 'Insignia Visible En Todo Chirp'
        : 'Todavía Sin Badge';

    box.innerHTML = `<div class="section-title">
      <div>
        <h2>ChirpCheck</h2>
        <p>Insignias por seguidores, Black veterano y Gold premium.</p>
      </div>
      <span class="chip ${hasAnyBadge ? '' : 'chip-muted'}">${currentBadgeHTML(profile)}</span>
    </div>

    <div class="verification-card__body">
      <div class="verification-card__status">
        <strong>${esc(statusText)}</strong>
        <span>${followers.toLocaleString('es-AR')} seguidores</span>
      </div>

      <div class="verification-meter" aria-label="Progreso ChirpCheck">
        <div class="verification-meter__bar" style="width:${meterWidth}%"></div>
      </div>

      <div class="verification-card__numbers">
        <span>${esc(leftNumber)}</span>
        <span>${esc(rightNumber)}</span>
      </div>

      <div class="chirpcheck-tier-grid">
        ${TIERS.map((tier) => {
          const active = goldActive
            ? tier.level === 'gold'
            : tier.level === level;

          return `<div class="chirpcheck-tier ${active ? 'is-active' : ''} chirpcheck-tier--${esc(tier.level)}">
            <b>${esc(tier.label)} ${badgeHTML(tier.level)}</b>
            <small>${esc(tier.description)}</small>
          </div>`;
        }).join('')}
      </div>

      <p class="verification-card__note">
        La insignia aparece junto al nick en Chirps, perfiles, respuestas, búsquedas, notificaciones, mensajes y listados.
      </p>
    </div>`;
  }

  function scheduleBadgeHydration() {
    clearTimeout(badgeHydrateTimer);

    badgeHydrateTimer = setTimeout(() => {
      hydrateProfileNameBadges(document).catch((error) => {
        console.warn('[ChirpCheck] hydrate failed', error);
      });
    }, 220);
  }

  function observeDynamicContent() {
    const observer = new MutationObserver(scheduleBadgeHydration);

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  async function initVerificationUI() {
    await renderVerificationPanel();
    await hydrateProfileNameBadges(document);
    observeDynamicContent();

    sb.channel('chirpcheck-ui')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          profileCache = null;
          scheduleBadgeHydration();
          renderVerificationPanel().catch(() => null);
        }
      )
      .subscribe();
  }

  document.addEventListener('DOMContentLoaded', () => {
    initVerificationUI().catch((error) => {
      console.warn('[ChirpCheck] init failed', error);
    });
  });
})();
