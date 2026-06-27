const { getSupabaseUserFromRequest } = require('../../_utils/auth.js');
const { createGoldOrder, updateGoldOrder } = require('../../_utils/chirpSupabase.js');
const { sendJson, methodNotAllowed, readJson, siteUrl } = require('../../_utils/http.js');
const { createPreference } = require('../../_utils/mercadopago.js');
const { getPlan } = require('../../_utils/plans.js');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

    const user = await getSupabaseUserFromRequest(req);
    const body = readJson(req);
    const plan = getPlan(body.plan_id || 'gold_monthly');
    const amount = plan.mercadopago.amount;
    const currency = plan.mercadopago.currency;
    const order = await createGoldOrder({ userId: user.id, provider: 'mercadopago', plan, amount, currency });

    const base = siteUrl();
    const preference = await createPreference({
      items: [
        {
          id: plan.id,
          title: plan.name,
          description: plan.description,
          quantity: 1,
          currency_id: currency,
          unit_price: amount,
        },
      ],
      payer: { email: user.email || undefined },
      external_reference: order.id,
      metadata: {
        chirp_order_id: order.id,
        user_id: user.id,
        plan_id: plan.id,
      },
      back_urls: {
        success: `${base}/gold-return.html?provider=mercadopago&result=success&order_id=${order.id}`,
        failure: `${base}/gold-return.html?provider=mercadopago&result=failure&order_id=${order.id}`,
        pending: `${base}/gold-return.html?provider=mercadopago&result=pending&order_id=${order.id}`,
      },
      auto_return: 'approved',
      notification_url: `${base}/api/payments/mercadopago/webhook`,
      statement_descriptor: 'CHIRP GOLD',
    });

    await updateGoldOrder(order.id, {
      provider_order_id: preference.id || null,
      provider_preference_id: preference.id || null,
      checkout_url: preference.init_point || preference.sandbox_init_point || null,
      external_reference: order.id,
      raw: { create_preference: preference },
    });

    return sendJson(res, {
      ok: true,
      provider: 'mercadopago',
      order_id: order.id,
      preference_id: preference.id,
      init_point: preference.init_point,
      sandbox_init_point: preference.sandbox_init_point,
    });
  } catch (error) {
    console.error('[Chirp Gold MP create]', error);
    return sendJson(res, { error: error.message || 'No pude crear el pago de Mercado Pago.', details: error.details || null }, error.statusCode || 500);
  }
};
