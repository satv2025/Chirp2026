export function humanAuthError(error, context = 'auth') {
  const raw = String(error?.message || error?.error_description || error?.name || 'Error desconocido');
  const status = error?.status || error?.code || error?.__status;
  const text = raw.toLowerCase();

  if (text.includes('email rate limit') || text.includes('rate limit')) {
    return {
      title: 'Límite de emails alcanzado',
      message: 'Supabase frenó el envío de emails. Subí el límite en Authentication → Rate Limits o esperá a que se libere.',
      detail: raw
    };
  }

  if (text.includes('tardó demasiado') || text.includes('timeout') || text.includes('timed out')) {
    return {
      title: 'Supabase tardó demasiado',
      message: 'El registro quedó esperando respuesta de Auth/SMTP. Revisá Authentication → Logs y el proveedor SMTP; el frontend ya dejó de esperar para no quedarse colgado.',
      detail: raw
    };
  }

  if (status === 504 || text.includes('gateway timeout') || text.includes('504')) {
    return {
      title: 'Timeout del servidor',
      message: 'El endpoint de Auth respondió 504. Suele pasar por dominio custom, SMTP lento o un trigger de signup trabado.',
      detail: raw
    };
  }

  if (text.includes('already registered') || text.includes('user already registered') || text.includes('already exists')) {
    return {
      title: 'Ese email ya tiene cuenta',
      message: 'Probá entrar con ese email o usá recuperar contraseña.',
      detail: raw
    };
  }

  if (text.includes('invalid email')) {
    return {
      title: 'Email inválido',
      message: 'Revisá que el email esté bien escrito.',
      detail: raw
    };
  }

  if (text.includes('password') && (text.includes('weak') || text.includes('short') || text.includes('at least'))) {
    return {
      title: 'Contraseña muy débil',
      message: 'Probá con una contraseña más larga y segura.',
      detail: raw
    };
  }

  if (text.includes('signup disabled') || text.includes('signups not allowed')) {
    return {
      title: 'Registro desactivado',
      message: 'Activá los registros en Supabase Authentication → Providers → Email.',
      detail: raw
    };
  }

  if (text.includes('redirect') || text.includes('not allowed')) {
    return {
      title: 'Redirect no permitido',
      message: 'Agregá https://chirp.com.ar/** en Supabase Authentication → URL Configuration → Redirect URLs.',
      detail: raw
    };
  }

  if (text.includes('api key') || text.includes('apikey')) {
    return {
      title: 'Falta la API key',
      message: 'Revisá js/config.js y que el cliente Supabase se cree con URL + anon key.',
      detail: raw
    };
  }

  if (text.includes('failed to fetch') || text.includes('networkerror') || text.includes('network')) {
    return {
      title: 'No se pudo conectar',
      message: 'El navegador no pudo conectar con Supabase. Revisá dominio, CORS, conexión o bloqueadores.',
      detail: raw
    };
  }

  return {
    title: context === 'signup' ? 'No se pudo crear la cuenta' : 'No se pudo completar',
    message: raw,
    detail: raw
  };
}

export function reportAuthError(error, context = 'auth') {
  const info = humanAuthError(error, context);
  console.group(`[Chirp Auth] ${info.title}`);
  console.log('Mensaje para usuario:', info.message);
  console.log('Detalle crudo:', info.detail);
  console.log('Error original:', error);
  console.groupEnd();
  return info;
}
