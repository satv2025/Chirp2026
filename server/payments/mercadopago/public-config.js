const { sendJson } = require('../../../api/_utils/http.js');
const { mpMode, assertMpCredentialPair } = require('../../../api/_utils/mercadopago.js');
const { getPlan } = require('../../../api/_utils/plans.js');

module.exports = async function handler(req, res) {
  try {
    assertMpCredentialPair();
    const publicKey = process.env.MERCADOPAGO_PUBLIC_KEY || '';
    const plan = getPlan('gold_monthly');
    const mode = mpMode();

    return sendJson(res, {
      ok: true,
      provider: 'mercadopago',
      mode,
      public_key: publicKey,
      locale: 'es-AR',
      checkout_flow: 'preapproval_plan_hosted',
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
    return sendJson(res, { error: error.message || 'No pude cargar el módulo de pago.' }, error.statusCode || 500);
  }
};
