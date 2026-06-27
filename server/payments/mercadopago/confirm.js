const { getSupabaseUserFromRequest } = require('../../../api/_utils/auth.js');
const {
  activateGold,
  findGoldOrderById,
  findGoldOrderByProviderOrder,
  updateGoldOrder,
} = require('../../../api/_utils/chirpSupabase.js');
const { sendJson, methodNotAllowed, readJson } = require('../../../api/_utils/http.js');
const { getPayment, getPreapproval } = require('../../../api/_utils/mercadopago.js');
const { getPlan } = require('../../../api/_utils/plans.js');

function clean(value = '') {
  return String(value || '').trim();
}

function cleanUuidLike(value = '') {
  return clean(value).split('?')[0].split('&')[0];
}

function normalizeReturnPayload(body = {}) {
  let orderId = clean(body.order_id || body.orderId || '');
  let preapprovalId = clean(body.preapproval_id || body.preapprovalId || body.preapproval || '');

  // Mercado Pago puede volver como:
  // /gold-return?provider=mercadopago&...&order_id=<uuid>?preapproval_id=<id>
  // Ese segundo ? deja preapproval_id escondido dentro de order_id.
  if (orderId.includes('?')) {
    const [pureOrderId, nestedQuery] = orderId.split('?');
    orderId = pureOrderId;
    const nested = new URLSearchParams(nestedQuery || '');
    preapprovalId = preapprovalId || clean(nested.get('preapproval_id') || nested.get('id') || '');
  }

  return {
    orderId: cleanUuidLike(orderId),
    preapprovalId,
    paymentId: clean(body.payment_id || body.collection_id || body.paymentId || body.collectionId || ''),
    preferenceId: clean(body.preference_id || body.preferenceId || ''),
    status: clean(body.status || body.collection_status || body.result || '').toLowerCase(),
    externalReference: clean(body.external_reference || body.externalReference || ''),
    rawReturn: body,
  };
}

async function tryGetPayment(paymentId) {
  if (!paymentId) return null;
  try {
    return await getPayment(paymentId);
  } catch (error) {
    console.warn('[Chirp Gold MP confirm] No pude leer payment', paymentId, error.message);
    return null;
  }
}

async function tryGetPreapproval(preapprovalId) {
  if (!preapprovalId) return null;
  try {
    return await getPreapproval(preapprovalId);
  } catch (error) {
    console.warn('[Chirp Gold MP confirm] No pude leer preapproval', preapprovalId, error.message);
    return null;
  }
}

async function resolveOrder({ orderId, preapprovalId, payment, preapproval }) {
  const candidates = [];

  if (orderId) candidates.push({ type: 'order_id', value: orderId });
  if (payment?.metadata?.chirp_order_id) candidates.push({ type: 'order_id', value: payment.metadata.chirp_order_id });
  if (payment?.metadata?.order_id) candidates.push({ type: 'order_id', value: payment.metadata.order_id });
  if (preapproval?.external_reference) candidates.push({ type: 'order_id', value: preapproval.external_reference });

  for (const candidate of candidates) {
    const order = await findGoldOrderById(cleanUuidLike(candidate.value));
    if (order) return order;
  }

  const providerCandidates = [
    preapprovalId,
    preapproval?.id,
    preapproval?.preapproval_plan_id,
    payment?.preapproval_id,
    payment?.subscription_id,
    payment?.metadata?.preapproval_id,
    payment?.external_reference,
  ].filter(Boolean).map(clean);

  for (const value of providerCandidates) {
    const order = await findGoldOrderByProviderOrder('mercadopago', value);
    if (order) return order;
  }

  return null;
}

