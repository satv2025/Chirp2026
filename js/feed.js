import { APP } from './config.js';
import { supabase } from './supabaseClient.js';
import {
  $, $$, escapeHtml, timeAgo, fallbackAvatar, requireUser, getMyProfile, hydrateAvatar,
  publicOrSignedUrl, showToast, setButtonLoading, limitText, readPathTail
} from './utils.js';
import { initAppShell, initCustomControls, initFilePreview, initPlyr, bindErrorBoundary, setCustomTextValue } from './ui.js';

bindErrorBoundary();
initCustomControls();
initFilePreview();

let currentUser = null;
let myProfile = null;

async function boot() {
  currentUser = await requireUser();
  if (!currentUser) return;
  myProfile = await getMyProfile();
  await initAppShell();
  await routeInit();
}

async function routeInit() {
  const page = document.body.dataset.page;
  if (page === 'home') {
    await initComposer();
    await loadFeed();
  }
  if (page === 'bookmarks') await loadBookmarks();
  if (page === 'notifications') await loadNotifications();
  if (page === 'explore') await initExplore();
  if (page === 'profile') await initProfile();
  if (page === 'settings') await initSettings();
  if (page === 'user') await loadUserProfile();
  if (page === 'chirp') await loadSingleChirp();
  if (page === 'support') await initSupport();
}

async function initComposer() {
  hydrateAvatar($('.js-composer-avatar'), myProfile);
  const contentInput = $('#chirpContent');
  const counter = $('.js-char-count');
  contentInput?.addEventListener('input', () => {
    contentInput.value = limitText(contentInput.value);
    if (counter) counter.textContent = `${contentInput.value.length}/${APP.chirpLimit}`;
  });

  $('#composerForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter;
    setButtonLoading(button, true, 'Chirpeando...');
    try {
      const content = contentInput.value.trim();
      const file = $('#chirpMedia')?.files?.[0] || null;
      const visibility = $('#chirpVisibility')?.value || 'public';
      if (!content && !file) throw new Error('Escribí algo o subí una foto/video.');
      const { data: chirp, error } = await supabase
        .from('chirps')
        .insert({ author_id: currentUser.id, content, visibility })
        .select('*')
        .single();
      if (error) throw error;
      if (file) await uploadChirpMedia(chirp.id, file);
      await syncChirpTagsAndMentions(chirp.id);
      setCustomTextValue('#chirpContent', '');
      $('#chirpMedia').value = '';
      $('.media-preview')?.classList.remove('is-active');
      $('.media-preview__body').innerHTML = '';
      showToast('Chirp publicado', 'Ya está en tu timeline.');
      await loadFeed();
    } catch (error) {
      showToast('No se pudo chirpear', error.message, 'error');
    } finally {
      setButtonLoading(button, false);
    }
  });
}

async function uploadChirpMedia(chirpId, file) {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const safeName = `${crypto.randomUUID()}.${ext}`;
  const path = `${currentUser.id}/${chirpId}/${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from(APP.mediaBucket)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (uploadError) throw uploadError;
  const mediaType = file.type.startsWith('video/') ? 'video' : file.type === 'image/gif' ? 'gif' : 'image';
  const { error: dbError } = await supabase.from('chirp_media').insert({
    chirp_id: chirpId,
    user_id: currentUser.id,
    storage_bucket: APP.mediaBucket,
    storage_path: path,
    media_type: mediaType,
    sort_order: 0
  });
  if (dbError) throw dbError;
}


async function syncChirpTagsAndMentions(chirpId) {
  try {
    const { error } = await supabase.rpc('sync_chirp_entities_for', {
      chirp_id_to_sync: chirpId
    });
    if (error) throw error;
  } catch (error) {
    console.warn('[Chirp] No pude sincronizar hashtags/menciones por RPC. El trigger puede haberlo hecho igual.', error);
  }
}

function linkifyChirpContent(content = '') {
  const escaped = escapeHtml(content);
  return escaped
    .replace(/(^|[\s>])#([a-zA-Z0-9_]{1,50})\b/g, (match, prefix, tag) => {
      return `${prefix}<a class="text-tag" href="/explore/?q=%23${encodeURIComponent(tag.toLowerCase())}">#${tag}</a>`;
    })
    .replace(/(^|[\s>])@([a-zA-Z0-9_]{3,30})\b/g, (match, prefix, username) => {
      return `${prefix}<a class="text-mention" href="/u/${encodeURIComponent(username)}/">@${username}</a>`;
    });
}

