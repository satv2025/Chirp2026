const { sendJson } = require('../../_utils/http.js');
const { mpPublicKey } = require('../../_utils/mercadopago.js');
const { getPlan } = require('../../_utils/plans.js');

module.exports = async function handler(req, res) {
  try {
    const plan = getPlan('gold_monthly');
    return sendJson(res, {
      ok: true,
      public_key: mpPublicKey(),
      locale: 'es-AR',
      plan: {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        amount: plan.mercadopago.amount,
        currency: plan.mercadopago.currency,
      },
    });
  } catch (error) {
    console.error('[Chirp Gold MP public-config]', error);
    return sendJson(res, { error: error.message || 'No pude cargar Mercado Pago.' }, error.statusCode || 500);
  }
};