function isApproved({ status, payment, preapproval }) {
  const paymentStatus = String(payment?.status || '').toLowerCase();
  const preapprovalStatus = String(preapproval?.status || '').toLowerCase();

  return (
    status === 'approved' ||
    status === 'authorized' ||
    paymentStatus === 'approved' ||
    preapprovalStatus === 'authorized' ||
    preapprovalStatus === 'approved'
  );
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

    const user = await getSupabaseUserFromRequest(req);
    const input = normalizeReturnPayload(readJson(req));

    let payment = await tryGetPayment(input.paymentId);

    // En Checkout de suscripciones MP suele devolver preapproval_id en external_reference
    // o dentro del order_id mal concatenado.
    let preapprovalId = input.preapprovalId || payment?.preapproval_id || payment?.subscription_id || '';
    if (!preapprovalId && input.externalReference && input.externalReference !== input.orderId) {
      preapprovalId = input.externalReference;
    }
    if (!preapprovalId && payment?.external_reference && payment.external_reference !== input.orderId) {
      preapprovalId = String(payment.external_reference || '');
    }

    let preapproval = await tryGetPreapproval(preapprovalId);

    const order = await resolveOrder({
      orderId: input.orderId,
      preapprovalId,
      payment,
      preapproval,
    });

    if (!order) {
      return sendJson(res, {
        error: 'No encontré la orden Gold para esta vuelta de Mercado Pago.',
        hint: 'Revisá que la URL vuelva con order_id o que el webhook de preapproval_plan_id esté llegando.',
        received: {
          order_id: input.orderId || null,
          preapproval_id: preapprovalId || null,
          payment_id: input.paymentId || null,
          external_reference: input.externalReference || payment?.external_reference || null,
          preference_id: input.preferenceId || null,
        },
      }, 404);
    }

    if (order.user_id !== user.id) {
      return sendJson(res, { error: 'La orden no pertenece al usuario logueado.' }, 403);
    }

    const approved = isApproved({ status: input.status, payment, preapproval });
    const raw = {
      ...(order.raw || {}),
      mercadopago_return_confirm: input.rawReturn,
      mercadopago_confirm_payment: payment || null,
      mercadopago_confirm_preapproval: preapproval || null,
      mercadopago_confirm_preapproval_id: preapprovalId || null,
    };

    if (!approved) {
      await updateGoldOrder(order.id, {
        status: input.status || payment?.status || preapproval?.status || order.status || 'pending',
        provider_payment_id: input.paymentId || order.provider_payment_id || null,
        provider_subscription_id: preapprovalId || order.provider_subscription_id || null,
        raw,
      });

      return sendJson(res, {
        ok: true,
        activated: false,
        status: input.status || payment?.status || preapproval?.status || 'pending',
        order_id: order.id,
      });
    }

    const plan = getPlan(order.plan_id || 'gold_monthly');
    const providerPaymentId = String(payment?.id || input.paymentId || order.provider_payment_id || '');
    const providerOrderId = String(
      preapprovalId ||
      preapproval?.id ||
      preapproval?.preapproval_plan_id ||
      payment?.preapproval_id ||
      payment?.order?.id ||
      order.provider_order_id ||
      input.preferenceId ||
      ''
    );

    await activateGold({
      orderId: order.id,
      userId: order.user_id,
      days: plan.durationDays,
      providerPaymentId,
      providerOrderId,
      status: 'approved',
      raw,
    });

    await updateGoldOrder(order.id, {
      provider_payment_id: providerPaymentId || order.provider_payment_id || null,
      provider_subscription_id: preapprovalId || preapproval?.id || order.provider_subscription_id || null,
      checkout_url: preapproval?.init_point || order.checkout_url || null,
      external_reference: order.external_reference || order.id,
      raw,
    });

    return sendJson(res, {
      ok: true,
      activated: true,
      provider: 'mercadopago',
      order_id: order.id,
      preapproval_id: preapprovalId || preapproval?.id || null,
      payment_id: providerPaymentId || null,
    });
  } catch (error) {
    console.error('[Chirp Gold MP confirm]', error);
    return sendJson(res, {
      error: error.message || 'No pude confirmar Mercado Pago.',
      details: error.details || null,
    }, error.statusCode || 500);
  }
};
