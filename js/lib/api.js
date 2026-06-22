import { supabase } from "./supabaseClient.js";
import { STORAGE_BUCKETS } from "../config.js";

export async function listFeed(limit = 30) {
  const { data, error } = await supabase
    .from("chirps")
    .select("*, profiles:author_id(*), chirp_media(*)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return hydrateMedia(data || []);
}

export async function listUserChirps(userId, limit = 30) {
  const { data, error } = await supabase
    .from("chirps")
    .select("*, profiles:author_id(*), chirp_media(*)")
    .eq("author_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return hydrateMedia(data || []);
}

export async function getChirp(id) {
  const { data, error } = await supabase
    .from("chirps")
    .select("*, profiles:author_id(*), chirp_media(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return hydrateMedia([data])[0];
}

export async function listReplies(chirpId) {
  const { data, error } = await supabase
    .from("chirps")
    .select("*, profiles:author_id(*), chirp_media(*)")
    .eq("reply_to_id", chirpId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return hydrateMedia(data || []);
}

export async function createChirp({ author_id, content, reply_to_id = null, root_chirp_id = null, quote_chirp_id = null, visibility = "public" }) {
  const { data, error } = await supabase
    .from("chirps")
    .insert({ author_id, content, reply_to_id, root_chirp_id, quote_chirp_id, visibility })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function uploadChirpMedia(userId, chirpId, file, index = 0) {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `${userId}/${chirpId}/${Date.now()}-${index}.${ext}`;
  const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKETS.chirpMedia).upload(path, file, { upsert: false, contentType: file.type });
  if (uploadError) throw uploadError;
  const mediaType = file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : file.type === "image/gif" ? "gif" : "image";
  const { error } = await supabase.from("chirp_media").insert({ chirp_id: chirpId, user_id: userId, storage_bucket: STORAGE_BUCKETS.chirpMedia, storage_path: path, media_type: mediaType, sort_order: index });
  if (error) throw error;
  return path;
}

export async function uploadProfileImage(userId, file, bucket, filename) {
  const ext = (file.name.split(".").pop() || "webp").toLowerCase();
  const path = `${userId}/${filename}.${ext}`;
  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function toggleTable(table, payload, match) {
  const query = supabase.from(table).select("*");
  Object.entries(match).forEach(([k,v]) => query.eq(k,v));
  const { data: exists, error: findError } = await query.maybeSingle();
  if (findError) throw findError;
  if (exists) {
    let del = supabase.from(table).delete();
    Object.entries(match).forEach(([k,v]) => del = del.eq(k,v));
    const { error } = await del;
    if (error) throw error;
    return false;
  }
  const { error } = await supabase.from(table).insert(payload);
  if (error) throw error;
  return true;
}

export async function listBookmarks(userId) {
  const { data, error } = await supabase
    .from("bookmarks")
    .select("chirps:chirp_id(*, profiles:author_id(*), chirp_media(*))")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return hydrateMedia((data || []).map(r => r.chirps).filter(Boolean));
}

export async function listNotifications(userId) {
  const { data, error } = await supabase
    .from("notifications")
    .select("*, actor:actor_id(*), chirps:chirp_id(*)")
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

export async function markAllNotificationsRead(userId) {
  const { error } = await supabase.from("notifications").update({ is_read: true }).eq("recipient_id", userId).eq("is_read", false);
  if (error) throw error;
}

export async function searchProfiles(term) {
  const clean = term.trim();
  let query = supabase.from("profiles").select("*").eq("is_suspended", false).limit(20);
  if (clean) query = query.or(`username.ilike.%${clean}%,display_name.ilike.%${clean}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getProfileByUsername(username) {
  const clean = username.replace("@", "").trim();
  const { data, error } = await supabase.from("profiles").select("*").eq("username", clean).single();
  if (error) throw error;
  return data;
}

export async function updateProfile(userId, values) {
  const { data, error } = await supabase.from("profiles").update(values).eq("id", userId).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateAccountSettings(userId, values) {
  const { data, error } = await supabase.from("account_settings").update(values).eq("user_id", userId).select("*").single();
  if (error) throw error;
  return data;
}

export async function getAccountSettings(userId) {
  const { data, error } = await supabase.from("account_settings").select("*").eq("user_id", userId).single();
  if (error) return null;
  return data;
}

export async function createSupportRequest(userId, payload) {
  const { error } = await supabase.from("support_requests").insert({ user_id: userId, ...payload });
  if (error) throw error;
}

function hydrateMedia(chirps) {
  return chirps.map(chirp => {
    const media = chirp.chirp_media || [];
    chirp.chirp_media = media.map(m => {
      if (m.storage_bucket && m.storage_path) {
        const { data } = supabase.storage.from(m.storage_bucket).getPublicUrl(m.storage_path);
        return { ...m, public_url: data.publicUrl };
      }
      return m;
    });
    return chirp;
  });
}
