import { mountApp } from "../lib/appPage.js";
import { renderTopbar, renderChirp, toast } from "../lib/ui.js";
import { listUserChirps } from "../lib/api.js";
import { escapeHtml } from "../lib/dom.js";
const ctx = await mountApp("profile");
if (ctx) {
  const main = document.querySelector("#main");
  main.insertAdjacentHTML("afterbegin", renderTopbar("Mi perfil", `<a class="btn secondary" href="/settings/">Editar</a>`));
  const p = ctx.profile || {};
  document.querySelector("#profile-card").innerHTML = `<section class="profile-header"><div class="profile-banner" style="${p.banner_url ? `background-image:url('${escapeHtml(p.banner_url)}');background-size:cover;background-position:center` : ""}"></div><div class="profile-body"><div class="profile-avatar">${p.avatar_url ? `<img src="${escapeHtml(p.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:30px">` : "🐣"}</div><h2>${escapeHtml(p.display_name || "Chirper")}</h2><div class="handle">@${escapeHtml(p.username || "usuario")}</div><p>${escapeHtml(p.bio || "Sin bio todavía, pero con mucho mood rosa.")}</p><div class="profile-stats"><span><b>${p.chirps_count || 0}</b> Chirps</span><span><b>${p.followers_count || 0}</b> Seguidores</span><span><b>${p.following_count || 0}</b> Siguiendo</span></div></div></section>`;
  const list = document.querySelector("#profile-feed");
  try { const chirps = await listUserChirps(ctx.user.id); list.innerHTML = chirps.length ? chirps.map(c => renderChirp(c, ctx.profile)).join("") : `<div class="empty card"><b>Aún no chirpeaste</b>Tu perfil está listo para el primer Chirp.</div>`; }
  catch (error) { toast(error.message, "bad"); }
}
