import { mountApp } from "../lib/appPage.js";
import { renderTopbar, renderChirp, toast } from "../lib/ui.js";
import { getChirp, listReplies, createChirp } from "../lib/api.js";
import { getPathPart } from "../lib/dom.js";
const ctx = await mountApp("home");
if (ctx) {
  const id = getPathPart(1) || new URLSearchParams(location.search).get("id");
  document.querySelector("#main").insertAdjacentHTML("afterbegin", renderTopbar("Chirp"));
  const thread = document.querySelector("#thread");
  async function load() { try { const chirp = await getChirp(id); const replies = await listReplies(id); thread.innerHTML = renderChirp(chirp, ctx.profile) + `<section class="composer"><form id="reply-form"><textarea class="textarea" name="content" placeholder="Responder con un Chirp..."></textarea><div class="composer-tools"><span></span><button class="btn primary">Responder</button></div></form></section>` + (replies.length ? replies.map(c => renderChirp(c, ctx.profile)).join("") : `<div class="empty card"><b>Sin respuestas todavía</b>Sé la primera persona en responder.</div>`); document.querySelector("#reply-form").addEventListener("submit", async e => { e.preventDefault(); const content = e.target.content.value.trim(); if (!content) return; await createChirp({ author_id: ctx.user.id, content, reply_to_id: id, root_chirp_id: id }); toast("Respuesta publicada."); load(); }); } catch(error) { thread.innerHTML = `<div class="empty card"><b>No pudimos cargar el Chirp</b>${error.message}</div>`; }}
  load();
}
