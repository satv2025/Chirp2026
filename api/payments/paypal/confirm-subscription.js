const { getSupabaseUserFromRequest } = require('../../_utils/auth.js');
const { activateGold, findGoldOrderById, findGoldOrderByProviderOrder, updateGoldOrder } = require('../../_utils/chirpSupabase.js');
const { sendJson, methodNotAllowed, readJson } = require('../../_utils/http.js');
const { getPaypalSubscription } = require('../../_utils/paypal.js');
const { getPlan } = require('../../_utils/plans.js');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

    const user = await getSupabaseUserFromRequest(req);
    const body = readJson(req);
    const orderId = body.order_id || '';
    const subscriptionId = body.subscription_id || body.paypal_subscription_id || body.token || '';

    let order = orderId ? await findGoldOrderById(orderId) : null;
    if (!order && subscriptionId) order = await findGoldOrderByProviderOrder('paypal', subscriptionId);
    if (!order) return sendJson(res, { error: 'Orden ChirpCheck Gold no encontrada.' }, 404);
    if (order.user_id !== user.id) return sendJson(res, { error: 'No autorizado para confirmar esta suscripción.' }, 403);

    const paypalSubId = subscriptionId || order.provider_order_id;
    if (!paypalSubId) return sendJson(res, { error: 'Falta el ID de suscripción de PayPal.' }, 400);

    const subscription = await getPaypalSubscription(paypalSubId);
    const status = String(subscription.status || '').toUpperCase();

    await updateGoldOrder(order.id, {
      provider_order_id: subscription.id || paypalSubId,
      provider_subscription_id: subscription.id || paypalSubId,
      status: status.toLowerCase(),
      raw: { paypal_subscription_confirm: subscription },
    });

    if (status === 'ACTIVE') {
      const plan = getPlan(order.plan_id || 'gold_monthly');
      await activateGold({
        orderId: order.id,
        userId: order.user_id,
        days: plan.durationDays,
        providerPaymentId: subscription.id || paypalSubId,
        providerOrderId: subscription.id || paypalSubId,
        status: 'approved',
        raw: { paypal_subscription_confirm: subscription },
      });
      return sendJson(res, { ok: true, status, activated: true });
    }

    return sendJson(res, { ok: false, status, activated: false });
  } catch (error) {
    console.error('[Chirp Gold PayPal confirm-subscription]', error);
    return sendJson(res, {
      error: error.message || 'No pude confirmar la suscripción de PayPal.',
      details: error.details || null,
    }, error.statusCode || 500);
  }
};
