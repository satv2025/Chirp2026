import { APP } from './config.js';
import { supabase } from './supabaseClient.js';

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function timeAgo(dateValue) {
  if (!dateValue) return '';
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(dateValue).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 8) return `${days}d`;
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' }).format(new Date(dateValue));
}

export function initials(profile) {
  const name = profile?.display_name || profile?.username || 'Chirp';
  return name.trim().slice(0, 2).toUpperCase();
}

export function fallbackAvatar(profile = {}) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="20" fill="#fff0f7"/><text x="50%" y="56%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="30" font-weight="800" fill="#ef3e91">${initials(profile)}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function limitText(text, limit = APP.chirpLimit) {
  return String(text || '').slice(0, limit);
}

export function withTimeout(promise, ms = APP.authTimeoutMs, label = 'La operación') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} tardó demasiado después de ${Math.round(ms / 1000)}s. Probá de nuevo en unos segundos.`);
      err.code = 'CHIRP_TIMEOUT';
      err.__status = 408;
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function showToast(title, message = '', type = 'info') {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<strong>${escapeHtml(title)}</strong>${message ? `<small>${escapeHtml(message)}</small>` : ''}`;
  stack.appendChild(toast);
  setTimeout(() => toast.remove(), 5200);
}

export function setButtonLoading(button, loading, text) {
  if (!button) return;
  if (loading) {
    button.dataset.oldText = button.textContent.trim();
    button.classList.add('is-loading');
    button.disabled = true;
    button.textContent = text || 'Cargando...';
  } else {
    button.classList.remove('is-loading');
    button.disabled = false;
    if (button.dataset.oldText) button.textContent = button.dataset.oldText;
  }
}

export async function getSessionUser() {
  const { data } = await supabase.auth.getUser();
  return data.user || null;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) {
    window.location.href = `/login/?next=${encodeURIComponent(location.pathname)}`;
    return null;
  }
  return user;
}

export async function getMyProfile() {
  const user = await getSessionUser();
  if (!user) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (error) return null;
  return data;
}

export function hydrateAvatar(img, profile) {
  if (!img) return;
  img.src = profile?.avatar_url || fallbackAvatar(profile);
  img.alt = profile?.display_name || profile?.username || 'Usuario';
}

export async function logSecurityEvent(type, details = {}) {
  const user = await getSessionUser();
  if (!user) return;
  await supabase.from('security_events').insert({
    user_id: user.id,
    type,
    metadata: details,
    user_agent: navigator.userAgent
  });
}

export async function publicOrSignedUrl(bucket, path) {
  if (!bucket || !path) return '';
  if (bucket === 'avatars' || bucket === 'banners') {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 20);
  if (error) {
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
    return pub.publicUrl;
  }
  return data.signedUrl;
}

export function readPathTail() {
  const bits = location.pathname.split('/').filter(Boolean);
  return decodeURIComponent(bits[1] || bits[0] || '');
}
