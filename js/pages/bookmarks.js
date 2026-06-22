import { mountApp } from "../lib/appPage.js";
import { renderTopbar, renderChirp } from "../lib/ui.js";
import { listBookmarks } from "../lib/api.js";
const ctx = await mountApp("bookmarks");
if (ctx) {
  const main = document.querySelector("#main");
  main.insertAdjacentHTML("afterbegin", renderTopbar("Guardados"));
  const list = document.querySelector("#bookmarks");
  try {
    const chirps = await listBookmarks(ctx.user.id);
    list.innerHTML = chirps.length ? chirps.map(c => renderChirp(c, ctx.profile)).join("") : `<div class="empty card"><b>No guardaste nada todavía</b>Cuando marques un Chirp con 🎀 aparece acá.</div>`;
  } catch (error) { list.innerHTML = `<div class="empty card"><b>No pudimos cargar guardados</b>${error.message}</div>`; }
}
