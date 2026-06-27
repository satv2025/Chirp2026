const DEFAULT_MONTHLY_DAYS = 30;

const PLANS = {
  gold_monthly: {
    id: 'gold_monthly',
    name: 'Chirp Gold mensual',
    description: 'Acceso a Chirp Gold por 30 días.',
    durationDays: Number(process.env.CHIRP_GOLD_MONTHLY_DAYS || DEFAULT_MONTHLY_DAYS),
    mercadopago: {
      currency: process.env.MP_GOLD_MONTHLY_CURRENCY || 'ARS',
      amount: Number(process.env.MP_GOLD_MONTHLY_PRICE || process.env.MP_GOLD_MONTHLY_PRICE_ARS || 3490),
    },
    paypal: {
      currency: process.env.PAYPAL_GOLD_MONTHLY_CURRENCY || 'USD',
      amount: Number(process.env.PAYPAL_GOLD_MONTHLY_PRICE || process.env.PAYPAL_GOLD_MONTHLY_PRICE_USD || 4.99),
    },
  },
};

function getPlan(planId = 'gold_monthly') {
  return PLANS[planId] || PLANS.gold_monthly;
}

function moneyValue(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return '0.00';
  return n.toFixed(2);
}

module.exports = { PLANS, getPlan, moneyValue };
