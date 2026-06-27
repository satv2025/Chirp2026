function sendJson(res, data, statusCode = 200) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(data);
  }

  res.statusCode = statusCode;
  return res.end(JSON.stringify(data));
}

function methodNotAllowed(res, method = 'POST') {
  res.setHeader('Allow', method);
  return sendJson(res, { error: `Método no permitido. Usá ${method}.` }, 405);
}

function readJson(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch (_error) {
    return {};
  }
}

function siteUrl() {
  const raw =
    process.env.PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    'https://chirp.com.ar';

  let url = String(raw).trim();
  if (!url) url = 'https://chirp.com.ar';
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, '');
}

function requireEnv(names = []) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) {
    const err = new Error(`Faltan variables de entorno: ${missing.join(', ')}`);
    err.statusCode = 500;
    throw err;
  }
}

function bearerToken(req) {
  const raw = req.headers.authorization || req.headers.Authorization || '';
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

module.exports = {
  sendJson,
  methodNotAllowed,
  readJson,
  siteUrl,
  requireEnv,
  bearerToken,
};
