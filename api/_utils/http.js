function sendJson(res, data, statusCode = 200) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(statusCode).json(data);
}

function methodNotAllowed(res, method = 'POST') {
  sendJson(res, { error: `Método no permitido. Usá ${method}.` }, 405);
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
  return (process.env.PUBLIC_SITE_URL || process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
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

module.exports = { sendJson, methodNotAllowed, readJson, siteUrl, requireEnv, bearerToken };
