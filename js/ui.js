import { $, $$, showToast, getSessionUser, getMyProfile, hydrateAvatar } from './utils.js';
import { supabase } from './supabaseClient.js';

export function initCustomControls(root = document) {
  $$('[data-toggle]', root).forEach(toggle => {
    if (toggle.dataset.bound === '1') return;
    toggle.dataset.bound = '1';
    toggle.addEventListener('click', () => {
      const value = toggle.getAttribute('aria-checked') === 'true';
      toggle.setAttribute('aria-checked', String(!value));
      const input = document.querySelector(toggle.dataset.toggle);
      if (input) input.value = !value ? 'true' : 'false';
    });
  });

  $$('[data-dropdown]', root).forEach(drop => {
    if (drop.dataset.bound === '1') return;
    drop.dataset.bound = '1';
    const button = $('.dropdown__button', drop);
    const items = $$('.dropdown__item', drop);
    const input = document.querySelector(drop.dataset.dropdown);
    button?.addEventListener('click', () => drop.classList.toggle('is-open'));
    items.forEach(item => {
      item.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('is-selected'));
        item.classList.add('is-selected');
        if (input) input.value = item.dataset.value || '';
        const label = $('[data-dropdown-label]', drop);
        if (label) label.textContent = item.textContent.trim();
        drop.classList.remove('is-open');
      });
    });
  });

  document.addEventListener('click', event => {
    if (!event.target.closest('.dropdown')) {
      $$('.dropdown.is-open').forEach(drop => drop.classList.remove('is-open'));
    }
  });
}

export async function initAppShell() {
  const profile = await getMyProfile();
  const user = await getSessionUser();
  hydrateAvatar($('.js-me-avatar'), profile);
  $$('.js-me-name').forEach(el => el.textContent = profile?.display_name || 'Tu perfil');
  $$('.js-me-username').forEach(el => el.textContent = profile?.username ? `@${profile.username}` : user?.email || '');
  const logoutButtons = $$('.js-logout');
  logoutButtons.forEach(btn => btn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '/login/';
  }));

  const current = location.pathname.split('/').filter(Boolean)[0] || 'home';
  $$('[data-route]').forEach(link => {
    if (link.dataset.route === current) link.classList.add('is-active');
  });
}

export function initFilePreview() {
  const fileInput = $('#chirpMedia');
  const preview = $('.media-preview');
  const body = $('.media-preview__body');
  const clear = $('.js-clear-media');
  if (!fileInput || !preview || !body) return;

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    body.innerHTML = '';
    if (!file) {
      preview.classList.remove('is-active');
      return;
    }
    const url = URL.createObjectURL(file);
    const node = file.type.startsWith('video/')
      ? document.createElement('video')
      : document.createElement('img');
    node.src = url;
    if (node.tagName === 'VIDEO') {
      node.muted = true;
      node.playsInline = true;
      node.autoplay = true;
      node.loop = true;
    }
    body.appendChild(node);
    preview.classList.add('is-active');
  });

  clear?.addEventListener('click', () => {
    fileInput.value = '';
    body.innerHTML = '';
    preview.classList.remove('is-active');
  });
}

export function initPlyr(root = document) {
  if (!window.Plyr) return;
  root.querySelectorAll('video.js-plyr:not([data-plyr-ready])').forEach(video => {
    video.dataset.plyrReady = '1';
    new window.Plyr(video, {
      controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen'],
      ratio: '16:9',
      hideControls: true,
      clickToPlay: true,
      keyboard: { focused: true, global: false },
      tooltips: { controls: false, seek: true }
    });
  });
}

export function bindErrorBoundary() {
  window.addEventListener('unhandledrejection', event => {
    console.error(event.reason);
    showToast('Algo se trabó', event.reason?.message || 'Probá actualizar la página.', 'error');
  });
}

export function initLandingSession() {
  getSessionUser().then(user => {
    const cta = document.querySelector('[data-smart-cta]');
    if (!cta) return;
    if (user) {
      cta.href = '/home/';
      cta.textContent = 'Ir a mi timeline';
    }
  });
}
