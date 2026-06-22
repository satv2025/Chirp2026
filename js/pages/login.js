import { supabase } from "../lib/supabaseClient.js";
import { authErrorMessage } from "../lib/auth.js";
import { toast } from "../lib/ui.js";
import { SITE_URL } from "../config.js";

const form = document.querySelector("#login-form");
const magic = document.querySelector("#magic-link");

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const email = fd.get("email");
  const password = fd.get("password");
  const btn = form.querySelector("button");
  btn.disabled = true; btn.textContent = "Entrando...";
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = "Entrar";
  if (error) return toast(authErrorMessage(error), "bad");
  window.location.href = "/home/";
});

magic?.addEventListener("click", async () => {
  const email = form?.email?.value?.trim();
  if (!email) return toast("Escribí tu email primero.", "bad");
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${SITE_URL}/auth/callback/` } });
  if (error) return toast(authErrorMessage(error), "bad");
  toast("Te mandamos un link mágico a tu email.");
});
