const { getSupabaseUserFromRequest } = require('../../../api/_utils/auth.js');
const { activateGold, findGoldOrderById, findGoldOrderByProviderOrder, updateGoldOrder } = require('../../../api/_utils/chirpSupabase.js');
const { sendJson, methodNotAllowed, readJson } = require('../../../api/_utils/http.js');
const { capturePaypalOrder } = require('../../../api/_utils/paypal.js');
const { getPlan } = require('../../../api/_utils/plans.js');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

    const user = await getSupabaseUserFromRequest(req);
    const body = readJson(req);
    const orderId = body.order_id || '';
    const paypalOrderId = body.paypal_order_id || body.token || '';

    let order = orderId ? await findGoldOrderById(orderId) : null;
    if (!order && paypalOrderId) order = await findGoldOrderByProviderOrder('paypal', paypalOrderId);
    if (!order) return sendJson(res, { error: 'Orden Chirp Gold no encontrada.' }, 404);
    if (order.user_id !== user.id) return sendJson(res, { error: 'No autorizado para capturar esta orden.' }, 403);
    if (order.status === 'approved') return sendJson(res, { ok: true, already_approved: true, order });

    const captured = await capturePaypalOrder(order.provider_order_id || paypalOrderId);
    const capture = captured?.purchase_units?.[0]?.payments?.captures?.[0] || null;
    const status = capture?.status || captured.status || 'unknown';

    if (status === 'COMPLETED') {
      const plan = getPlan(order.plan_id || 'gold_monthly');
      await activateGold({
        orderId: order.id,
        userId: order.user_id,
        days: plan.durationDays,
        providerPaymentId: capture?.id || '',
        providerOrderId: captured.id || order.provider_order_id || paypalOrderId,
        status: 'approved',
        raw: { paypal_capture: captured },
      });
      return sendJson(res, { ok: true, status: 'approved' });
    }

    await updateGoldOrder(order.id, {
      status: String(status).toLowerCase(),
      provider_payment_id: capture?.id || null,
      raw: { paypal_capture: captured },
    });

    return sendJson(res, { ok: false, status });
  } catch (error) {
    console.error('[Chirp Gold PayPal capture]', error);
    return sendJson(res, { error: error.message || 'No pude capturar la orden de PayPal.', details: error.details || null }, error.statusCode || 500);
  }
};
