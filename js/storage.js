import { supabase } from './supabaseClient.js';
import { STORAGE_BUCKETS, APP_LIMITS } from './config.js';
import { getMediaType } from './ui.js';

function safeExtension(file) {
  const raw = file?.name?.split('.').pop()?.toLowerCase() || 'bin';
  return raw.replace(/[^a-z0-9]/g, '') || 'bin';
}

function assertFile(file, allowedType = null) {
  if (!file) throw new Error('No hay archivo seleccionado.');
  const sizeMb = file.size / 1024 / 1024;
  if (sizeMb > APP_LIMITS.maxMediaSizeMb) {
    throw new Error(`El archivo pesa ${sizeMb.toFixed(1)}MB. Máximo: ${APP_LIMITS.maxMediaSizeMb}MB.`);
  }
  if (allowedType && !file.type.startsWith(allowedType)) {
    throw new Error('Tipo de archivo no permitido.');
  }
}

export async function uploadAvatar(userId, file) {
  assertFile(file, 'image/');
  const extension = safeExtension(file);
  const path = `${userId}/avatar-${Date.now()}.${extension}`;
  const { error } = await supabase.storage
    .from(STORAGE_BUCKETS.avatars)
    .upload(path, file, { upsert: true, cacheControl: '3600' });

  if (error) throw error;
  return supabase.storage.from(STORAGE_BUCKETS.avatars).getPublicUrl(path).data.publicUrl;
}

export async function uploadBanner(userId, file) {
  assertFile(file, 'image/');
  const extension = safeExtension(file);
  const path = `${userId}/banner-${Date.now()}.${extension}`;
  const { error } = await supabase.storage
    .from(STORAGE_BUCKETS.banners)
    .upload(path, file, { upsert: true, cacheControl: '3600' });

  if (error) throw error;
  return supabase.storage.from(STORAGE_BUCKETS.banners).getPublicUrl(path).data.publicUrl;
}

export async function uploadChirpMedia(userId, chirpId, file) {
  assertFile(file);
  const mediaType = getMediaType(file);
  if (!mediaType) throw new Error('Media no soportada. Usá imagen, GIF, video o audio.');

  const extension = safeExtension(file);
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const path = `${userId}/${chirpId}/${id}.${extension}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKETS.chirpMedia)
    .upload(path, file, { upsert: false, cacheControl: '3600' });

  if (error) throw error;
  return {
    bucket: STORAGE_BUCKETS.chirpMedia,
    path,
    mediaType
  };
}

export async function signedMediaUrl(bucket, path) {
  if (!bucket || !path) return '';
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 30);
  if (error) return '';
  return data?.signedUrl || '';
}
