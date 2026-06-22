import { supabase } from './supabaseClient.js';
import { state } from './state.js';
import {
  getSession,
  signIn,
  signUp,
  resetPassword,
  signOut,
  loadCurrentUserData,
  updateAuth,
  updateProfile,
  updateSettings
} from './auth.js';
import {
  fetchFeed,
  fetchProfileChirps,
  searchChirps,
  fetchTrendingTags,
  createChirp,
  deleteChirp,
  toggleLike,
  toggleBookmark,
  toggleRechirp,
  renderChirps,
  renderTrendingTags
} from './chirps.js';
import { fetchNotifications, markAllNotificationsRead, renderNotifications } from './notifications.js';
import { setupRealtime, cleanupRealtime } from './realtime.js';
import { uploadAvatar, uploadBanner } from './storage.js';
import { $, $$, showToast, setActiveSection, setButtonLoading, updateFilePreview } from './ui.js';

let refreshTimer = null;

function debounceRefresh(callback) {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(callback, 650);
}

function showAuthView() {
  $('#authView').classList.remove('hidden');
  $('#appView').classList.add('hidden');
  cleanupRealtime();
}

function showAppView() {
  $('#authView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
}

function fillProfileUI() {
  const profile = state.profile;
  const settings = state.settings;
  if (!profile) return;

  const avatarUrl = profile.avatar_url || 'assets/avatar-placeholder.svg';
  $('#composerAvatar').src = avatarUrl;
  $('#profileAvatar').src = avatarUrl;
  $('#profileBanner').style.backgroundImage = profile.banner_url
    ? `url('${profile.banner_url}')`
    : '';

  $('#profileName').textContent = profile.display_name || 'Usuario';
  $('#profileUsername').textContent = `@${profile.username || 'usuario'}`;
  $('#profileBio').textContent = profile.bio || 'Sin bio todavía.';
  $('#profileChirpsCount').textContent = profile.chirps_count || 0;
  $('#profileFollowersCount').textContent = profile.followers_count || 0;
  $('#profileFollowingCount').textContent = profile.following_count || 0;

  $('#miniProfile').innerHTML = `
    <img class="avatar" src="${avatarUrl}" alt="Avatar" />
    <div>
      <strong>${profile.display_name || 'Usuario'}</strong>
      <span>@${profile.username || 'usuario'}</span>
    </div>
  `;

  const profileForm = $('#profileForm');
  profileForm.elements.username.value = profile.username || '';
  profileForm.elements.display_name.value = profile.display_name || '';
  profileForm.elements.bio.value = profile.bio || '';
  profileForm.elements.website.value = profile.website || '';
  profileForm.elements.location.value = profile.location || '';
  profileForm.elements.is_private.checked = Boolean(profile.is_private);

  if (settings) {
    const settingsForm = $('#appSettingsForm');
    settingsForm.elements.theme.value = settings.theme || 'system';
    settingsForm.elements.language.value = settings.language || 'es';
    settingsForm.elements.email_notifications.checked = Boolean(settings.email_notifications);
    settingsForm.elements.push_notifications.checked = Boolean(settings.push_notifications);
  }
}

async function refreshFeed() {
  const feed = await fetchFeed();
  await renderChirps($('#feedList'), feed, chirpHandlers);
}

async function refreshProfileChirps() {
  const chirps = await fetchProfileChirps();
  await renderChirps($('#profileChirps'), chirps, chirpHandlers);
}

async function refreshNotifications() {
  const notifications = await fetchNotifications();
  renderNotifications($('#notificationsList'), notifications);
}

async function refreshTrending() {
  const tags = await fetchTrendingTags();
  renderTrendingTags($('#trendingTags'), tags);
}

async function refreshEverything() {
  await loadCurrentUserData();
  fillProfileUI();
  await Promise.all([
    refreshFeed(),
    refreshProfileChirps(),
    refreshNotifications(),
    refreshTrending()
  ]);
}

async function navigateTo(section) {
  state.currentSection = section;
  setActiveSection(section);
  window.location.hash = section;

  try {
    if (section === 'home') await refreshFeed();
    if (section === 'profile') await refreshProfileChirps();
    if (section === 'notifications') await refreshNotifications();
    if (section === 'explore' && !$('#exploreResults').children.length) {
      $('#exploreResults').innerHTML = '<div class="empty-state">Buscá algo arriba: @usuario, #tema o texto.</div>';
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

const chirpHandlers = {
  async onLike(chirp) {
    try {
      await toggleLike(chirp);
      await refreshFeed();
      await refreshProfileChirps();
    } catch (error) {
      showToast(error.message, 'error');
    }
  },
  async onBookmark(chirp) {
    try {
      await toggleBookmark(chirp);
      showToast(chirp.viewer_has_bookmarked ? 'Quitado de guardados.' : 'Guardado.', 'success');
      await refreshFeed();
      await refreshProfileChirps();
    } catch (error) {
      showToast(error.message, 'error');
    }
  },
  async onRechirp(chirp) {
    try {
      await toggleRechirp(chirp);
      await refreshFeed();
      await refreshProfileChirps();
    } catch (error) {
      showToast(error.message, 'error');
    }
  },
  async onReply(chirp, text) {
    try {
      await createChirp({ content: text, visibility: chirp.visibility || 'public', replyTo: chirp });
      showToast('Respuesta publicada.', 'success');
      await refreshFeed();
      await refreshProfileChirps();
    } catch (error) {
      showToast(error.message, 'error');
    }
  },
  async onDelete(chirp) {
    try {
      const ok = window.confirm('¿Borrar este Chirp?');
      if (!ok) return;
      await deleteChirp(chirp.id);
      showToast('Chirp borrado.', 'success');
      await refreshEverything();
    } catch (error) {
      showToast(error.message, 'error');
    }
  },
  async onSearch(term) {
    $('#searchInput').value = term;
    await navigateTo('explore');
    await runSearch(term);
  }
};

async function runSearch(term) {
  const button = $('#searchForm button');
  try {
    setButtonLoading(button, true, 'Buscando...');
    const results = await searchChirps(term);
    await renderChirps($('#exploreResults'), results, chirpHandlers);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    setButtonLoading(button, false);
  }
}

function bindAuthForms() {
  $$('[data-auth-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const selected = button.dataset.authTab;
      $$('[data-auth-tab]').forEach((tab) => tab.classList.toggle('active', tab === button));
      $$('[data-auth-form]').forEach((form) => form.classList.toggle('hidden', form.dataset.authForm !== selected));
    });
  });

  $('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.submitter;
    try {
      setButtonLoading(button, true, 'Entrando...');
      const form = event.currentTarget;
      await signIn(form.elements.email.value.trim(), form.elements.password.value);
      await bootApp();
      showToast('Entraste a Chirp.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setButtonLoading(button, false);
    }
  });

  $('#signupForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.submitter;
    try {
      setButtonLoading(button, true, 'Creando...');
      const form = event.currentTarget;
      const data = await signUp({
        displayName: form.elements.display_name.value.trim(),
        username: form.elements.username.value.trim(),
        email: form.elements.email.value.trim(),
        password: form.elements.password.value
      });

      if (data.session) {
        await bootApp();
        showToast('Cuenta creada. Bienvenido a Chirp 🐥', 'success');
      } else {
        showToast('Cuenta creada. Revisá tu email para confirmar.', 'success');
      }
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setButtonLoading(button, false);
    }
  });

  $('#resetForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.submitter;
    try {
      setButtonLoading(button, true, 'Enviando...');
      await resetPassword(event.currentTarget.elements.email.value.trim());
      showToast('Te mandamos el enlace de recuperación.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setButtonLoading(button, false);
    }
  });
}

