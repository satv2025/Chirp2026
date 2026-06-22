import { supabase } from "../lib/supabaseClient.js";
import { authErrorMessage } from "../lib/auth.js";
import { toast } from "../lib/ui.js";
import { SITE_URL } from "../config.js";

const form = document.querySelector("#reset-form");
form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = new FormData(form).get("email");
  const btn = form.querySelector("button");
  btn.disabled = true; btn.textContent = "Enviando...";
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${SITE_URL}/auth/callback/?next=/update-password/` });
  btn.disabled = false; btn.textContent = "Mandar email";
  if (error) return toast(authErrorMessage(error), "bad");
  document.querySelector("#reset-done").classList.remove("hidden");
});
