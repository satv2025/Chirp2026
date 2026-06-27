const { sendJson, methodNotAllowed } = require('../../../api/_utils/http.js');
const { paypalPlanId } = require('../../../api/_utils/paypal.js');
const { getPlan, moneyValue } = require('../../../api/_utils/plans.js');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, 'GET');

    const clientId = process.env.PAYPAL_CLIENT_ID || '';
    if (!clientId) return sendJson(res, { error: 'Falta PAYPAL_CLIENT_ID en Vercel.' }, 500);

    const plan = getPlan('gold_monthly');
    return sendJson(res, {
      ok: true,
      env: (process.env.PAYPAL_ENV || 'sandbox').toLowerCase(),
      client_id: clientId,
      plan_id: paypalPlanId(),
      plan: {
        id: plan.id,
        amount: moneyValue(plan.paypal.amount),
        currency: plan.paypal.currency || 'USD',
        duration_days: plan.durationDays,
      },
    });
  } catch (error) {
    console.error('[Chirp Gold PayPal public-config]', error);
    return sendJson(res, {
      error: error.message || 'No pude cargar PayPal.',
      details: error.details || null,
    }, error.statusCode || 500);
  }
};
