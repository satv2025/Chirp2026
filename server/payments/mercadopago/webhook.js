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


async function resolveOrderFromPayment(payment, fallbackResourceId = '') {
  const directOrderIds = [
    payment?.metadata?.chirp_order_id,
    payment?.metadata?.order_id,
  ].filter(Boolean);

  for (const orderId of directOrderIds) {
    const order = await findGoldOrderById(String(orderId));
    if (order) return { order, preapproval: null, preapprovalId: '' };
  }

  const possiblePreapprovalIds = [
    payment?.preapproval_id,
    payment?.metadata?.preapproval_id,
    payment?.subscription_id,
    payment?.external_reference,
  ].filter(Boolean).map(String);

  for (const preapprovalId of possiblePreapprovalIds) {
    let order = await findGoldOrderByProviderOrder('mercadopago', preapprovalId);
    if (order) return { order, preapproval: null, preapprovalId };

    // En el checkout hosted de suscripciones, el payment.external_reference puede ser
    // el preapproval_id. Si el pago llega antes que el webhook de suscripción,
    // todavía no tenemos provider_subscription_id guardado, así que buscamos la
    // preapproval y usamos su preapproval_plan_id para encontrar la orden original.
    try {
      const preapproval = await getPreapproval(preapprovalId);
      const inheritedOrderId = preapproval?.external_reference || '';
      if (inheritedOrderId) {
        order = await findGoldOrderById(inheritedOrderId);
        if (order) return { order, preapproval, preapprovalId };
      }
      const preapprovalPlanId = preapproval?.preapproval_plan_id || '';
      if (preapprovalPlanId) {
        order = await findGoldOrderByProviderOrder('mercadopago', preapprovalPlanId);
        if (order) return { order, preapproval, preapprovalId };
      }
    } catch (error) {
      console.warn('[Chirp Gold MP webhook] no pude resolver preapproval desde payment', preapprovalId, error.message);
    }
  }

  const paymentOrderId = payment?.order?.id || fallbackResourceId || '';
  if (paymentOrderId) {
    const order = await findGoldOrderByProviderOrder('mercadopago', String(paymentOrderId));
    if (order) return { order, preapproval: null, preapprovalId: '' };
  }

  return { order: null, preapproval: null, preapprovalId: '' };
}

async function handlePayment({ resourceId, body }) {
  const payment = await getPayment(resourceId);
  const resolved = await resolveOrderFromPayment(payment, resourceId);
  const order = resolved.order;
  const preapproval = resolved.preapproval;
  const preapprovalId = resolved.preapprovalId || payment?.preapproval_id || payment?.metadata?.preapproval_id || payment?.subscription_id || '';

  if (!order) {
    return {
      ok: true,
      ignored: 'order_not_found',
      payment_id: payment?.id || resourceId,
      external_reference: payment?.external_reference || null,
      preapproval_id: preapprovalId || null,
    };
  }

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
        provider_order_id: order.provider_order_id || preapproval?.preapproval_plan_id || preapprovalId || payment.order?.id || null,
        provider_subscription_id: order.provider_subscription_id || preapprovalId || preapproval?.id || null,
        raw: {
          ...(order.raw || {}),
          mercadopago_last_payment: payment,
          mercadopago_last_payment_webhook: body,
          mercadopago_last_preapproval_from_payment: preapproval || null,
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
      providerOrderId: order.provider_order_id || preapproval?.preapproval_plan_id || preapprovalId || payment.order?.id || resourceId,
      status: 'approved',
      raw: {
        mercadopago_payment: payment,
        mercadopago_webhook: body,
        mercadopago_preapproval_from_payment: preapproval || null,
      },
    });

    if (preapprovalId || preapproval?.id) {
      await updateGoldOrder(order.id, {
        provider_subscription_id: preapprovalId || preapproval?.id || order.provider_subscription_id || null,
        provider_order_id: order.provider_order_id || preapproval?.preapproval_plan_id || preapprovalId || null,
      });
    }

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
  const preapprovalId = preapproval?.id || resourceId;
  const preapprovalPlanId = preapproval?.preapproval_plan_id || '';

  let order = orderId ? await findGoldOrderById(orderId) : null;
  if (!order) order = await findGoldOrderByProviderOrder('mercadopago', preapprovalId);
  if (!order && preapprovalPlanId) order = await findGoldOrderByProviderOrder('mercadopago', preapprovalPlanId);
  if (!order) return { ok: true, ignored: 'order_not_found' };

  const status = String(preapproval?.status || 'unknown').toLowerCase();
  const raw = {
    ...(order.raw || {}),
    mercadopago_preapproval: preapproval,
    mercadopago_preapproval_webhook: body,
    mercadopago_preapproval_plan_id: preapprovalPlanId || null,
  };

  if (status === 'authorized' || status === 'approved') {
    const plan = getPlan(order.plan_id || 'gold_monthly');
    await activateGold({
      orderId: order.id,
      userId: order.user_id,
      days: plan.durationDays,
      providerPaymentId: '',
      providerOrderId: preapprovalId,
      status: 'approved',
      raw,
    });

    await updateGoldOrder(order.id, {
      provider_subscription_id: preapprovalId,
      checkout_url: preapproval.init_point || order.checkout_url || null,
      external_reference: order.external_reference || order.id,
      raw,
    });

    return { ok: true, activated: true, status };
  }

  await updateGoldOrder(order.id, {
    status,
    provider_order_id: preapprovalId,
    provider_subscription_id: preapprovalId,
    checkout_url: preapproval.init_point || order.checkout_url || null,
    external_reference: order.external_reference || order.id,
    raw,
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
