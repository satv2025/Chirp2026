import { supabase } from './supabaseClient.js';
import { state } from './state.js';
import { normalizeUsername } from './ui.js';

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  state.session = data.session;
  state.user = data.session?.user || null;
  return state.session;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  state.session = data.session;
  state.user = data.user;
  await loadCurrentUserData();
  return data;
}

export async function signUp({ email, password, username, displayName }) {
  const cleanUsername = normalizeUsername(username);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: cleanUsername,
        display_name: displayName
      }
    }
  });
  if (error) throw error;

  if (data.session) {
    state.session = data.session;
    state.user = data.user;
    await ensureProfile({ username: cleanUsername, display_name: displayName });
    await loadCurrentUserData();
  }

  return data;
}

export async function resetPassword(email) {
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  state.session = null;
  state.user = null;
  state.profile = null;
  state.settings = null;
}

export async function updateAuth({ email, phone, password }) {
  const payload = {};
  if (email) payload.email = email;
  if (phone) payload.phone = phone;
  if (password) payload.password = password;

  if (!Object.keys(payload).length) {
    throw new Error('Completá al menos un campo para actualizar la cuenta.');
  }

  const { data, error } = await supabase.auth.updateUser(payload);
  if (error) throw error;
  state.user = data.user;
  return data.user;
}

export async function ensureProfile(preferred = {}) {
  if (!state.user) return null;

  const meta = state.user.user_metadata || {};
  const username = normalizeUsername(preferred.username || meta.username || `user_${state.user.id.replaceAll('-', '').slice(0, 24)}`);
  const displayName = (preferred.display_name || meta.display_name || meta.name || 'Nuevo usuario').slice(0, 50);

  const { data: current, error: selectError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', state.user.id)
    .maybeSingle();

  if (selectError) throw selectError;

  if (!current) {
    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id: state.user.id,
        username,
        display_name: displayName
      })
      .select('*')
      .single();
    if (error) throw error;
    await ensureSettings();
    state.profile = data;
    return data;
  }

  const shouldAdoptPreferredUsername = meta.username && /^user_[a-f0-9]{12,24}$/i.test(String(current.username));
  if (shouldAdoptPreferredUsername) {
    const { data, error } = await supabase
      .from('profiles')
      .update({ username: normalizeUsername(meta.username) })
      .eq('id', state.user.id)
      .select('*')
      .single();
    if (!error) {
      state.profile = data;
      await ensureSettings();
      return data;
    }
  }

  state.profile = current;
  await ensureSettings();
  return current;
}

export async function ensureSettings() {
  if (!state.user) return null;

  const { data: existing, error: selectError } = await supabase
    .from('account_settings')
    .select('*')
    .eq('user_id', state.user.id)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) {
    state.settings = existing;
    return existing;
  }

  const { data, error } = await supabase
    .from('account_settings')
    .insert({ user_id: state.user.id })
    .select('*')
    .single();

  if (error) throw error;
  state.settings = data;
  return data;
}

export async function loadCurrentUserData() {
  await ensureProfile();
  return {
    profile: state.profile,
    settings: state.settings
  };
}

export async function updateProfile(payload) {
  if (!state.user) throw new Error('No hay sesión activa.');
  const cleanPayload = {
    ...payload,
    username: payload.username ? normalizeUsername(payload.username) : payload.username
  };

  const { data, error } = await supabase
    .from('profiles')
    .update(cleanPayload)
    .eq('id', state.user.id)
    .select('*')
    .single();

  if (error) throw error;
  state.profile = data;
  return data;
}

export async function updateSettings(payload) {
  if (!state.user) throw new Error('No hay sesión activa.');

  const { data, error } = await supabase
    .from('account_settings')
    .update(payload)
    .eq('user_id', state.user.id)
    .select('*')
    .single();

  if (error) throw error;
  state.settings = data;
  return data;
}
