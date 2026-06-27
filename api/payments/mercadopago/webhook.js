const { activateGold, findGoldOrderById, updateGoldOrder } = require('../../_utils/chirpSupabase.js');
const { sendJson, methodNotAllowed, readJson } = require('../../_utils/http.js');
const { extractMpPaymentId, getPayment, verifyMpWebhookSignature } = require('../../_utils/mercadopago.js');
const { getPlan } = require('../../_utils/plans.js');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

    const body = readJson(req);
    const paymentId = extractMpPaymentId(req, body);
    if (!paymentId) return sendJson(res, { ok: true, ignored: 'missing_payment_id' });

    const signature = verifyMpWebhookSignature(req, paymentId);
    if (!signature.ok) {
      console.warn('[Chirp Gold MP webhook] firma inválida', signature);
      return sendJson(res, { error: 'Firma inválida.' }, 401);
    }

    const payment = await getPayment(paymentId);
    const orderId = payment?.metadata?.chirp_order_id || payment?.external_reference || '';
    if (!orderId) return sendJson(res, { ok: true, ignored: 'missing_chirp_order_id' });

    const order = await findGoldOrderById(orderId);
    if (!order) return sendJson(res, { ok: true, ignored: 'order_not_found' });

    const status = payment.status || 'unknown';
    const providerPaymentId = String(payment.id || paymentId);

    if (status === 'approved') {
      const plan = getPlan(order.plan_id || 'gold_monthly');
      await activateGold({
        orderId: order.id,
        userId: order.user_id,
        days: plan.durationDays,
        providerPaymentId,
        providerOrderId: order.provider_order_id || payment.order?.id || paymentId,
        status: 'approved',
        raw: { mercadopago_payment: payment, mercadopago_webhook: body },
      });
    } else {
      await updateGoldOrder(order.id, {
        status,
        provider_payment_id: providerPaymentId,
        raw: { mercadopago_payment: payment, mercadopago_webhook: body },
      });
    }

    return sendJson(res, { ok: true });
  } catch (error) {
    console.error('[Chirp Gold MP webhook]', error);
    return sendJson(res, { error: error.message || 'No pude procesar el webhook de Mercado Pago.', details: error.details || null }, error.statusCode || 500);
  }
};
