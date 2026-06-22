import { supabase } from './supabaseClient.js';
import { state } from './state.js';
import { escapeHTML, formatDate, renderEmpty } from './ui.js';

const NOTIFICATION_LABELS = {
  like: 'le dio like a tu Chirp',
  reply: 'respondió tu Chirp',
  follow: 'te empezó a seguir',
  rechirp: 'rechirpeó tu Chirp',
  quote: 'citó tu Chirp',
  mention: 'te mencionó'
};

export async function fetchNotifications() {
  if (!state.user) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select(`
      *,
      actor:profiles!notifications_actor_id_fkey(id, username, display_name, avatar_url)
    `)
    .eq('recipient_id', state.user.id)
    .order('created_at', { ascending: false })
    .limit(40);

  if (error) throw error;
  state.notifications = data || [];
  return state.notifications;
}

export function renderNotifications(container, notifications) {
  if (!notifications.length) {
    renderEmpty(container, 'No tenés notificaciones todavía. Cuando pase algo, aparece acá 🔔');
    return;
  }

  container.innerHTML = notifications.map((item) => {
    const actor = item.actor || {};
    const label = NOTIFICATION_LABELS[item.type] || 'interactuó con vos';
    return `
      <article class="notification-item ${item.is_read ? '' : 'unread'}">
        <strong>${escapeHTML(actor.display_name || 'Alguien')}</strong>
        <span class="muted">@${escapeHTML(actor.username || 'usuario')}</span>
        <p>${escapeHTML(label)}</p>
        <small class="muted">${formatDate(item.created_at)}</small>
      </article>
    `;
  }).join('');
}

export async function markAllNotificationsRead() {
  if (!state.user) return;
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('recipient_id', state.user.id)
    .eq('is_read', false);

  if (error) throw error;
}