function normalizeHashtagQuery(value = '') {
  return value.trim().replace(/^#/, '').toLowerCase();
}

async function loadFeed() {
  const container = $('#feedList');
  if (!container) return;
  container.innerHTML = loadingCard('Buscando Chirps...');
  const { data, error } = await supabase
    .from('chirps')
    .select('*, profiles:author_id(*), chirp_media(*)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) {
    container.innerHTML = emptyState('No pude cargar el timeline', error.message);
    return;
  }
  await renderChirps(container, data || []);
}

async function loadBookmarks() {
  const container = $('#bookmarkList');
  container.innerHTML = loadingCard('Cargando guardados...');
  const { data, error } = await supabase
    .from('bookmarks')
    .select('chirps(*, profiles:author_id(*), chirp_media(*))')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  if (error) return container.innerHTML = emptyState('No pude cargar guardados', error.message);
  await renderChirps(container, (data || []).map(row => row.chirps).filter(Boolean));
}

async function loadSingleChirp() {
  const id = readPathTail();
  const container = $('#singleChirp');
  container.innerHTML = loadingCard('Cargando Chirp...');
  const { data, error } = await supabase
    .from('chirps')
    .select('*, profiles:author_id(*), chirp_media(*)')
    .eq('id', id)
    .single();
  if (error) return container.innerHTML = emptyState('No encontré ese Chirp', error.message);
  await renderChirps(container, [data]);
}

async function loadNotifications() {
  const container = $('#notificationList');
  container.innerHTML = loadingCard('Cargando notificaciones...');
  const { data, error } = await supabase
    .from('notifications')
    .select('*, actor:actor_id(*), chirps(*)')
    .eq('recipient_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) return container.innerHTML = emptyState('No pude cargar notificaciones', error.message);
  if (!data?.length) return container.innerHTML = emptyState('Todavía sin notificaciones', 'Cuando alguien interactúe con vos, aparece acá.');
  container.innerHTML = data.map(item => notificationTemplate(item)).join('');
  await supabase.from('notifications').update({ is_read: true }).eq('recipient_id', currentUser.id).eq('is_read', false);
}

async function initExplore() {
  const input = $('#exploreSearch');
  const results = $('#exploreResults');

  const renderHashtagFeed = async tag => {
    const { data: exactTag } = await supabase
      .from('hashtags')
      .select('*')
      .eq('tag', tag)
      .maybeSingle();

    if (!exactTag) return '';

    const { data: rows, error } = await supabase
      .from('chirp_hashtags')
      .select('chirps(*, profiles:author_id(*), chirp_media(*))')
      .eq('hashtag_id', exactTag.id)
      .limit(30);

    if (error) {
      console.warn('[Chirp] No pude cargar feed de hashtag', error);
      return '';
    }

    const chirps = (rows || []).map(row => row.chirps).filter(Boolean);
    if (!chirps.length) {
      return `<div class="card panel"><h3>#${escapeHtml(tag)}</h3><p style="color:var(--muted);margin:6px 0 0;">El hashtag existe, pero todavía no hay Chirps visibles.</p></div>`;
    }

    const rendered = [];
    for (const chirp of chirps) rendered.push(await chirpTemplate(chirp));

    return `<section class="hashtag-feed">
      <div class="section-title"><div><h2>#${escapeHtml(tag)}</h2><p>${exactTag.chirps_count || chirps.length} Chirps con este hashtag</p></div></div>
      <div class="chirp-list">${rendered.join('')}</div>
    </section>`;
  };

  const run = async () => {
    const q = input.value.trim();
    if (!q) {
      results.innerHTML = emptyState('Buscá gente o hashtags', 'Probá con @usuario, #rosin o una palabra que te guste.');
      return;
    }

    results.innerHTML = loadingCard('Buscando...');
    const cleanTag = normalizeHashtagQuery(q);
    const tagQuery = cleanTag || q;

    const [profiles, tags] = await Promise.all([
      supabase.from('profiles').select('*').or(`username.ilike.%${q.replace(/^@/, '')}%,display_name.ilike.%${q}%`).limit(12),
      supabase.from('hashtags').select('*').ilike('tag', `%${tagQuery}%`).limit(12)
    ]);

    const html = [];
    if (profiles.data?.length) html.push(`<div class="card"><div class="panel"><h3>Personas</h3></div>${profiles.data.map(userRow).join('')}</div>`);
    if (tags.data?.length) html.push(`<div class="card"><div class="panel"><h3>Hashtags</h3></div>${tags.data.map(tag => `<a class="user-row" href="/explore/?q=%23${encodeURIComponent(tag.tag)}"><span class="chip">#</span><div><b>#${escapeHtml(tag.tag)}</b><small>${tag.chirps_count || 0} Chirps</small></div><span>→</span></a>`).join('')}</div>`);

    if (q.startsWith('#') || tags.data?.some(tag => tag.tag?.toLowerCase() === cleanTag)) {
      const tagFeed = await renderHashtagFeed(cleanTag);
      if (tagFeed) html.push(tagFeed);
    }

    results.innerHTML = html.join('') || emptyState('Sin resultados', 'Probá con otra búsqueda.');
    bindChirpActions(results);
    initPlyr(results);
  };

  input?.addEventListener('input', debounce(run, 350));
  const paramsQ = new URLSearchParams(location.search).get('q');
  if (paramsQ) {
    setCustomTextValue('#exploreSearch', paramsQ);
    run();
  } else {
    results.innerHTML = emptyState('Explorá Chirp', 'Encontrá gente, temas y conversaciones nuevas.');
  }
}

async function initProfile() {
  hydrateAvatar($('#profileAvatar'), myProfile);
  $('#profileName').textContent = myProfile?.display_name || 'Tu perfil';
  $('#profileUser').textContent = myProfile?.username ? `@${myProfile.username}` : '';
  $('#profileBio').textContent = myProfile?.bio || 'Todavía sin bio.';
  $('#profileCounts').innerHTML = `<strong>${myProfile?.chirps_count || 0}</strong> Chirps · <strong>${myProfile?.followers_count || 0}</strong> seguidores · <strong>${myProfile?.following_count || 0}</strong> siguiendo`;
  if (myProfile?.banner_url) $('#profileCover').innerHTML = `<img src="${escapeHtml(myProfile.banner_url)}" alt="Banner">`;

  const { data } = await supabase.from('chirps').select('*, profiles:author_id(*), chirp_media(*)').eq('author_id', currentUser.id).is('deleted_at', null).order('created_at', { ascending: false });
  await renderChirps($('#profileFeed'), data || []);
}

async function loadUserProfile() {
  const username = readPathTail();
  const box = $('#publicProfile');
  const feed = $('#publicFeed');
  box.innerHTML = loadingCard('Cargando perfil...');
  const { data: profile, error } = await supabase.from('profiles').select('*').eq('username', username).single();
  if (error) return box.innerHTML = emptyState('No encontré ese perfil', error.message);
  box.innerHTML = publicProfileTemplate(profile);
  const { data } = await supabase.from('chirps').select('*, profiles:author_id(*), chirp_media(*)').eq('author_id', profile.id).is('deleted_at', null).order('created_at', { ascending: false });
  await renderChirps(feed, data || []);
}

async function initSettings() {
  setCustomTextValue('#settingsName', myProfile?.display_name || '');
  setCustomTextValue('#settingsUsername', myProfile?.username || '');
  setCustomTextValue('#settingsBio', myProfile?.bio || '');
  $('#privateValue').value = String(Boolean(myProfile?.is_private));
  const toggle = $('[data-toggle="#privateValue"]');
  toggle?.setAttribute('aria-checked', String(Boolean(myProfile?.is_private)));

  $('#profileSettingsForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter;
    setButtonLoading(button, true, 'Guardando...');
    try {
      const update = {
        display_name: $('#settingsName').value.trim(),
        username: $('#settingsUsername').value.trim(),
        bio: $('#settingsBio').value.trim(),
        is_private: $('#privateValue').value === 'true'
      };
      if (!update.display_name) throw new Error('El nombre no puede quedar vacío.');
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(update.username)) throw new Error('El usuario debe tener 3 a 30 caracteres: letras, números o guión bajo.');
      const { error } = await supabase.from('profiles').update(update).eq('id', currentUser.id);
      if (error) throw error;
      showToast('Perfil actualizado', 'Tus cambios ya están guardados.');
    } catch (error) {
      showToast('No se pudo guardar', error.message, 'error');
    } finally {
      setButtonLoading(button, false);
    }
  });

  bindImageUpload('avatarUpload', 'avatars', 'avatar_url');
  bindImageUpload('bannerUpload', 'banners', 'banner_url');

  $('#emailSettingsForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter;
    setButtonLoading(button, true, 'Enviando...');
    try {
      const email = $('#newEmail').value.trim();
      if (!email || !email.includes('@')) throw new Error('Escribí un email válido.');
      const { error } = await supabase.auth.updateUser({ email });
      if (error) throw error;
      showToast('Confirmá tu email', 'Te mandamos un enlace para confirmar el cambio.');
    } catch (error) {
      showToast('No se pudo cambiar', error.message, 'error');
    } finally {
      setButtonLoading(button, false);
    }
  });

  $('#passwordSettingsForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter;
    setButtonLoading(button, true, 'Actualizando...');
    try {
      const password = $('#newPassword').value;
      if (!password || password.length < 6) throw new Error('La contraseña tiene que tener al menos 6 caracteres.');
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      showToast('Contraseña cambiada', 'Tu cuenta quedó actualizada.');
    } catch (error) {
      showToast('No se pudo cambiar', error.message, 'error');
    } finally {
      setButtonLoading(button, false);
    }
  });
}

