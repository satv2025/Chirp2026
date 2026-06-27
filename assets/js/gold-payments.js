(() => {
  const CFG = window.CHIRP;
  const sb = window.__chirpSupabaseClient || (window.__chirpSupabaseClient = window.supabase?.createClient(
    CFG?.SUPABASE_URL,
    CFG?.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  ));

  const $ = (q, root = document) => root.querySelector(q);
  const params = new URLSearchParams(location.search);
  const page = document.body.dataset.page;

  function setStatus(message, type = '') {
    const box = $('#goldStatus');
    if (!box) return;
    box.textContent = message;
    box.classList.toggle('is-ok', type === 'ok');
    box.classList.toggle('is-error', type === 'error');
  }

  function setLoading(isLoading, message = '') {
    const form = $('#form-checkout');
    const submit = $('#form-checkout__submit');
    const progress = $('#goldProgress');

    form?.classList.toggle('is-loading', Boolean(isLoading));
    progress?.classList.toggle('is-loading', Boolean(isLoading));
    if (submit) submit.disabled = Boolean(isLoading);
    if (message) setStatus(message);
  }

  async function sessionOrRedirect() {
    const { data } = await sb.auth.getSession();
    const session = data?.session;
    if (!session?.access_token) {
      location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
      return null;
    }
    return session;
  }

  async function fetchProfile(userId) {
    const { data, error } = await sb
      .from('profiles')
      .select('is_chirp_gold, gold_until, display_name, username')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  function isGoldActive(profile) {
    if (!profile?.is_chirp_gold) return false;
    if (!profile.gold_until) return true;
    return new Date(profile.gold_until).getTime() > Date.now();
  }

  function goldUntilLabel(profile) {
    if (!profile?.gold_until) return 'Gold activo.';
    return `Gold activo hasta ${new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(profile.gold_until))}.`;
  }

  async function postPayment(url, payload, session) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload || {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = data.details?.message || data.error || `Error ${response.status}`;
      const err = new Error(msg);
      err.details = data.details || null;
      throw err;
    }
    return data;
  }

  async function getMpConfig() {
    const response = await fetch('/api/payments/mercadopago/public-config', { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No pude cargar la configuración pública de Mercado Pago.');
    if (!data.public_key) throw new Error('Falta MERCADOPAGO_PUBLIC_KEY en Vercel.');
    return data;
  }

  function updatePriceLabels(mpConfig) {
    const plan = mpConfig?.plan || {};
    const amount = Number(plan.amount || 0);
    const currency = plan.currency || 'ARS';
    const label = amount
      ? new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
      : 'ARS $3.490';

    document.querySelectorAll('[data-mp-price]').forEach((node) => {
      node.textContent = label;
    });
  }



  function bindGoldCtas() {
    document.querySelectorAll('[data-gold-scroll]').forEach((button) => {
      button.addEventListener('click', () => {
        const checkout = $('#goldCheckout') || $('#form-checkout');
        checkout?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.setTimeout(() => {
          $('#form-checkout__cardholderName')?.focus({ preventScroll: true });
        }, 450);
      });
    });
  }

  function prefillEmail(session) {
    const email = session?.user?.email || '';
    const input = $('#form-checkout__cardholderEmail');
    if (input && !input.value) input.value = email;
  }

  function initMercadoPagoCardForm(mpConfig, session) {
    const form = $('#form-checkout');
    if (!form) return;

    if (!window.MercadoPago) {
      setStatus('No cargó MercadoPago.js. Revisá la conexión o el bloqueador.', 'error');
      return;
    }

    const amount = String(mpConfig.plan?.amount || 3490);
    const publicKey = mpConfig.public_key;
    const mp = new window.MercadoPago(publicKey, { locale: mpConfig.locale || 'es-AR' });

    const cardForm = mp.cardForm({
      amount,
      iframe: true,
      form: {
        id: 'form-checkout',
        cardNumber: {
          id: 'form-checkout__cardNumber',
          placeholder: 'Número de tarjeta',
        },
        expirationDate: {
          id: 'form-checkout__expirationDate',
          placeholder: 'MM/AA',
        },
        securityCode: {
          id: 'form-checkout__securityCode',
          placeholder: 'Código',
        },
        cardholderName: {
          id: 'form-checkout__cardholderName',
          placeholder: 'Titular de la tarjeta',
        },
        issuer: {
          id: 'form-checkout__issuer',
          placeholder: 'Banco emisor',
        },
        installments: {
          id: 'form-checkout__installments',
          placeholder: 'Cuotas',
        },
        identificationType: {
          id: 'form-checkout__identificationType',
          placeholder: 'Tipo de documento',
        },
        identificationNumber: {
          id: 'form-checkout__identificationNumber',
          placeholder: 'Número de documento',
        },
        cardholderEmail: {
          id: 'form-checkout__cardholderEmail',
          placeholder: 'E-mail',
        },
      },
      callbacks: {
        onFormMounted: (error) => {
          if (error) {
            console.warn('[Chirp Gold MP] form mount error:', error);
            setStatus('No pude montar el formulario de Mercado Pago.', 'error');
            return;
          }
          setStatus('Completá los datos para activar Chirp Gold con autopago mensual.');
        },
        onSubmit: async (event) => {
          event.preventDefault();
          setLoading(true, 'Tokenizando tarjeta de forma segura...');

          try {
            const formData = cardForm.getCardFormData();
            const token = formData.token;
            const payerEmail = formData.cardholderEmail || $('#form-checkout__cardholderEmail')?.value || session.user.email;

            if (!token) throw new Error('Mercado Pago no generó el token de tarjeta. Revisá los datos.');
            if (!payerEmail) throw new Error('Falta el email del pagador.');

            setStatus('Creando suscripción Chirp Gold...');
            const data = await postPayment('/api/payments/mercadopago/subscribe', {
              plan_id: 'gold_monthly',
              card_token_id: token,
              payer_email: payerEmail,
              payment_method_id: formData.paymentMethodId,
              issuer_id: formData.issuerId,
              identification: {
                type: formData.identificationType,
                number: formData.identificationNumber,
              },
            }, session);

            if (!data.ok) throw new Error('Mercado Pago no confirmó la suscripción.');

            const profile = await waitForGold(session, 6);
            if (profile) {
              setStatus(`¡Chirp Gold activado! ${goldUntilLabel(profile)}`, 'ok');
            } else {
              setStatus('Suscripción creada. La activación puede tardar unos segundos; refrescá tu perfil en un momento.', 'ok');
            }
          } catch (error) {
            console.error('[Chirp Gold MP]', error);
            setStatus(error.message || 'No pude activar Chirp Gold con Mercado Pago.', 'error');
          } finally {
            setLoading(false);
          }
        },
        onFetching: () => {
          const progress = $('#goldProgress');
          progress?.removeAttribute('value');
          progress?.classList.add('is-loading');
          return () => {
            progress?.setAttribute('value', '0');
            progress?.classList.remove('is-loading');
          };
        },
      },
    });

    return cardForm;
  }

  async function initGoldPage() {
    const session = await sessionOrRedirect();
    if (!session) return;

    prefillEmail(session);

    const profile = await fetchProfile(session.user.id);
    if (isGoldActive(profile)) setStatus(goldUntilLabel(profile), 'ok');
    else setStatus('Tu cuenta todavía no tiene Gold activo. Completá el formulario para activar autopago mensual.');

    try {
      const mpConfig = await getMpConfig();
      updatePriceLabels(mpConfig);
      initMercadoPagoCardForm(mpConfig, session);
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'No pude cargar Mercado Pago.', 'error');
    }

    $('#payPayPal')?.addEventListener('click', async (event) => {
      const btn = event.currentTarget;
      btn.disabled = true;
      setStatus('Creando orden de PayPal...');
      try {
        const data = await postPayment('/api/payments/paypal/create', { plan_id: 'gold_monthly' }, session);
        if (!data.approve_url) throw new Error('PayPal no devolvió URL de aprobación.');
        location.href = data.approve_url;
      } catch (error) {
        console.error(error);
        setStatus(error.message || 'No pude iniciar PayPal.', 'error');
        btn.disabled = false;
      }
    });
  }

  async function waitForGold(session, tries = 10) {
    for (let i = 0; i < tries; i += 1) {
      const profile = await fetchProfile(session.user.id);
      if (isGoldActive(profile)) return profile;
      await new Promise((resolve) => setTimeout(resolve, 1700));
    }
    return null;
  }

  async function initReturnPage() {
    const session = await sessionOrRedirect();
    if (!session) return;

    const provider = params.get('provider') || '';
    const result = params.get('result') || '';
    const orderId = params.get('order_id') || '';
    const token = params.get('token') || params.get('paymentId') || '';

    if (result === 'failure' || result === 'cancelled') {
      $('#returnTitle') && ($('#returnTitle').textContent = 'Pago cancelado o rechazado');
      $('#returnMessage') && ($('#returnMessage').textContent = 'No se activó Chirp Gold. Podés intentar nuevamente cuando quieras.');
      setStatus('Gold no activado.', 'error');
      return;
    }

    try {
      if (provider === 'paypal') {
        $('#returnTitle') && ($('#returnTitle').textContent = 'Capturando pago de PayPal...');
        await postPayment('/api/payments/paypal/capture', {
          order_id: orderId,
          paypal_order_id: token,
          token,
        }, session);
      }

      $('#returnTitle') && ($('#returnTitle').textContent = 'Verificando activación...');
      setStatus('Esperando confirmación de Chirp Gold...');
      const profile = await waitForGold(session, provider === 'mercadopago' ? 14 : 8);

      if (profile) {
        $('#returnTitle') && ($('#returnTitle').textContent = '¡Chirp Gold activado!');
        $('#returnMessage') && ($('#returnMessage').textContent = 'Listo, tu perfil ya tiene Gold activo.');
        setStatus(goldUntilLabel(profile), 'ok');
      } else {
        $('#returnTitle') && ($('#returnTitle').textContent = 'Pago recibido o pendiente');
        $('#returnMessage') && ($('#returnMessage').textContent = 'Si el proveedor aprobó el pago, el webhook puede tardar unos segundos más. Volvé a tu perfil o refrescá en un momento.');
        setStatus('Confirmación pendiente. Revisá nuevamente en unos segundos.');
      }
    } catch (error) {
      console.error(error);
      $('#returnTitle') && ($('#returnTitle').textContent = 'No pude confirmar el pago');
      $('#returnMessage') && ($('#returnMessage').textContent = 'El proveedor puede haber aprobado el pago, pero Chirp no pudo completar la confirmación automática.');
      setStatus(error.message || 'Error al confirmar.', 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindGoldCtas();

    if (!CFG || !window.supabase || !sb) {
      setStatus('Falta cargar config.js o Supabase.', 'error');
      return;
    }
    if (page === 'gold') initGoldPage();
    if (page === 'gold-return') initReturnPage();
  });
})();
