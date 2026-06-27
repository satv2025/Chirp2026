const checkout = require('../../server/payments/mercadopago/checkout.js');
const confirm = require('../../server/payments/mercadopago/confirm.js');
const create = require('../../server/payments/mercadopago/create.js');
const publicConfig = require('../../server/payments/mercadopago/public-config.js');
const subscribe = require('../../server/payments/mercadopago/subscribe.js');
const webhook = require('../../server/payments/mercadopago/webhook.js');
const { sendJson } = require('../_utils/http.js');

const handlers = {
  checkout,
  confirm,
  create,
  'public-config': publicConfig,
  subscribe,
  webhook,
};

function actionFromRequest(req) {
  const queryAction = req.query?.action;
  if (Array.isArray(queryAction)) return queryAction[0];
  if (queryAction) return String(queryAction);

  const url = new URL(req.url || '/', 'https://chirp.local');
  const parts = url.pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  return last === 'mercadopago' ? '' : last;
}

module.exports = async function handler(req, res) {
  const action = actionFromRequest(req);
  const selected = handlers[action];

  if (!selected) {
    return sendJson(res, {
      error: 'Acción Mercado Pago no encontrada.',
      action: action || null,
      available: Object.keys(handlers),
    }, 404);
  }

  return selected(req, res);
};