function bindImageUpload(inputId, bucket, column) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const ext = (file.name.split('.').pop() || 'webp').toLowerCase();
      const path = `${currentUser.id}/${column}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      const { error } = await supabase.from('profiles').update({ [column]: data.publicUrl }).eq('id', currentUser.id);
      if (error) throw error;
      showToast('Imagen actualizada', 'Se guardó correctamente.');
    } catch (error) {
      showToast('No se pudo subir', error.message, 'error');
    }
  });
}

async function initSupport() {
  $('#supportForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter;
    setButtonLoading(button, true, 'Enviando...');
    try {
      const subject = $('#supportSubject').value.trim();
      const message = $('#supportMessage').value.trim();
      if (!subject || !message) throw new Error('Completá asunto y mensaje.');
      const { error } = await supabase.from('support_tickets').insert({
        user_id: currentUser.id,
        subject,
        message
      });
      if (error) throw error;
      showToast('Soporte recibido', 'Lo dejamos guardado.');
      setCustomTextValue('#supportSubject', '');
      setCustomTextValue('#supportMessage', '');
      event.target.reset();
    } catch (error) {
      showToast('No se pudo enviar', error.message, 'error');
    } finally {
      setButtonLoading(button, false);
    }
  });
}

async function renderChirps(container, chirps) {
  if (!container) return;
  if (!chirps.length) {
    container.innerHTML = emptyState('Todavía no hay Chirps', 'Sé la primera persona en romper el silencio rosa.');
    return;
  }
  const html = [];
  for (const chirp of chirps) html.push(await chirpTemplate(chirp));
  container.innerHTML = html.join('');
  bindChirpActions(container);
  initPlyr(container);
}

async function chirpTemplate(chirp) {
  const profile = chirp.profiles || {};
  const media = await mediaTemplate(chirp.chirp_media || []);
  return `<article class="chirp" data-chirp-id="${escapeHtml(chirp.id)}">
    <div class="chirp__grid">
      <a href="/u/${encodeURIComponent(profile.username || '')}/"><img class="avatar" src="${escapeHtml(profile.avatar_url || fallbackAvatar(profile))}" alt="${escapeHtml(profile.display_name || profile.username || 'Usuario')}"></a>
      <div>
        <div class="chirp__meta"><a class="chirp__name" href="/u/${encodeURIComponent(profile.username || '')}/">${escapeHtml(profile.display_name || 'Usuario')}</a><span>@${escapeHtml(profile.username || 'usuario')}</span><span>·</span><a href="/chirp/${chirp.id}/">${timeAgo(chirp.created_at)}</a></div>
        ${chirp.content ? `<p class="chirp__text">${linkifyChirpContent(chirp.content)}</p>` : ''}
        ${media}
        <div class="chirp__actions">
          <button class="action-btn js-like"><span>♡</span><b>${chirp.likes_count || 0}</b></button>
          <button class="action-btn js-rechirp"><span>↻</span><b>${chirp.rechirps_count || 0}</b></button>
          <button class="action-btn js-bookmark"><span>◇</span><b>${chirp.bookmarks_count || 0}</b></button>
          <a class="action-btn" href="/chirp/${chirp.id}/"><span>↩</span><b>${chirp.replies_count || 0}</b></a>
        </div>
      </div>
    </div>
  </article>`;
}

async function mediaTemplate(mediaRows) {
  if (!mediaRows.length) return '';
  const nodes = [];
  for (const media of mediaRows.sort((a, b) => a.sort_order - b.sort_order)) {
    const url = media.media_url || await publicOrSignedUrl(media.storage_bucket, media.storage_path);
    if (!url) continue;
    if (media.media_type === 'video') {
      nodes.push(`<div class="chirp-video-wrap"><video class="js-plyr" playsinline preload="metadata"><source src="${escapeHtml(url)}"></video></div>`);
    } else {
      nodes.push(`<img class="chirp-photo" src="${escapeHtml(url)}" alt="${escapeHtml(media.alt_text || 'Foto del Chirp')}" loading="lazy">`);
    }
  }
  return nodes.length ? `<div class="chirp__media">${nodes.join('')}</div>` : '';
}

function bindChirpActions(container) {
  container.querySelectorAll('.chirp').forEach(card => {
    const id = card.dataset.chirpId;
    $('.js-like', card)?.addEventListener('click', async () => toggleJoin('likes', { user_id: currentUser.id, chirp_id: id }, card, 'js-like'));
    $('.js-rechirp', card)?.addEventListener('click', async () => toggleJoin('rechirps', { user_id: currentUser.id, chirp_id: id }, card, 'js-rechirp'));
    $('.js-bookmark', card)?.addEventListener('click', async () => toggleJoin('bookmarks', { user_id: currentUser.id, chirp_id: id }, card, 'js-bookmark'));
  });
}

async function toggleJoin(table, row, card, className) {
  const button = $(`.${className}`, card);
  button.classList.toggle('is-active');
  const { data } = await supabase.from(table).select('*').match(row).maybeSingle();
  if (data) await supabase.from(table).delete().match(row);
  else await supabase.from(table).insert(row);
}

function notificationTemplate(item) {
  const actor = item.actor || {};
  const labels = { like: 'le gustó tu Chirp', reply: 'te respondió', follow: 'empezó a seguirte', rechirp: 'rechirpeó tu Chirp', quote: 'citó tu Chirp', mention: 'te mencionó' };
  return `<a class="notification-row" href="${item.chirp_id ? `/chirp/${item.chirp_id}/` : `/u/${actor.username || ''}/`}">
    <img class="avatar" src="${escapeHtml(actor.avatar_url || fallbackAvatar(actor))}" alt="${escapeHtml(actor.display_name || 'Usuario')}">
    <div><b>${escapeHtml(actor.display_name || 'Alguien')} ${labels[item.type] || 'interactuó con vos'}</b><small>${timeAgo(item.created_at)}</small></div>
    <span>${item.is_read ? '' : '●'}</span>
  </a>`;
}

function userRow(profile) {
  return `<a class="user-row" href="/u/${encodeURIComponent(profile.username)}/">
    <img class="avatar" src="${escapeHtml(profile.avatar_url || fallbackAvatar(profile))}" alt="${escapeHtml(profile.display_name)}">
    <div><b>${escapeHtml(profile.display_name)}</b><small>@${escapeHtml(profile.username)}</small></div>
    <span>→</span>
  </a>`;
}

function publicProfileTemplate(profile) {
  return `<div class="card">
    <div id="profileCover" class="profile-cover">${profile.banner_url ? `<img src="${escapeHtml(profile.banner_url)}" alt="Banner">` : ''}</div>
    <div class="profile-card">
      <div class="profile-card__top">
        <img class="avatar avatar-lg" src="${escapeHtml(profile.avatar_url || fallbackAvatar(profile))}" alt="${escapeHtml(profile.display_name)}">
        <button class="btn btn-primary btn-small">Seguir</button>
      </div>
      <h2>${escapeHtml(profile.display_name)}</h2>
      <div class="chirp__meta">@${escapeHtml(profile.username)}</div>
      <p>${escapeHtml(profile.bio || 'Sin bio todavía.')}</p>
      <div class="stat-row"><span><strong>${profile.chirps_count || 0}</strong> Chirps</span><span><strong>${profile.followers_count || 0}</strong> seguidores</span><span><strong>${profile.following_count || 0}</strong> siguiendo</span></div>
    </div>
  </div>`;
}

function loadingCard(text) {
  return `<div class="card empty"><strong>${escapeHtml(text)}</strong><span>Un segundo, el patito está buscando.</span></div>`;
}

function emptyState(title, text) {
  return `<div class="card empty"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div>`;
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

boot();
