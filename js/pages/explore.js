import { mountApp } from "../lib/appPage.js";
import { renderTopbar, duckAvatar, toast } from "../lib/ui.js";
import { searchProfiles } from "../lib/api.js";
import { escapeHtml } from "../lib/dom.js";
const ctx = await mountApp("explore");
if (ctx) {
  const main = document.querySelector("#main");
  main.insertAdjacentHTML("afterbegin", renderTopbar("Explorar"));
  const form = document.querySelector("#search-form");
  const list = document.querySelector("#results");
  async function run(term="") {
    try {
      const profiles = await searchProfiles(term);
      list.innerHTML = profiles.length ? profiles.map(p => `<a class="user-row card" href="/u/${escapeHtml(p.username)}">${duckAvatar(p)}<div><b>${escapeHtml(p.display_name)}</b><small>@${escapeHtml(p.username)} · ${p.followers_count || 0} seguidores</small></div></a>`).join("") : `<div class="empty card"><b>No encontramos perfiles</b>Probá con otro nombre.</div>`;
    } catch (error) { toast(error.message, "bad"); }
  }
  form?.addEventListener("submit", e => { e.preventDefault(); run(form.q.value); });
  run();
}
