// ChirpCheck Gold · Crear plan Mercado Pago (opcional)
// Uso CMD:
//   set MERCADOPAGO_ACCESS_TOKEN=TEST-... 
//   node tools/create-mp-gold-plan.mjs
// Uso PowerShell:
//   $env:MERCADOPAGO_ACCESS_TOKEN="TEST-..."
//   node tools/create-mp-gold-plan.mjs

const ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const SITE_URL = (process.env.PUBLIC_SITE_URL || 'https://chirp.com.ar').replace(/\/+$/, '');
const AMOUNT = Number(process.env.MP_GOLD_MONTHLY_PRICE_ARS || process.env.MP_GOLD_MONTHLY_PRICE || 7560);
const CURRENCY = process.env.MP_GOLD_MONTHLY_CURRENCY || 'ARS';

if (!ACCESS_TOKEN) {
  console.error('Falta MERCADOPAGO_ACCESS_TOKEN. Usá TEST-... para prueba o APP_USR-... para producción.');
  process.exit(1);
}

if (!Number.isFinite(AMOUNT) || AMOUNT <= 0) {
  console.error('Monto inválido. Revisá MP_GOLD_MONTHLY_PRICE_ARS.');
  process.exit(1);
}

const isTest = ACCESS_TOKEN.startsWith('TEST-');
const headers = {
  Authorization: `Bearer ${ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
  ...(isTest ? { 'X-scope': 'stage' } : {}),
};

const payload = {
  reason: 'ChirpCheck Gold Mensual',
  auto_recurring: {
    frequency: 1,
    frequency_type: 'months',
    transaction_amount: AMOUNT,
    currency_id: CURRENCY,
  },
  back_url: `${SITE_URL}/gold-return?provider=mercadopago`,
};

const response = await fetch('https://api.mercadopago.com/preapproval_plan', {
  method: 'POST',
  headers,
  body: JSON.stringify(payload),
});

const data = await response.json().catch(() => ({}));

if (!response.ok) {
  console.error('ERROR Mercado Pago:', JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log('✅ PLAN MERCADO PAGO CREADO');
console.log(`Modo: ${isTest ? 'TEST' : 'PRODUCCIÓN'}`);
console.log(`MP_PREAPPROVAL_PLAN_ID=${data.id}`);
console.log('');
console.log('Pegá ese ID en Vercel si querés usar plan asociado. Si no lo pegás, Chirp usa suscripción sin plan asociado.');
