import { supabase } from './supabaseClient.js';
import { state } from './state.js';

export function cleanupRealtime() {
  for (const channel of state.realtimeChannels) {
    supabase.removeChannel(channel);
  }
  state.realtimeChannels = [];
}

export function setupRealtime({ onFeedChange, onNotificationChange }) {
  cleanupRealtime();

  const feedChannel = supabase
    .channel('chirp-feed')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chirps' }, () => onFeedChange?.())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, () => onFeedChange?.())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rechirps' }, () => onFeedChange?.())
    .subscribe();

  state.realtimeChannels.push(feedChannel);

  if (state.user) {
    const notificationChannel = supabase
      .channel(`chirp-notifications-${state.user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${state.user.id}`
        },
        () => onNotificationChange?.()
      )
      .subscribe();

    state.realtimeChannels.push(notificationChannel);
  }
}
