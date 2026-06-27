const { getSupabaseUserFromRequest } = require('../../../api/_utils/auth.js');
const { createGoldOrder, updateGoldOrder } = require('../../../api/_utils/chirpSupabase.js');
const { sendJson, methodNotAllowed, readJson, siteUrl } = require('../../../api/_utils/http.js');
const { createPaypalOrder } = require('../../../api/_utils/paypal.js');
const { getPlan, moneyValue } = require('../../../api/_utils/plans.js');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

    const user = await getSupabaseUserFromRequest(req);
    const body = readJson(req);
    const plan = getPlan(body.plan_id || 'gold_monthly');
    const amount = moneyValue(plan.paypal.amount);
    const currency = plan.paypal.currency;
    const order = await createGoldOrder({ userId: user.id, provider: 'paypal', plan, amount: Number(amount), currency });

    const base = siteUrl();
    const paypalOrder = await createPaypalOrder({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: order.id,
          custom_id: order.id,
          description: plan.description,
          amount: {
            currency_code: currency,
            value: amount,
          },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: 'Chirp',
            user_action: 'PAY_NOW',
            shipping_preference: 'NO_SHIPPING',
            return_url: `${base}/gold-return.html?provider=paypal&order_id=${order.id}`,
            cancel_url: `${base}/gold-return.html?provider=paypal&result=cancelled&order_id=${order.id}`,
          },
        },
      },
    });

    const approveUrl = (paypalOrder.links || []).find((link) => link.rel === 'payer-action' || link.rel === 'approve')?.href || '';

    await updateGoldOrder(order.id, {
      provider_order_id: paypalOrder.id,
      checkout_url: approveUrl,
      external_reference: order.id,
      raw: { create_order: paypalOrder },
    });

    return sendJson(res, {
      ok: true,
      provider: 'paypal',
      order_id: order.id,
      paypal_order_id: paypalOrder.id,
      approve_url: approveUrl,
    });
  } catch (error) {
    console.error('[Chirp Gold PayPal create]', error);
    return sendJson(res, { error: error.message || 'No pude crear la orden de PayPal.', details: error.details || null }, error.statusCode || 500);
  }
};
