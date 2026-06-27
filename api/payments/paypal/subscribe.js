const { getSupabaseUserFromRequest } = require('../../_utils/auth.js');
const { createGoldOrder, updateGoldOrder } = require('../../_utils/chirpSupabase.js');
const { sendJson, methodNotAllowed, readJson } = require('../../_utils/http.js');
const { createPaypalSubscription } = require('../../_utils/paypal.js');
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

    const subscription = await createPaypalSubscription({
      orderId: order.id,
      plan,
      user,
      customId: order.id,
    });

    const approveUrl = (subscription.links || []).find((link) => {
      return link.rel === 'approve' || link.rel === 'payer-action';
    })?.href || '';

    await updateGoldOrder(order.id, {
      provider_order_id: subscription.id || null,
      provider_subscription_id: subscription.id || null,
      checkout_url: approveUrl,
      external_reference: order.id,
      raw: { create_subscription: subscription },
    });

    return sendJson(res, {
      ok: true,
      provider: 'paypal',
      order_id: order.id,
      paypal_subscription_id: subscription.id,
      approve_url: approveUrl,
    });
  } catch (error) {
    console.error('[Chirp Gold PayPal subscribe]', error);
    return sendJson(res, {
      error: error.message || 'No pude crear la suscripción de PayPal.',
      details: error.details || null,
    }, error.statusCode || 500);
  }
};
