const { bearerToken, requireEnv } = require('./http.js');

async function getSupabaseUserFromRequest(req) {
  requireEnv(['SUPABASE_URL', 'SUPABASE_ANON_KEY']);
  const token = bearerToken(req);
  if (!token) {
    const err = new Error('Falta Authorization: Bearer <access_token>.');
    err.statusCode = 401;
    throw err;
  }

  const response = await fetch(`${process.env.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.id) {
    const err = new Error(data?.msg || data?.message || 'Sesión inválida.');
    err.statusCode = 401;
    throw err;
  }

  return data;
}

module.exports = { getSupabaseUserFromRequest };
