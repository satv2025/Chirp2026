import { APP } from './config.js';
import { supabase } from './supabaseClient.js';
import { $, showToast, setButtonLoading, withTimeout, logSecurityEvent, escapeHtml } from './utils.js';
import { initCustomControls, bindErrorBoundary } from './ui.js';
import { reportAuthError } from './auth-errors.js';

bindErrorBoundary();
initCustomControls();

const nextUrl = new URLSearchParams(location.search).get('next') || '/home/';

function setInlineMessage(selector, title, message, detail = '', type = 'error') {
  const box = $(selector);
  if (!box) return;
  box.classList.remove('hidden');
  box.classList.toggle('notice-error', type === 'error');
  box.classList.toggle('notice-success', type !== 'error');
  box.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>${detail && detail !== message ? `<code>${escapeHtml(detail)}</code>` : ''}`;
}

function clearInlineMessage(selector) {
  const box = $(selector);
  if (!box) return;
  box.classList.add('hidden');
  box.innerHTML = '';
}

async function signIn(email, password) {
  return withTimeout(supabase.auth.signInWithPassword({ email, password }), APP.authTimeoutMs, 'Entrar');
}

async function signUp(email, password, displayName) {
  return withTimeout(supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: APP.authCallback,
      data: { display_name: displayName }
    }
  }), APP.authTimeoutMs, 'Crear tu cuenta');
}

$('#loginForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  setButtonLoading(button, true, 'Entrando...');
  const email = $('#loginEmail').value.trim();
  const password = $('#loginPassword').value;
  try {
    const { error } = await signIn(email, password);
    if (error) throw error;
    showToast('Entraste a Chirp', 'Volviendo a tu timeline.');
    location.href = nextUrl;
  } catch (error) {
    const info = reportAuthError(error, 'login');
    showToast(info.title, info.message, 'error');
  } finally {
    setButtonLoading(button, false);
  }
});

$('#registerForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  setButtonLoading(button, true, 'Creando cuenta...');
  clearInlineMessage('.js-register-error');
  const displayName = $('#registerName').value.trim();
  const email = $('#registerEmail').value.trim();
  const password = $('#registerPassword').value;
  try {
    const { error } = await signUp(email, password, displayName);
    if (error) throw error;
    showToast('Cuenta creada', 'Te mandamos un email para confirmar tu cuenta.');
    $('.js-register-done')?.classList.remove('hidden');
    clearInlineMessage('.js-register-error');
  } catch (error) {
    const info = reportAuthError(error, 'signup');
    showToast(info.title, info.message, 'error');
    setInlineMessage('.js-register-error', info.title, info.message, info.detail, 'error');
  } finally {
    setButtonLoading(button, false);
  }
});

$('#resetForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  setButtonLoading(button, true, 'Enviando...');
  const email = $('#resetEmail').value.trim();
  try {
    const { error } = await withTimeout(supabase.auth.resetPasswordForEmail(email, {
      redirectTo: APP.updatePassword
    }), APP.authTimeoutMs, 'Enviar el email');
    if (error) throw error;
    showToast('Listo', 'Te mandamos un email para crear una contraseña nueva.');
  } catch (error) {
    const info = reportAuthError(error, 'reset');
    showToast(info.title, info.message, 'error');
  } finally {
    setButtonLoading(button, false);
  }
});

$('#updatePasswordForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  setButtonLoading(button, true, 'Guardando...');
  const password = $('#newPassword').value;
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    await logSecurityEvent('password_updated_from_reset');
    showToast('Contraseña actualizada', 'Ya podés entrar con tu nueva contraseña.');
    setTimeout(() => location.href = '/home/', 900);
  } catch (error) {
    const info = reportAuthError(error, 'update-password');
    showToast(info.title, info.message, 'error');
  } finally {
    setButtonLoading(button, false);
  }
});

$('#magicForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  setButtonLoading(button, true, 'Mandando link...');
  const email = $('#magicEmail').value.trim();
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: APP.authCallback }
    });
    if (error) throw error;
    showToast('Link enviado', 'Revisá tu email para entrar.');
  } catch (error) {
    const info = reportAuthError(error, 'magic-link');
    showToast(info.title, info.message, 'error');
  } finally {
    setButtonLoading(button, false);
  }
});
