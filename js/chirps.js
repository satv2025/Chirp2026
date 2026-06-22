import { supabase } from './supabaseClient.js';
import { state } from './state.js';
import { APP_LIMITS } from './config.js';
import { $, escapeHTML, formatDate, linkifyChirp, renderEmpty } from './ui.js';
import { signedMediaUrl, uploadChirpMedia } from './storage.js';

const CHIRP_SELECT = `
  *,
  author:profiles!chirps_author_id_fkey(id, username, display_name, avatar_url, is_verified),
  chirp_media(*)
`;

async function decorateChirps(chirps = []) {
  if (!state.user || !chirps.length) return chirps;
  const ids = chirps.map((chirp) => chirp.id);

  const [likes, bookmarks, rechirps] = await Promise.all([
    supabase.from('likes').select('chirp_id').eq('user_id', state.user.id).in('chirp_id', ids),
    supabase.from('bookmarks').select('chirp_id').eq('user_id', state.user.id).in('chirp_id', ids),
    supabase.from('rechirps').select('chirp_id').eq('user_id', state.user.id).in('chirp_id', ids)
  ]);

  const liked = new Set((likes.data || []).map((item) => item.chirp_id));
  const bookmarked = new Set((bookmarks.data || []).map((item) => item.chirp_id));
  const rechirped = new Set((rechirps.data || []).map((item) => item.chirp_id));

  return chirps.map((chirp) => ({
    ...chirp,
    viewer_has_liked: liked.has(chirp.id),
    viewer_has_bookmarked: bookmarked.has(chirp.id),
    viewer_has_rechirped: rechirped.has(chirp.id)
  }));
}

