const { activateGold, findGoldOrderById, findGoldOrderByProviderOrder, updateGoldOrder } = require('../../_utils/chirpSupabase.js');
const { sendJson, methodNotAllowed, readJson } = require('../../_utils/http.js');
const { verifyPaypalWebhook } = require('../../_utils/paypal.js');
const { getPlan } = require('../../_utils/plans.js');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

    const body = readJson(req);
    const verification = await verifyPaypalWebhook(req, body);
    if (!verification.ok) return sendJson(res, { error: 'Firma PayPal inválida.' }, 401);

    const eventType = body.event_type || '';
    const resource = body.resource || {};

    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      const capture = resource;
      const orderId = capture.custom_id || capture.invoice_id || '';
      let order = orderId ? await findGoldOrderById(orderId) : null;
      if (!order && capture.supplementary_data?.related_ids?.order_id) {
        order = await findGoldOrderByProviderOrder('paypal', capture.supplementary_data.related_ids.order_id);
      }

      if (order) {
        const plan = getPlan(order.plan_id || 'gold_monthly');
        await activateGold({
          orderId: order.id,
          userId: order.user_id,
          days: plan.durationDays,
          providerPaymentId: capture.id || '',
          providerOrderId: order.provider_order_id || capture.supplementary_data?.related_ids?.order_id || '',
          status: 'approved',
          raw: { paypal_webhook: body },
        });
      }
    }

    if (['PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.CAPTURE.REVERSED', 'PAYMENT.CAPTURE.DENIED'].includes(eventType)) {
      const capture = resource;
      const orderId = capture.custom_id || capture.invoice_id || '';
      const order = orderId ? await findGoldOrderById(orderId) : null;
      if (order) {
        await updateGoldOrder(order.id, {
          status: eventType.toLowerCase().replaceAll('.', '_'),
          provider_payment_id: capture.id || order.provider_payment_id || null,
          raw: { paypal_webhook: body },
        });
      }
    }

    return sendJson(res, { ok: true });
  } catch (error) {
    console.error('[Chirp Gold PayPal webhook]', error);
    return sendJson(res, { error: error.message || 'No pude procesar el webhook de PayPal.', details: error.details || null }, error.statusCode || 500);
  }
};
