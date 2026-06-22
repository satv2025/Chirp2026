import { mountApp } from "../lib/appPage.js";
import { renderTopbar, duckAvatar, toast } from "../lib/ui.js";
import { listNotifications, markAllNotificationsRead } from "../lib/api.js";
import { escapeHtml, fmtDate } from "../lib/dom.js";
const ctx = await mountApp("notifications");
if (ctx) {
  const main = document.querySelector("#main");
  main.insertAdjacentHTML("afterbegin", renderTopbar("Notificaciones", `<button class="btn secondary" id="mark-read">Marcar leídas</button>`));
  const labels = { like:"le dio amor a tu Chirp", reply:"te respondió", follow:"te empezó a seguir", rechirp:"rechirpeó tu Chirp", quote:"citó tu Chirp", mention:"te mencionó" };
  async function load() {
    const list = document.querySelector("#notifs");
    const items = await listNotifications(ctx.user.id);
    list.innerHTML = items.length ? items.map(n => `<article class="notif card ${n.is_read ? "" : "unread"}">${duckAvatar(n.actor || {})}<div><b>${escapeHtml(n.actor?.display_name || "Alguien")}</b><small>${labels[n.type] || n.type} · ${fmtDate(n.created_at)}</small></div></article>`).join("") : `<div class="empty card"><b>Todo tranqui</b>No tenés notificaciones nuevas.</div>`;
  }
  document.querySelector("#mark-read")?.addEventListener("click", async () => { await markAllNotificationsRead(ctx.user.id); toast("Notificaciones marcadas como leídas."); load(); });
  await load();
}
