export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function showToast(message, type = 'default') {
  const root = $('#toastRoot');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  root.appendChild(toast);
  window.setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px) scale(.98)';
    window.setTimeout(() => toast.remove(), 180);
  }, 3600);
}

export function setButtonLoading(button, isLoading, labelWhenLoading = 'Cargando...') {
  if (!button) return;
  if (isLoading) {
    button.dataset.originalLabel = button.textContent;
    button.textContent = labelWhenLoading;
    button.disabled = true;
    return;
  }
  button.textContent = button.dataset.originalLabel || button.textContent;
  button.disabled = false;
}

export function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function linkifyChirp(value = '') {
  const safe = escapeHTML(value);
  return safe
    .replace(/(^|\s)#([a-zA-Z0-9_]{1,50})/g, '$1<a href="#explore" data-search-tag="$2">#$2</a>')
    .replace(/(^|\s)@([a-zA-Z0-9_]{3,30})/g, '$1<a href="#explore" data-search-user="$2">@$2</a>');
}

export function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return 'ahora';
  if (diff < hour) return `${Math.floor(diff / minute)} min`;
  if (diff < day) return `${Math.floor(diff / hour)} h`;

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function publicUrlFromPath(supabase, bucket, path) {
  if (!bucket || !path) return '';
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || '';
}

export function renderEmpty(container, message) {
  container.innerHTML = `<div class="empty-state">${escapeHTML(message)}</div>`;
}

export function setActiveSection(section) {
  $$('.app-section').forEach((item) => item.classList.toggle('active', item.dataset.section === section));
  $$('[data-section-link]').forEach((button) => button.classList.toggle('active', button.dataset.sectionLink === section));

  const titles = {
    home: ['Tu feed', 'Inicio'],
    explore: ['Buscá gente y temas', 'Explorar'],
    profile: ['Tu identidad pública', 'Perfil'],
    notifications: ['Lo que pasó', 'Notificaciones'],
    settings: ['Cuenta y preferencias', 'Ajustes']
  };
  const [eyebrow, title] = titles[section] || titles.home;
  $('#sectionEyebrow').textContent = eyebrow;
  $('#sectionTitle').textContent = title;
}

export function updateFilePreview(file, container) {
  if (!file) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  const url = URL.createObjectURL(file);
  const type = file.type;
  container.classList.remove('hidden');

  if (type.startsWith('image/')) {
    container.innerHTML = `<img src="${url}" alt="Vista previa de media" />`;
    return;
  }

  if (type.startsWith('video/')) {
    container.innerHTML = `<video src="${url}" controls></video>`;
    return;
  }

  if (type.startsWith('audio/')) {
    container.innerHTML = `<audio src="${url}" controls></audio>`;
    return;
  }

  container.innerHTML = `<p class="muted">Archivo seleccionado: ${escapeHTML(file.name)}</p>`;
}

export function getMediaType(file) {
  if (!file) return null;
  if (file.type.includes('gif')) return 'gif';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return null;
}

export function normalizeUsername(username = '') {
  return username.trim().replace(/^@/, '').toLowerCase();
}
