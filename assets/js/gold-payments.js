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

  async function sessionOrRedirect() {
    const { data } = await sb.auth.getSession();
    const session = data?.session;
    if (!session?.access_token) {
      location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
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
    if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
    return data;
  }

  async function initGoldPage() {
    const session = await sessionOrRedirect();
    if (!session) return;

    const profile = await fetchProfile(session.user.id);
    if (isGoldActive(profile)) setStatus(goldUntilLabel(profile), 'ok');
    else setStatus('Tu cuenta todavía no tiene Gold activo. Elegí un medio de pago para activarlo.');

    $('#payMercadoPago')?.addEventListener('click', async (event) => {
      const btn = event.currentTarget;
      btn.disabled = true;
      setStatus('Creando checkout de Mercado Pago...');
      try {
        const data = await postPayment('/api/payments/mercadopago/create', { plan_id: 'gold_monthly' }, session);
        const url = data.init_point || data.sandbox_init_point;
        if (!url) throw new Error('Mercado Pago no devolvió URL de checkout.');
        location.href = url;
      } catch (error) {
        console.error(error);
        setStatus(error.message || 'No pude iniciar Mercado Pago.', 'error');
        btn.disabled = false;
      }
    });

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
    if (!CFG || !window.supabase || !sb) {
      setStatus('Falta cargar config.js o Supabase.', 'error');
      return;
    }
    if (page === 'gold') initGoldPage();
    if (page === 'gold-return') initReturnPage();
  });
})();
