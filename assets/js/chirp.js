/* chirp.js */
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
  const esc = (v) =>
    String(v ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  const wait = (promise, ms, label) => {
    let t;
    const timeout = new Promise(
      (_, rej) =>
        (t = setTimeout(
          () =>
            rej(
              new Error(
                `${label} tardó demasiado después de ${Math.round(ms / 1000)}s.`
              )
            ),
          ms
        ))
    );
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
  };
  const limit = (s, n = CFG.chirpLimit) => String(s || '').slice(0, n);
  const cleanUsernameInput = (value = '') =>
    String(value || '')
      .trim()
      .replace(/^@+/, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_]/g, '')
      .slice(0, 30);
  const validUsername = (value = '') =>
    /^[a-zA-Z0-9_]{3,30}$/.test(String(value || ''));
  const VERIFIED_ICON_SRC = '/assets/img/icons/verified.svg';
  const VERIFIED_GOLD_ICON_SRC = '/assets/img/icons/verifiedgold.png';

  const CHIRPCHECK_LEVELS = ['pink', 'orange', 'red', 'gold'];

  function oneYearVip(p = {}) {
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    const vipMs = new Date(p.vip_since || 0).getTime();
    const createdMs = new Date(p.created_at || 0).getTime();

    return (
      Boolean(p.is_vip) &&
      ((Number.isFinite(vipMs) &&
        vipMs > 0 &&
        Date.now() - vipMs >= oneYearMs) ||
        (Number.isFinite(createdMs) &&
          createdMs > 0 &&
          Date.now() - createdMs >= oneYearMs))
    );
  }

  function chirpCheckLevel(p = {}) {
    if (!p) return '';

    const stored = String(
      p.chirpcheck_level || p.verification_badge || ''
    ).toLowerCase();

    if (CHIRPCHECK_LEVELS.includes(stored)) return stored;

    // Compatibilidad con cuentas viejas que quedaron guardadas como "blue".
    if (stored === 'blue') return 'pink';

    if (
      p.is_chirp_official ||
      p.is_satv_group ||
      oneYearVip(p) ||
      stored === 'official' ||
      stored === 'vip'
    ) {
      return 'gold';
    }

    const followers = Number(p.followers_count || 0);

    if (followers >= 10000000) return 'red';
    if (followers >= 1000000) return 'orange';

    if (
      followers >= 100000 ||
      p.is_verified ||
      p.verification_status === 'auto_verified' ||
      p.verification_status === 'manual_verified'
    ) {
      return 'pink';
    }

    return '';
  }

  function chirpCheckLabel(level = 'pink') {
    return (
      {
        pink: 'ChirpCheck',
        orange: 'ChirpCheck naranja',
        red: 'ChirpCheck roja',
        gold: 'ChirpCheck Gold',
      }[level] || 'ChirpCheck'
    );
  }

  function chirpCheckBadgeHTML(p = {}) {
    const level = chirpCheckLevel(p);
    if (!level) return '';

    const label = chirpCheckLabel(level);
    const iconSrc =
      level === 'gold' ? VERIFIED_GOLD_ICON_SRC : VERIFIED_ICON_SRC;

    return `<span class="verification-badge chirpcheck-badge chirpcheck-badge--${esc(level)}" title="${esc(label)}" aria-label="${esc(label)}"><img src="${esc(iconSrc)}" alt="" aria-hidden="true" loading="lazy" decoding="async"></span>`;
  }

  function profileNameHTML(p = {}, fallback = 'Usuario') {
    return `${esc(p?.display_name || fallback)}${chirpCheckBadgeHTML(p)}`;
  }

  const page = document.body.dataset.page || 'landing';
  const publicAuth = new Set([
    '/',
    '/login.html',
    '/signin/',
    '/register.html',
    '/signup/',
  ]);

  let user = null;
  let profile = null;
  let dmIncomingCounts = new Map();
  let dmIncomingTotal = 0;
  let dmReadAtColumnSupported = true;

  const DM_READ_STORAGE_PREFIX = 'chirp:dm:last-read';

  function normalizedPath() {
    return location.pathname || '/';
  }

  function toast(title, msg = '', type = 'info') {
    let stack = $('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    const node = document.createElement('div');
    node.className = `toast toast-${type}`;
    node.innerHTML = `<strong>${esc(title)}</strong>${msg ? `<small>${esc(msg)}</small>` : ''}`;
    stack.appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  function fallbackAvatar(p = {}) {
    const name = (p.display_name || p.username || 'Chirp')
      .trim()
      .slice(0, 2)
      .toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="18" fill="#fff0f7"/><text x="50%" y="56%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="30" font-weight="800" fill="#ef008a">${esc(name)}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function ago(dateValue) {
    if (!dateValue) return '';
    const s = Math.max(
      1,
      Math.floor((Date.now() - new Date(dateValue).getTime()) / 1000)
    );
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 8) return `${d}d`;
    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: 'short',
    }).format(new Date(dateValue));
  }

  async function getSession() {
    const { data } = await sb.auth.getSession();
    return data?.session?.user || null;
  }

  async function ensureProfile() {
    if (!user) return null;
    let { data } = await sb
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (!data) {
      const chosenUsername = cleanUsernameInput(
        user.user_metadata?.username ||
          user.user_metadata?.preferred_username ||
          ''
      );
      const username = validUsername(chosenUsername)
        ? chosenUsername
        : `user_${user.id.replaceAll('-', '').slice(0, 24)}`;
      const display_name = (
        user.user_metadata?.display_name ||
        user.email?.split('@')[0] ||
        'Nuevo usuario'
      ).slice(0, 50);
      await sb.rpc('ensure_current_user_profile').catch(() => null);
      await sb
        .from('profiles')
        .insert({ id: user.id, username, display_name })
        .select('*')
        .maybeSingle();
      const result = await sb
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      data = result.data;
    }
    profile = data;
    hydrateMe();
    return profile;
  }

  async function requireUser() {
    user = await getSession();
    if (!user) {
      location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
      return null;
    }
    await ensureProfile();
    return user;
  }

  async function redirectIfLoggedIn() {
    const p = normalizedPath();
    if (!publicAuth.has(p)) return;
    const u = await getSession();
    if (u) location.replace('/home.html');
  }

  function hydrateMe() {
    $$('.js-me-name').forEach((el) => {
      el.innerHTML = profileNameHTML(profile, 'Tu perfil');
      if (profile?.username) el.dataset.chirpUsername = profile.username;
    });
    $$('.js-me-username').forEach(
      (el) => (el.textContent = profile?.username ? `@${profile.username}` : '')
    );
    $$('.js-me-avatar').forEach(
      (el) => (el.src = profile?.avatar_url || fallbackAvatar(profile))
    );
    $$('.js-composer-avatar').forEach(
      (el) => (el.src = profile?.avatar_url || fallbackAvatar(profile))
    );
  }

  function badgeCountLabel(count = 0) {
    const n = Number(count || 0);
    if (!Number.isFinite(n) || n <= 0) return '';
    return n > 99 ? '99+' : String(n);
  }

  function renderNumberBadge(count, className = 'number-badge') {
    const label = badgeCountLabel(count);
    return label
      ? `<span class="${className}" aria-label="${label} mensajes sin leer">${label}</span>`
      : '';
  }

  function updateMessagesNavBadge(count = dmIncomingTotal) {
    const label = badgeCountLabel(count);
    $$(".side-link[data-route='messages']").forEach((link) => {
      let badge = $('.nav-number-badge', link);

      if (!label) {
        badge?.remove();
        return;
      }

      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-number-badge';
        link.appendChild(badge);
      }

      badge.textContent = label;
      badge.setAttribute('aria-label', `${label} mensajes sin leer`);
    });
  }

  function dmReadStorageKey(peerId) {
    return `${DM_READ_STORAGE_PREFIX}:${user?.id || 'anon'}:${peerId}`;
  }

  function messageTimeMs(value) {
    const ms = new Date(value || 0).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  function getLocalDmReadAt(peerId) {
    if (!peerId || !user) return 0;
    try {
      const saved = localStorage.getItem(dmReadStorageKey(peerId));
      const numeric = Number(saved || 0);
      if (Number.isFinite(numeric) && numeric > 0) return numeric;
      return messageTimeMs(saved);
    } catch (_error) {
      return 0;
    }
  }

  function setLocalDmReadAt(peerId, value = new Date()) {
    if (!peerId || !user) return;
    const ms = value instanceof Date ? value.getTime() : messageTimeMs(value);
    if (!Number.isFinite(ms) || ms <= 0) return;
    try {
      localStorage.setItem(dmReadStorageKey(peerId), String(ms));
    } catch (_error) {
      // Sin localStorage, se usa Supabase/read_at si está disponible.
    }
  }

  function readAtColumnMissing(error) {
    const text =
      `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    return (
      text.includes('read_at') ||
      text.includes('column') ||
      error?.code === '42703'
    );
  }

  function rowIsUnreadDm(row) {
    const senderId = row?.sender_id;
    if (!senderId || senderId === user.id) return false;
    if (Object.prototype.hasOwnProperty.call(row, 'read_at') && row.read_at)
      return false;
    const localReadAt = getLocalDmReadAt(senderId);
    return messageTimeMs(row.created_at) > localReadAt;
  }

  async function refreshIncomingDmBadges() {
    if (!user) return new Map();

    const fields = dmReadAtColumnSupported
      ? 'sender_id, created_at, read_at'
      : 'sender_id, created_at';
    let { data, error } = await sb
      .from('direct_messages')
      .select(fields)
      .eq('receiver_id', user.id);

    if (error && dmReadAtColumnSupported && readAtColumnMissing(error)) {
      dmReadAtColumnSupported = false;
      ({ data, error } = await sb
        .from('direct_messages')
        .select('sender_id, created_at')
        .eq('receiver_id', user.id));
    }

    if (error) {
      console.warn('[Chirp messages] no pude contar mensajes sin leer', error);
      dmIncomingCounts = new Map();
      dmIncomingTotal = 0;
      updateMessagesNavBadge(0);
      return dmIncomingCounts;
    }

    const counts = new Map();
    (data || []).forEach((row) => {
      if (!rowIsUnreadDm(row)) return;
      const senderId = row.sender_id;
      counts.set(senderId, (counts.get(senderId) || 0) + 1);
    });

    dmIncomingCounts = counts;
    dmIncomingTotal = [...counts.values()].reduce(
      (total, current) => total + current,
      0
    );
    updateMessagesNavBadge(dmIncomingTotal);
    return dmIncomingCounts;
  }

  async function markDmThreadAsRead(peerId, messages = []) {
    if (!user || !peerId) return;

    const latestIncoming = (messages || [])
      .filter((msg) => msg.sender_id === peerId && msg.receiver_id === user.id)
      .reduce(
        (latest, msg) => Math.max(latest, messageTimeMs(msg.created_at)),
        0
      );

    setLocalDmReadAt(
      peerId,
      latestIncoming ? new Date(latestIncoming) : new Date()
    );

    if (dmReadAtColumnSupported) {
      let { error } = await sb.rpc('mark_dm_thread_read', { peer: peerId });

      if (error) {
        ({ error } = await sb
          .from('direct_messages')
          .update({ read_at: new Date().toISOString() })
          .eq('receiver_id', user.id)
          .eq('sender_id', peerId)
          .is('read_at', null));
      }

      if (error) {
        if (readAtColumnMissing(error)) {
          dmReadAtColumnSupported = false;
        } else {
          console.warn('[Chirp messages] no pude marcar DM como leído', error);
        }
      }
    }

    dmIncomingCounts.delete(peerId);
    dmIncomingTotal = [...dmIncomingCounts.values()].reduce(
      (total, current) => total + current,
      0
    );
    updateMessagesNavBadge(dmIncomingTotal);
  }

  function initShell() {
    const key = page;
    $$('[data-route]').forEach((a) =>
      a.classList.toggle('is-active', a.dataset.route === key)
    );
    $$('.js-logout').forEach((btn) =>
      btn.addEventListener('click', async () => {
        await sb.auth.signOut();
        location.href = '/';
      })
    );
  }

  function initDropdowns() {
    $$('[data-dropdown]').forEach((drop) => {
      const btn = $('.dropdown__button', drop);
      const input = $(drop.dataset.dropdown);
      const label = $('[data-dropdown-label]', drop);
      btn?.addEventListener('click', () => drop.classList.toggle('is-open'));
      $$('.dropdown__item', drop).forEach((item) =>
        item.addEventListener('click', () => {
          $$('.dropdown__item', drop).forEach((i) =>
            i.classList.remove('is-selected')
          );
          item.classList.add('is-selected');
          if (input) input.value = item.dataset.value || '';
          if (label) label.textContent = item.textContent.trim();
          drop.classList.remove('is-open');
        })
      );
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.dropdown'))
        $$('.dropdown.is-open').forEach((d) => d.classList.remove('is-open'));
    });
  }

  function initMediaPreview() {
    const fileInput = $('#chirpMedia');
    const box = $('.media-preview');
    const body = $('.media-preview__body');
    $('.js-clear-media')?.addEventListener('click', () => {
      fileInput.value = '';
      if (body) body.innerHTML = '';
      box?.classList.remove('is-active');
    });
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file || !body || !box) return;
      const url = URL.createObjectURL(file);
      body.innerHTML = '';
      const node = file.type.startsWith('video/')
        ? Object.assign(document.createElement('video'), {
            src: url,
            controls: false,
            muted: true,
          })
        : Object.assign(document.createElement('img'), {
            src: url,
            alt: 'Vista previa',
          });
      body.appendChild(node);
      box.classList.add('is-active');
    });
  }

  const CHIRP_PLAYER_ASSET_BASE = 'https://player.chirp.com.ar/assets';
  const CHIRP_PLAYER_STYLE_URL = `${CHIRP_PLAYER_ASSET_BASE}/styles.css`;
  const CHIRP_PLAYER_SCRIPT_URL = `${CHIRP_PLAYER_ASSET_BASE}/chirpplayer.js`;
  const CHIRP_REACT_URLS = [
    'https://unpkg.com/react@18/umd/react.production.min.js',
  ];
  const CHIRP_REACT_DOM_URLS = [
    'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  ];

  let chirpPlayerAssetsPromise = null;
  let chirpPlayerReloadPromise = null;

  function chirpPlayerGlobal() {
    return (
      window.ChirpPlayer ||
      window.chirpPlayer ||
      window.Chirpplayer ||
      window.ChirpPlayerComponent ||
      null
    );
  }

  function reactReady() {
    return Boolean(window.React?.createElement && window.React?.useState);
  }

  function reactDomReady() {
    return Boolean(window.ReactDOM?.createRoot);
  }

  function playerReady() {
    return (
      typeof window.ChirpPlayerMount === 'function' ||
      Boolean(chirpPlayerGlobal())
    );
  }

  function renderNativePlayerFallback(mount, props = {}) {
    const src = props.src || '';
    if (!src) return null;

    mount.innerHTML =
      props.kind === 'audio'
        ? `<audio class="chirp-native-player" controls preload="metadata"><source src="${esc(src)}"${props.type ? ` type="${esc(props.type)}"` : ''}></audio>`
        : `<video class="chirp-native-player" controls playsinline preload="metadata"${props.poster ? ` poster="${esc(props.poster)}"` : ''}><source src="${esc(src)}"${props.type ? ` type="${esc(props.type)}"` : ''}></video>`;

    return mount.firstElementChild;
  }

  function ensureChirpPlayerStylesheet() {
    const alreadyLoaded = [
      ...document.querySelectorAll('link[rel="stylesheet"]'),
    ].some(
      (link) => String(link.href || '').split('?')[0] === CHIRP_PLAYER_STYLE_URL
    );

    if (alreadyLoaded) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = CHIRP_PLAYER_STYLE_URL;
    document.head.appendChild(link);
  }

  function removeScriptByCleanSrc(cleanSrc) {
    [...document.scripts].forEach((script) => {
      if (String(script.src || '').split('?')[0] === cleanSrc) script.remove();
    });
  }

  function waitForReady(isReady, timeoutMs = 2500) {
    if (isReady()) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        if (isReady()) {
          resolve();
          return;
        }

        if (Date.now() - started >= timeoutMs) {
          reject(new Error('La API esperada no quedó disponible.'));
          return;
        }

        window.setTimeout(tick, 40);
      };

      tick();
    });
  }

  function loadScriptTag(src, attrs = {}) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;

      Object.entries(attrs).forEach(([key, value]) => {
        if (value === true) script.setAttribute(key, '');
        else if (value) script.setAttribute(key, String(value));
      });

      script.onload = () => resolve(script);
      script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
      document.head.appendChild(script);
    });
  }

  async function loadScriptWithFallback(urls, isReady, label, attrs = {}) {
    if (isReady()) return;

    const list = Array.isArray(urls) ? urls : [urls];
    const errors = [];

    for (const src of list) {
      const cleanSrc = String(src).split('?')[0];

      if (isReady()) return;

      try {
        const existing = [...document.scripts].find((script) => {
          return String(script.src || '').split('?')[0] === cleanSrc;
        });

        if (existing) {
          await waitForReady(isReady, 3500);
          return;
        }

        await loadScriptTag(src, attrs);
        await waitForReady(isReady, 3500);
        return;
      } catch (error) {
        errors.push(error);
        removeScriptByCleanSrc(cleanSrc);
      }
    }

    throw new Error(
      `${label} no quedó disponible. ${errors.map((error) => error?.message || error).join(' | ')}`
    );
  }

  async function ensureChirpPlayerAssets() {
    if (chirpPlayerAssetsPromise) return chirpPlayerAssetsPromise;

    chirpPlayerAssetsPromise = (async () => {
      ensureChirpPlayerStylesheet();

      await loadScriptWithFallback(CHIRP_REACT_URLS, reactReady, 'React', {
        crossorigin: 'anonymous',
      });

      await loadScriptWithFallback(
        CHIRP_REACT_DOM_URLS,
        reactDomReady,
        'ReactDOM',
        {
          crossorigin: 'anonymous',
        }
      );

      await loadScriptWithFallback(
        CHIRP_PLAYER_SCRIPT_URL,
        playerReady,
        'ChirpPlayer'
      );
    })().catch((error) => {
      chirpPlayerAssetsPromise = null;
      throw error;
    });

    return chirpPlayerAssetsPromise;
  }

  async function reloadChirpPlayerBundle() {
    if (chirpPlayerReloadPromise) return chirpPlayerReloadPromise;

    chirpPlayerReloadPromise = (async () => {
      [...document.scripts].forEach((script) => {
        const src = String(script.src || '');
        if (src.includes('player.chirp.com.ar/assets/chirpplayer.js')) {
          script.remove();
        }
      });

      try {
        delete window.ChirpPlayerMount;
        delete window.ChirpPlayer;
        delete window.chirpPlayer;
        delete window.Chirpplayer;
        delete window.ChirpPlayerComponent;
      } catch (_error) {
        window.ChirpPlayerMount = undefined;
      }

      await loadScriptWithFallback(
        `${CHIRP_PLAYER_SCRIPT_URL}?v=${Date.now()}`,
        playerReady,
        'ChirpPlayer'
      );
    })();

    try {
      await chirpPlayerReloadPromise;
    } finally {
      chirpPlayerReloadPromise = null;
    }
  }

  function isReactDomMountError(error) {
    const text =
      `${error?.name || ''} ${error?.message || ''} ${error?.stack || ''}`.toLowerCase();
    return text.includes('reactdom') || text.includes('createroot');
  }

  function applyChirpPlayerDataset(mount, props = {}) {
    const src = props.src || '';
    if (!src) return;

    mount.classList.add('chirp-player-root');
    mount.setAttribute('data-chirp-player', '');
    mount.dataset.src = src;

    if (props.poster) mount.dataset.poster = props.poster;
    else delete mount.dataset.poster;

    if (props.kind) mount.dataset.kind = props.kind;
    else delete mount.dataset.kind;

    if (props.type) mount.dataset.type = props.type;
    else delete mount.dataset.type;

    if (props.aspectRatio) mount.dataset.aspectRatio = props.aspectRatio;
    else delete mount.dataset.aspectRatio;
  }

  async function mountChirpPlayer(mount, props = {}) {
    const src = props.src || '';
    if (!src) return null;

    applyChirpPlayerDataset(mount, props);
    await ensureChirpPlayerAssets();

    if (typeof window.ChirpPlayerMount === 'function') {
      try {
        window.ChirpPlayerMount();
        return { refresh: window.ChirpPlayerMount };
      } catch (error) {
        if (!isReactDomMountError(error)) throw error;

        await reloadChirpPlayerBundle();
        window.ChirpPlayerMount();
        return { refresh: window.ChirpPlayerMount };
      }
    }

    const api = chirpPlayerGlobal();

    if (api?.mount) return api.mount(mount, props);
    if (api?.render) return api.render(mount, props);
    if (api?.create) return api.create(mount, props);
    if (typeof window.mountChirpPlayer === 'function') {
      return window.mountChirpPlayer(mount, props);
    }
    if (typeof window.renderChirpPlayer === 'function') {
      return window.renderChirpPlayer(mount, props);
    }

    const Component =
      api?.Component ||
      window.ChirpPlayerComponent ||
      (typeof api === 'function' ? api : null);

    if (Component && reactReady() && reactDomReady()) {
      const root = window.ReactDOM.createRoot(mount);
      root.render(window.React.createElement(Component, props));
      return root;
    }

    return null;
  }

  async function initChirpPlayers(root = document) {
    const mounts = [
      ...root.querySelectorAll(
        '.js-chirp-player:not([data-ready="1"]):not([data-ready="loading"])'
      ),
    ];

    for (const mount of mounts) {
      const src = mount.dataset.src || '';
      if (!src) continue;

      mount.dataset.ready = 'loading';

      const props = {
        src,
        poster: mount.dataset.poster || '',
        kind: mount.dataset.kind || 'video',
        type: mount.dataset.type || '',
        aspectRatio: mount.dataset.aspectRatio || '',
      };

      try {
        const instance = await mountChirpPlayer(mount, props);
        if (instance) {
          mount.__chirpPlayer = instance;
          mount.dataset.ready = '1';
          continue;
        }
      } catch (error) {
        console.warn(
          '[Chirp Player] No pude montar ChirpPlayer, uso fallback nativo',
          error
        );
      }

      renderNativePlayerFallback(mount, props);
      mount.dataset.ready = '1';
    }
  }

  async function uploadChirpMedia(chirpId, file) {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const safe = `${crypto.randomUUID()}.${ext}`;
    const path = `${user.id}/${chirpId}/${safe}`;
    const up = await sb.storage.from(CFG.mediaBucket).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });
    if (up.error) throw up.error;
    const media_type = file.type.startsWith('video/')
      ? 'video'
      : file.type === 'image/gif'
        ? 'gif'
        : 'image';
    const ins = await sb.from('chirp_media').insert({
      chirp_id: chirpId,
      user_id: user.id,
      storage_bucket: CFG.mediaBucket,
      storage_path: path,
      media_type,
      sort_order: 0,
    });
    if (ins.error) throw ins.error;
  }

  async function syncEntities(chirpId) {
    try {
      await sb.rpc('sync_chirp_entities_for', { chirp_id_to_sync: chirpId });
    } catch (e) {
      console.warn('[Chirp] sync entities skipped', e);
    }
  }

  async function signedOrPublic(bucket, path) {
    if (!bucket || !path) return '';
    if (bucket === 'avatars' || bucket === 'banners')
      return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    const { data } = await sb.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 30);
    return data?.signedUrl || '';
  }

  function linkContent(c = '') {
    return esc(c)
      .replace(/(^|[\s>])#([a-zA-Z0-9_]{1,50})\b/g, (m, pre, tag) => {
        const clean = tag.toLowerCase();
        return `${pre}<a class="text-tag" data-tag="${clean}" href="/explore.html?tag=${encodeURIComponent(clean)}">#${tag}</a>`;
      })
      .replace(
        /(^|[\s>])@([a-zA-Z0-9_]{3,30})\b/g,
        (m, pre, u) =>
          `${pre}<a class="text-mention" href="${profileURL(u)}">@${u}</a>`
      );
  }

  async function mediaHtml(rows = []) {
    const out = [];
    for (const m of rows.sort(
      (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
    )) {
      const url =
        m.media_url || (await signedOrPublic(m.storage_bucket, m.storage_path));
      if (!url) continue;
      if (m.media_type === 'video') {
        const ratio =
          Number(m.width) > 0 && Number(m.height) > 0
            ? ` data-aspect-ratio="${esc(`${m.width}:${m.height}`)}"`
            : '';

        out.push(
          `<div class="chirp-video-wrap"><div class="js-chirp-player chirp-player-root" data-chirp-player data-src="${esc(url)}" data-poster="${esc(m.poster_url || m.thumbnail_url || '')}" data-kind="video" data-type="${esc(m.mime_type || m.content_type || '')}"${ratio}></div></div>`
        );
      } else
        out.push(
          `<img class="chirp-photo" src="${esc(url)}" alt="${esc(m.alt_text || 'Foto del Chirp')}" loading="lazy">`
        );
    }
    return out.length ? `<div class="chirp__media">${out.join('')}</div>` : '';
  }

  function chirpURL(id) {
    const clean = String(id || '').trim();
    return clean ? `/chirp/${encodeURIComponent(clean)}` : '/chirp.html';
  }

  function absoluteURL(path = '/') {
    try {
      return new URL(path, location.origin).toString();
    } catch (_error) {
      return path;
    }
  }

  function chirpShareURL(id) {
    return absoluteURL(chirpURL(id));
  }

  function chirpEmbedURL(id) {
    const clean = String(id || '').trim();
    return absoluteURL(
      clean ? `/embed/${encodeURIComponent(clean)}` : '/embed.html'
    );
  }

  function chirpIframeCode(id) {
    return `<iframe src="${chirpEmbedURL(id)}" width="100%" height="360" style="border:0;max-width:640px;" loading="lazy" title="Chirp insertado"></iframe>`;
  }

  async function copyText(text, success = 'Copiado') {
    const value = String(text || '');
    if (!value) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const area = document.createElement('textarea');
        area.value = value;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.left = '-9999px';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      toast(success, 'Listo para pegar donde quieras.');
    } catch (_error) {
      toast(
        'No pude copiar',
        'Seleccioná el texto y copialo manualmente.',
        'error'
      );
    }
  }

  function ensureShareModal() {
    let modal = $('#chirpShareModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'chirpShareModal';
    modal.className = 'chirp-share-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="chirp-share-modal__backdrop js-share-close"></div>
      <section class="chirp-share-modal__box" role="dialog" aria-modal="true" aria-labelledby="chirpShareTitle">
        <div class="section-title">
          <div>
            <h2 id="chirpShareTitle">Compartir Chirp</h2>
            <p>Copiá el link o el iframe para insertarlo en otra web.</p>
          </div>
          <button class="btn btn-ghost btn-small js-share-close" type="button">Cerrar</button>
        </div>
        <label class="field">
          <span>Link directo</span>
          <div class="share-copy-row">
            <input id="chirpShareLink" readonly>
            <button class="btn btn-soft btn-small js-copy-share-link" type="button">Copiar</button>
          </div>
        </label>
        <label class="field">
          <span>Iframe para insertar</span>
          <textarea id="chirpShareIframe" class="share-code" readonly rows="4"></textarea>
        </label>
        <div class="chirp-share-modal__actions">
          <button class="btn btn-soft btn-small js-copy-share-iframe" type="button">Copiar iframe</button>
          <button class="btn btn-ghost btn-small js-native-share" type="button">Compartir del dispositivo</button>
        </div>
      </section>`;
    document.body.appendChild(modal);

    $$('.js-share-close', modal).forEach((btn) =>
      btn.addEventListener('click', () => closeShareModal())
    );
    $('.js-copy-share-link', modal)?.addEventListener('click', () =>
      copyText($('#chirpShareLink', modal)?.value, 'Link copiado')
    );
    $('.js-copy-share-iframe', modal)?.addEventListener('click', () =>
      copyText($('#chirpShareIframe', modal)?.value, 'Iframe copiado')
    );
    $('.js-native-share', modal)?.addEventListener('click', async () => {
      const url = $('#chirpShareLink', modal)?.value || '';
      if (!navigator.share) return copyText(url, 'Link copiado');
      try {
        await navigator.share({ title: 'Chirp', url });
      } catch (_error) {
        /* El usuario canceló o el navegador no permitió compartir. */
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal.classList.contains('is-open'))
        closeShareModal();
    });

    return modal;
  }

  function closeShareModal() {
    const modal = $('#chirpShareModal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function openShareModal(chirpId) {
    const modal = ensureShareModal();
    const link = chirpShareURL(chirpId);
    const iframe = chirpIframeCode(chirpId);
    const linkInput = $('#chirpShareLink', modal);
    const iframeInput = $('#chirpShareIframe', modal);
    if (linkInput) linkInput.value = link;
    if (iframeInput) iframeInput.value = iframe;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    linkInput?.focus();
    linkInput?.select();
  }

  function getSingleChirpId() {
    const params = new URLSearchParams(location.search);
    const fromQuery =
      params.get('id') || params.get('chirp_id') || params.get('chirp');

    if (fromQuery && String(fromQuery).trim()) return String(fromQuery).trim();

    if (location.search && location.search.startsWith('?=')) {
      const loose = decodeURIComponent(location.search.slice(2)).trim();
      if (loose) return loose;
    }

    const parts = location.pathname.split('/').filter(Boolean);

    if (parts[0] === 'chirp' && parts[1]) return decodeURIComponent(parts[1]);
    if (parts[0] === 'chirp.html' && parts[1])
      return decodeURIComponent(parts[1]);
    if (parts[0] === 'embed' && parts[1]) return decodeURIComponent(parts[1]);
    if (parts[0] === 'embed.html' && parts[1])
      return decodeURIComponent(parts[1]);

    return '';
  }

  async function chirpHtml(chirp) {
    const p = chirp.profiles || {};
    const isEmbed = page === 'embed';
    const isOwn = Boolean(user?.id && chirp.author_id === user.id);
    const displayName = p.display_name || 'Usuario';
    const username = p.username || 'usuario';
    const content = chirp.content || '';
    const hasEditedAt =
      chirp.updated_at &&
      chirp.created_at &&
      new Date(chirp.updated_at).getTime() >
        new Date(chirp.created_at).getTime() + 1000;
    const socialActions = !isEmbed
      ? `
            <button class="action-btn js-like" title="Me gusta"><span class="action-icon action-icon-like" aria-hidden="true"></span><b>${chirp.likes_count || 0}</b></button>
            <button class="action-btn js-rechirp" title="Rechirp"><span class="action-icon action-icon-rechirp" aria-hidden="true"></span><b>${chirp.rechirps_count || 0}</b></button>
            <button class="action-btn js-bookmark" title="Guardar"><span class="action-icon action-icon-bookmark" aria-hidden="true"></span><b>${chirp.bookmarks_count || 0}</b></button>
            <a class="action-btn" title="Respuestas" href="${chirpURL(chirp.id)}"><span class="action-icon action-icon-comment" aria-hidden="true"></span><b>${chirp.replies_count || 0}</b></a>`
      : '';
    const ownerActions =
      isOwn && !isEmbed
        ? `
            <button class="action-btn js-edit-chirp" type="button" title="Editar Chirp">Editar</button>
            <button class="action-btn action-btn-danger js-delete-chirp" type="button" title="Borrar Chirp">Borrar</button>`
        : '';
    const shareAction = !isEmbed
      ? `
            <button class="action-btn js-share-chirp" type="button" title="Compartir Chirp">Compartir</button>`
      : `
            <a class="action-btn" target="_blank" rel="noopener" href="${chirpShareURL(chirp.id)}">Ver en Chirp</a>`;

    return `<article class="chirp${isEmbed ? ' chirp-embed-card' : ''}" data-chirp-id="${esc(chirp.id)}" data-author-id="${esc(chirp.author_id || '')}" data-content="${esc(content)}">
      <div class="chirp__grid">
        <a href="${profileURL(username)}" target="${isEmbed ? '_blank' : '_self'}" rel="${isEmbed ? 'noopener' : ''}"><img class="avatar" src="${esc(p.avatar_url || fallbackAvatar(p))}" alt="${esc(displayName)}"></a>
        <div class="chirp__body">
          <div class="chirp__meta"><a class="chirp__name" href="${profileURL(username)}" target="${isEmbed ? '_blank' : '_self'}" rel="${isEmbed ? 'noopener' : ''}">${profileNameHTML(p, displayName)}</a><span>@${esc(username)}</span><span>·</span><a href="${chirpURL(chirp.id)}" target="${isEmbed ? '_blank' : '_self'}" rel="${isEmbed ? 'noopener' : ''}">${ago(chirp.created_at)}</a>${hasEditedAt ? `<span>· editado</span>` : ''}</div>
          ${content ? `<p class="chirp__text">${linkContent(content)}</p>` : ''}
          ${await mediaHtml(chirp.chirp_media || [])}
          <div class="chirp__actions">
            ${socialActions}
            ${shareAction}
            ${ownerActions}
          </div>
        </div>
      </div>
    </article>`;
  }

  function empty(title, msg) {
    return `<div class="card empty"><strong>${esc(title)}</strong><span>${esc(msg)}</span></div>`;
  }
  function loading(msg) {
    return empty(msg, 'Un segundo, el patito está buscando.');
  }

  async function hydrateMyChirpActions(root, chirpIds = []) {
    if (!root || !user?.id || !chirpIds.length) return;

    const uniqueIds = [...new Set(chirpIds.filter(Boolean))];
    if (!uniqueIds.length) return;

    try {
      const [liked, bookmarked, rechirped] = await Promise.all([
        sb
          .from('likes')
          .select('chirp_id')
          .eq('user_id', user.id)
          .in('chirp_id', uniqueIds),
        sb
          .from('bookmarks')
          .select('chirp_id')
          .eq('user_id', user.id)
          .in('chirp_id', uniqueIds),
        sb
          .from('rechirps')
          .select('chirp_id')
          .eq('user_id', user.id)
          .in('chirp_id', uniqueIds),
      ]);

      const likedSet = new Set((liked.data || []).map((row) => row.chirp_id));
      const bookmarkedSet = new Set(
        (bookmarked.data || []).map((row) => row.chirp_id)
      );
      const rechirpedSet = new Set(
        (rechirped.data || []).map((row) => row.chirp_id)
      );

      root.querySelectorAll('.chirp').forEach((card) => {
        const id = card.dataset.chirpId;
        const likeBtn = $('.js-like', card);
        const bookmarkBtn = $('.js-bookmark', card);
        const rechirpBtn = $('.js-rechirp', card);

        if (likedSet.has(id)) {
          likeBtn?.classList.add('is-active');
        }

        if (bookmarkedSet.has(id)) {
          bookmarkBtn?.classList.add('is-active');
        }

        if (rechirpedSet.has(id)) {
          rechirpBtn?.classList.add('is-active');
        }
      });
    } catch (error) {
      console.warn('[Chirp] no pude hidratar acciones del usuario', error);
    }
  }

  async function renderChirps(container, chirps) {
    if (!container) return;
    if (!chirps?.length) {
      container.innerHTML = empty(
        'Todavía no hay Chirps',
        'Sé la primera persona en romper el silencio rosa.'
      );
      return;
    }
    const html = [];
    for (const c of chirps) html.push(await chirpHtml(c));
    container.innerHTML = html.join('');
    await hydrateMyChirpActions(
      container,
      (chirps || []).map((c) => c.id)
    );
    bindActions(container);
    initChirpPlayers(container);
  }

  function bindActions(root) {
    root.querySelectorAll('.chirp').forEach((card) => {
      const id = card.dataset.chirpId;

      if (user?.id) {
        $('.js-like', card)?.addEventListener('click', () =>
          toggleJoin(
            'likes',
            { user_id: user.id, chirp_id: id },
            card,
            '.js-like'
          )
        );
        $('.js-rechirp', card)?.addEventListener('click', () =>
          toggleJoin(
            'rechirps',
            { user_id: user.id, chirp_id: id },
            card,
            '.js-rechirp'
          )
        );
        $('.js-bookmark', card)?.addEventListener('click', () =>
          toggleJoin(
            'bookmarks',
            { user_id: user.id, chirp_id: id },
            card,
            '.js-bookmark'
          )
        );
        $('.js-edit-chirp', card)?.addEventListener('click', () =>
          startEditChirp(card)
        );
        $('.js-delete-chirp', card)?.addEventListener('click', () =>
          deleteChirp(card)
        );
      }

      $('.js-share-chirp', card)?.addEventListener('click', () =>
        openShareModal(id)
      );
    });
  }

  function insertAfter(reference, node) {
    if (!reference?.parentNode) return;
    reference.parentNode.insertBefore(node, reference.nextSibling);
  }

  function restoreChirpText(card, content) {
    let textEl = $('.chirp__text', card);
    const body = $('.chirp__body', card);
    const meta = $('.chirp__meta', card);

    if (!content) {
      textEl?.remove();
      card.dataset.content = '';
      return;
    }

    if (!textEl) {
      textEl = document.createElement('p');
      textEl.className = 'chirp__text';
      if (meta) insertAfter(meta, textEl);
      else body?.prepend(textEl);
    }

    textEl.innerHTML = linkContent(content);
    textEl.hidden = false;
    card.dataset.content = content;
  }

  function startEditChirp(card) {
    if (!user?.id || card.dataset.authorId !== user.id)
      return toast(
        'No autorizado',
        'Solo podés editar tus propios Chirps.',
        'error'
      );
    if ($('.chirp-edit-form', card)) return;

    const current = card.dataset.content || '';
    const body = $('.chirp__body', card);
    const textEl = $('.chirp__text', card);
    const meta = $('.chirp__meta', card);

    const form = document.createElement('form');
    form.className = 'chirp-edit-form';
    form.innerHTML = `
      <textarea class="chirp-edit-form__textarea" maxlength="${CFG.chirpLimit}" placeholder="Editá tu Chirp...">${esc(current)}</textarea>
      <div class="chirp-edit-form__bar">
        <span class="form-hint js-edit-count">${current.length}/${CFG.chirpLimit}</span>
        <div class="chirp-edit-form__actions">
          <button class="btn btn-ghost btn-small js-cancel-edit" type="button">Cancelar</button>
          <button class="btn btn-primary btn-small" type="submit">Guardar</button>
        </div>
      </div>`;

    if (textEl) {
      textEl.hidden = true;
      insertAfter(textEl, form);
    } else if (meta) {
      insertAfter(meta, form);
    } else {
      body?.prepend(form);
    }

    const textarea = $('.chirp-edit-form__textarea', form);
    const counter = $('.js-edit-count', form);
    textarea?.focus();
    textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
    textarea?.addEventListener('input', () => {
      textarea.value = limit(textarea.value);
      if (counter)
        counter.textContent = `${textarea.value.length}/${CFG.chirpLimit}`;
    });

    $('.js-cancel-edit', form)?.addEventListener('click', () => {
      form.remove();
      if (textEl) textEl.hidden = false;
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const next = limit(textarea?.value || '').trim();
      const hasMedia = Boolean($('.chirp__media', card));
      if (!next && !hasMedia)
        return toast(
          'Chirp vacío',
          'Dejá texto o multimedia para poder guardarlo.',
          'error'
        );

      const btn = event.submitter;
      btn.disabled = true;
      btn.textContent = 'Guardando...';

      try {
        await updateChirpContent(card.dataset.chirpId, next);
        await syncEntities(card.dataset.chirpId);
        restoreChirpText(card, next);
        form.remove();
        markChirpAsEdited(card);
        toast('Chirp actualizado', 'Los cambios ya quedaron guardados.');
      } catch (error) {
        toast('No se pudo editar', error.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar';
      }
    });
  }

  function missingColumn(error, column) {
    const text =
      `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    return (
      text.includes(String(column).toLowerCase()) || error?.code === '42703'
    );
  }

  async function updateChirpContent(chirpId, content) {
    const payload = { content, updated_at: new Date().toISOString() };
    let { error } = await sb
      .from('chirps')
      .update(payload)
      .eq('id', chirpId)
      .eq('author_id', user.id);

    if (error && missingColumn(error, 'updated_at')) {
      ({ error } = await sb
        .from('chirps')
        .update({ content })
        .eq('id', chirpId)
        .eq('author_id', user.id));
    }

    if (error) throw error;
    scheduleRealtimeRefresh('chirps:edit');
  }

  function markChirpAsEdited(card) {
    const meta = $('.chirp__meta', card);
    if (!meta || $('.chirp-edited-mark', meta)) return;
    const mark = document.createElement('span');
    mark.className = 'chirp-edited-mark';
    mark.textContent = '· editado';
    meta.appendChild(mark);
  }

  async function deleteChirp(card) {
    if (!user?.id || card.dataset.authorId !== user.id)
      return toast(
        'No autorizado',
        'Solo podés borrar tus propios Chirps.',
        'error'
      );
    const ok = confirm(
      '¿Borrar este Chirp? Va a dejar de verse en el timeline.'
    );
    if (!ok) return;

    const btn = $('.js-delete-chirp', card);
    btn && (btn.disabled = true);

    try {
      let { error } = await sb
        .from('chirps')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', card.dataset.chirpId)
        .eq('author_id', user.id);

      if (error && missingColumn(error, 'deleted_at')) {
        ({ error } = await sb
          .from('chirps')
          .delete()
          .eq('id', card.dataset.chirpId)
          .eq('author_id', user.id));
      }

      if (error) throw error;

      card.remove();
      toast('Chirp borrado', 'Ya no aparece publicado.');
      scheduleRealtimeRefresh('chirps:delete');

      if (page === 'chirp' && $('#singleChirp') && !$('#singleChirp .chirp')) {
        $('#singleChirp').innerHTML = empty(
          'Chirp borrado',
          'Esta publicación ya no está disponible.'
        );
        $('#replyComposer') && ($('#replyComposer').innerHTML = '');
        $('#replyList') && ($('#replyList').innerHTML = '');
      }
    } catch (error) {
      toast('No se pudo borrar', error.message, 'error');
      btn && (btn.disabled = false);
    }
  }

  async function toggleJoin(table, row, card, selector) {
    const btn = $(selector, card);
    const countEl = btn?.querySelector('b');
    const wasActive = btn?.classList.contains('is-active');
    const current = Number(countEl?.textContent || 0);

    btn?.classList.toggle('is-active', !wasActive);
    if (countEl)
      countEl.textContent = String(Math.max(0, current + (wasActive ? -1 : 1)));

    try {
      const { data, error: selectError } = await sb
        .from(table)
        .select('*')
        .match(row)
        .maybeSingle();
      if (selectError) throw selectError;

      if (data) {
        const { error } = await sb.from(table).delete().match(row);
        if (error) throw error;
      } else {
        const { error } = await sb.from(table).insert(row);
        if (error) throw error;
      }

      scheduleRealtimeRefresh(`${table}:manual`);
    } catch (error) {
      btn?.classList.toggle('is-active', wasActive);
      if (countEl) countEl.textContent = String(current);
      toast('No se pudo actualizar', error.message, 'error');
    }
  }

  async function loadFeed() {
    const box = $('#feedList');
    if (!box) return;
    box.innerHTML = loading('Buscando Chirps...');
    const { data, error } = await sb
      .from('chirps')
      .select('*, profiles:author_id(*), chirp_media(*)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error)
      return (box.innerHTML = empty(
        'No pude cargar el timeline',
        error.message
      ));
    await renderChirps(box, data || []);
  }

  async function loadTrending() {
    const boxes = $$('.js-trending-tags');
    if (!boxes.length) return;
    try {
      let tags = [];
      const rpc = await sb.rpc('get_top_hashtags', { limit_count: 6 });
      if (!rpc.error && rpc.data?.length) tags = rpc.data;
      else {
        const res = await sb
          .from('hashtags')
          .select('tag, chirps_count')
          .gt('chirps_count', 0)
          .order('chirps_count', { ascending: false })
          .limit(6);
        if (res.error) throw res.error;
        tags = (res.data || []).map((t) => ({
          tag: t.tag,
          chirps_count: t.chirps_count,
          users_count: null,
        }));
      }
      const html = tags.length
        ? tags
            .map(
              (t) =>
                `<a class="chip trending-tag" data-tag="${String(t.tag).toLowerCase()}" href="/explore.html?tag=${encodeURIComponent(String(t.tag).toLowerCase())}"><span>#${esc(String(t.tag).toLowerCase())}</span><small>${t.users_count ? `${t.users_count} usuarios · ` : ''}${t.chirps_count || 0} Chirps</small></a>`
            )
            .join('')
        : `<div class="chip chip-muted">Todavía sin hashtags</div>`;
      boxes.forEach((b) => (b.innerHTML = html));
    } catch (e) {
      boxes.forEach(
        (b) =>
          (b.innerHTML = `<div class="chip chip-muted">Sin hashtags por ahora</div>`)
      );
    }
  }

  async function getChirpsByTag(tag) {
    const clean = String(tag || '')
      .trim()
      .replace(/^#/, '')
      .toLowerCase();
    const ht = await sb
      .from('hashtags')
      .select('*')
      .eq('tag', clean)
      .maybeSingle();
    if (ht.error) throw ht.error;
    if (!ht.data) return { hashtag: null, chirps: [] };
    const rows = await sb
      .from('chirp_hashtags')
      .select('chirps(*, profiles:author_id(*), chirp_media(*))')
      .eq('hashtag_id', ht.data.id)
      .limit(80);
    if (rows.error) throw rows.error;
    const chirps = (rows.data || [])
      .map((r) => r.chirps)
      .filter(Boolean)
      .filter((c) => !c.deleted_at)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { hashtag: ht.data, chirps };
  }

  async function filterByTag(tag) {
    const box = $('#exploreResults');
    const clean = String(tag || '')
      .trim()
      .replace(/^#/, '')
      .toLowerCase();
    if (!box) return;
    box.innerHTML = loading(`Filtrando #${clean}...`);
    try {
      const { hashtag, chirps } = await getChirpsByTag(clean);
      if (!hashtag)
        return (box.innerHTML = empty(
          `#${clean} todavía no existe`,
          'Cuando alguien lo use en un Chirp, aparece acá.'
        ));
      const list = document.createElement('div');
      const rendered = [];
      for (const c of chirps) rendered.push(await chirpHtml(c));
      box.innerHTML = `<section class="hashtag-feed"><div class="hashtag-filter-head"><h2>#${esc(clean)}</h2><p>Filtro directo por hashtag · ${chirps.length || hashtag.chirps_count || 0} Chirps.</p></div><div class="chirp-list">${rendered.join('') || empty('Sin Chirps visibles', 'El hashtag existe, pero no hay publicaciones visibles.')}</div></section>`;
      await hydrateMyChirpActions(
        box,
        chirps.map((c) => c.id)
      );
      bindActions(box);
      initChirpPlayers(box);
    } catch (e) {
      box.innerHTML = empty('No pude filtrar el hashtag', e.message);
    }
  }

  async function initExplore() {
    const input = $('#exploreSearch');
    const box = $('#exploreResults');
    const params = new URLSearchParams(location.search);
    const tag =
      params.get('tag') || sessionStorage.getItem('chirp_pending_tag');
    if (tag) {
      sessionStorage.removeItem('chirp_pending_tag');
      if (input) input.value = `#${tag}`;
      await filterByTag(tag);
      return;
    }
    if (!box) return;
    box.innerHTML = empty(
      'Explorá Chirp',
      'Buscá personas o tipeá #hashtag para filtrar Chirps.'
    );
    let timer;
    input?.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = input.value.trim();
        if (!q)
          return (box.innerHTML = empty(
            'Explorá Chirp',
            'Buscá personas o tipeá #hashtag para filtrar Chirps.'
          ));
        if (q.startsWith('#')) {
          const clean = q.replace(/^#/, '').toLowerCase();
          history.replaceState(
            null,
            '',
            `/explore.html?tag=${encodeURIComponent(clean)}`
          );
          return filterByTag(clean);
        }
        box.innerHTML = loading('Buscando...');
        const clean = q.replace(/^@/, '');
        const [profiles, tags] = await Promise.all([
          sb
            .from('profiles')
            .select('*')
            .or(`username.ilike.%${clean}%,display_name.ilike.%${q}%`)
            .limit(12),
          sb
            .from('hashtags')
            .select('*')
            .ilike('tag', `%${clean}%`)
            .order('chirps_count', { ascending: false })
            .limit(12),
        ]);
        const html = [];
        if (profiles.data?.length)
          html.push(
            `<div class="card"><div class="panel"><h3>Personas</h3></div>${profiles.data.map(userRow).join('')}</div>`
          );
        if (tags.data?.length)
          html.push(
            `<div class="card"><div class="panel"><h3>Hashtags</h3><p style="color:var(--muted);margin:6px 0 0;">Click para filtrar Chirps.</p></div>${tags.data.map((t) => `<a class="user-row" data-tag="${String(t.tag).toLowerCase()}" href="/explore.html?tag=${encodeURIComponent(String(t.tag).toLowerCase())}"><span class="chip">#</span><div><b>#${esc(t.tag)}</b><small>${t.chirps_count || 0} Chirps</small></div><span>→</span></a>`).join('')}</div>`
          );
        box.innerHTML =
          html.join('') || empty('Sin resultados', 'Probá con otra búsqueda.');
      }, 320);
    });
  }

  function userRow(p) {
    return `<a class="user-row" href="${profileURL(p.username)}"><img class="avatar" src="${esc(p.avatar_url || fallbackAvatar(p))}" alt="${esc(p.display_name || '')}"><div><b>${profileNameHTML(p, 'Usuario')}</b><small>@${esc(p.username || '')}</small></div><span>→</span></a>`;
  }

  async function initComposer() {
    initDropdowns();
    initMediaPreview();
    const form = $('#composerForm');
    const content = $('#chirpContent');
    const count = $('.js-char-count');
    content?.addEventListener('input', () => {
      content.value = limit(content.value);
      if (count)
        count.textContent = `${content.value.length}/${CFG.chirpLimit}`;
    });
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.submitter;
      btn.disabled = true;
      btn.textContent = 'Chirpeando...';
      try {
        const text = content.value.trim();
        const file = $('#chirpMedia')?.files?.[0] || null;
        const visibility = $('#chirpVisibility')?.value || 'public';
        if (!text && !file)
          throw new Error('Escribí algo o subí una foto/video.');
        const { data, error } = await sb
          .from('chirps')
          .insert({ author_id: user.id, content: text, visibility })
          .select('*')
          .single();
        if (error) throw error;
        if (file) await uploadChirpMedia(data.id, file);
        await syncEntities(data.id);
        content.value = '';
        $('#chirpMedia').value = '';
        $('.media-preview')?.classList.remove('is-active');
        if ($('.media-preview__body')) $('.media-preview__body').innerHTML = '';
        toast('Chirp publicado', 'Ya está en tu timeline.');
        await loadFeed();
        await loadTrending();
      } catch (e) {
        toast('No se pudo chirpear', e.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Chirpear';
      }
    });
  }

  async function loadBookmarks() {
    const box = $('#bookmarkList');
    if (!box) return;
    box.innerHTML = loading('Cargando guardados...');
    const { data, error } = await sb
      .from('bookmarks')
      .select('chirps(*, profiles:author_id(*), chirp_media(*))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error)
      return (box.innerHTML = empty('No pude cargar guardados', error.message));
    await renderChirps(box, (data || []).map((r) => r.chirps).filter(Boolean));
  }

  async function loadNotifications() {
    const box = $('#notificationList');
    if (!box) return;
    box.innerHTML = loading('Cargando notificaciones...');
    const { data, error } = await sb
      .from('notifications')
      .select('*, actor:actor_id(*), chirps(*)')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(60);
    if (error)
      return (box.innerHTML = empty(
        'No pude cargar notificaciones',
        error.message
      ));
    if (!data?.length)
      return (box.innerHTML = empty(
        'Todavía sin notificaciones',
        'Cuando alguien interactúe con vos, aparece acá.'
      ));
    box.innerHTML = data
      .map((n) => {
        const a = n.actor || {};
        const labels = {
          like: 'le gustó tu Chirp',
          reply: 'te respondió',
          follow: 'empezó a seguirte',
          rechirp: 'rechirpeó tu Chirp',
          quote: 'citó tu Chirp',
          mention: 'te mencionó',
        };
        return `<a class="notification-row" href="${n.chirp_id ? chirpURL(n.chirp_id) : `/${encodeURIComponent(a.username || '')}`}"><img class="avatar" src="${esc(a.avatar_url || fallbackAvatar(a))}" alt="${esc(a.display_name || 'Usuario')}"><div><b>${profileNameHTML(a, 'Alguien')} ${esc(labels[n.type] || 'interactuó con vos')}</b><small>${ago(n.created_at)}</small></div><span>${n.is_read ? '' : '●'}</span></a>`;
      })
      .join('');
    await sb
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_id', user.id)
      .eq('is_read', false);
  }

  async function loadMyProfile() {
    $('#profileName') &&
      ($('#profileName').innerHTML = profileNameHTML(profile, 'Tu perfil'));
    $('#profileUser') &&
      ($('#profileUser').textContent = profile?.username
        ? `@${profile.username}`
        : '');
    $('#profileBio') &&
      ($('#profileBio').textContent = profile?.bio || 'Todavía sin bio.');
    $('#profileCounts') &&
      ($('#profileCounts').innerHTML =
        `<strong>${profile?.chirps_count || 0}</strong> Chirps · <strong>${profile?.followers_count || 0}</strong> seguidores · <strong>${profile?.following_count || 0}</strong> siguiendo`);
    $('#profileAvatar') &&
      ($('#profileAvatar').src =
        profile?.avatar_url || fallbackAvatar(profile));
    if (profile?.banner_url && $('#profileCover'))
      $('#profileCover').innerHTML =
        `<img src="${esc(profile.banner_url)}" alt="Banner">`;
    const { data } = await sb
      .from('chirps')
      .select('*, profiles:author_id(*), chirp_media(*)')
      .eq('author_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    await renderChirps($('#profileFeed'), data || []);
  }

  function reservedPublicPathSlugs() {
    return new Set([
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
  }

  function getPublicUsernameFromURL() {
    const reserved = reservedPublicPathSlugs();
    const params = new URLSearchParams(location.search);
    const fromQuery = params.get('username') || params.get('user');
    if (fromQuery) {
      const cleanQuery = fromQuery.trim().replace(/^@/, '');
      return reserved.has(cleanQuery.toLowerCase()) ? '' : cleanQuery;
    }

    const pathname = (location.pathname || '').replace(/\/+$/, '');
    const parts = pathname.split('/').filter(Boolean);
    const last = parts.pop() || '';
    const cleanPath = decodeURIComponent(last).trim().replace(/^@/, '');

    if (!cleanPath || reserved.has(cleanPath.toLowerCase())) return '';
    return cleanPath;
  }

  function profileURL(username) {
    const clean = String(username || '')
      .trim()
      .replace(/^@/, '');
    return clean ? `/${encodeURIComponent(clean)}` : '/u.html';
  }

  async function loadPublicProfile() {
    const username = getPublicUsernameFromURL();
    const box = $('#publicProfile'),
      feed = $('#publicFeed');
    const followersBox = $('#publicFollowers');
    const followingBox = $('#publicFollowing');

    if (!box || !username) return;
    box.innerHTML = loading('Cargando perfil público...');

    const { data: p, error } = await sb
      .from('profiles')
      .select('*')
      .eq('username', username)
      .maybeSingle();
    if (error)
      return (box.innerHTML = empty('No encontré ese perfil', error.message));
    if (!p)
      return (box.innerHTML = empty(
        'No encontré ese perfil',
        'Revisá que el usuario exista o abrí el link completo.'
      ));

    const actions = await renderRelationshipButtons(p);
    const cover = p.banner_url
      ? `<img src="${esc(p.banner_url)}" alt="Banner">`
      : `<div class="profile-cover--empty"><img src="/assets/img/logo-duck.png" alt="Chirp"></div>`;

    box.innerHTML = `<div class="card">
      <div class="profile-cover">${cover}</div>
      <div class="profile-card">
        <div class="profile-card__top">
          <img class="avatar avatar-lg" src="${esc(p.avatar_url || fallbackAvatar(p))}" alt="${esc(p.display_name)}">
          ${actions}
        </div>
        <h2>${profileNameHTML(p, 'Usuario')}</h2>
        <div class="chirp__meta">@${esc(p.username)}</div>
        <p class="profile-card__bio">${esc(p.bio || 'Sin bio todavía.')}</p>
        <div class="public-profile-meta">
          <span class="chip"><strong>${p.chirps_count || 0}</strong> Chirps</span>
          <span class="chip"><strong>${p.followers_count || 0}</strong> seguidores</span>
          <span class="chip"><strong>${p.following_count || 0}</strong> seguidos</span>
        </div>
      </div>
    </div>`;

    bindRelationshipActions(box);
    bindPublicProfileTabs();

    const { data: chirps } = await sb
      .from('chirps')
      .select('*, profiles:author_id(*), chirp_media(*)')
      .eq('author_id', p.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    await renderChirps(feed, chirps || []);
    await loadPublicFollowers(p.id, followersBox);
    await loadPublicFollowing(p.id, followingBox);
  }

  function bindPublicProfileTabs() {
    const tabs = $$('.public-tab');
    if (!tabs.length) return;

    tabs.forEach((tab) => {
      if (tab.dataset.bound === '1') return;
      tab.dataset.bound = '1';
      tab.addEventListener('click', () => {
        const target = tab.dataset.publicTab;
        tabs.forEach((x) => x.classList.toggle('is-active', x === tab));

        $('#publicFeed') &&
          ($('#publicFeed').style.display =
            target === 'chirps' ? 'grid' : 'none');
        $('#publicFollowers') &&
          ($('#publicFollowers').style.display =
            target === 'followers' ? 'block' : 'none');
        $('#publicFollowing') &&
          ($('#publicFollowing').style.display =
            target === 'following' ? 'block' : 'none');
      });
    });
  }

  async function loadPublicFollowers(profileId, container) {
    if (!container) return;
    container.innerHTML = `<div class="public-list-head"><h2>Seguidores</h2><p>Personas que siguen este perfil.</p></div>`;

    const { data, error } = await sb
      .from('follows')
      .select('profiles:follower_id(*)')
      .eq('following_id', profileId)
      .order('created_at', { ascending: false })
      .limit(80);

    if (error) {
      container.innerHTML += `<div class="empty"><strong>No pude cargar seguidores</strong><span>${esc(error.message)}</span></div>`;
      return;
    }

    const users = (data || []).map((row) => row.profiles).filter(Boolean);
    container.innerHTML += users.length
      ? users.map(publicUserRow).join('')
      : `<div class="empty"><strong>Sin seguidores todavía</strong><span>Cuando alguien lo siga, aparece acá.</span></div>`;
  }

  async function loadPublicFollowing(profileId, container) {
    if (!container) return;
    container.innerHTML = `<div class="public-list-head"><h2>Seguidos</h2><p>Perfiles que sigue este usuario.</p></div>`;

    const { data, error } = await sb
      .from('follows')
      .select('profiles:following_id(*)')
      .eq('follower_id', profileId)
      .order('created_at', { ascending: false })
      .limit(80);

    if (error) {
      container.innerHTML += `<div class="empty"><strong>No pude cargar seguidos</strong><span>${esc(error.message)}</span></div>`;
      return;
    }

    const users = (data || []).map((row) => row.profiles).filter(Boolean);
    container.innerHTML += users.length
      ? users.map(publicUserRow).join('')
      : `<div class="empty"><strong>No sigue a nadie todavía</strong><span>Los perfiles seguidos aparecen acá.</span></div>`;
  }

  function publicUserRow(p) {
    return `<a class="user-row" href="${profileURL(p.username)}">
      <img class="avatar" src="${esc(p.avatar_url || fallbackAvatar(p))}" alt="${esc(p.display_name || 'Usuario')}">
      <div><b>${profileNameHTML(p, 'Usuario')}</b><small>@${esc(p.username || '')}</small></div>
      <span>→</span>
    </a>`;
  }

  function replyHtml(reply) {
    const p = reply.profiles || {};
    return `<article class="chirp" data-reply-id="${esc(reply.id)}">
      <div class="chirp__grid">
        <a href="${profileURL(p.username)}"><img class="avatar" src="${esc(p.avatar_url || fallbackAvatar(p))}" alt="${esc(p.display_name || p.username || 'Usuario')}"></a>
        <div>
          <div class="chirp__meta">
            <a class="chirp__name" href="${profileURL(p.username)}">${profileNameHTML(p, 'Usuario')}</a>
            <span>@${esc(p.username || 'usuario')}</span>
            <span>·</span>
            <span>${ago(reply.created_at)}</span>
          </div>
          <p class="chirp__text">${linkContent(reply.content || '')}</p>
        </div>
      </div>
    </article>`;
  }

  function renderReplyComposer(chirpId) {
    const box = $('#replyComposer');
    if (!box) return;

    box.innerHTML = `<div class="card composer">
      <form id="replyForm">
        <div class="composer__head">
          <img class="avatar js-composer-avatar" src="${esc(profile?.avatar_url || fallbackAvatar(profile))}" alt="Tu avatar">
          <div>
            <textarea id="replyContent" class="composer-textarea" maxlength="${CFG.chirpLimit}" placeholder="Escribí tu respuesta..."></textarea>
            <div class="composer__tools">
              <div class="composer__left">
                <span class="chip chip-muted">Respondiendo al Chirp</span>
              </div>
              <div style="display:flex;align-items:center;gap:10px;">
                <span class="js-reply-char-count form-hint">0/${CFG.chirpLimit}</span>
                <button class="btn btn-primary" type="submit">Responder</button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>`;

    hydrateMe();

    const form = $('#replyForm', box);
    const input = $('#replyContent', box);
    const count = $('.js-reply-char-count', box);

    input?.addEventListener('input', () => {
      input.value = limit(input.value);
      if (count) count.textContent = `${input.value.length}/${CFG.chirpLimit}`;
    });

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();

      const body = input.value.trim();
      if (!body)
        return toast(
          'Escribí una respuesta',
          'No puede quedar vacía.',
          'error'
        );

      const btn = event.submitter;
      btn.disabled = true;
      btn.textContent = 'Respondiendo...';

      try {
        const { error } = await sb.from('chirp_replies').insert({
          chirp_id: chirpId,
          author_id: user.id,
          content: body,
        });

        if (error) throw error;

        input.value = '';
        if (count) count.textContent = `0/${CFG.chirpLimit}`;

        toast('Respuesta publicada', 'Ya aparece dentro del Chirp.');
        await loadSingleChirp();
      } catch (error) {
        toast('No se pudo responder', error.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Responder';
      }
    });
  }

  async function loadReplies(chirpId) {
    const box = $('#replyList');
    if (!box) return;

    box.innerHTML = loading('Cargando respuestas...');

    const { data, error } = await sb
      .from('chirp_replies')
      .select('*, profiles:author_id(*)')
      .eq('chirp_id', chirpId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) {
      box.innerHTML = empty('No pude cargar respuestas', error.message);
      return;
    }

    box.innerHTML = (data || []).length
      ? (data || []).map(replyHtml).join('')
      : empty(
          'Sin respuestas todavía',
          'Sé la primera persona en comentar este Chirp.'
        );
  }

  async function loadSingleChirp() {
    const id = getSingleChirpId();
    const box = $('#singleChirp');
    const repliesBox = $('#replyList');
    const composerBox = $('#replyComposer');

    if (!box) return;

    if (!id) {
      if (composerBox) composerBox.innerHTML = '';
      if (repliesBox) repliesBox.innerHTML = '';
      box.innerHTML = empty(
        'Falta el Chirp',
        'Abrí el Chirp desde el botón de respuestas o usá una URL tipo /chirp/ID.'
      );
      return;
    }

    box.innerHTML = loading('Cargando Chirp...');
    if (composerBox) composerBox.innerHTML = '';
    if (repliesBox) repliesBox.innerHTML = '';

    const { data, error } = await sb
      .from('chirps')
      .select('*, profiles:author_id(*), chirp_media(*)')
      .eq('id', id)
      .single();

    if (error) {
      box.innerHTML = empty('No encontré ese Chirp', error.message);
      return;
    }

    await renderChirps(box, [data]);
    renderReplyComposer(id);
    await loadReplies(id);
  }

  async function loadEmbedChirp() {
    const id = getSingleChirpId();
    const box = $('#embedChirp');
    if (!box) return;

    if (!id) {
      box.innerHTML = empty(
        'Falta el Chirp',
        'Usá un iframe con /embed.html?chirp=ID.'
      );
      return;
    }

    box.innerHTML = loading('Cargando Chirp...');

    const { data, error } = await sb
      .from('chirps')
      .select('*, profiles:author_id(*), chirp_media(*)')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      box.innerHTML = empty('No pude cargar el Chirp', error.message);
      return;
    }

    if (!data) {
      box.innerHTML = empty(
        'Chirp no disponible',
        'Puede estar borrado o privado.'
      );
      return;
    }

    await renderChirps(box, [data]);
    document.title = `${data.profiles?.display_name || 'Chirp'} · Chirp insertado`;
  }

  async function uploadProfileImage(inputId, bucket, column) {
    const input = document.getElementById(inputId);
    input?.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const ext = (file.name.split('.').pop() || 'webp').toLowerCase();
        const path = `${user.id}/${column}-${Date.now()}.${ext}`;
        const up = await sb.storage
          .from(bucket)
          .upload(path, file, { upsert: true, contentType: file.type });
        if (up.error) throw up.error;
        const url = sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
        const res = await sb
          .from('profiles')
          .update({ [column]: url })
          .eq('id', user.id);
        if (res.error) throw res.error;
        toast('Imagen actualizada', 'Se guardó correctamente.');
      } catch (e) {
        toast('No se pudo subir', e.message, 'error');
      }
    });
  }

  function initSettings() {
    $('#settingsName') &&
      ($('#settingsName').value = profile?.display_name || '');
    $('#settingsUsername') &&
      ($('#settingsUsername').value = profile?.username || '');
    $('#settingsBio') && ($('#settingsBio').value = profile?.bio || '');
    $('#privateValue') && ($('#privateValue').checked = !!profile?.is_private);
    $('#profileSettingsForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.submitter;
      btn.disabled = true;
      try {
        const update = {
          display_name: $('#settingsName').value.trim(),
          username: $('#settingsUsername').value.trim(),
          bio: $('#settingsBio').value.trim(),
          is_private: $('#privateValue').checked,
        };
        if (!update.display_name)
          throw new Error('El nombre no puede quedar vacío.');
        if (!/^[a-zA-Z0-9_]{3,30}$/.test(update.username))
          throw new Error(
            'Usuario: 3 a 30 caracteres, letras, números o guión bajo.'
          );
        const { error } = await sb
          .from('profiles')
          .update(update)
          .eq('id', user.id);
        if (error) throw error;
        toast('Perfil actualizado', 'Tus cambios ya están guardados.');
      } catch (e) {
        toast('No se pudo guardar', e.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });

    uploadProfileImage('avatarUpload', CFG.avatarBucket, 'avatar_url');
    uploadProfileImage('bannerUpload', CFG.bannerBucket, 'banner_url');

    $('#emailSettingsForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.submitter;
      btn.disabled = true;
      try {
        const email = $('#newEmail').value.trim();
        if (!email || !email.includes('@'))
          throw new Error('Escribí un email válido.');
        const { error } = await sb.auth.updateUser(
          { email },
          { emailRedirectTo: CFG.authCallback }
        );
        if (error) throw error;
        toast(
          'Revisá tu correo',
          'Te mandamos un mail para confirmar el cambio.'
        );
      } catch (e) {
        toast('No se pudo enviar', e.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });

    $('#passwordSettingsForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.submitter;
      btn.disabled = true;
      try {
        if (!user?.email) throw new Error('No encontré el email actual.');
        const { error } = await sb.auth.resetPasswordForEmail(user.email, {
          redirectTo: CFG.updatePassword,
        });
        if (error) throw error;
        toast(
          'Revisá tu correo',
          'Te mandamos un enlace para cambiar tu contraseña.'
        );
      } catch (e) {
        toast('No se pudo enviar', e.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function initSupport() {
    $('#supportForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const subject = $('#supportSubject').value.trim();
        const message = $('#supportMessage').value.trim();
        if (!subject || !message) throw new Error('Completá asunto y mensaje.');
        const { error } = await sb
          .from('support_tickets')
          .insert({ user_id: user.id, subject, message });
        if (error) throw error;
        toast('Soporte recibido', 'Lo dejamos guardado.');
        e.target.reset();
      } catch (err) {
        toast('No se pudo enviar', err.message, 'error');
      }
    });
  }

  const ICON_SHOW = `
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path fill-rule="evenodd" clip-rule="evenodd"
          d="M6.30147 15.5771C4.77832 14.2684 3.6904 12.7726 3.18002 12C3.6904 11.2274 4.77832 9.73158 6.30147 8.42294C7.87402 7.07185 9.81574 6 12 6C14.1843 6 16.1261 7.07185 17.6986 8.42294C19.2218 9.73158 20.3097 11.2274 20.8201 12C20.3097 12.7726 19.2218 14.2684 17.6986 15.5771C16.1261 16.9282 14.1843 18 12 18C9.81574 18 7.87402 16.9282 6.30147 15.5771ZM12 4C9.14754 4 6.75717 5.39462 4.99812 6.90595C3.23268 8.42276 2.00757 10.1376 1.46387 10.9698C1.05306 11.5985 1.05306 12.4015 1.46387 13.0302C2.00757 13.8624 3.23268 15.5772 4.99812 17.0941C6.75717 18.6054 9.14754 20 12 20C14.8525 20 17.2429 18.6054 19.002 17.0941C20.7674 15.5772 21.9925 13.8624 22.5362 13.0302C22.947 12.4015 22.947 11.5985 22.5362 10.9698C21.9925 10.1376 20.7674 8.42276 19.002 6.90595C17.2429 5.39462 14.8525 4 12 4ZM10 12C10 10.8954 10.8955 10 12 10C13.1046 10 14 10.8954 14 12C14 13.1046 13.1046 14 12 14C10.8955 14 10 13.1046 10 12ZM12 8C9.7909 8 8.00004 9.79086 8.00004 12C8.00004 14.2091 9.7909 16 12 16C14.2092 16 16 14.2091 16 12C16 9.79086 14.2092 8 12 8Z"
          fill="currentColor"/>
      </svg>`;

  const ICON_HIDE = `
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path fill-rule="evenodd" clip-rule="evenodd" d="M22.2954 6.31083C22.6761 6.474 22.8524 6.91491 22.6893 7.29563L21.9999 7.00019C22.6893 7.29563 22.6894 7.29546 22.6893 7.29563L22.6886 7.29731L22.6875 7.2998L22.6843 7.30716L22.6736 7.33123C22.6646 7.35137 22.6518 7.37958 22.6352 7.41527C22.6019 7.48662 22.5533 7.58794 22.4888 7.71435C22.3599 7.967 22.1675 8.32087 21.9084 8.73666C21.4828 9.4197 20.8724 10.2778 20.0619 11.1304L21.0303 12.0987C21.3231 12.3916 21.3231 12.8665 21.0303 13.1594C20.7374 13.4523 20.2625 13.4523 19.9696 13.1594L18.969 12.1588C18.3093 12.7115 17.5528 13.2302 16.695 13.6564L17.6286 15.0912C17.8545 15.4383 17.7562 15.9029 17.409 16.1288C17.0618 16.3547 16.5972 16.2564 16.3713 15.9092L15.2821 14.2353C14.5028 14.4898 13.659 14.6628 12.7499 14.7248V16.5002C12.7499 16.9144 12.4141 17.2502 11.9999 17.2502C11.5857 17.2502 11.2499 16.9144 11.2499 16.5002V14.7248C10.3689 14.6647 9.54909 14.5004 8.78982 14.2586L7.71575 15.9093C7.48984 16.2565 7.02526 16.3548 6.67807 16.1289C6.33089 15.903 6.23257 15.4384 6.45847 15.0912L7.37089 13.689C6.5065 13.2668 5.74381 12.7504 5.07842 12.1984L4.11744 13.1594C3.82455 13.4523 3.34968 13.4523 3.05678 13.1594C2.76389 12.8665 2.76389 12.3917 3.05678 12.0988L3.98055 11.175C3.15599 10.3153 2.53525 9.44675 2.10277 8.75486C1.83984 8.33423 1.6446 7.97584 1.51388 7.71988C1.44848 7.59182 1.3991 7.48914 1.36537 7.41683C1.3485 7.38067 1.33553 7.35207 1.32641 7.33167L1.31562 7.30729L1.31238 7.29984L1.31129 7.29733L1.31088 7.29638C1.31081 7.2962 1.31056 7.29563 1.99992 7.00019L1.31088 7.29638C1.14772 6.91565 1.32376 6.474 1.70448 6.31083C2.08489 6.1478 2.52539 6.32374 2.68888 6.70381C2.68882 6.70368 2.68894 6.70394 2.68888 6.70381L2.68983 6.706L2.69591 6.71972C2.7018 6.73291 2.7114 6.7541 2.72472 6.78267C2.75139 6.83983 2.79296 6.92644 2.84976 7.03767C2.96345 7.26029 3.13762 7.58046 3.37472 7.95979C3.85033 8.72067 4.57157 9.70728 5.55561 10.6218C6.42151 11.4265 7.48259 12.1678 8.75165 12.656C9.70614 13.0232 10.7854 13.2502 11.9999 13.2502C13.2416 13.2502 14.342 13.013 15.3124 12.631C16.5738 12.1345 17.6277 11.3884 18.4866 10.5822C19.4562 9.67216 20.1668 8.69535 20.6354 7.9434C20.869 7.5685 21.0405 7.25246 21.1525 7.03286C21.2085 6.92315 21.2494 6.83776 21.2757 6.78144C21.2888 6.75328 21.2983 6.73242 21.3041 6.71943L21.31 6.70595L21.3106 6.70475C21.3105 6.70485 21.3106 6.70466 21.3106 6.70475M22.2954 6.31083C21.9147 6.14771 21.4738 6.32423 21.3106 6.70475L22.2954 6.31083ZM2.68888 6.70381C2.68882 6.70368 2.68894 6.70394 2.68888 6.70381V6.70381Z" fill="currentColor"/>
  </svg>`;

  function initPasswordToggles(root = document) {
    $$('.js-password-toggle', root).forEach((btn) => {
      if (btn.dataset.ready) return;
      const selector = btn.dataset.passwordToggle;
      if (!selector) return;
      const input = $(selector, root);
      if (!input) return;

      btn.dataset.ready = '1';
      btn.setAttribute('type', 'button');

      const sync = () => {
        const isVisible = input.type === 'text';
        btn.innerHTML = isVisible ? ICON_SHOW : ICON_HIDE;
        btn.setAttribute(
          'aria-label',
          isVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'
        );
        btn.setAttribute('aria-pressed', String(isVisible));
      };

      sync();
      btn.addEventListener('click', () => {
        const start = input.selectionStart;
        const end = input.selectionEnd;
        input.type = input.type === 'password' ? 'text' : 'password';
        sync();
        input.focus();
        if (Number.isInteger(start) && Number.isInteger(end)) {
          input.setSelectionRange(start, end);
        }
      });
    });
  }

  function initAuth() {
    initPasswordToggles();

    $('#loginForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.submitter;
      btn.disabled = true;
      try {
        const email = $('#loginEmail').value.trim();
        const password = $('#loginPassword').value;
        const { error } = await wait(
          sb.auth.signInWithPassword({ email, password }),
          CFG.authTimeoutMs,
          'Entrar'
        );
        if (error) throw error;
        await ensureProfile();
        location.href =
          new URLSearchParams(location.search).get('next') || '/home.html';
      } catch (err) {
        toast('No se pudo entrar', err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });

    $('#registerForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.submitter;
      btn.disabled = true;
      try {
        const displayName = $('#registerName').value.trim();
        const username = cleanUsernameInput(
          $('#registerUsername')?.value || ''
        );
        const email = $('#registerEmail').value.trim();
        const password = $('#registerPassword').value;
        if (!validUsername(username))
          throw new Error(
            'Usuario: 3 a 30 caracteres, letras, números o guión bajo.'
          );
        const existing = await sb
          .from('profiles')
          .select('id')
          .eq('username', username)
          .maybeSingle();
        if (existing.data) throw new Error('Ese usuario ya está ocupado.');
        const { data, error } = await wait(
          sb.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: CFG.authCallback,
              data: { display_name: displayName, username },
            },
          }),
          CFG.authTimeoutMs,
          'Crear cuenta'
        );
        if (error) throw error;
        if (data?.session) location.href = '/home.html';
        else
          toast(
            'Confirmá tu email',
            'Te mandamos el enlace para activar la cuenta.',
            'success'
          );
      } catch (err) {
        toast('No se pudo crear la cuenta', err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });

    $('#resetForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const email = $('#resetEmail').value.trim();
        const { error } = await sb.auth.resetPasswordForEmail(email, {
          redirectTo: CFG.updatePassword,
        });
        if (error) throw error;
        toast(
          'Revisá tu correo',
          'Te mandamos un enlace para cambiar tu contraseña.',
          'success'
        );
      } catch (err) {
        toast('No se pudo enviar', err.message, 'error');
      }
    });

    $('#updatePasswordForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const pass = $('#updatePassword').value;
        if (pass.length < 6) throw new Error('Mínimo 6 caracteres.');
        const { error } = await sb.auth.updateUser({ password: pass });
        if (error) throw error;
        toast(
          'Contraseña actualizada',
          'Ya podés usar tu nueva clave.',
          'success'
        );
        setTimeout(() => (location.href = '/home.html'), 1200);
      } catch (err) {
        toast('No se pudo cambiar', err.message, 'error');
      }
    });

    $('#magicForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const email = $('#magicEmail').value.trim();
        const { error } = await sb.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: CFG.authCallback },
        });
        if (error) throw error;
        toast('Revisá tu correo', 'Te mandamos un acceso mágico.', 'success');
      } catch (err) {
        toast('No se pudo enviar', err.message, 'error');
      }
    });
  }

  async function initCallback() {
    try {
      await sb.auth.getSession();
      location.replace('/home.html');
    } catch {
      location.replace('/login.html');
    }
  }

  function bindHashtagNavigation() {
    document.addEventListener(
      'click',
      (event) => {
        const link = event.target.closest(
          'a.text-tag, a.trending-tag, a[data-tag]'
        );
        if (!link) return;

        const rawHref = link.getAttribute('href') || '';
        let tag = link.dataset.tag || '';

        try {
          const url = new URL(rawHref, location.origin);
          tag =
            tag ||
            url.searchParams.get('tag') ||
            url.searchParams.get('q') ||
            '';
        } catch {}

        tag = (tag || link.textContent || '')
          .trim()
          .replace(/^#/, '')
          .toLowerCase();
        if (!tag) return;

        event.preventDefault();
        sessionStorage.setItem('chirp_pending_tag', tag);
        location.href = `/explore.html?tag=${encodeURIComponent(tag)}`;
      },
      true
    );
  }

  let activeDmUser = null;
  let activeDmProfile = null;

  async function isFollowing(targetId) {
    if (!targetId || !user?.id) return false;
    const { data } = await sb
      .from('follows')
      .select('*')
      .eq('follower_id', user.id)
      .eq('following_id', targetId)
      .maybeSingle();
    return Boolean(data);
  }

  async function isBlocked(targetId) {
    if (!targetId || !user?.id) return false;
    const { data } = await sb
      .from('blocks')
      .select('*')
      .eq('blocker_id', user.id)
      .eq('blocked_id', targetId)
      .maybeSingle();
    return Boolean(data);
  }

  async function renderRelationshipButtons(targetProfile, root = document) {
    if (!targetProfile?.id || targetProfile.id === user?.id) return '';
    const [following, blocked] = await Promise.all([
      isFollowing(targetProfile.id),
      isBlocked(targetProfile.id),
    ]);
    return `<div class="profile-actions" data-user-id="${esc(targetProfile.id)}" data-username="${esc(targetProfile.username || '')}">
      <button class="btn ${following ? 'btn-ghost' : 'btn-primary'} btn-small js-follow">${following ? 'Dejar de seguir' : 'Seguir'}</button>
      <button class="btn btn-soft btn-small js-message-user">Mensaje</button>
      <button class="btn ${blocked ? 'btn-primary' : 'btn-ghost'} btn-small js-block">${blocked ? 'Desbloquear' : 'Bloquear'}</button>
    </div>`;
  }

  function bindRelationshipActions(root = document) {
    root.querySelectorAll('.profile-actions').forEach((box) => {
      if (box.dataset.bound === '1') return;
      box.dataset.bound = '1';
      const targetId = box.dataset.userId;
      const username = box.dataset.username;

      $('.js-follow', box)?.addEventListener('click', async (event) => {
        const btn = event.currentTarget;
        try {
          const nowFollowing = btn.textContent
            .trim()
            .toLowerCase()
            .startsWith('dejar');
          if (nowFollowing) {
            await sb
              .from('follows')
              .delete()
              .eq('follower_id', user.id)
              .eq('following_id', targetId);
            btn.textContent = 'Seguir';
            btn.className = 'btn btn-primary btn-small js-follow';
          } else {
            const { error } = await sb
              .from('follows')
              .insert({ follower_id: user.id, following_id: targetId });
            if (error) throw error;
            btn.textContent = 'Dejar de seguir';
            btn.className = 'btn btn-ghost btn-small js-follow';
          }
        } catch (e) {
          toast('No se pudo actualizar', e.message, 'error');
        }
      });

      $('.js-block', box)?.addEventListener('click', async (event) => {
        const btn = event.currentTarget;
        try {
          const nowBlocked = btn.textContent
            .trim()
            .toLowerCase()
            .startsWith('desbloquear');
          if (nowBlocked) {
            await sb
              .from('blocks')
              .delete()
              .eq('blocker_id', user.id)
              .eq('blocked_id', targetId);
            btn.textContent = 'Bloquear';
            btn.className = 'btn btn-ghost btn-small js-block';
          } else {
            const { error } = await sb
              .from('blocks')
              .insert({ blocker_id: user.id, blocked_id: targetId });
            if (error) throw error;
            btn.textContent = 'Desbloquear';
            btn.className = 'btn btn-primary btn-small js-block';
          }
        } catch (e) {
          toast('No se pudo bloquear', e.message, 'error');
        }
      });

      $('.js-message-user', box)?.addEventListener('click', () => {
        location.href = `/messages.html?user=${encodeURIComponent(username)}`;
      });
    });
  }

  async function startDmWithProfile(targetProfile) {
    activeDmProfile = targetProfile;
    activeDmUser = targetProfile?.id || null;
    $('#dmPeerName') &&
      ($('#dmPeerName').innerHTML = profileNameHTML(targetProfile, 'Usuario'));
    $('#dmPeerUser') &&
      ($('#dmPeerUser').textContent = targetProfile?.username
        ? `@${targetProfile.username}`
        : 'DM privado');
    $('#dmPeerAvatar') &&
      ($('#dmPeerAvatar').src =
        targetProfile?.avatar_url || fallbackAvatar(targetProfile));
    await loadDmMessages();
    await loadDmThreads();
  }

  function dmRow(profile, receivedCount = 0) {
    const isActive = profile.id && profile.id === activeDmUser;
    return `<button class="dm-row${isActive ? ' is-active' : ''}" data-user-id="${esc(profile.id)}" data-username="${esc(profile.username || '')}">
      <img class="avatar" src="${esc(profile.avatar_url || fallbackAvatar(profile))}" alt="${esc(profile.display_name || 'Usuario')}">
      <span class="dm-row__main"><b>${profileNameHTML(profile, 'Usuario')}</b><small>@${esc(profile.username || '')}</small></span>
      ${renderNumberBadge(receivedCount, 'dm-count-badge')}
    </button>`;
  }

  async function findDmUsers(query) {
    const box = $('#dmSearchResults');
    if (!box) return;
    const q = String(query || '')
      .trim()
      .replace(/^@/, '');
    if (!q) {
      box.innerHTML = '';
      return;
    }
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .neq('id', user.id)
      .limit(8);
    if (error)
      return (box.innerHTML = `<div class="notice notice-error"><strong>Error</strong><span>${esc(error.message)}</span></div>`);
    box.innerHTML =
      (data || [])
        .map((profile) => dmRow(profile, dmIncomingCounts.get(profile.id) || 0))
        .join('') || `<div class="chip chip-muted">Sin usuarios</div>`;
    bindDmRows(box);
  }

  function bindDmRows(root = document) {
    root.querySelectorAll('.dm-row').forEach((row) => {
      if (row.dataset.bound === '1') return;
      row.dataset.bound = '1';
      row.addEventListener('click', async () => {
        root
          .querySelectorAll('.dm-row')
          .forEach((x) => x.classList.remove('is-active'));
        row.classList.add('is-active');
        const username = row.dataset.username;
        const { data, error } = await sb
          .from('profiles')
          .select('*')
          .eq('username', username)
          .maybeSingle();
        if (error || !data)
          return toast(
            'No encontré el usuario',
            error?.message || 'Probá buscarlo de nuevo.',
            'error'
          );
        await startDmWithProfile(data);
      });
    });
  }

  async function fetchProfilesByIds(ids = []) {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (!uniqueIds.length) return new Map();
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .in('id', uniqueIds);
    if (error) {
      console.warn('[Chirp] no pude cargar perfiles', error);
      return new Map();
    }
    return new Map((data || []).map((p) => [p.id, p]));
  }

  async function loadDmThreads() {
    const box = $('#dmThreads');
    if (!box) return;
    await refreshIncomingDmBadges();
    const { data, error } = await sb.rpc('get_dm_threads');
    if (error) {
      box.innerHTML = `<div class="chip chip-muted">Sin chats todavía</div>`;
      return;
    }
    const profileMap = await fetchProfilesByIds(
      (data || []).map((row) => row.peer_id)
    );
    box.innerHTML =
      (data || [])
        .map((row) => {
          const fresh = profileMap.get(row.peer_id) || {};
          const peer = {
            id: row.peer_id,
            username: row.peer_username,
            display_name: row.peer_display_name,
            avatar_url: row.peer_avatar_url,
            ...fresh,
          };
          return dmRow(peer, dmIncomingCounts.get(peer.id) || 0);
        })
        .join('') || `<div class="chip chip-muted">Sin chats todavía</div>`;
    bindDmRows(box);
  }

  async function loadDmMessages() {
    const box = $('#dmMessages');
    if (!box || !activeDmUser) return;
    box.innerHTML = `<div class="empty"><strong>Cargando DM...</strong><span>Un segundo.</span></div>`;
    const { data, error } = await sb
      .from('direct_messages')
      .select('*')
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${activeDmUser}),and(sender_id.eq.${activeDmUser},receiver_id.eq.${user.id})`
      )
      .order('created_at', { ascending: true })
      .limit(120);
    if (error)
      return (box.innerHTML = empty('No pude cargar el DM', error.message));

    box.innerHTML =
      (data || [])
        .map(
          (
            msg
          ) => `<div class="dm-message ${msg.sender_id === user.id ? 'is-me' : ''}">
      ${esc(msg.body)}
      <small>${ago(msg.created_at)}</small>
    </div>`
        )
        .join('') ||
      `<div class="empty"><strong>Nuevo chat</strong><span>Mandá el primer mensaje.</span></div>`;
    box.scrollTop = box.scrollHeight;

    await markDmThreadAsRead(activeDmUser, data || []);
    await refreshIncomingDmBadges();
  }

  async function initMessages() {
    await refreshIncomingDmBadges();
    const qUser = new URLSearchParams(location.search).get('user');
    if (qUser) {
      const { data } = await sb
        .from('profiles')
        .select('*')
        .eq('username', qUser)
        .maybeSingle();
      if (data) await startDmWithProfile(data);
    }

    await loadDmThreads();

    let timer;
    $('#dmUserSearch')?.addEventListener('input', (event) => {
      clearTimeout(timer);
      timer = setTimeout(() => findDmUsers(event.target.value), 280);
    });

    $('#dmForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!activeDmUser)
        return toast(
          'Elegí un usuario',
          'Primero buscá o abrí un chat.',
          'error'
        );
      const input = $('#dmInput');
      const body = input.value.trim();
      if (!body) return;
      input.value = '';
      const { error } = await sb.from('direct_messages').insert({
        sender_id: user.id,
        receiver_id: activeDmUser,
        body,
      });
      if (error) return toast('No se pudo enviar', error.message, 'error');
      await refreshIncomingDmBadges();
      await loadDmMessages();
      await loadDmThreads();
    });
  }

  async function generateChirpyReply(question) {
    const cleanQuestion = String(question || '').trim();
    if (!cleanQuestion) return 'Preguntame algo y te ayudo.';

    try {
      const { data: sessionData } = await sb.auth.getSession();
      const token = sessionData?.session?.access_token;

      const response = await fetch(CFG.chirpyEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: cleanQuestion,
          page,
          profile: profile
            ? {
                username: profile.username,
                display_name: profile.display_name,
              }
            : null,
        }),
      });

      let payload = null;
      const raw = await response.text();

      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch (_error) {
        payload = null;
      }

      console.info('[Chirpy] backend response', {
        status: response.status,
        ok: response.ok,
        payload,
        raw,
      });

      if (!response.ok) {
        const backendError =
          payload?.error || payload?.reply || raw || `HTTP ${response.status}`;
        throw new Error(
          `Backend Chirpy respondió ${response.status}: ${backendError}`
        );
      }

      if (payload?.mode && $('#chirpyMode')) {
        $('#chirpyMode').textContent =
          payload.mode === 'openai'
            ? 'Respuestas generadas por IA'
            : payload.mode === 'fallback'
              ? 'Fallback backend: revisar OpenAI key'
              : `Modo ${payload.mode}`;
      }

      if (payload?.reply) return String(payload.reply).trim();

      if (Object.prototype.hasOwnProperty.call(payload || {}, 'hasOpenAIKey')) {
        return [
          'Debug Chirpy:',
          `OPENAI_API_KEY: ${payload.hasOpenAIKey ? 'OK' : 'NO DETECTADA'}`,
          `Modelo: ${payload.model || 'sin modelo'}`,
          `Deployment: ${payload.deployment || 'sin deployment'}`,
        ].join('\n');
      }

      if (payload?.error) {
        throw new Error(payload.error);
      }

      return [
        'Chirpy respondió, pero sin campo `reply`.',
        'Respuesta recibida:',
        JSON.stringify(payload || raw || {}, null, 2),
      ].join('\n');
    } catch (error) {
      console.warn(
        '[Chirpy] IA backend no disponible, usando fallback generativo local.',
        error
      );
      return localChirpyFallback(cleanQuestion);
    }
  }

  function localChirpyFallback(question) {
    const q = String(question || '').trim();
    const topic = q
      .replace(/[¿?¡!]/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 10)
      .join(' ');

    return `Puedo ayudarte con eso: “${topic}”. Ahora mismo no está conectado el backend de IA, pero en Chirp revisá estas zonas: Home para publicar, Explorar para hashtags y usuarios, Mensajes para DM, Perfil para tu cuenta pública y Ajustes para email, contraseña, privacidad, avatar y banner. Si el problema es con otro usuario, abrí su perfil y usá Seguir, Mensaje o Bloquear.`;
  }

  function addChirpyMessage(text, who = 'bot', extraClass = '') {
    const box = $('#chirpyMessages');
    if (!box) return null;
    const node = document.createElement('div');
    node.className =
      `chirpy-message ${who === 'me' ? 'user' : 'bot'} ${extraClass}`.trim();

    if (who === 'me') {
      node.innerHTML = `<div><p>${esc(text)}</p></div>`;
    } else {
      node.innerHTML = `<img src="/assets/img/chirpy.png" alt="Chirpy"><div><b>Chirpy</b><p>${esc(text)}</p></div>`;
    }

    box.appendChild(node);
    box.scrollTop = box.scrollHeight;
    return node;
  }

  async function askChirpy(text) {
    const q = String(text || '').trim();
    if (!q) return;

    addChirpyMessage(q, 'me');
    const thinking = addChirpyMessage('Pensando', 'bot', 'chirpy-thinking');

    const reply = await generateChirpyReply(q);

    if (thinking) thinking.remove();
    addChirpyMessage(reply, 'bot');
  }

  function initChirpy() {
    $('#chirpyForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = $('#chirpyInput');
      const q = input.value.trim();
      input.value = '';
      askChirpy(q);
    });

    $$('.js-chirpy-prompt').forEach((btn) => {
      btn.addEventListener('click', () =>
        askChirpy(btn.dataset.prompt || btn.textContent)
      );
    });
  }

  let realtimeRefreshTimer = null;
  let realtimeChannel = null;

  function scheduleRealtimeRefresh(reason = 'change') {
    clearTimeout(realtimeRefreshTimer);
    realtimeRefreshTimer = setTimeout(async () => {
      try {
        await loadTrending();

        if (page === 'home') await loadFeed();
        if (page === 'profile') await loadMyProfile();
        if (page === 'bookmarks') await loadBookmarks();
        if (page === 'notifications') await loadNotifications();
        if (page === 'messages') {
          await refreshIncomingDmBadges();
          await loadDmThreads();
          if (activeDmUser) await loadDmMessages();
        }
        if (page === 'user') await loadPublicProfile();
        if (page === 'explore') {
          const tag =
            new URLSearchParams(location.search).get('tag') ||
            sessionStorage.getItem('chirp_pending_tag');
          if (tag) await filterByTag(tag);
        }
        if (page === 'chirp') await loadSingleChirp();
      } catch (error) {
        console.warn('[Chirp realtime] refresh failed:', reason, error);
      }
    }, 380);
  }

  function initRealtimeCounts() {
    if (!user || realtimeChannel) return;

    const tables = [
      'likes',
      'bookmarks',
      'rechirps',
      'follows',
      'blocks',
      'chirps',
      'chirp_media',
      'chirp_hashtags',
      'hashtags',
      'direct_messages',
      'chirp_replies',
      'notifications',
    ];

    realtimeChannel = sb.channel(`chirp-live-${user.id}`);

    tables.forEach((table) => {
      realtimeChannel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => {
          scheduleRealtimeRefresh(`${payload.table}:${payload.eventType}`);
        }
      );
    });

    realtimeChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.info('[Chirp realtime] connected');
      }
    });

    window.addEventListener('beforeunload', () => {
      if (realtimeChannel) sb.removeChannel(realtimeChannel);
    });
  }

  async function boot() {
    window.addEventListener('unhandledrejection', (e) =>
      toast('Algo se trabó', e.reason?.message || 'Probá actualizar.', 'error')
    );
    bindHashtagNavigation();
    if (publicAuth.has(normalizedPath())) redirectIfLoggedIn();

    initAuth();

    if (page === 'embed') {
      await loadEmbedChirp();
      return;
    }

    const privatePages = [
      'home',
      'explore',
      'notifications',
      'bookmarks',
      'profile',
      'settings',
      'support',
      'user',
      'chirp',
      'messages',
      'chirpy',
    ];
    if (privatePages.includes(page)) {
      await requireUser();
      initShell();
      await loadTrending();
      await refreshIncomingDmBadges();
      initRealtimeCounts();
    }

    if (page === 'home') {
      await initComposer();
      await loadFeed();
    }
    if (page === 'explore') await initExplore();
    if (page === 'bookmarks') await loadBookmarks();
    if (page === 'notifications') await loadNotifications();
    if (page === 'profile') await loadMyProfile();
    if (page === 'settings') initSettings();
    if (page === 'support') initSupport();
    if (page === 'messages') await initMessages();
    if (page === 'chirpy') initChirpy();
    if (page === 'user') await loadPublicProfile();
    if (page === 'chirp') await loadSingleChirp();
    if (page === 'callback') await initCallback();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
