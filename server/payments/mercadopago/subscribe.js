const crypto = require('node:crypto');
const { getSupabaseUserFromRequest } = require('../../../api/_utils/auth.js');
const { createGoldOrder, updateGoldOrder, activateGold } = require('../../../api/_utils/chirpSupabase.js');
const { sendJson, methodNotAllowed, readJson, siteUrl } = require('../../../api/_utils/http.js');
const { createPreapproval, mpMode, assertMpCredentialPair } = require('../../../api/_utils/mercadopago.js');
const { getPlan } = require('../../../api/_utils/plans.js');

function isoNowPlusMinutes(minutes = 2) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function safeMpDetails(error) {
  const details = error.details || null;
  if (!details) return null;
  return details;
}

function mpFriendlyMessage(error) {
  const raw = JSON.stringify(error.details || {}) + ' ' + (error.message || '');
  if (raw.includes('CC_VAL_433')) {
    return 'La tarjeta no pasó la validación de Mercado Pago. En modo prueba usá una tarjeta TEST válida, vencimiento futuro, CVV correcto y documento del comprador de prueba.';
  }
  if (/invalid.*access|unauthorized|401/i.test(raw)) {
    return 'Mercado Pago rechazó las credenciales. Revisá que Public Key y Access Token sean ambos TEST o ambos producción.';
  }
  if (/card_token/i.test(raw)) {
    return 'Mercado Pago rechazó el token de tarjeta. Generá el token con la Public Key del mismo ambiente que el Access Token.';
  }
  return error.message || 'No pude crear la suscripción en Mercado Pago.';
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

    assertMpCredentialPair();
    const user = await getSupabaseUserFromRequest(req);
    const body = readJson(req);
    const plan = getPlan(body.plan_id || 'gold_monthly');

    const cardTokenId = String(body.card_token_id || body.token || '').trim();
    if (!cardTokenId) {
      return sendJson(res, { error: 'Falta el token seguro de tarjeta.' }, 400);
    }

    const payerEmail = String(body.payer_email || body.email || user.email || '').trim();
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
    const preapprovalPlanId = String(process.env.MP_PREAPPROVAL_PLAN_ID || '').trim();
    const payload = {
      ...(preapprovalPlanId ? { preapproval_plan_id: preapprovalPlanId } : {}),
      reason: plan.name || 'ChirpCheck Gold mensual',
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
    let preapproval;
    try {
      preapproval = await createPreapproval(payload, idempotencyKey);
    } catch (error) {
      await updateGoldOrder(order.id, {
        status: 'failed',
        raw: {
          mercadopago_error: safeMpDetails(error),
          mercadopago_message: error.message || null,
          preapproval_payload_safe: {
            ...payload,
            card_token_id: '[redacted]',
          },
        },
      });
      return sendJson(res, {
        error: mpFriendlyMessage(error),
        details: safeMpDetails(error),
      }, error.statusCode || 500);
    }

    const preapprovalId = preapproval?.id || preapproval?.preapproval_id || '';
    const status = String(preapproval?.status || 'authorized').toLowerCase();

    await updateGoldOrder(order.id, {
      provider_order_id: preapprovalId || null,
      provider_subscription_id: preapprovalId || null,
      external_reference: order.id,
      checkout_url: preapproval?.init_point || null,
      status,
      raw: {
        create_preapproval: preapproval,
        mercadopago_mode: mpMode(),
        preapproval_payload_safe: {
          ...payload,
          card_token_id: '[redacted]',
        },
      },
    });

    // Mercado Pago valida la tarjeta al crear la suscripción. La primera cuota puede entrar unos minutos después.
    // Para que Chirp se sienta instantáneo, activamos el primer período cuando la suscripción queda authorized/pending.
    const canActivateNow = ['authorized', 'pending'].includes(status);
    if (canActivateNow) {
      await activateGold({
        orderId: order.id,
        userId: user.id,
        days: plan.durationDays,
        providerPaymentId: preapprovalId ? `preapproval:${preapprovalId}:start` : `preapproval:${order.id}:start`,
        providerOrderId: preapprovalId || order.id,
        status: 'approved',
        raw: { mercadopago_preapproval: preapproval, mercadopago_mode: mpMode() },
      });
    }

    return sendJson(res, {
      ok: true,
      provider: 'mercadopago',
      mode: mpMode(),
      order_id: order.id,
      preapproval_id: preapprovalId,
      status,
      gold_activated: canActivateNow,
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
