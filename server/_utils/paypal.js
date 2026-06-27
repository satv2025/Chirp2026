const { requireEnv, siteUrl } = require('./http.js');

function paypalBase() {
  const env = (process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
  if (process.env.PAYPAL_API_BASE) return process.env.PAYPAL_API_BASE.replace(/\/+$/, '');
  return env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

async function paypalAccessToken() {
  requireEnv(['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET']);
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');

  const response = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.access_token) {
    const err = new Error(data?.error_description || data?.message || 'No pude autenticar PayPal.');
    err.statusCode = response.status;
    err.details = data;
    throw err;
  }

  return data.access_token;
}

async function paypalFetch(path, options = {}) {
  const token = await paypalAccessToken();
  const response = await fetch(`${paypalBase()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
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
    const err = new Error(data?.message || data?.name || `PayPal error ${response.status}`);
    err.statusCode = response.status;
    err.details = data;
    throw err;
  }

  return data;
}

function createPaypalOrder(payload) {
  return paypalFetch('/v2/checkout/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

function capturePaypalOrder(orderId) {
  return paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

function paypalPlanId() {
  const planId = process.env.PAYPAL_PLAN_ID || process.env.PAYPAL_GOLD_PLAN_ID;
  if (!planId) {
    const err = new Error('Falta PAYPAL_PLAN_ID en Vercel. Creá un plan mensual de PayPal Subscriptions y pegá el ID P-...');
    err.statusCode = 500;
    throw err;
  }
  return planId;
}

function createPaypalSubscription({ orderId, plan, user, customId }) {
  const base = siteUrl();
  const returnUrl = `${base}/gold-return.html?provider=paypal&order_id=${encodeURIComponent(orderId)}`;
  const cancelUrl = `${base}/gold-return.html?provider=paypal&result=cancelled&order_id=${encodeURIComponent(orderId)}`;

  return paypalFetch('/v1/billing/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      plan_id: paypalPlanId(),
      custom_id: customId || orderId,
      quantity: '1',
      subscriber: user?.email
        ? {
            email_address: user.email,
          }
        : undefined,
      application_context: {
        brand_name: 'Chirp',
        locale: 'es-AR',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'SUBSCRIBE_NOW',
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    }),
  });
}

function getPaypalSubscription(subscriptionId) {
  return paypalFetch(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

async function verifyPaypalWebhook(req, body) {
  if (!process.env.PAYPAL_WEBHOOK_ID) return { ok: true, skipped: true };

  const payload = {
    auth_algo: req.headers['paypal-auth-algo'],
    cert_url: req.headers['paypal-cert-url'],
    transmission_id: req.headers['paypal-transmission-id'],
    transmission_sig: req.headers['paypal-transmission-sig'],
    transmission_time: req.headers['paypal-transmission-time'],
    webhook_id: process.env.PAYPAL_WEBHOOK_ID,
    webhook_event: body,
  };

  const result = await paypalFetch('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return { ok: result?.verification_status === 'SUCCESS', skipped: false, result };
}

module.exports = {
  paypalBase,
  paypalFetch,
  createPaypalOrder,
  capturePaypalOrder,
  createPaypalSubscription,
  getPaypalSubscription,
  verifyPaypalWebhook,
  paypalPlanId,
};
