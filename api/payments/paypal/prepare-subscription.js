const { getSupabaseUserFromRequest } = require('../../_utils/auth.js');
const { createGoldOrder } = require('../../_utils/chirpSupabase.js');
const { sendJson, methodNotAllowed, readJson } = require('../../_utils/http.js');
const { getPlan, moneyValue } = require('../../_utils/plans.js');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

    const user = await getSupabaseUserFromRequest(req);
    const body = readJson(req);
    const plan = getPlan(body.plan_id || 'gold_monthly');
    const amount = moneyValue(plan.paypal.amount);
    const currency = plan.paypal.currency || 'USD';

    const order = await createGoldOrder({
      userId: user.id,
      provider: 'paypal',
      plan,
      amount: Number(amount),
      currency,
    });

    return sendJson(res, {
      ok: true,
      provider: 'paypal',
      order_id: order.id,
    });
  } catch (error) {
    console.error('[Chirp Gold PayPal prepare-subscription]', error);
    return sendJson(res, {
      error: error.message || 'No pude preparar la suscripción de PayPal.',
      details: error.details || null,
    }, error.statusCode || 500);
  }
};
