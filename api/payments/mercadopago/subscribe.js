const crypto = require('node:crypto');
const { getSupabaseUserFromRequest } = require('../../_utils/auth.js');
const { createGoldOrder, updateGoldOrder, activateGold } = require('../../_utils/chirpSupabase.js');
const { sendJson, methodNotAllowed, readJson, siteUrl } = require('../../_utils/http.js');
const { createPreapproval } = require('../../_utils/mercadopago.js');
const { getPlan } = require('../../_utils/plans.js');

function isoNowPlusMinutes(minutes = 2) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

    const user = await getSupabaseUserFromRequest(req);
    const body = readJson(req);
    const plan = getPlan(body.plan_id || 'gold_monthly');

    const cardTokenId = body.card_token_id || body.token || '';
    if (!cardTokenId) {
      return sendJson(res, { error: 'Falta el token seguro de tarjeta.' }, 400);
    }

    const payerEmail = body.payer_email || body.email || user.email || '';
    if (!payerEmail) {
      return sendJson(res, { error: 'Falta email del pagador.' }, 400);
    }

    const amount = Number(plan.mercadopago.amount);
    const currency = plan.mercadopago.currency || 'ARS';
    if (!Number.isFinite(amount) || amount <= 0) {
      return sendJson(res, { error: 'El monto del plan de pago es inválido.' }, 400);
    }

    const order = await createGoldOrder({
      userId: user.id,
      provider: 'mercadopago',
      plan,
      amount,
      currency,
    });

    const base = siteUrl();
    const payload = {
      reason: plan.name || 'Chirp Gold mensual',
      external_reference: order.id,
      payer_email: payerEmail,
      card_token_id: cardTokenId,
      back_url: `${base}/gold-return?provider=mercadopago&result=success&order_id=${order.id}`,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        start_date: isoNowPlusMinutes(2),
        transaction_amount: amount,
        currency_id: currency,
      },
      status: 'authorized',
    };

    const idempotencyKey = crypto.randomUUID();
    const preapproval = await createPreapproval(payload, idempotencyKey);
    const preapprovalId = preapproval?.id || preapproval?.preapproval_id || '';
    const status = preapproval?.status || 'authorized';

    await updateGoldOrder(order.id, {
      provider_order_id: preapprovalId || null,
      external_reference: order.id,
      checkout_url: preapproval?.init_point || null,
      status,
      raw: {
        create_preapproval: preapproval,
        preapproval_payload_safe: {
          ...payload,
          card_token_id: '[redacted]',
        },
      },
    });

    // En suscripciones autorizadas, Mercado Pago valida la tarjeta y el primer cobro puede demorar.
    // Chirp activa el primer período inmediatamente; los pagos mensuales futuros renuevan por webhook.
    if (String(status).toLowerCase() === 'authorized' || String(status).toLowerCase() === 'pending') {
      await activateGold({
        orderId: order.id,
        userId: user.id,
        days: plan.durationDays,
        providerPaymentId: preapprovalId ? `preapproval:${preapprovalId}:start` : `preapproval:${order.id}:start`,
        providerOrderId: preapprovalId || order.id,
        status: 'approved',
        raw: { mercadopago_preapproval: preapproval },
      });
    }

    return sendJson(res, {
      ok: true,
      provider: 'mercadopago',
      order_id: order.id,
      preapproval_id: preapprovalId,
      status,
      gold_activated: String(status).toLowerCase() === 'authorized' || String(status).toLowerCase() === 'pending',
    });
  } catch (error) {
    console.error('[Chirp Gold MP subscribe]', error);
    return sendJson(
      res,
      {
        error: error.message || 'No pude crear la suscripción.',
        details: error.details || null,
      },
      error.statusCode || 500
    );
  }
};
