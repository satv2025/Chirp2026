# Chirp Gold · Mercado Pago Suscripciones

Este ZIP cambia Mercado Pago de redirección Checkout Pro a formulario integrado en Chirp usando MercadoPago.js CardForm + API `/preapproval`.

## Archivos clave

- `gold.html`: pantalla Gold con formulario de tarjeta integrado.
- `assets/js/gold-payments.js`: inicializa MercadoPago.js, tokeniza tarjeta y llama al backend.
- `api/payments/mercadopago/public-config.js`: expone Public Key TEST/PROD y plan.
- `api/payments/mercadopago/subscribe.js`: crea suscripción mensual en Mercado Pago.
- `api/payments/mercadopago/webhook.js`: procesa webhooks de pagos y suscripciones.
- `api/_utils/mercadopago.js`: helpers de `/preapproval`, `/v1/payments`, firma webhook.
- `supabase-chirp-gold-subscriptions.sql`: setup SQL por si necesitás reasegurar DB.

## Variables en Vercel

Sensitive:

```env
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
MERCADOPAGO_ACCESS_TOKEN=TEST-...
MERCADOPAGO_WEBHOOK_SECRET=...
```

No sensitive:

```env
PUBLIC_SITE_URL=https://chirp.com.ar
SUPABASE_URL=https://db.chirp.com.ar
MERCADOPAGO_PUBLIC_KEY=TEST-...
MP_GOLD_MONTHLY_PRICE_ARS=7560
MP_GOLD_MONTHLY_CURRENCY=ARS
CHIRP_GOLD_MONTHLY_DAYS=30
```

## Webhook Mercado Pago

URL:

```text
https://chirp.com.ar/api/payments/mercadopago/webhook
```

Eventos recomendados:

- Pagos
- Planes y suscripciones
- Perfil de pago
- Reclamos
- Contracargos

## Prueba

1. Deploy en Vercel.
2. Abrí `/gold` con un usuario logueado de Chirp.
3. En el email del formulario podés usar el email de la cuenta compradora de prueba de MP.
4. Usá tarjeta de prueba aprobada.
5. Verificá en Supabase:

```sql
select id, username, is_chirp_gold, gold_until
from public.profiles
where is_chirp_gold = true
order by gold_until desc;

select *
from public.chirp_gold_orders
order by created_at desc
limit 10;
```


## v5
- Página Gold sin spam técnico en la descripción pública.
- Dropdowns visuales 100% custom en la UI.
- Si la cuenta ya tiene Gold activo, se ocultan promos de compra fuera de la leftbar.


# Chirp Gold · PayPal Subscriptions

Esta versión también incluye PayPal para pagos internacionales con suscripción mensual.

## Archivos PayPal clave

- `api/payments/paypal/subscribe.js`: crea la suscripción y devuelve URL de aprobación.
- `api/payments/paypal/confirm-subscription.js`: confirma la suscripción al volver a Chirp.
- `api/payments/paypal/webhook.js`: procesa activación, pagos, cancelaciones y suspensiones.
- `api/_utils/paypal.js`: helpers de OAuth, Subscriptions y webhooks.

## Variables PayPal en Vercel

Sensitive:

```env
PAYPAL_CLIENT_SECRET=...
PAYPAL_WEBHOOK_ID=WH-...
```

No sensitive:

```env
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=...
PAYPAL_PLAN_ID=P-...
PAYPAL_GOLD_MONTHLY_PRICE_USD=4.99
PAYPAL_GOLD_MONTHLY_CURRENCY=USD
```

## Webhook PayPal

URL:

```text
https://chirp.com.ar/api/payments/paypal/webhook
```

Eventos recomendados:

- `BILLING.SUBSCRIPTION.ACTIVATED`
- `BILLING.SUBSCRIPTION.CANCELLED`
- `BILLING.SUBSCRIPTION.SUSPENDED`
- `BILLING.SUBSCRIPTION.EXPIRED`
- `PAYMENT.SALE.COMPLETED`
- `PAYMENT.SALE.DENIED`
- `PAYMENT.SALE.REFUNDED`
- `PAYMENT.SALE.REVERSED`

## Importante

Para PayPal necesitás crear un plan mensual de suscripción y pegar su ID en Vercel como `PAYPAL_PLAN_ID`. Normalmente empieza con `P-`.


## v9 - Selector de región de compra

La página `/gold` ahora muestra un dropdown 100% custom para elegir desde dónde compra el usuario:

- **Argentina:** muestra el formulario integrado en ARS.
- **Internacional:** muestra el flujo internacional en USD con autopago mensual.

No se usa `<select>` nativo para este selector; es un componente visual custom con `div`/`button`.
