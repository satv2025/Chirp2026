import { supabase } from './supabaseClient.js';

const PUBLIC_AUTH_PATHS = new Set([
  '/',
  '/login/',
  '/signin/',
  '/register/',
  '/signup/'
]);

function normalizedPath() {
  let path = location.pathname || '/';
  if (!path.endsWith('/')) path += '/';
  return path;
}

export async function redirectIfLoggedIn({ to = '/home/', replace = true } = {}) {
  const path = normalizedPath();
  if (!PUBLIC_AUTH_PATHS.has(path)) return false;

  const { data } = await supabase.auth.getSession();
  if (data?.session?.user) {
    replace ? location.replace(to) : (location.href = to);
    return true;
  }

  return false;
}

export function watchAuthRedirect({ to = '/home/' } = {}) {
  supabase.auth.onAuthStateChange((event, session) => {
    const path = normalizedPath();
    if (!PUBLIC_AUTH_PATHS.has(path)) return;
    if (session?.user && ['SIGNED_IN', 'TOKEN_REFRESHED', 'INITIAL_SESSION'].includes(event)) {
      location.replace(to);
    }
  });
}
