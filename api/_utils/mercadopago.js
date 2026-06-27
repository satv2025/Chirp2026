const crypto = require('node:crypto');
const { requireEnv } = require('./http.js');

const MP_BASE = 'https://api.mercadopago.com';

function mpAccessToken() {
  requireEnv(['MERCADOPAGO_ACCESS_TOKEN']);
  return process.env.MERCADOPAGO_ACCESS_TOKEN;
}

function mpPublicKey() {
  requireEnv(['MERCADOPAGO_PUBLIC_KEY']);
  return process.env.MERCADOPAGO_PUBLIC_KEY;
}

async function mpFetch(path, options = {}) {
  const response = await fetch(`${MP_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${mpAccessToken()}`,
      'Content-Type': 'application/json',
      ...(mpAccessToken().startsWith('TEST-') ? { 'X-scope': 'stage' } : {}),
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_error) {
    data = { raw: text };
  }

  if (!response.ok) {
    const err = new Error(data?.message || data?.error || `Mercado Pago error ${response.status}`);
    err.statusCode = response.status;
    err.details = data;
    throw err;
  }

  return data;
}

function createPreference(payload) {
  if (payload?.auto_return && !payload?.back_urls?.success) {
    const err = new Error('auto_return requiere back_urls.success.');
    err.statusCode = 400;
    throw err;
  }

  return mpFetch('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

function createPreapproval(payload, idempotencyKey = '') {
  const headers = {};
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;

  return mpFetch('/preapproval', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
}

function getPreapproval(preapprovalId) {
  return mpFetch(`/preapproval/${encodeURIComponent(preapprovalId)}`, { method: 'GET' });
}

function getPayment(paymentId) {
  return mpFetch(`/v1/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' });
}

function requestUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host || 'localhost';
  return new URL(req.url, `${proto}://${host}`);
}

function extractMpResourceId(req, body = {}) {
  const url = requestUrl(req);
  const resource = body?.resource || body?.data?.id || body?.id || '';
  return (
    url.searchParams.get('data.id') ||
    url.searchParams.get('id') ||
    (typeof resource === 'string' ? resource.split('/').pop() : '') ||
    ''
  );
}

function extractMpTopic(req, body = {}) {
  const url = requestUrl(req);
  return String(
    url.searchParams.get('topic') ||
    url.searchParams.get('type') ||
    body?.type ||
    body?.topic ||
    body?.action ||
    ''
  ).toLowerCase();
}

function verifyMpWebhookSignature(req, resourceId = '') {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET || '';
  if (!secret) return { ok: true, skipped: true };

  const signature = req.headers['x-signature'] || '';
  const requestId = req.headers['x-request-id'] || '';
  const ts = signature.split(',').map((part) => part.trim()).find((part) => part.startsWith('ts='))?.slice(3) || '';
  const v1 = signature.split(',').map((part) => part.trim()).find((part) => part.startsWith('v1='))?.slice(3) || '';

  if (!resourceId || !requestId || !ts || !v1) {
    return { ok: false, skipped: false, reason: 'missing_signature_parts' };
  }

  const manifest = `id:${resourceId};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(v1, 'hex');
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    return { ok, skipped: false, reason: ok ? '' : 'bad_signature' };
  } catch (_error) {
    return { ok: false, skipped: false, reason: 'bad_signature_format' };
  }
}

module.exports = {
  mpPublicKey,
  createPreference,
  createPreapproval,
  getPreapproval,
  getPayment,
  extractMpResourceId,
  extractMpTopic,
  verifyMpWebhookSignature,
};
