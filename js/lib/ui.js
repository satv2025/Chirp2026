import { $, escapeHtml, fmtDate } from "./dom.js";

export function toast(message, type = "ok") {
  let wrap = $(".toast-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "toast-wrap";
    document.body.appendChild(wrap);
  }
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

export function duckAvatar(profile = {}) {
  if (profile.avatar_url) return `<img class="avatar" src="${escapeHtml(profile.avatar_url)}" alt="">`;
  return `<div class="avatar">🐣</div>`;
}

export function renderShell(active = "home", profile = null) {
  const nav = [
    ["/home/", "home", "🏠", "Inicio"],
    ["/explore/", "explore", "🔎", "Explorar"],
    ["/notifications/", "notifications", "💌", "Notificaciones"],
    ["/bookmarks/", "bookmarks", "🎀", "Guardados"],
    ["/profile/", "profile", "👤", "Perfil"],
    ["/settings/", "settings", "⚙️", "Ajustes"]
  ];
  const side = document.createElement("aside");
  side.className = "sidebar";
  side.innerHTML = `
    <a class="logo" href="/home/"><img src="/assets/brand/favicon.svg" alt=""><strong>Chirp</strong></a>
    <nav class="side-nav">
      ${nav.map(([href,key,icon,label]) => `<a class="side-link ${active === key ? "active" : ""}" href="${href}"><span>${icon}</span><b>${label}</b></a>`).join("")}
    </nav>
    <a class="btn primary" href="/home/#compose">Chirpear</a>
    <div class="side-footer">
      <div class="mini-profile">
        ${duckAvatar(profile || {})}
        <div><b>${escapeHtml(profile?.display_name || "Chirper")}</b><small>@${escapeHtml(profile?.username || "tu_usuario")}</small></div>
      </div>
      <button class="btn ghost" data-logout style="margin-top:12px;width:100%">Salir</button>
    </div>`;
  return side;
}

export function renderMobileNav(active = "home") {
  const nav = [["/home/","home","🏠"],["/explore/","explore","🔎"],["/notifications/","notifications","💌"],["/bookmarks/","bookmarks","🎀"],["/profile/","profile","👤"]];
  const el = document.createElement("nav");
  el.className = "mobile-nav";
  el.innerHTML = nav.map(([href,key,icon]) => `<a class="${active === key ? "active" : ""}" href="${href}">${icon}</a>`).join("");
  return el;
}

export function renderChirp(chirp, viewer = {}) {
  const p = chirp.profiles || chirp.author || {};
  const media = chirp.chirp_media || [];
  const mediaHtml = media.length ? `<div class="chirp-media-grid ${media.length > 1 ? "two" : ""}">${media.map(m => {
    const url = m.public_url || m.media_url || "";
    if ((m.media_type || "").startsWith("video")) return `<video src="${escapeHtml(url)}" controls></video>`;
    return `<img src="${escapeHtml(url)}" alt="${escapeHtml(m.alt_text || "media")}">`;
  }).join("")}</div>` : "";
  return `<article class="chirp-card" data-chirp-id="${chirp.id}">
    <div class="chirp-head">
      ${duckAvatar(p)}
      <div style="min-width:0;flex:1">
        <div class="chirp-author"><a href="/u/${escapeHtml(p.username || "")}"><b>${escapeHtml(p.display_name || "Chirper")}</b></a><small>@${escapeHtml(p.username || "usuario")}</small><small>· ${fmtDate(chirp.created_at)}</small></div>
        <div class="chirp-content">${escapeHtml(chirp.content || "")}</div>
        ${mediaHtml}
        <div class="chirp-actions">
          <a class="icon-btn" href="/chirp/${chirp.id}">💬 <span>${chirp.replies_count || 0}</span></a>
          <button class="icon-btn" data-action="rechirp">🔁 <span>${chirp.rechirps_count || 0}</span></button>
          <button class="icon-btn" data-action="like">💗 <span>${chirp.likes_count || 0}</span></button>
          <button class="icon-btn" data-action="bookmark">🎀 <span>${chirp.bookmarks_count || 0}</span></button>
        </div>
      </div>
    </div>
  </article>`;
}

export function renderTopbar(title, right = "") {
  return `<header class="topbar"><h1>${escapeHtml(title)}</h1><div>${right}</div></header>`;
}

export function requireCard() {
  document.body.innerHTML = `<main class="auth-required"><section class="card"><img src="/assets/brand/favicon.svg" style="width:76px;margin:auto" alt=""><h1>Entrá a Chirp</h1><p style="color:var(--muted);line-height:1.5">Necesitás iniciar sesión para ver esta sección.</p><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:20px"><a class="btn primary" href="/login/">Entrar</a><a class="btn secondary" href="/register/">Crear cuenta</a></div></section></main>`;
}