function bindAppEvents() {
  $$('[data-section-link]').forEach((button) => {
    button.addEventListener('click', () => navigateTo(button.dataset.sectionLink));
  });

  $('#sidebarComposeButton').addEventListener('click', () => {
    navigateTo('home');
    $('#chirpContent').focus();
  });

  $('#refreshButton').addEventListener('click', async () => {
    try {
      await refreshEverything();
      showToast('Chirp actualizado.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  $('#logoutButton').addEventListener('click', async () => {
    try {
      await signOut();
      showAuthView();
      showToast('Sesión cerrada.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  $('#chirpContent').addEventListener('input', (event) => {
    $('#charCount').textContent = `${event.target.value.length}/280`;
  });

  $('#chirpMediaInput').addEventListener('change', (event) => {
    state.selectedMedia = event.target.files?.[0] || null;
    updateFilePreview(state.selectedMedia, $('#mediaPreview'));
  });

  $('#postChirpButton').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    try {
      setButtonLoading(button, true, 'Chirpeando...');
      await createChirp({
        content: $('#chirpContent').value,
        visibility: $('#chirpVisibility').value,
        file: state.selectedMedia
      });
      $('#chirpContent').value = '';
      $('#charCount').textContent = '0/280';
      $('#chirpMediaInput').value = '';
      state.selectedMedia = null;
      updateFilePreview(null, $('#mediaPreview'));
      showToast('Chirp publicado.', 'success');
      await refreshEverything();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setButtonLoading(button, false);
    }
  });

  $('#searchForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    await runSearch($('#searchInput').value);
  });

  $('#trendingTags').addEventListener('click', async (event) => {
    const tag = event.target.closest('[data-tag]');
    if (!tag) return;
    $('#searchInput').value = `#${tag.dataset.tag}`;
    await navigateTo('explore');
    await runSearch(`#${tag.dataset.tag}`);
  });

  $('#profileForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.submitter;
    try {
      setButtonLoading(button, true, 'Guardando...');
      const form = event.currentTarget;
      const payload = {
        username: form.elements.username.value.trim(),
        display_name: form.elements.display_name.value.trim(),
        bio: form.elements.bio.value.trim() || null,
        website: form.elements.website.value.trim() || null,
        location: form.elements.location.value.trim() || null,
        is_private: form.elements.is_private.checked
      };

      const avatarFile = $('#avatarInput').files?.[0];
      const bannerFile = $('#bannerInput').files?.[0];

      if (avatarFile) payload.avatar_url = await uploadAvatar(state.user.id, avatarFile);
      if (bannerFile) payload.banner_url = await uploadBanner(state.user.id, bannerFile);

      await updateProfile(payload);
      $('#avatarInput').value = '';
      $('#bannerInput').value = '';
      fillProfileUI();
      await refreshEverything();
      showToast('Perfil guardado.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setButtonLoading(button, false);
    }
  });

  $('#accountForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.submitter;
    try {
      setButtonLoading(button, true, 'Actualizando...');
      const form = event.currentTarget;
      await updateAuth({
        email: form.elements.email.value.trim(),
        phone: form.elements.phone.value.trim(),
        password: form.elements.password.value
      });
      form.reset();
      showToast('Cuenta actualizada. Puede requerir confirmación.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setButtonLoading(button, false);
    }
  });

  $('#appSettingsForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.submitter;
    try {
      setButtonLoading(button, true, 'Guardando...');
      const form = event.currentTarget;
      await updateSettings({
        theme: form.elements.theme.value,
        language: form.elements.language.value,
        email_notifications: form.elements.email_notifications.checked,
        push_notifications: form.elements.push_notifications.checked
      });
      showToast('Ajustes guardados.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setButtonLoading(button, false);
    }
  });

  $('#markNotificationsButton').addEventListener('click', async () => {
    try {
      await markAllNotificationsRead();
      await refreshNotifications();
      showToast('Notificaciones marcadas como leídas.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

async function bootApp() {
  showAppView();
  await refreshEverything();
  setupRealtime({
    onFeedChange: () => debounceRefresh(async () => {
      try {
        await refreshFeed();
        await refreshProfileChirps();
        await refreshTrending();
      } catch (error) {
        console.warn(error);
      }
    }),
    onNotificationChange: () => debounceRefresh(async () => {
      try {
        await refreshNotifications();
      } catch (error) {
        console.warn(error);
      }
    })
  });
  const initialSection = window.location.hash.replace('#', '') || 'home';
  await navigateTo(['home', 'explore', 'profile', 'notifications', 'settings'].includes(initialSection) ? initialSection : 'home');
}

async function init() {
  bindAuthForms();
  bindAppEvents();

  supabase.auth.onAuthStateChange(async (event, session) => {
    state.session = session;
    state.user = session?.user || null;

    if (event === 'PASSWORD_RECOVERY') {
      showToast('Ya podés cambiar tu contraseña en Ajustes.', 'success');
    }
  });

  try {
    await getSession();
    if (state.session) {
      await bootApp();
    } else {
      showAuthView();
    }
  } catch (error) {
    showAuthView();
    showToast(error.message, 'error');
  }
}

init();
