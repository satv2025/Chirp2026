import { requireUser, wireLogout } from "./auth.js";
import { renderShell, renderMobileNav, requireCard } from "./ui.js";

export async function mountApp(active) {
  const ctx = await requireUser();
  if (!ctx.session) {
    requireCard();
    return null;
  }
  const shell = document.querySelector("#app-shell");
  if (shell) {
    shell.prepend(renderShell(active, ctx.profile));
    document.body.appendChild(renderMobileNav(active));
  }
  wireLogout();
  return ctx;
}
