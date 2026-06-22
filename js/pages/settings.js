import { mountApp } from "../lib/appPage.js";
import { renderTopbar, toast } from "../lib/ui.js";
import { updateProfile, uploadProfileImage, getAccountSettings, updateAccountSettings, createSupportRequest } from "../lib/api.js";
import { updateEmail, updatePassword } from "../lib/auth.js";
import { STORAGE_BUCKETS } from "../config.js";
const ctx = await mountApp("settings");
if (ctx) {
  const main = document.querySelector("#main");
  main.insertAdjacentHTML("afterbegin", renderTopbar("Ajustes"));
  const p = ctx.profile || {};
  const s = await getAccountSettings(ctx.user.id) || {};
  const form = document.querySelector("#profile-settings");
  form.username.value = p.username || ""; form.display_name.value = p.display_name || ""; form.bio.value = p.bio || ""; form.website.value = p.website || ""; form.location.value = p.location || ""; form.is_private.checked = !!p.is_private;
  const account = document.querySelector("#account-settings");
  account.theme.value = s.theme || "system"; account.email_notifications.checked = s.email_notifications !== false; account.push_notifications.checked = s.push_notifications !== false;
  form.addEventListener("submit", async e => { e.preventDefault(); try { let avatar_url = p.avatar_url, banner_url = p.banner_url; if (form.avatar.files[0]) avatar_url = await uploadProfileImage(ctx.user.id, form.avatar.files[0], STORAGE_BUCKETS.avatars, "avatar"); if (form.banner.files[0]) banner_url = await uploadProfileImage(ctx.user.id, form.banner.files[0], STORAGE_BUCKETS.banners, "banner"); await updateProfile(ctx.user.id, { username: form.username.value.trim(), display_name: form.display_name.value.trim(), bio: form.bio.value.trim(), website: form.website.value.trim(), location: form.location.value.trim(), is_private: form.is_private.checked, avatar_url, banner_url }); toast("Perfil actualizado."); } catch(error) { toast(error.message, "bad"); }});
  account.addEventListener("submit", async e => { e.preventDefault(); try { await updateAccountSettings(ctx.user.id, { theme: account.theme.value, email_notifications: account.email_notifications.checked, push_notifications: account.push_notifications.checked }); toast("Preferencias guardadas."); } catch(error) { toast(error.message, "bad"); }});
  const emailForm = document.querySelector("#email-form");
  emailForm.current_email.value = ctx.user.email || "";
  emailForm.addEventListener("submit", async e => { e.preventDefault(); try { await updateEmail(emailForm.new_email.value.trim(), ctx.user.email); toast("Te mandamos un email para confirmar el cambio."); emailForm.reset(); } catch(error) { toast(error.message, "bad"); }});
  const passForm = document.querySelector("#password-form");
  passForm.addEventListener("submit", async e => { e.preventDefault(); if (passForm.password.value !== passForm.password_confirm.value) return toast("Las contraseñas no coinciden.", "bad"); try { await updatePassword(passForm.password.value); toast("Contraseña cambiada."); passForm.reset(); } catch(error) { toast(error.message, "bad"); }});
  const support = document.querySelector("#support-form");
  support.addEventListener("submit", async e => { e.preventDefault(); try { await createSupportRequest(ctx.user.id, { type: support.type.value, subject: support.subject.value, message: support.message.value }); toast("Soporte recibió tu mensaje."); support.reset(); } catch(error) { toast(error.message, "bad"); }});
}