export async function fetchFeed() {
  const { data, error } = await supabase
    .from('chirps')
    .select(CHIRP_SELECT)
    .is('reply_to_id', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(APP_LIMITS.feedPageSize);

  if (error) throw error;
  state.feed = await decorateChirps(data || []);
  return state.feed;
}

export async function fetchProfileChirps(userId = state.user?.id) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('chirps')
    .select(CHIRP_SELECT)
    .eq('author_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(APP_LIMITS.feedPageSize);

  if (error) throw error;
  state.profileChirps = await decorateChirps(data || []);
  return state.profileChirps;
}

export async function searchChirps(term) {
  const clean = term.trim().replace(/^#|^@/, '');
  if (!clean) return [];

  const { data, error } = await supabase
    .from('chirps')
    .select(CHIRP_SELECT)
    .is('deleted_at', null)
    .or(`content.ilike.%${clean}%,author.username.ilike.%${clean}%`)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    const fallback = await supabase
      .from('chirps')
      .select(CHIRP_SELECT)
      .is('deleted_at', null)
      .ilike('content', `%${clean}%`)
      .order('created_at', { ascending: false })
      .limit(30);
    if (fallback.error) throw fallback.error;
    return decorateChirps(fallback.data || []);
  }

  return decorateChirps(data || []);
}

export async function fetchTrendingTags() {
  const { data, error } = await supabase
    .from('hashtags')
    .select('*')
    .order('chirps_count', { ascending: false })
    .limit(12);

  if (error) return [];
  return data || [];
}

export async function createChirp({ content, visibility = 'public', file = null, replyTo = null }) {
  if (!state.user) throw new Error('Iniciá sesión para chirpear.');
  const clean = content.trim();
  if (!clean && !file) throw new Error('Escribí algo o adjuntá media.');
  if (clean.length > APP_LIMITS.chirpLength) throw new Error('El Chirp supera 280 caracteres.');

  const payload = {
    author_id: state.user.id,
    content: clean || null,
    visibility,
    reply_to_id: replyTo?.id || null,
    root_chirp_id: replyTo ? (replyTo.root_chirp_id || replyTo.id) : null
  };

  const { data: chirp, error } = await supabase
    .from('chirps')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;

  if (file) {
    const uploaded = await uploadChirpMedia(state.user.id, chirp.id, file);
    const { error: mediaError } = await supabase.from('chirp_media').insert({
      chirp_id: chirp.id,
      user_id: state.user.id,
      storage_bucket: uploaded.bucket,
      storage_path: uploaded.path,
      media_type: uploaded.mediaType,
      sort_order: 0
    });
    if (mediaError) throw mediaError;
  }

  return chirp;
}

export async function deleteChirp(chirpId) {
  const { error } = await supabase
    .from('chirps')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', chirpId)
    .eq('author_id', state.user.id);

  if (error) throw error;
}

export async function toggleLike(chirp) {
  if (!state.user) throw new Error('Iniciá sesión para likear.');
  if (chirp.viewer_has_liked) {
    const { error } = await supabase
      .from('likes')
      .delete()
      .eq('user_id', state.user.id)
      .eq('chirp_id', chirp.id);
    if (error) throw error;
    return false;
  }

  const { error } = await supabase.from('likes').insert({ user_id: state.user.id, chirp_id: chirp.id });
  if (error) throw error;
  return true;
}

export async function toggleBookmark(chirp) {
  if (!state.user) throw new Error('Iniciá sesión para guardar.');
  if (chirp.viewer_has_bookmarked) {
    const { error } = await supabase
      .from('bookmarks')
      .delete()
      .eq('user_id', state.user.id)
      .eq('chirp_id', chirp.id);
    if (error) throw error;
    return false;
  }

  const { error } = await supabase.from('bookmarks').insert({ user_id: state.user.id, chirp_id: chirp.id });
  if (error) throw error;
  return true;
}

export async function toggleRechirp(chirp) {
  if (!state.user) throw new Error('Iniciá sesión para rechirpear.');
  if (chirp.viewer_has_rechirped) {
    const { error } = await supabase
      .from('rechirps')
      .delete()
      .eq('user_id', state.user.id)
      .eq('chirp_id', chirp.id);
    if (error) throw error;
    return false;
  }

  const { error } = await supabase.from('rechirps').insert({ user_id: state.user.id, chirp_id: chirp.id });
  if (error) throw error;
  return true;
}

async function renderMedia(mediaList = [], slot) {
  slot.innerHTML = '';
  if (!mediaList.length) return;

  for (const media of mediaList.sort((a, b) => a.sort_order - b.sort_order)) {
    const url = media.media_url || await signedMediaUrl(media.storage_bucket, media.storage_path);
    if (!url) continue;

    if (media.media_type === 'video') {
      const video = document.createElement('video');
      video.src = url;
      video.controls = true;
      video.preload = 'metadata';
      slot.appendChild(video);
      continue;
    }

    if (media.media_type === 'audio') {
      const audio = document.createElement('audio');
      audio.src = url;
      audio.controls = true;
      slot.appendChild(audio);
      continue;
    }

    const img = document.createElement('img');
    img.src = url;
    img.alt = media.alt_text || 'Media del Chirp';
    img.loading = 'lazy';
    slot.appendChild(img);
  }
}

export async function renderChirps(container, chirps, handlers = {}) {
  if (!chirps.length) {
    renderEmpty(container, 'Todavía no hay Chirps por acá. Sé el primero en chirpear 🐥');
    return;
  }

  container.innerHTML = '';
  const template = $('#chirpTemplate');

  for (const chirp of chirps) {
    const node = template.content.firstElementChild.cloneNode(true);
    const author = chirp.author || chirp.profiles || {};
    const avatar = node.querySelector('.chirp-avatar');
    const deleteButton = node.querySelector('.chirp-delete');
    const replyForm = node.querySelector('.reply-form');

    avatar.src = author.avatar_url || 'assets/avatar-placeholder.svg';
    avatar.alt = `Avatar de ${author.display_name || 'usuario'}`;
    node.querySelector('.chirp-name').textContent = author.display_name || 'Usuario';
    node.querySelector('.chirp-user').textContent = `@${author.username || 'usuario'}`;
    node.querySelector('.chirp-date').textContent = ` · ${formatDate(chirp.created_at)}`;
    node.querySelector('.chirp-content').innerHTML = linkifyChirp(chirp.content || '');
    node.querySelector('.replies-count').textContent = chirp.replies_count || 0;
    node.querySelector('.rechirps-count').textContent = chirp.rechirps_count || 0;
    node.querySelector('.likes-count').textContent = chirp.likes_count || 0;

    const likeButton = node.querySelector('[data-action="like"]');
    const bookmarkButton = node.querySelector('[data-action="bookmark"]');
    const rechirpButton = node.querySelector('[data-action="rechirp"]');
    const replyButton = node.querySelector('[data-action="reply"]');

    likeButton.classList.toggle('active', Boolean(chirp.viewer_has_liked));
    bookmarkButton.classList.toggle('active', Boolean(chirp.viewer_has_bookmarked));
    rechirpButton.classList.toggle('active', Boolean(chirp.viewer_has_rechirped));

    if (state.user?.id === chirp.author_id) {
      deleteButton.classList.remove('hidden');
      deleteButton.addEventListener('click', () => handlers.onDelete?.(chirp));
    }

    likeButton.addEventListener('click', () => handlers.onLike?.(chirp));
    bookmarkButton.addEventListener('click', () => handlers.onBookmark?.(chirp));
    rechirpButton.addEventListener('click', () => handlers.onRechirp?.(chirp));
    replyButton.addEventListener('click', () => replyForm.classList.toggle('hidden'));

    replyForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = replyForm.elements.reply;
      handlers.onReply?.(chirp, input.value);
      input.value = '';
      replyForm.classList.add('hidden');
    });

    node.addEventListener('click', (event) => {
      const tag = event.target.closest('[data-search-tag]');
      const user = event.target.closest('[data-search-user]');
      if (tag) handlers.onSearch?.(`#${tag.dataset.searchTag}`);
      if (user) handlers.onSearch?.(`@${user.dataset.searchUser}`);
    });

    container.appendChild(node);
    await renderMedia(chirp.chirp_media || [], node.querySelector('.chirp-media-slot'));
  }
}

export function renderTrendingTags(container, tags) {
  if (!tags.length) {
    container.innerHTML = '<p class="muted">Todavía no hay hashtags.</p>';
    return;
  }

  container.innerHTML = tags
    .map((tag) => `<button class="tag-chip" type="button" data-tag="${escapeHTML(tag.tag)}">#${escapeHTML(tag.tag)} · ${tag.chirps_count}</button>`)
    .join('');
}
