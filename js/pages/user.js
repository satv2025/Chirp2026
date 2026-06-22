import { mountApp } from "../lib/appPage.js";
import { renderTopbar, renderChirp, toast } from "../lib/ui.js";
import { getProfileByUsername, listUserChirps } from "../lib/api.js";
import { escapeHtml, getPathPart } from "../lib/dom.js";
const ctx = await mountApp("explore");
if (ctx) {
  const username = getPathPart(1) || new URLSearchParams(location.search).get("username") || "";
  const main = document.querySelector("#main");
  main.insertAdjacentHTML("afterbegin", renderTopbar(username ? `@${username}` : "Perfil"));
  try {
    const p = await getProfileByUsername(username);
    document.querySelector("#user-card").innerHTML = `<section class="profile-header"><div class="profile-banner" style="${p.banner_url ? `background-image:url('${escapeHtml(p.banner_url)}');background-size:cover;background-position:center` : ""}"></div><div class="profile-body"><div class="profile-avatar">${p.avatar_url ? `<img src="${escapeHtml(p.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:30px">` : "🐣"}</div><h2>${escapeHtml(p.display_name)}</h2><div class="handle">@${escapeHtml(p.username)}</div><p>${escapeHtml(p.bio || "Sin bio todavía.")}</p><div class="profile-stats"><span><b>${p.chirps_count || 0}</b> Chirps</span><span><b>${p.followers_count || 0}</b> Seguidores</span><span><b>${p.following_count || 0}</b> Siguiendo</span></div></div></section>`;
    const chirps = await listUserChirps(p.id); document.querySelector("#user-feed").innerHTML = chirps.length ? chirps.map(c => renderChirp(c, ctx.profile)).join("") : `<div class="empty card"><b>Sin Chirps públicos</b>Cuando chirpee, aparece acá.</div>`;
  } catch(error) { toast(error.message, "bad"); document.querySelector("#user-card").innerHTML = `<div class="empty card"><b>No encontramos ese perfil</b>Probá desde Explorar.</div>`; }
}
