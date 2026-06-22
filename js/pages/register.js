import { supabase } from "../lib/supabaseClient.js";
import { authErrorMessage } from "../lib/auth.js";
import { toast } from "../lib/ui.js";
import { SITE_URL } from "../config.js";

const form = document.querySelector("#register-form");
const meter = document.querySelector("#password-meter span");
form?.password?.addEventListener("input", () => {
  const v = form.password.value;
  let score = Math.min(100, v.length * 10 + (/[A-Z]/.test(v) ? 20 : 0) + (/\d/.test(v) ? 20 : 0));
  meter.style.width = `${score}%`;
});
form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const email = fd.get("email");
  const password = fd.get("password");
  const display_name = fd.get("display_name");
  const btn = form.querySelector("button");
  btn.disabled = true; btn.textContent = "Creando...";
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${SITE_URL}/auth/callback/`,
      data: { display_name }
    }
  });
  btn.disabled = false; btn.textContent = "Crear cuenta";
  if (error) return toast(authErrorMessage(error), "bad");
  document.querySelector("#register-done").classList.remove("hidden");
  form.classList.add("hidden");
});
