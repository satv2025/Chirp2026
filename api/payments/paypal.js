const capture = require('../../server/payments/paypal/capture.js');
const confirmSubscription = require('../../server/payments/paypal/confirm-subscription.js');
const create = require('../../server/payments/paypal/create.js');
const prepareSubscription = require('../../server/payments/paypal/prepare-subscription.js');
const publicConfig = require('../../server/payments/paypal/public-config.js');
const subscribe = require('../../server/payments/paypal/subscribe.js');
const webhook = require('../../server/payments/paypal/webhook.js');
const { sendJson } = require('../_utils/http.js');

const handlers = {
  capture,
  'confirm-subscription': confirmSubscription,
  create,
  'prepare-subscription': prepareSubscription,
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
  return last === 'paypal' ? '' : last;
}

module.exports = async function handler(req, res) {
  const action = actionFromRequest(req);
  const selected = handlers[action];

  if (!selected) {
    return sendJson(res, {
      error: 'Acción PayPal no encontrada.',
      action: action || null,
      available: Object.keys(handlers),
    }, 404);
  }

  return selected(req, res);
};
