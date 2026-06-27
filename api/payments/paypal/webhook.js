const {
  activateGold,
  findGoldOrderById,
  findGoldOrderByProviderOrder,
  updateGoldOrder,
  setProfileGold,
} = require('../../_utils/chirpSupabase.js');
const { sendJson, methodNotAllowed, readJson } = require('../../_utils/http.js');
const { verifyPaypalWebhook } = require('../../_utils/paypal.js');
const { getPlan } = require('../../_utils/plans.js');

function normalizedStatus(eventType = '') {
  const type = String(eventType || '').toUpperCase();
  if (type.includes('CANCELLED') || type.includes('EXPIRED')) return 'cancelled';
  if (type.includes('REFUNDED')) return 'refunded';
  if (type.includes('REVERSED')) return 'charged_back';
  if (type.includes('DENIED')) return 'rejected';
  if (type.includes('SUSPENDED')) return 'failed';
  return 'failed';
}

async function findOrderFromSubscriptionResource(resource = {}) {
  const customId = resource.custom_id || resource.custom || resource.invoice_id || '';
  const subscriptionId = resource.id || resource.billing_agreement_id || resource.subscription_id || '';

  let order = customId ? await findGoldOrderById(customId) : null;
  if (!order && subscriptionId) order = await findGoldOrderByProviderOrder('paypal', subscriptionId);
  return order;
}

async function activateFromOrder(order, eventType, resource, body) {
  const plan = getPlan(order.plan_id || 'gold_monthly');
  await activateGold({
    orderId: order.id,
    userId: order.user_id,
    days: plan.durationDays,
    providerPaymentId: resource.id || resource.billing_agreement_id || resource.subscription_id || '',
    providerOrderId: resource.id || resource.billing_agreement_id || resource.subscription_id || order.provider_order_id || '',
    status: eventType === 'BILLING.SUBSCRIPTION.ACTIVATED' ? 'approved' : 'approved',
    raw: { paypal_webhook: body },
  });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

    const body = readJson(req);
    const verification = await verifyPaypalWebhook(req, body);
    if (!verification.ok) return sendJson(res, { error: 'Firma PayPal inválida.' }, 401);

    const eventType = body.event_type || '';
    const resource = body.resource || {};

    if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED') {
      const order = await findOrderFromSubscriptionResource(resource);
      if (order) {
        await updateGoldOrder(order.id, {
          provider_order_id: resource.id || order.provider_order_id || null,
          provider_subscription_id: resource.id || order.provider_subscription_id || null,
          status: 'approved',
          raw: { paypal_webhook: body },
        });
        await activateFromOrder(order, eventType, resource, body);
      }
    }

    if (eventType === 'PAYMENT.SALE.COMPLETED' || eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      const capture = resource;
      const orderId = capture.custom_id || capture.invoice_id || '';
      const subscriptionId = capture.billing_agreement_id || capture.subscription_id || capture.supplementary_data?.related_ids?.order_id || '';
      let order = orderId ? await findGoldOrderById(orderId) : null;
      if (!order && subscriptionId) order = await findGoldOrderByProviderOrder('paypal', subscriptionId);

      if (order) {
        const plan = getPlan(order.plan_id || 'gold_monthly');
        await activateGold({
          orderId: order.id,
          userId: order.user_id,
          days: plan.durationDays,
          providerPaymentId: capture.id || '',
          providerOrderId: subscriptionId || order.provider_order_id || '',
          status: 'approved',
          raw: { paypal_webhook: body },
        });
      }
    }

    if ([
      'BILLING.SUBSCRIPTION.CANCELLED',
      'BILLING.SUBSCRIPTION.SUSPENDED',
      'BILLING.SUBSCRIPTION.EXPIRED',
      'PAYMENT.SALE.DENIED',
      'PAYMENT.SALE.REFUNDED',
      'PAYMENT.SALE.REVERSED',
      'PAYMENT.CAPTURE.REFUNDED',
      'PAYMENT.CAPTURE.REVERSED',
      'PAYMENT.CAPTURE.DENIED',
    ].includes(eventType)) {
      const order = await findOrderFromSubscriptionResource(resource);
      if (order) {
        await updateGoldOrder(order.id, {
          status: normalizedStatus(eventType),
          provider_payment_id: resource.id || order.provider_payment_id || null,
          raw: { paypal_webhook: body },
        });

        if (eventType.startsWith('BILLING.SUBSCRIPTION.')) {
          await setProfileGold(order.user_id, false, null);
        }
      }
    }

    return sendJson(res, { ok: true });
  } catch (error) {
    console.error('[Chirp Gold PayPal webhook]', error);
    return sendJson(res, {
      error: error.message || 'No pude procesar el webhook de PayPal.',
      details: error.details || null,
    }, error.statusCode || 500);
  }
};
