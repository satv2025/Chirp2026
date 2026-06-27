const { sendJson } = require('../../_utils/http.js');
const { mpPublicKey, mpMode, assertMpCredentialPair } = require('../../_utils/mercadopago.js');
const { getPlan } = require('../../_utils/plans.js');

module.exports = async function handler(req, res) {
  try {
    assertMpCredentialPair();
    const publicKey = mpPublicKey();
    const plan = getPlan('gold_monthly');
    const mode = mpMode();

    return sendJson(res, {
      ok: true,
      provider: 'mercadopago',
      mode,
      public_key: publicKey,
      locale: 'es-AR',
      using_preapproval_plan: Boolean(process.env.MP_PREAPPROVAL_PLAN_ID),
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
