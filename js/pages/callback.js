import { supabase } from "../lib/supabaseClient.js";
import { toast } from "../lib/ui.js";

const status = document.querySelector("#callback-status");
const params = new URLSearchParams(window.location.search);
const next = params.get("next") || "/home/";

async function finish() {
  try {
    if (params.get("code")) {
      const { error } = await supabase.auth.exchangeCodeForSession(params.get("code"));
      if (error) throw error;
    }
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      status.textContent = "No pudimos iniciar sesión con este enlace. Pedí uno nuevo.";
      return;
    }
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const type = params.get("type") || hashParams.get("type");
    if (type === "recovery" || next.includes("update-password")) {
      window.location.replace("/update-password/");
      return;
    }
    status.textContent = "Listo. Te llevamos a Chirp...";
    window.location.replace(next);
  } catch (error) {
    status.textContent = error.message || "El enlace ya venció o no es válido.";
    toast(status.textContent, "bad");
  }
}
finish();
