import { supabase } from './supabaseClient.js';
import { showToast } from './utils.js';

async function finish() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    showToast('No se pudo confirmar', error.message, 'error');
    setTimeout(() => location.href = '/login/', 1200);
    return;
  }
  if (data.session) {
    showToast('Cuenta lista', 'Bienvenida a Chirp.');
    setTimeout(() => location.href = '/home/', 700);
    return;
  }
  setTimeout(() => location.href = '/login/', 1200);
}
finish();
