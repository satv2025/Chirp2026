import { supabase } from "./supabaseClient.js";
import { toast } from "./ui.js";

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

export async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data.user || null;
}

export async function getProfile(userId) {
  if (!userId) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (error) return null;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = "/";
}

export function wireLogout() {
  document.addEventListener("click", async (e) => {
    if (e.target.closest("[data-logout]")) {
      e.preventDefault();
      await signOut();
    }
  });
}

export async function requireUser() {
  const session = await getSession();
  if (!session) return { session: null, user: null, profile: null };
  const user = session.user;
  const profile = await getProfile(user.id);
  return { session, user, profile };
}

export async function logSecurityEvent(type, payload = {}) {
  const user = await getUser();
  if (!user) return;
  await supabase.from("security_events").insert({
    user_id: user.id,
    type,
    metadata: payload
  });
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  await logSecurityEvent("password_changed", {});
}

export async function updateEmail(newEmail, oldEmail = null) {
  const { error } = await supabase.auth.updateUser({ email: newEmail });
  if (error) throw error;
  await logSecurityEvent("email_change_requested", { old_email: oldEmail, new_email: newEmail });
}

export function authErrorMessage(error) {
  const msg = error?.message || "Pasó algo raro.";
  if (msg.toLowerCase().includes("invalid login")) return "Email o contraseña incorrectos.";
  if (msg.toLowerCase().includes("already registered")) return "Ese email ya está registrado.";
  return msg;
}
