const crypto = require('node:crypto');
const { requireEnv } = require('./http.js');

const MP_BASE = 'https://api.mercadopago.com';

function mpAccessToken() {
  requireEnv(['MERCADOPAGO_ACCESS_TOKEN']);
  return process.env.MERCADOPAGO_ACCESS_TOKEN;
}

async function mpFetch(path, options = {}) {
  const response = await fetch(`${MP_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${mpAccessToken()}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const err = new Error(data?.message || data?.error || `Mercado Pago error ${response.status}`);
    err.statusCode = response.status;
    err.details = data;
    throw err;
  }
  return data;
}

function createPreference(payload) {
  return mpFetch('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

function getPayment(paymentId) {
  return mpFetch(`/v1/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' });
}

function extractMpPaymentId(req, body = {}) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url, `${proto}://${host}`);
  return (
    url.searchParams.get('data.id') ||
    url.searchParams.get('id') ||
    body?.data?.id ||
    body?.id ||
    body?.resource?.split('/').pop() ||
    ''
  );
}

function verifyMpWebhookSignature(req, paymentId = '') {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET || '';
  if (!secret) return { ok: true, skipped: true };

  const signature = req.headers['x-signature'] || '';
  const requestId = req.headers['x-request-id'] || '';
  const ts = signature.split(',').map((part) => part.trim()).find((part) => part.startsWith('ts='))?.slice(3) || '';
  const v1 = signature.split(',').map((part) => part.trim()).find((part) => part.startsWith('v1='))?.slice(3) || '';

  if (!paymentId || !requestId || !ts || !v1) return { ok: false, reason: 'missing_signature_parts' };

  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(v1, 'hex');
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { ok, skipped: false, reason: ok ? '' : 'bad_signature' };
}

module.exports = { createPreference, getPayment, extractMpPaymentId, verifyMpWebhookSignature };
