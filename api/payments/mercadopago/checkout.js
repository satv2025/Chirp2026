const crypto = require('node:crypto');
const { getSupabaseUserFromRequest } = require('../../_utils/auth.js');
const { createGoldOrder, updateGoldOrder } = require('../../_utils/chirpSupabase.js');
const { sendJson, methodNotAllowed, readJson, siteUrl } = require('../../_utils/http.js');
const { createPreapprovalPlan, mpMode, assertMpCredentialPair } = require('../../_utils/mercadopago.js');
const { getPlan } = require('../../_utils/plans.js');

function mpFriendlyMessage(error) {
  const raw = JSON.stringify(error.details || {}) + ' ' + (error.message || '');
  if (/invalid.*access|invalid_token|401/i.test(raw)) {
    return 'Mercado Pago rechazó el Access Token. Revisá MERCADOPAGO_ACCESS_TOKEN.';
  }
  if (/403|forbidden|policy|unauthorized/i.test(raw)) {
    return 'Mercado Pago bloqueó la creación del plan hosted. Revisá que el Access Token sea TEST válido y que la app tenga habilitadas suscripciones.';
  }
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

    // Checkout oficial de Mercado Pago para suscripciones SIN pedir email en Chirp.
    // Creamos un plan dinámico por orden y redirigimos al init_point:
    // Mercado Pago se encarga del login, email y medio de pago del comprador.
    const payload = {
      reason: `${plan.name || 'ChirpCheck Gold'} · ${String(order.id).slice(0, 8)}`,
      external_reference: order.id,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: amount,
        currency_id: currency,
      },
      payment_methods_allowed: {
        payment_types: [{}],
        payment_methods: [{}],
      },
      back_url: `${base}/gold-return?provider=mercadopago&result=pending&order_id=${order.id}`,
    };

    let preapprovalPlan;
    try {
      preapprovalPlan = await createPreapprovalPlan(payload, crypto.randomUUID());
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

    const preapprovalPlanId = preapprovalPlan?.id || preapprovalPlan?.preapproval_plan_id || '';
    const initPoint = preapprovalPlan?.init_point || preapprovalPlan?.sandbox_init_point || '';

    await updateGoldOrder(order.id, {
      provider_order_id: preapprovalPlanId || null,
      provider_subscription_id: null,
      external_reference: order.id,
      checkout_url: initPoint || null,
      status: String(preapprovalPlan?.status || 'pending').toLowerCase(),
      raw: {
        create_checkout_preapproval_plan: preapprovalPlan,
        mercadopago_mode: mpMode(),
        checkout_payload_safe: payload,
      },
    });

    if (!initPoint) {
      return sendJson(res, {
        error: 'Mercado Pago creó el plan pero no devolvió init_point.',
        details: preapprovalPlan || null,
      }, 500);
    }

    return sendJson(res, {
      ok: true,
      provider: 'mercadopago',
      mode: mpMode(),
      order_id: order.id,
      preapproval_plan_id: preapprovalPlanId,
      status: String(preapprovalPlan?.status || 'pending').toLowerCase(),
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
