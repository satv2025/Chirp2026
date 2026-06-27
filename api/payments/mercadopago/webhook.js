const {
  activateGold,
  findGoldOrderById,
  findGoldOrderByProviderOrder,
  updateGoldOrder,
} = require('../../_utils/chirpSupabase.js');
const { sendJson, methodNotAllowed, readJson } = require('../../_utils/http.js');
const {
  extractMpResourceId,
  extractMpTopic,
  getPayment,
  getPreapproval,
  verifyMpWebhookSignature,
} = require('../../_utils/mercadopago.js');
const { getPlan } = require('../../_utils/plans.js');

function isPaymentTopic(topic = '') {
  return topic.includes('payment') || topic === 'pagos' || topic === 'merchant_order';
}

function isPreapprovalTopic(topic = '') {
  return topic.includes('preapproval') || topic.includes('subscription') || topic.includes('suscrip');
}

function daysLeft(until) {
  if (!until) return -999;
  const ms = new Date(until).getTime() - Date.now();
  return ms / 86400000;
}

async function handlePayment({ resourceId, body }) {
  const payment = await getPayment(resourceId);
  const orderId = payment?.metadata?.chirp_order_id || payment?.external_reference || '';
  if (!orderId) return { ok: true, ignored: 'missing_chirp_order_id' };

  const order = await findGoldOrderById(orderId);
  if (!order) return { ok: true, ignored: 'order_not_found' };

  const status = payment.status || 'unknown';
  const providerPaymentId = String(payment.id || resourceId);

  if (order.provider_payment_id === providerPaymentId) {
    return { ok: true, ignored: 'duplicate_payment_webhook' };
  }

  if (status === 'approved') {
    const plan = getPlan(order.plan_id || 'gold_monthly');

    // Si la suscripción ya activó Gold recién, el primer pago de MP puede caer al rato.
    // Para no regalar 60 días por el primer cobro, si todavía quedan más de 7 días, solo registramos el pago.
    if (daysLeft(order.ends_at) > 7) {
      await updateGoldOrder(order.id, {
        status: 'approved',
        provider_payment_id: providerPaymentId,
        provider_order_id: order.provider_order_id || payment.order?.id || null,
        raw: {
          ...(order.raw || {}),
          mercadopago_last_payment: payment,
          mercadopago_last_payment_webhook: body,
          note: 'Pago aprobado registrado sin extender porque Gold ya tenía período activo.',
        },
      });

      return { ok: true, recorded: true, not_extended: true };
    }

    await activateGold({
      orderId: order.id,
      userId: order.user_id,
      days: plan.durationDays,
      providerPaymentId,
      providerOrderId: order.provider_order_id || payment.order?.id || resourceId,
      status: 'approved',
      raw: { mercadopago_payment: payment, mercadopago_webhook: body },
    });

    return { ok: true, activated: true };
  }

  await updateGoldOrder(order.id, {
    status,
    provider_payment_id: providerPaymentId,
    raw: {
      ...(order.raw || {}),
      mercadopago_payment: payment,
      mercadopago_webhook: body,
    },
  });

  return { ok: true, status };
}

async function handlePreapproval({ resourceId, body }) {
  const preapproval = await getPreapproval(resourceId);
  const orderId = preapproval?.external_reference || '';

  let order = orderId ? await findGoldOrderById(orderId) : null;
  if (!order) order = await findGoldOrderByProviderOrder('mercadopago', preapproval.id || resourceId);
  if (!order) return { ok: true, ignored: 'order_not_found' };

  const status = preapproval?.status || 'unknown';

  await updateGoldOrder(order.id, {
    status,
    provider_order_id: preapproval.id || resourceId,
    checkout_url: preapproval.init_point || order.checkout_url || null,
    raw: {
      ...(order.raw || {}),
      mercadopago_preapproval: preapproval,
      mercadopago_preapproval_webhook: body,
    },
  });

  return { ok: true, status };
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

    const body = readJson(req);
    const resourceId = extractMpResourceId(req, body);
    const topic = extractMpTopic(req, body);

    if (!resourceId) return sendJson(res, { ok: true, ignored: 'missing_resource_id' });

    const signature = verifyMpWebhookSignature(req, resourceId);
    if (!signature.ok) {
      console.warn('[Chirp Gold MP webhook] firma inválida', signature);
      return sendJson(res, { error: 'Firma inválida.' }, 401);
    }

    if (isPreapprovalTopic(topic)) {
      return sendJson(res, await handlePreapproval({ resourceId, body }));
    }

    if (isPaymentTopic(topic) || !topic) {
      return sendJson(res, await handlePayment({ resourceId, body }));
    }

    return sendJson(res, { ok: true, ignored: `topic_${topic}` });
  } catch (error) {
    console.error('[Chirp Gold MP webhook]', error);
    return sendJson(res, { error: error.message || 'No pude procesar el webhook de pago.', details: error.details || null }, error.statusCode || 500);
  }
};
