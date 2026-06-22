import { mountApp } from "../lib/appPage.js";
import { renderChirp, renderTopbar, toast } from "../lib/ui.js";
import { listFeed, createChirp, uploadChirpMedia, toggleTable } from "../lib/api.js";
import { supabase } from "../lib/supabaseClient.js";

const ctx = await mountApp("home");
if (ctx) {
  const main = document.querySelector("#main");
  const right = document.querySelector("#rightbar");
  main.insertAdjacentHTML("afterbegin", renderTopbar("Inicio", `<a class="btn secondary" href="/profile/">Mi perfil</a>`));
  right.innerHTML = `<section class="panel"><h3>Hoy en Chirp</h3><div class="trend"><span>💗</span><div><b>Rosin mood</b><small>Compartí algo lindo</small></div></div><div class="trend"><span>🐣</span><div><b>Nuevo Chirp</b><small>Tu timeline te espera</small></div></div></section>`;
  const composer = document.querySelector("#composer-form");
  const files = document.querySelector("#media-input");
  const preview = document.querySelector("#media-preview");
  files?.addEventListener("change", () => {
    preview.innerHTML = "";
    [...files.files].slice(0,4).forEach(file => {
      const url = URL.createObjectURL(file);
      preview.insertAdjacentHTML("beforeend", file.type.startsWith("video/") ? `<video src="${url}" controls></video>` : `<img src="${url}" alt="preview">`);
    });
  });
  composer?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const content = composer.content.value.trim();
    if (!content && !files.files.length) return toast("Escribí algo o subí una imagen.", "bad");
    const btn = composer.querySelector("button[type=submit]");
    btn.disabled = true; btn.textContent = "Chirpeando...";
    try {
      const chirp = await createChirp({ author_id: ctx.user.id, content });
      for (const [i,file] of [...files.files].slice(0,4).entries()) await uploadChirpMedia(ctx.user.id, chirp.id, file, i);
      composer.reset(); preview.innerHTML = ""; toast("Chirp publicado."); await loadFeed();
    } catch (error) { toast(error.message, "bad"); }
    finally { btn.disabled = false; btn.textContent = "Chirpear"; }
  });
  async function loadFeed() {
    const list = document.querySelector("#feed");
    list.innerHTML = `<div class="card pad"><div class="skeleton" style="width:70%"></div><br><div class="skeleton" style="width:90%"></div></div>`;
    try {
      const chirps = await listFeed();
      list.innerHTML = chirps.length ? chirps.map(c => renderChirp(c, ctx.profile)).join("") : `<div class="empty card"><b>Todavía no hay Chirps</b>Rompé el hielo con el primero.</div>`;
    } catch (error) { list.innerHTML = `<div class="empty card"><b>No pudimos cargar el feed</b>${error.message}</div>`; }
  }
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const card = e.target.closest("[data-chirp-id]");
    const chirp_id = card?.dataset.chirpId;
    try {
      const map = { like: "likes", rechirp: "rechirps", bookmark: "bookmarks" };
      await toggleTable(map[btn.dataset.action], { user_id: ctx.user.id, chirp_id }, { user_id: ctx.user.id, chirp_id });
      btn.classList.toggle("active");
    } catch (error) { toast(error.message, "bad"); }
  });
  await loadFeed();
  supabase.channel("chirps-feed").on("postgres_changes", { event: "INSERT", schema: "public", table: "chirps" }, loadFeed).subscribe();
}
