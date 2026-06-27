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
    const mpCheckoutButton = $('#mpCheckoutButton');
    const progress = $('#goldProgress');

    form?.classList.toggle('is-loading', Boolean(isLoading));
    $('#mpRedirectCheckout')?.classList.toggle('is-loading', Boolean(isLoading));
    progress?.classList.toggle('is-loading', Boolean(isLoading));
    if (submit) submit.disabled = Boolean(isLoading);
    if (mpCheckoutButton) mpCheckoutButton.disabled = Boolean(isLoading);
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
    if (!response.ok) throw new Error(data.error || 'No pude cargar la configuración pública de pago.');
    return data;
  }

  async function getPayPalConfig() {
    const response = await fetch('/api/payments/paypal/public-config', { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No pude cargar la configuración de PayPal.');
    if (!data.client_id) throw new Error('Falta PAYPAL_CLIENT_ID en Vercel.');
    if (!data.plan_id) throw new Error('Falta PAYPAL_PLAN_ID en Vercel.');
    return data;
  }

  function loadExternalScript(src, id) {
    return new Promise((resolve, reject) => {
      if (id && document.getElementById(id)) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      if (id) script.id = id;
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('No pude cargar el SDK de PayPal. Revisá el bloqueador o la conexión.'));
      document.head.appendChild(script);
    });
  }

  async function loadPayPalSdk(paypalConfig) {
    if (window.paypal?.Buttons) return;
    const currency = paypalConfig?.plan?.currency || 'USD';
    const qs = new URLSearchParams({
      'client-id': paypalConfig.client_id,
      components: 'buttons',
      vault: 'true',
      intent: 'subscription',
      currency,
    });
    await loadExternalScript(`https://www.paypal.com/sdk/js?${qs.toString()}`, 'paypal-subscriptions-sdk');
  }

  async function initPayPalButtons(session) {
    const container = $('#paypalButtonContainer');
    if (!container || container.dataset.ready === 'true') return;
    container.dataset.ready = 'true';

    try {
      const paypalConfig = await getPayPalConfig();
      await loadPayPalSdk(paypalConfig);

      if (!window.paypal?.Buttons) throw new Error('PayPal no cargó el botón de suscripción.');

      let currentOrderId = '';
      container.innerHTML = '';

      window.paypal.Buttons({
        style: {
          shape: 'rect',
          color: 'white',
          layout: 'vertical',
          label: 'subscribe',
        },
        createSubscription: async (_data, actions) => {
          setStatus('Preparando compra internacional...');
          const prepared = await postPayment('/api/payments/paypal/prepare-subscription', { plan_id: 'gold_monthly' }, session);
          currentOrderId = prepared.order_id || '';

          return actions.subscription.create({
            plan_id: paypalConfig.plan_id,
            custom_id: currentOrderId || undefined,
            application_context: {
              brand_name: 'Chirp',
              locale: 'es-AR',
              shipping_preference: 'NO_SHIPPING',
              user_action: 'SUBSCRIBE_NOW',
            },
          });
        },
        onApprove: async (data) => {
          setStatus('PayPal aprobó la suscripción. Activando ChirpCheck Gold...');
          await postPayment('/api/payments/paypal/confirm-subscription', {
            order_id: currentOrderId,
            subscription_id: data.subscriptionID,
          }, session);

          const profile = await waitForGold(session, 8);
          if (profile) {
            setGoldActiveUi(profile);
            setStatus(`¡ChirpCheck Gold activado! ${goldUntilLabel(profile)}`, 'ok');
          } else {
            setStatus('Suscripción aprobada. La activación puede tardar unos segundos; refrescá tu perfil en un momento.', 'ok');
          }
        },
        onCancel: () => {
          setStatus('Compra internacional cancelada. Podés intentarlo nuevamente cuando quieras.');
        },
        onError: (error) => {
          console.error('[Chirp Gold PayPal]', error);
          setStatus(error?.message || 'PayPal no pudo iniciar la suscripción.', 'error');
        },
      }).render('#paypalButtonContainer');
    } catch (error) {
      console.error('[Chirp Gold PayPal init]', error);
      container.innerHTML = '<button id="payPayPalFallback" class="btn btn-primary gold-btn gold-paypal-btn" type="button">Reintentar compra internacional</button>';
      $('#payPayPalFallback')?.addEventListener('click', () => {
        container.dataset.ready = 'false';
        container.innerHTML = '<div class="gold-paypal-loading">Cargando botón internacional seguro...</div>';
        initPayPalButtons(session);
      });
      setStatus(error.message || 'No pude cargar PayPal.', 'error');
    }
  }

  function updatePriceLabels(mpConfig) {
    const plan = mpConfig?.plan || {};
    const amount = Number(plan.amount || 0);
    const currency = plan.currency || 'ARS';
    const moneyLabel = amount
      ? new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
      : 'ARS $7.560';
    const label = `${moneyLabel} / mes`;

    document.querySelectorAll('[data-mp-price]').forEach((node) => {
      node.innerHTML = '';
      const price = document.createTextNode(moneyLabel + ' ');
      const period = document.createElement('span');
      period.textContent = '/ mes';
      node.append(price, period);
      node.setAttribute('aria-label', label);
    });
  }

  function initMpModeHint(mpConfig) {
    const mode = mpConfig?.mode || (String(mpConfig?.public_key || '').startsWith('TEST-') ? 'test' : 'live');
    document.body.dataset.mpMode = mode;
    $('#form-checkout')?.setAttribute('data-mp-mode', mode);
    $('#mpRedirectCheckout')?.setAttribute('data-mp-mode', mode);
    const hint = $('#mpTestHint');
    if (hint) hint.hidden = mode !== 'test';
  }

  function flattenErrorDetails(details) {
    if (!details) return '';
    if (typeof details === 'string') return details;
    try {
      return JSON.stringify(details);
    } catch (_error) {
      return String(details);
    }
  }

  function humanizePaymentError(error) {
    const raw = [error?.message || '', flattenErrorDetails(error?.details)].join(' ');
    const text = raw.toLowerCase();

    if (raw.includes('CC_VAL_433') || text.includes('credit card validation')) {
      return 'La tarjeta no pasó la validación de Mercado Pago. En prueba usá una tarjeta TEST válida, vencimiento futuro, CVV correcto, nombre y documento del comprador de prueba.';
    }

    if (text.includes('card_token') || text.includes('token')) {
      return 'No se pudo generar o usar el token seguro de la tarjeta. Revisá número, vencimiento, CVV y que la Public Key corresponda al mismo ambiente que el Access Token.';
    }

    if (text.includes('invalid access token') || text.includes('401')) {
      return 'Mercado Pago rechazó el Access Token. Revisá MERCADOPAGO_ACCESS_TOKEN.';
    }

    if (text.includes('policy') || text.includes('forbidden') || text.includes('403') || text.includes('unauthorized')) {
      return 'Mercado Pago bloqueó el checkout hosted. Revisá que el Access Token TEST sea válido y que suscripciones esté habilitado en esa app.';
    }

    return error?.message || 'Mercado Pago no pudo crear la suscripción.';
  }

  function resetInvalidFields(root = document) {
    root.querySelectorAll('.is-invalid').forEach((node) => node.classList.remove('is-invalid'));
  }

  function markInvalid(selector) {
    const node = $(selector);
    node?.classList.add('is-invalid');
    return node;
  }

  function validateMpVisibleFields() {
    resetInvalidFields($('#form-checkout') || document);

    const required = [
      ['#form-checkout__cardNumber', 'Completá el número de tarjeta.'],
      ['#form-checkout__expirationDate', 'Completá el vencimiento.'],
      ['#form-checkout__securityCode', 'Completá el código de seguridad.'],
      ['#form-checkout__cardholderName', 'Completá el titular de la tarjeta.'],
      ['#form-checkout__cardholderEmail', 'Completá el email del pagador.'],
      ['#form-checkout__identificationNumber', 'Completá el número de documento.'],
    ];

    for (const [selector, message] of required) {
      const node = $(selector);
      if (!String(node?.value || '').trim()) {
        markInvalid(selector)?.focus?.({ preventScroll: false });
        throw new Error(message);
      }
    }

    const email = $('#form-checkout__cardholderEmail')?.value || '';
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      markInvalid('#form-checkout__cardholderEmail')?.focus?.({ preventScroll: false });
      throw new Error('El email del pagador no parece válido.');
    }
  }


  function setGoldActiveUi(profile) {
    const active = isGoldActive(profile);
    document.body.classList.toggle('is-gold-active', active);
    document.body.dataset.chirpGoldActive = active ? 'true' : 'false';
    document.querySelectorAll('[data-hide-if-gold]').forEach((node) => {
      node.hidden = active;
    });
    document.querySelectorAll('.gold-active-account-card').forEach((node) => {
      node.hidden = !active;
    });
  }

  function optionLabel(option) {
    return (option?.textContent || option?.label || option?.value || '').trim();
  }

  function syncCustomDropdown(drop) {
    const selector = drop.dataset.goldSelect;
    const select = selector ? document.querySelector(selector) : null;
    const label = drop.querySelector('[data-gold-dropdown-label]');
    const menu = drop.querySelector('.gold-custom-dropdown__menu');
    const placeholder = drop.dataset.placeholder || 'Seleccionar';
    if (!select || !menu || !label) return;

    const options = [...select.options].filter((option) => option.value || optionLabel(option));
    const selected = options.find((option) => option.value === select.value) || options.find((option) => option.selected);
    label.textContent = selected ? optionLabel(selected) : placeholder;

    menu.innerHTML = '';
    if (!options.length) {
      const empty = document.createElement('button');
      empty.type = 'button';
      empty.className = 'gold-custom-dropdown__item is-disabled';
      empty.disabled = true;
      empty.textContent = placeholder;
      menu.appendChild(empty);
      return;
    }

    options.forEach((option) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'gold-custom-dropdown__item';
      item.textContent = optionLabel(option);
      item.dataset.value = option.value;
      item.setAttribute('role', 'option');
      if (option.value === select.value) item.classList.add('is-selected');
      item.addEventListener('click', () => {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.dispatchEvent(new Event('input', { bubbles: true }));
        label.textContent = optionLabel(option);
        drop.classList.remove('is-open');
        syncCustomDropdown(drop);
      });
      menu.appendChild(item);
    });
  }

  function initCustomDropdowns() {
    document.querySelectorAll('.gold-custom-dropdown').forEach((drop) => {
      if (drop.dataset.ready === 'true') {
        syncCustomDropdown(drop);
        return;
      }
      drop.dataset.ready = 'true';
      const selector = drop.dataset.goldSelect;
      const select = selector ? document.querySelector(selector) : null;
      const button = drop.querySelector('.gold-custom-dropdown__button');
      if (!select || !button) return;

      button.addEventListener('click', () => {
        document.querySelectorAll('.gold-custom-dropdown.is-open').forEach((other) => {
          if (other !== drop) other.classList.remove('is-open');
        });
        drop.classList.toggle('is-open');
        syncCustomDropdown(drop);
      });

      select.addEventListener('change', () => syncCustomDropdown(drop));
      const observer = new MutationObserver(() => syncCustomDropdown(drop));
      observer.observe(select, { childList: true, subtree: true, attributes: true });
      syncCustomDropdown(drop);
    });
  }

  function setPaymentRegion(region) {
    const normalized = region === 'internacional' ? 'internacional' : 'argentina';
    const input = $('#goldPaymentRegion');
    if (input) input.value = normalized;

    document.body.dataset.goldPaymentRegion = normalized;

    document.querySelectorAll('[data-gold-payment-panel]').forEach((panel) => {
      const active = panel.dataset.goldPaymentPanel === normalized;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });

    const pill = $('#goldRegionPill');
    if (pill) {
      pill.textContent = normalized === 'internacional'
        ? 'Internacional · Autopago mensual'
        : 'Argentina · Autopago mensual';
    }

    const checkout = $('#goldCheckout');
    checkout?.classList.toggle('is-international-mode', normalized === 'internacional');
  }

  function initPaymentRegionDropdown() {
    const drop = $('[data-gold-region-dropdown]');
    if (!drop) {
      setPaymentRegion('argentina');
      return;
    }

    if (drop.dataset.ready !== 'true') {
      drop.dataset.ready = 'true';
      const button = drop.querySelector('.gold-region-dropdown__button');
      const label = drop.querySelector('[data-gold-region-label]');
      const sublabel = drop.querySelector('[data-gold-region-sublabel]');

      button?.addEventListener('click', () => {
        const isOpen = drop.classList.toggle('is-open');
        button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });

      drop.querySelectorAll('[data-region]').forEach((item) => {
        item.addEventListener('click', () => {
          const region = item.dataset.region || 'argentina';
          drop.querySelectorAll('[data-region]').forEach((other) => {
            const selected = other === item;
            other.classList.toggle('is-selected', selected);
            other.setAttribute('aria-selected', selected ? 'true' : 'false');
          });
          if (label) label.textContent = item.dataset.label || item.textContent.trim();
          if (sublabel) sublabel.textContent = item.dataset.sublabel || '';
          drop.classList.remove('is-open');
          button?.setAttribute('aria-expanded', 'false');
          setPaymentRegion(region);
        });
      });

      document.addEventListener('click', (event) => {
        if (!drop.contains(event.target)) {
          drop.classList.remove('is-open');
          button?.setAttribute('aria-expanded', 'false');
        }
      });
    }

    const initial = $('#goldPaymentRegion')?.value || 'argentina';
    setPaymentRegion(initial);
  }


  function bindGoldCtas() {
    document.querySelectorAll('[data-gold-scroll]').forEach((button) => {
      button.addEventListener('click', () => {
        const checkout = $('#goldCheckout') || $('#mpRedirectCheckout') || $('#form-checkout');
        checkout?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.setTimeout(() => {
          ($('#mpCheckoutButton') || $('#form-checkout__cardholderName'))?.focus({ preventScroll: true });
        }, 450);
      });
    });
  }

  function prefillEmail(session) {
    const email = session?.user?.email || '';
    const input = $('#form-checkout__cardholderEmail');
    if (input && !input.value) input.value = email;
  }


  function initMercadoPagoHostedCheckout(mpConfig, session) {
    const button = $('#mpCheckoutButton');
    if (!button || button.dataset.ready === 'true') return;

    button.dataset.ready = 'true';
    initMpModeHint(mpConfig);

    button.addEventListener('click', async () => {
      setLoading(true, 'Abriendo Mercado Pago...');

      try {
        const data = await postPayment('/api/payments/mercadopago/checkout', {
          plan_id: 'gold_monthly',
        }, session);

        const url = data.init_point || data.checkout_url || data.sandbox_init_point || '';
        if (!url) throw new Error('Mercado Pago no devolvió un link de checkout.');

        setStatus('Redirigiendo a Mercado Pago para iniciar sesión y aprobar la suscripción...');
        window.location.href = url;
      } catch (error) {
        console.error('[Chirp Gold MP checkout]', error);
        setStatus(humanizePaymentError(error), 'error');
        setLoading(false);
      }
    });
  }

  function initMercadoPagoCardForm(mpConfig, session) {
    const form = $('#form-checkout');
    if (!form) return;

    if (!window.MercadoPago) {
      setStatus('No cargó el módulo de pago seguro. Revisá la conexión o el bloqueador.', 'error');
      return;
    }

    const amount = String(mpConfig.plan?.amount || 7560);
    const publicKey = mpConfig.public_key;
    initMpModeHint(mpConfig);
    const mp = new window.MercadoPago(publicKey, { locale: mpConfig.locale || 'es-AR' });

    const cardForm = mp.cardForm({
      amount,
      iframe: false,
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
            setStatus('No pude montar el formulario de pago seguro.', 'error');
            return;
          }
          initCustomDropdowns();
          setStatus('Completá los datos para activar ChirpCheck Gold con autopago mensual.');
        },
        onSubmit: async (event) => {
          event.preventDefault();
          try {
            validateMpVisibleFields();
          } catch (error) {
            setStatus(error.message, 'error');
            return;
          }
          setLoading(true, 'Tokenizando tarjeta de forma segura...');

          try {
            const formData = cardForm.getCardFormData();
            const token = formData.token;
            const payerEmail = formData.cardholderEmail || $('#form-checkout__cardholderEmail')?.value || session.user.email;

            if (!token) throw new Error('No se pudo generar el token seguro de la tarjeta. Revisá los datos.');
            if (!payerEmail) throw new Error('Falta el email del pagador.');

            setStatus('Creando suscripción ChirpCheck Gold...');
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

            if (!data.ok) throw new Error('No se confirmó la suscripción.');

            const profile = await waitForGold(session, 6);
            if (profile) {
              setGoldActiveUi(profile);
              setStatus(`¡ChirpCheck Gold activado! ${goldUntilLabel(profile)}`, 'ok');
            } else {
              setStatus('Suscripción creada. La activación puede tardar unos segundos; refrescá tu perfil en un momento.', 'ok');
            }
          } catch (error) {
            console.error('[Chirp Gold MP]', error);
            setStatus(humanizePaymentError(error), 'error');
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
            window.setTimeout(initCustomDropdowns, 80);
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
    setGoldActiveUi(profile);
    initPaymentRegionDropdown();
    if (isGoldActive(profile)) {
      setStatus(`Ya sos ChirpCheck Gold. ${goldUntilLabel(profile)}`, 'ok');
      return;
    }
    setStatus('Tu cuenta todavía no tiene Gold activo. Elegí método y continuá al checkout oficial.')

    try {
      const mpConfig = await getMpConfig();
      updatePriceLabels(mpConfig);
      initPaymentRegionDropdown();
      initMercadoPagoHostedCheckout(mpConfig, session);
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'No pude cargar el módulo de pago.', 'error');
    }

    initPayPalButtons(session);
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
        $('#returnTitle') && ($('#returnTitle').textContent = 'Confirmando suscripción de PayPal...');
        await postPayment('/api/payments/paypal/confirm-subscription', {
          order_id: orderId,
          subscription_id: params.get('subscription_id') || params.get('ba_token') || token,
          token,
        }, session);
      }

      $('#returnTitle') && ($('#returnTitle').textContent = 'Verificando activación...');
      setStatus('Esperando confirmación de ChirpCheck Gold...');
      const profile = await waitForGold(session, provider === 'mercadopago' ? 14 : 8);

      if (profile) {
        $('#returnTitle') && ($('#returnTitle').textContent = '¡ChirpCheck Gold activado!');
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
    initCustomDropdowns();
    initPaymentRegionDropdown();

    if (!CFG || !window.supabase || !sb) {
      setStatus('Falta cargar config.js o Supabase.', 'error');
      return;
    }
    if (page === 'gold') initGoldPage();
    if (page === 'gold-return') initReturnPage();
  });
})();
