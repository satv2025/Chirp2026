const crypto = require('node:crypto');
const { getSupabaseUserFromRequest } = require('../../_utils/auth.js');
const { createGoldOrder, updateGoldOrder } = require('../../_utils/chirpSupabase.js');
const { sendJson, methodNotAllowed, readJson, siteUrl } = require('../../_utils/http.js');
const { createPreapproval, mpMode, assertMpCredentialPair } = require('../../_utils/mercadopago.js');
const { getPlan } = require('../../_utils/plans.js');

function mpFriendlyMessage(error) {
  const raw = JSON.stringify(error.details || {}) + ' ' + (error.message || '');
  if (/invalid.*access|unauthorized|401/i.test(raw)) {
    return 'Mercado Pago rechazó las credenciales. Revisá que MERCADOPAGO_PUBLIC_KEY y MERCADOPAGO_ACCESS_TOKEN sean ambos TEST o ambos producción.';
  }
  if (/payer_email/i.test(raw)) return 'Mercado Pago rechazó el email del comprador.';
  if (/back_url/i.test(raw)) return 'Mercado Pago rechazó la URL de regreso. Revisá PUBLIC_SITE_URL.';
  return error.message || 'No pude crear el checkout de Mercado Pago.';
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

    assertMpCredentialPair();
    const user = await getSupabaseUserFromRequest(req);
    const body = readJson(req);
    const plan = getPlan(body.plan_id || 'gold_monthly');

    const payerEmail = String(body.payer_email || body.email || user.email || '').trim();
    if (!payerEmail) return sendJson(res, { error: 'Falta email del comprador.' }, 400);

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

    // Checkout oficial de Mercado Pago para suscripciones.
    // Usamos modelo pending: el comprador elige el medio de pago en Mercado Pago.
    // No mandamos card_token_id porque Chirp no quiere formulario de tarjeta propio.
    const payload = {
      reason: plan.name || 'ChirpCheck Gold mensual',
      external_reference: order.id,
      payer_email: payerEmail,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: amount,
        currency_id: currency,
      },
      back_url: `${base}/gold-return?provider=mercadopago&result=pending&order_id=${order.id}`,
      status: 'pending',
    };

    let preapproval;
    try {
      preapproval = await createPreapproval(payload, crypto.randomUUID());
    } catch (error) {
      await updateGoldOrder(order.id, {
        status: 'failed',
        raw: {
          mercadopago_error: error.details || null,
          mercadopago_message: error.message || null,
          checkout_payload_safe: payload,
        },
      });
      return sendJson(res, {
        error: mpFriendlyMessage(error),
        details: error.details || null,
      }, error.statusCode || 500);
    }

    const preapprovalId = preapproval?.id || preapproval?.preapproval_id || '';
    const initPoint = preapproval?.init_point || preapproval?.sandbox_init_point || '';

    await updateGoldOrder(order.id, {
      provider_order_id: preapprovalId || null,
      provider_subscription_id: preapprovalId || null,
      external_reference: order.id,
      checkout_url: initPoint || null,
      status: String(preapproval?.status || 'pending').toLowerCase(),
      raw: {
        create_checkout_preapproval: preapproval,
        mercadopago_mode: mpMode(),
        checkout_payload_safe: payload,
      },
    });

    if (!initPoint) {
      return sendJson(res, {
        error: 'Mercado Pago creó la suscripción pero no devolvió init_point.',
        details: preapproval || null,
      }, 500);
    }

    return sendJson(res, {
      ok: true,
      provider: 'mercadopago',
      mode: mpMode(),
      order_id: order.id,
      preapproval_id: preapprovalId,
      status: String(preapproval?.status || 'pending').toLowerCase(),
      init_point: initPoint,
      checkout_url: initPoint,
    });
  } catch (error) {
    console.error('[Chirp Gold MP checkout]', error);
    return sendJson(res, {
      error: error.message || 'No pude crear el checkout de Mercado Pago.',
      details: error.details || null,
    }, error.statusCode || 500);
  }
};
