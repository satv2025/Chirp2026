import { updatePassword } from "../lib/auth.js";
import { toast } from "../lib/ui.js";
const form = document.querySelector("#update-password-form");
form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const a = fd.get("password");
  const b = fd.get("password_confirm");
  if (a.length < 8) return toast("Usá una contraseña de mínimo 8 caracteres.", "bad");
  if (a !== b) return toast("Las contraseñas no coinciden.", "bad");
  const btn = form.querySelector("button");
  btn.disabled = true; btn.textContent = "Guardando...";
  try {
    await updatePassword(a);
    toast("Contraseña actualizada.");
    window.location.href = "/home/";
  } catch (error) {
    toast(error.message, "bad");
  } finally {
    btn.disabled = false; btn.textContent = "Guardar contraseña";
  }
});
