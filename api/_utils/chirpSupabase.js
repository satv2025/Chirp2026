const { requireEnv } = require('./http.js');

function supabaseConfig() {
  requireEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  return {
    url: process.env.SUPABASE_URL.replace(/\/+$/, ''),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

async function supabaseRest(path, options = {}) {
  const cfg = supabaseConfig();
  const url = `${cfg.url}/rest/v1/${path.replace(/^\/+/, '')}`;
  const headers = {
    apikey: cfg.serviceRoleKey,
    Authorization: `Bearer ${cfg.serviceRoleKey}`,
    'Content-Type': 'application/json',
    Prefer: options.prefer || 'return=representation',
    ...(options.headers || {}),
  };

  const response = await fetch(url, { ...options, headers });
  const text = await response.text();

  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_error) {
    data = text;
  }

  if (!response.ok) {
    const err = new Error(data?.message || data?.error || `Supabase REST error ${response.status}`);
    err.statusCode = response.status;
    err.details = data;
    throw err;
  }

  return data;
}

async function createGoldOrder({ userId, provider, plan, amount, currency }) {
  const rows = await supabaseRest('chirp_gold_orders', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      provider,
      plan_id: plan.id,
      status: 'pending',
      amount,
      currency,
      raw: {},
    }),
  });

  return Array.isArray(rows) ? rows[0] : rows;
}

async function updateGoldOrder(orderId, payload = {}) {
  const rows = await supabaseRest(`chirp_gold_orders?id=eq.${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  return Array.isArray(rows) ? rows[0] : rows;
}

async function findGoldOrderById(orderId) {
  const rows = await supabaseRest(`chirp_gold_orders?id=eq.${encodeURIComponent(orderId)}&select=*`, {
    method: 'GET',
  });

  return Array.isArray(rows) ? rows[0] : null;
}

async function findGoldOrderByProviderOrder(provider, providerOrderId) {
  const encodedProvider = encodeURIComponent(provider);
  const encodedValue = encodeURIComponent(providerOrderId);
  const rows = await supabaseRest(
    `chirp_gold_orders?provider=eq.${encodedProvider}&or=(provider_order_id.eq.${encodedValue},provider_subscription_id.eq.${encodedValue})&select=*`,
    { method: 'GET' }
  );

  return Array.isArray(rows) ? rows[0] : null;
}

async function activateGold({ orderId, userId, days, providerPaymentId = '', providerOrderId = '', status = 'approved', raw = {} }) {
  return supabaseRest('rpc/activate_chirp_gold', {
    method: 'POST',
    body: JSON.stringify({
      p_user_id: userId,
      p_order_id: orderId,
      p_days: days,
      p_provider_payment_id: providerPaymentId || null,
      p_provider_order_id: providerOrderId || null,
      p_status: status,
      p_raw: raw || {},
    }),
  });
}

async function setProfileGold(userId, isGold, goldUntil = null) {
  const rows = await supabaseRest(`profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      is_chirp_gold: Boolean(isGold),
      gold_until: goldUntil,
    }),
  });

  return Array.isArray(rows) ? rows[0] : rows;
}

module.exports = {
  supabaseRest,
  createGoldOrder,
  updateGoldOrder,
  findGoldOrderById,
  findGoldOrderByProviderOrder,
  activateGold,
  setProfileGold,
};
