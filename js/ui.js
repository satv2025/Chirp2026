import { $, $$, showToast, getSessionUser, getMyProfile, hydrateAvatar } from './utils.js';
import { supabase } from './supabaseClient.js';

function syncCustomText(el) {
  const target = document.querySelector(el.dataset.customField || '');
  if (!target) return;
  const max = Number(el.dataset.maxlength || 0);
  let text = el.innerText.replace(/\u00a0/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  if (!el.dataset.multiline) text = text.replace(/\n/g, ' ');
  if (max && text.length > max) {
    const selection = window.getSelection();
    text = text.slice(0, max);
    el.innerText = text;
    placeCaretAtEnd(el, selection);
  }
  target.value = text.trimStart();
  target.dispatchEvent(new Event('input', { bubbles: true }));
  refreshPlaceholder(el);
}

function refreshPlaceholder(el) {
  const empty = !el.innerText.trim();
  el.classList.toggle('is-empty', empty);
}

function placeCaretAtEnd(el) {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

export function setCustomTextValue(selectorOrInput, value = '') {
  const target = typeof selectorOrInput === 'string' ? document.querySelector(selectorOrInput) : selectorOrInput;
  if (!target) return;
  target.value = value || '';
  const editor = document.querySelector(`[data-custom-field="#${CSS.escape(target.id)}"]`);
  if (editor) {
    editor.innerText = value || '';
    refreshPlaceholder(editor);
  }
  target.dispatchEvent(new Event('input', { bubbles: true }));
}

function moveDropdownSelection(drop, direction) {
  const items = $$('.dropdown__item', drop);
  if (!items.length) return;
  let index = items.findIndex(item => item.getAttribute('aria-selected') === 'true');
  index = index < 0 ? 0 : index + direction;
  if (index < 0) index = items.length - 1;
  if (index >= items.length) index = 0;
  items[index].focus();
}

function chooseDropdownItem(drop, item) {
  const items = $$('.dropdown__item', drop);
  const input = document.querySelector(drop.dataset.dropdown || '');
  const label = $('[data-dropdown-label]', drop);
  items.forEach(i => {
    i.classList.remove('is-selected');
    i.setAttribute('aria-selected', 'false');
  });
  item.classList.add('is-selected');
  item.setAttribute('aria-selected', 'true');
  if (input) {
    input.value = item.dataset.value || '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (label) label.textContent = item.textContent.trim();
  closeDropdown(drop);
}

function openDropdown(drop) {
  const button = $('.dropdown__button', drop);
  const menu = $('.dropdown__menu', drop);
  drop.classList.add('is-open');
  button?.setAttribute('aria-expanded', 'true');
  menu?.removeAttribute('aria-hidden');
}

function closeDropdown(drop) {
  const button = $('.dropdown__button', drop);
  const menu = $('.dropdown__menu', drop);
  drop.classList.remove('is-open');
  button?.setAttribute('aria-expanded', 'false');
  menu?.setAttribute('aria-hidden', 'true');
}

function toggleSwitch(toggle, forcedValue) {
  const current = toggle.getAttribute('aria-checked') === 'true';
  const next = typeof forcedValue === 'boolean' ? forcedValue : !current;
  toggle.setAttribute('aria-checked', String(next));
  const input = document.querySelector(toggle.dataset.toggle || '');
  if (input) {
    input.value = next ? 'true' : 'false';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

export function initCustomControls(root = document) {
  $$('[data-custom-field]', root).forEach(field => {
    if (field.dataset.bound === '1') return;
    field.dataset.bound = '1';
    field.setAttribute('contenteditable', 'true');
    field.setAttribute('spellcheck', 'true');
    field.setAttribute('role', field.dataset.role || 'textbox');
    field.setAttribute('aria-multiline', field.dataset.multiline ? 'true' : 'false');
    field.setAttribute('tabindex', '0');
    refreshPlaceholder(field);
    field.addEventListener('input', () => syncCustomText(field));
    field.addEventListener('blur', () => syncCustomText(field));
    field.addEventListener('keydown', event => {
      if (!field.dataset.multiline && event.key === 'Enter') {
        event.preventDefault();
        const form = field.closest('form');
        const submit = form?.querySelector('button[type="submit"]');
        submit?.focus();
      }
      if (event.key === 'Escape') field.blur();
    });
    field.addEventListener('paste', event => {
      event.preventDefault();
      const text = event.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
    });
  });

  $$('[data-toggle]', root).forEach(toggle => {
    if (toggle.dataset.bound === '1') return;
    toggle.dataset.bound = '1';
    toggle.setAttribute('tabindex', '0');
    toggle.addEventListener('click', () => toggleSwitch(toggle));
    toggle.addEventListener('keydown', event => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        toggleSwitch(toggle);
      }
      if (event.key === 'ArrowRight') toggleSwitch(toggle, true);
      if (event.key === 'ArrowLeft') toggleSwitch(toggle, false);
    });
  });

  $$('[data-dropdown]', root).forEach(drop => {
    if (drop.dataset.bound === '1') return;
    drop.dataset.bound = '1';
    const button = $('.dropdown__button', drop);
    const menu = $('.dropdown__menu', drop);
    const items = $$('.dropdown__item', drop);
    button?.setAttribute('aria-haspopup', 'listbox');
    button?.setAttribute('aria-expanded', 'false');
    menu?.setAttribute('role', 'listbox');
    menu?.setAttribute('aria-hidden', 'true');
    items.forEach(item => {
      item.setAttribute('role', 'option');
      item.setAttribute('tabindex', '-1');
      item.setAttribute('aria-selected', item.classList.contains('is-selected') ? 'true' : 'false');
      item.addEventListener('click', () => chooseDropdownItem(drop, item));
      item.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          chooseDropdownItem(drop, item);
          button?.focus();
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          moveDropdownSelection(drop, 1);
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          moveDropdownSelection(drop, -1);
        }
        if (event.key === 'Escape') {
          closeDropdown(drop);
          button?.focus();
        }
      });
    });
    button?.addEventListener('click', () => drop.classList.contains('is-open') ? closeDropdown(drop) : openDropdown(drop));
    button?.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
        event.preventDefault();
        openDropdown(drop);
        const selected = $('.dropdown__item.is-selected', drop) || items[0];
        selected?.focus();
      }
      if (event.key === 'Escape') closeDropdown(drop);
    });
  });



  $$('.media-picker', root).forEach(picker => {
    if (picker.dataset.fileBound === '1') return;
    picker.dataset.fileBound = '1';
    picker.setAttribute('role', 'button');
    picker.setAttribute('tabindex', picker.getAttribute('tabindex') || '0');
    picker.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        picker.querySelector('input[type="file"]')?.click();
      }
    });
  });


  document.addEventListener('click', event => {
    if (!event.target.closest('.dropdown')) {
      $$('.dropdown.is-open').forEach(closeDropdown);
    }
  }, { once: false });
}

export async function initAppShell() {
  const profile = await getMyProfile();
  const user = await getSessionUser();
  hydrateAvatar($('.js-me-avatar'), profile);
  $$('.js-me-name').forEach(el => el.textContent = profile?.display_name || 'Tu perfil');
  $$('.js-me-username').forEach(el => el.textContent = profile?.username ? `@${profile.username}` : user?.email || '');
  $$('.js-logout').forEach(btn => btn.addEventListener('click', async () => {
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
      node.controls = false;
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
