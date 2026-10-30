/* Chirp Shorts + Stories | módulo nativo, sin frameworks ni dependencias nuevas */
(() => {
  'use strict';
  const CFG = window.CHIRP;
  const sb = window.__chirpSupabaseClient;
  if (!CFG || !sb) return;
  const page = document.body?.dataset?.page || '';
  if (!['home', 'shorts', 'stories'].includes(page)) return;

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const html = escapeHTML;
  const avatar = p => p?.avatar_url || '/assets/img/chirpy.png';
  const nameOf = p => p?.display_name || p?.username || 'Usuario';
  const profileLink = p => `/u/${encodeURIComponent(p?.username || 'usuario')}`;
  const tr = n => Number.isFinite(n) ? new Intl.NumberFormat('es-AR', {notation: 'compact', maximumFractionDigits: 1}).format(n) : '0';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const current = {user: null, profile: null, profiles: new Map(), stories: [], groups: [], index: -1, part: 0, storyTimer: 0, storyStart: 0, elapsed: 0, paused: false, shortCards: [], playing: null, shortObserver: null, pageIndex: 0, allLoaded: false, loading: false, movieUrl: '', storyUrls: new Map(), panel: null};

  function notify(msg, error = false) {
    const el = document.createElement('div');
    el.className = 'shst-toast' + (error ? ' shst-toast--error' : '');
    el.textContent = msg;
    document.body.append(el);
    setTimeout(() => el.remove(), 4100);
  }
  function getError(result) {
    if (result.error) throw new Error(result.error.message || 'No se pudo completar la operación.');
    return result.data;
  }
  function showError(e) {
    console.error('[Chirp media]', e);
    const message = e?.message || 'Ocurrió un error. Probá otra vez.';
    notify(message.includes('relation') || message.includes('does not exist') ? 'No se pudieron cargar los videos o historias.' : message, true);
  }
  async function loadProfiles(ids) {
    const missing = [...new Set(ids.filter(Boolean))].filter(id => !current.profiles.has(id));
    if (!missing.length) return;
    const rows = getError(await sb.from('profiles').select('id,username,display_name,avatar_url').in('id', missing));
    (rows || []).forEach(p => current.profiles.set(p.id, p));
  }
  const prof = id => current.profiles.get(id) || {};
  function mediaURL(bucket, path, ttl = 1800) {
    return sb.storage.from(bucket).createSignedUrl(path, ttl).then(r => {
      const data = getError(r);
      return data.signedUrl;
    });
  }
  function openOverlay(id, content, className = '') {
    closeOverlay(id);
    const layer = document.createElement('div');
    layer.id = id;
    layer.className = `shst-overlay ${className}`;
    layer.innerHTML = `<div class="shst-scrim" data-close></div>${content}`;
    document.body.append(layer);
    layer.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) closeOverlay(id);
    });
    document.body.classList.add('shst-no-scroll');
    return layer;
  }
  function closeOverlay(id) {
    if (id === 'storyViewer') resetStoryTimer();
    const el = document.getElementById(id);
    if (el) { $$('video', el).forEach(v => v.pause()); el.remove(); }
    if (!$$('.shst-overlay').length) document.body.classList.remove('shst-no-scroll');
  }
  function fileInfo(file, type) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      if (type === 'image') {
        const i = new Image();
        i.onload = () => { URL.revokeObjectURL(url); resolve({duration: 5}); };
        i.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No pudimos abrir esa imagen.')); };
        i.src = url;
      } else {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
          URL.revokeObjectURL(url);
          const d = video.duration;
          if (!Number.isFinite(d) || d <= 0) reject(new Error('No se pudo identificar la duración del video.'));
          else resolve({duration: Number(d.toFixed(2))});
          video.removeAttribute('src'); video.load();
        };
        video.onerror = () => { URL.revokeObjectURL(url); reject(new Error('El video no se pudo abrir. Usá MP4 o WebM.')); };
        video.src = url;
      }
    });
  }
  const mimeExt = {'video/mp4':'mp4','video/webm':'webm','image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
  async function uploadMedia(bucket, path, file, status) {
    // Supabase recomienda TUS para archivos superiores a 6 MB.
    if (file.size <= 6 * 1024 * 1024 || !window.tus?.Upload) {
      getError(await sb.storage.from(bucket).upload(path, file, {contentType:file.type, upsert:false, cacheControl:'3600'}));
      return;
    }
    const {data:authData,error:authError} = await sb.auth.getSession();
    if (authError || !authData?.session?.access_token) throw new Error('Iniciá sesión nuevamente para subir el video.');
    await new Promise((resolve,reject) => {
      const up = new window.tus.Upload(file, {
        endpoint: CFG.SUPABASE_URL.replace(/\/$/,'') + '/storage/v1/upload/resumable',
        retryDelays: [0,3000,5000,10000,20000],
        headers: {authorization:`Bearer ${authData.session.access_token}`, apikey:CFG.SUPABASE_ANON_KEY},
        metadata: {bucketName:bucket,objectName:path,contentType:file.type,cacheControl:'3600'},
        chunkSize: 6 * 1024 * 1024,
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        onError: reject,
        onProgress: (sent,total) => { if(status.isConnected)status.textContent = `Subiendo contenido... ${Math.round(sent/total*100)}%`; },
        onSuccess: resolve
      });
      up.start();
    });
  }

  function createPost(kind) {
    const short = kind === 'short';
    const title = short ? 'Nuevo Short' : 'Nueva Story';
    const inputAccept = short ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/webp,video/mp4,video/webm';
    const layer = openOverlay('shstComposer', `<section class="shst-dialog" role="dialog" aria-modal="true" aria-label="${title}">
      <header class="shst-dialog-head"><h2>${title}</h2><button type="button" class="shst-close" data-close aria-label="Cerrar">×</button></header>
      <form id="shstUploadForm"><label class="shst-file-picker"><input id="shstFile" type="file" accept="${inputAccept}" required><span class="shst-file-symbol">＋</span><strong>Elegí ${short ? 'un video' : 'una foto o un video'}</strong><span>${short ? 'Hasta 90 segundos · 100 MB' : 'Videos hasta 30 segundos · 50 MB'}</span></label>
      <div class="shst-upload-preview" id="shstPreview"></div>
      <label class="shst-caption-label" for="shstCaption">Descripción</label><textarea id="shstCaption" maxlength="${short ? '500' : '250'}" rows="2" placeholder="Escribí algo..."></textarea>
      <p class="shst-upload-status" id="shstUploadStatus" aria-live="polite"></p>
      <button class="btn btn-primary btn-wide" type="submit" id="shstSubmit">Publicar ${short ? 'Short' : 'Story'}</button></form></section>`, 'shst-modal-compose');
    const picker = $('#shstFile', layer);
    const preview = $('#shstPreview', layer);
    let previewUrl = '';
    function releasePreview() { if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = ''; } }
    picker.addEventListener('change', () => {
      releasePreview(); preview.innerHTML = '';
      const f = picker.files?.[0]; if (!f) return;
      previewUrl = URL.createObjectURL(f);
      const el = document.createElement(f.type.startsWith('video/') ? 'video' : 'img');
      el.src = previewUrl;
      if (el.tagName === 'VIDEO') { el.muted = true; el.controls = true; el.playsInline = true; }
      el.alt = 'Vista previa';
      preview.append(el);
    });
    layer.addEventListener('click', e => { if (e.target.closest('[data-close]')) releasePreview(); });
    $('#shstUploadForm', layer).addEventListener('submit', async e => {
      e.preventDefault();
      const file = picker.files?.[0]; if (!file) return;
      const type = file.type.startsWith('video/') ? 'video' : 'image';
      const ext = mimeExt[file.type];
      const sizeMax = short ? 100 * 1024 * 1024 : 50 * 1024 * 1024;
      if (!ext || (short && type !== 'video')) return notify('Formato no admitido. Usá MP4, WebM o imagen compatible.', true);
      if (file.size > sizeMax || file.size === 0) return notify('El archivo está vacío o supera el máximo permitido.', true);
      const button = $('#shstSubmit', layer), status = $('#shstUploadStatus', layer);
      button.disabled = true; picker.disabled = true;
      let bucket = short ? 'chirp-shorts' : 'chirp-stories';
      let path = '';
      try {
        status.textContent = 'Preparando archivo...';
        const {duration} = await fileInfo(file, type);
        if (duration > (short ? 90 : 30)) throw new Error(`El video supera los ${short ? 90 : 30} segundos permitidos.`);
        path = `${current.user.id}/${crypto.randomUUID()}.${ext}`;
        status.textContent = 'Subiendo contenido...';
        await uploadMedia(bucket, path, file, status);
        status.textContent = 'Publicando...';
        const payload = short ? {author_id:current.user.id, caption:$('#shstCaption', layer).value.trim(), media_path:path, duration_seconds:duration} :
          {author_id:current.user.id, caption:$('#shstCaption', layer).value.trim(), media_path:path, media_kind:type, duration_seconds:duration};
        const insert = await sb.from(short ? 'sh_videos' : 'st_stories').insert(payload).select('id').single();
        if (insert.error) { await sb.storage.from(bucket).remove([path]); throw insert.error; }
        releasePreview(); closeOverlay('shstComposer');
        notify(short ? '¡Short publicado!' : '¡Story publicada!');
        if (short) { await resetShorts(); } else { await loadStories(); if (page === 'stories') renderStoryScreen(); else renderStoryTray($('#homeStories')); }
      } catch (err) {
        showError(err);
      } finally { button.disabled = false; picker.disabled = false; status.textContent = ''; }
    });
  }

  // --------------------- SHORTS ---------------------
  function shortCardMarkup(s, url) {
    const p = prof(s.author_id);
    const own = s.author_id === current.user.id;
    return `<article class="shst-short" data-short-id="${html(s.id)}" data-author-id="${html(s.author_id)}">
      <video class="shst-short-video" playsinline preload="metadata" muted loop src="${html(url)}"></video>
      <div class="shst-short-shade"></div>
      <button class="shst-sound" type="button" data-action="sound" aria-label="Activar sonido">♫</button>
      <button class="shst-play" type="button" data-action="play" aria-label="Reproducir o pausar">Ⅱ</button>
      <div class="shst-short-content"><a class="shst-short-user" href="${profileLink(p)}"><img src="${html(avatar(p))}" alt=""><strong>@${html(p.username || 'usuario')}</strong></a>${!own ? `<button class="shst-follow" data-action="follow" type="button">Seguir</button>` : ''}
        ${s.caption ? `<p>${html(s.caption)}</p>` : ''}</div>
      <div class="shst-short-actions"><button data-action="like" aria-label="Me gusta"><span class="shst-action-symbol">♡</span><small data-count="likes">0</small></button>
        <button data-action="comments" aria-label="Comentarios"><span class="shst-action-symbol">▢</span><small data-count="comments">0</small></button>
        <button data-action="share" aria-label="Compartir"><span class="shst-action-symbol">↗</span><small>Compartir</small></button>
        ${own ? '<button data-action="delete" aria-label="Eliminar Short"><span class="shst-action-symbol">×</span><small>Eliminar</small></button>' : ''}
      </div><span class="shst-short-meter"><span></span></span>
    </article>`;
  }
  async function resetShorts() {
    current.shortObserver?.disconnect(); current.shortObserver = null;
    current.shortCards = []; current.playing?.pause(); current.playing = null;
    current.pageIndex = 0; current.allLoaded = false; current.loading = false;
    const feed = $('#shortsFeed'); if (feed) { feed.innerHTML = ''; feed.scrollTop = 0; }
    await loadShortPage();
  }
  async function loadShortPage() {
    if (current.loading || current.allLoaded) return;
    const feed = $('#shortsFeed'); if (!feed) return;
    current.loading = true;
    const more = $('#moreShorts'); if (more) more.disabled = true;
    try {
      let query = sb.from('sh_videos').select('*').order('created_at', {ascending:false});
      if (new URLSearchParams(location.search).get('mine') === '1') query = query.eq('author_id', current.user.id);
      const rangeStart = current.pageIndex * 10;
      let videos = getError(await query.range(rangeStart, rangeStart + 9)) || [];
      if (current.pageIndex === 0) {
        const deepLink = new URLSearchParams(location.search).get('video');
        if (deepLink && /^[a-f0-9-]{36}$/.test(deepLink) && !videos.some(v => v.id === deepLink)) {
          const r = await sb.from('sh_videos').select('*').eq('id', deepLink).maybeSingle();
          if (r.data) videos = [r.data, ...videos];
        }
      }
      if (videos.length < 10) current.allLoaded = true;
      await loadProfiles(videos.map(v => v.author_id));
      const cards = await Promise.all(videos.map(async v => {
        try { return {video:v, markup:shortCardMarkup(v, await mediaURL('chirp-shorts',v.media_path,3600))}; }
        catch (e) {console.warn('Error en Short',v.id,e); return null;}
      }));
      if (!current.pageIndex && !cards.some(Boolean)) feed.innerHTML = '<div class="shst-empty">Todavía no hay Shorts. ¡Publicá el primero!</div>';
      cards.filter(Boolean).forEach(entry => feed.insertAdjacentHTML('beforeend',entry.markup));
      current.pageIndex++;
      $$('.shst-short', feed).forEach(card => {
        if (card.dataset.bound) return;
        card.dataset.bound = '1';
        card.addEventListener('click', e => onShortAction(e,card));
        const video = $('.shst-short-video',card);
        video.addEventListener('timeupdate', () => { const bar = $('.shst-short-meter span',card); if (bar && video.duration) bar.style.width = `${video.currentTime/video.duration * 100}%`; });
        video.addEventListener('click',()=>{ if (video.paused) video.play().catch(()=>{}); else video.pause(); });
        current.shortCards.push(card);
        current.shortObserver?.observe(card);
      });
      if (!current.shortObserver) {
        current.shortObserver = new IntersectionObserver(entries => {
          const visible = entries.filter(e => e.isIntersecting && e.intersectionRatio > .65).sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
          if (visible) activateShort(visible.target);
        }, {root:feed,threshold:[0,.25,.65,.9]});
        current.shortCards.forEach(card => current.shortObserver.observe(card));
      }
      if (current.pageIndex === 1 && current.shortCards.length) activateShort(current.shortCards[0]);
      $('#shortsNext').hidden = current.allLoaded;
    } catch (e) { showError(e); if (!current.shortCards.length) feed.innerHTML = '<div class="shst-empty">No pudimos cargar los Shorts. Probá actualizar.</div>'; }
    finally {current.loading = false;if (more) more.disabled = false;}
  }
  async function activateShort(card) {
    if (!card || current.playing === $('.shst-short-video',card)) return;
    current.shortCards.forEach(c => {const v = $('video',c);if(v) v.pause();});
    const video = $('video',card);
    current.playing = video;
    video.play().catch(() => {});
    refreshShortMeta(card);
    const id = card.dataset.shortId;
    setTimeout(async () => {
      if (current.playing !== video || video.paused || !video.isConnected) return;
      await sb.from('sh_views').upsert({video_id:id,user_id:current.user.id},{onConflict:'video_id,user_id',ignoreDuplicates:true});
    }, 2000);
    const cards = current.shortCards;
    if (!current.allLoaded && cards.indexOf(card) >= cards.length - 3) loadShortPage();
  }
  async function refreshShortMeta(card) {
    if (!card?.isConnected) return;
    const id = card.dataset.shortId;
    try {
      const [likes,comments,own,follow] = await Promise.all([
        sb.from('sh_likes').select('*',{count:'exact',head:true}).eq('video_id',id),
        sb.from('sh_comments').select('*',{count:'exact',head:true}).eq('video_id',id),
        sb.from('sh_likes').select('video_id').eq('video_id',id).eq('user_id',current.user.id).maybeSingle(),
        sb.from('follows').select('follower_id').eq('following_id',card.dataset.authorId).eq('follower_id',current.user.id).maybeSingle()
      ]);
      if (!card.isConnected) return;
      $('[data-count="likes"]',card).textContent = tr(likes.count ?? 0);
      $('[data-count="comments"]',card).textContent = tr(comments.count ?? 0);
      $('[data-action="like"]',card).classList.toggle('is-liked',Boolean(own.data));
      const f = $('[data-action="follow"]',card); if (f) { f.textContent = follow.data ? 'Siguiendo' : 'Seguir'; f.classList.toggle('is-following',Boolean(follow.data)); }
    } catch (e) { console.warn(e); }
  }
  async function onShortAction(e,card) {
    const control = e.target.closest('button[data-action]'); if (!control) return;
    const id = card.dataset.shortId, action = control.dataset.action, v = $('video',card);
    control.disabled = true;
    try {
      if (action === 'sound') { v.muted = !v.muted; control.textContent = v.muted ? '♫' : '♪';control.setAttribute('aria-label',v.muted?'Activar sonido':'Silenciar'); }
      else if (action === 'play') {if(v.paused) await v.play();else v.pause();control.textContent = v.paused ? '▶' : 'Ⅱ';}
      else if (action === 'like') {
        if (control.classList.contains('is-liked')) getError(await sb.from('sh_likes').delete().match({video_id:id,user_id:current.user.id}));
        else getError(await sb.from('sh_likes').insert({video_id:id,user_id:current.user.id}));
        await refreshShortMeta(card);
      } else if (action === 'comments') { v.pause(); await openComments(id); }
      else if (action === 'share') {
        const link = `${location.origin}/shorts.html?video=${encodeURIComponent(id)}`;
        if (navigator.share) { try {await navigator.share({title:'Chirp Shorts',url:link});} catch(e) {if(e.name!=='AbortError')throw e;} }
        else if(navigator.clipboard?.writeText) {await navigator.clipboard.writeText(link);notify('Enlace copiado');}
        else {window.prompt('Copiá el enlace del Short:', link);}
      } else if (action === 'follow') {
        const target = card.dataset.authorId;
        if (target === current.user.id) return;
        if (control.classList.contains('is-following')) getError(await sb.from('follows').delete().match({follower_id:current.user.id,following_id:target}));
        else getError(await sb.from('follows').insert({follower_id:current.user.id,following_id:target}));
        await refreshShortMeta(card);
      } else if (action === 'delete') {
        if (!confirm('¿Eliminar este Short?')) return;
        const row = getError(await sb.from('sh_videos').select('media_path').eq('id',id).eq('author_id',current.user.id).single());
        getError(await sb.from('sh_videos').delete().eq('id',id).eq('author_id',current.user.id));
        const rm = await sb.storage.from('chirp-shorts').remove([row.media_path]); if(rm.error) console.warn('Archivo pendiente de limpieza',rm.error);
        card.remove(); current.shortCards = current.shortCards.filter(c=>c!==card); notify('Short eliminado');
        if (current.shortCards.length) activateShort(current.shortCards[0]);
        else resetShorts();
      }
    } catch(err) {showError(err);} finally {control.disabled = false;}
  }
  async function openComments(videoId) {
    const layer = openOverlay('shstComments', `<section class="shst-comments shst-dialog" role="dialog" aria-modal="true" aria-label="Comentarios"><header class="shst-dialog-head"><h2>Comentarios</h2><button class="shst-close" data-close aria-label="Cerrar" type="button">×</button></header><div class="shst-comments-list" id="shstCommentsList">Cargando...</div><form id="shstCommentForm"><input maxlength="500" id="shstCommentText" placeholder="Escribí un comentario..." required><button type="submit" class="btn btn-primary">Enviar</button></form></section>`,'shst-modal-comments');
    const view = $('#shstCommentsList',layer);
    async function refresh() {
      const rows = getError(await sb.from('sh_comments').select('id,author_id,content,created_at').eq('video_id',videoId).order('created_at',{ascending:false}).limit(100));
      await loadProfiles(rows.map(r=>r.author_id));
      view.innerHTML = rows.length ? rows.map(c=>{
        const p=prof(c.author_id);return `<div class="shst-comment"><img src="${html(avatar(p))}" alt=""><div><a href="${profileLink(p)}">@${html(p.username||'usuario')}</a><p>${html(c.content)}</p></div>${c.author_id===current.user.id?`<button data-delete-comment="${html(c.id)}" title="Eliminar" aria-label="Eliminar comentario">×</button>`:''}</div>`;
      }).join('') : '<p class="shst-muted">Todavía no hay comentarios.</p>';
    }
    try {await refresh();}catch(e){showError(e);}
    view.addEventListener('click',async e=>{
      const b=e.target.closest('[data-delete-comment]');if(!b)return;
      try{getError(await sb.from('sh_comments').delete().eq('id',b.dataset.deleteComment).eq('author_id',current.user.id));await refresh();}catch(err){showError(err);}
    });
    $('#shstCommentForm',layer).addEventListener('submit',async e=>{
      e.preventDefault();const input=$('#shstCommentText',layer),content=input.value.trim();if(!content)return;
      const button=$('button[type="submit"]',e.target);button.disabled=true;
      try{getError(await sb.from('sh_comments').insert({video_id:videoId,author_id:current.user.id,content}));input.value='';await refresh();const card=$(`[data-short-id="${videoId}"]`);if(card)refreshShortMeta(card);}catch(err){showError(err);}finally{button.disabled=false;}
    });
    layer.addEventListener('click',e=>{if(e.target.closest('[data-close]')){const card=$(`[data-short-id="${videoId}"]`);if(card && current.playing===$('video',card))current.playing.play().catch(()=>{});}});
  }

  // --------------------- STORIES ---------------------
  async function loadStories() {
    const result = await sb.from('st_stories').select('*').gt('expires_at',new Date().toISOString()).order('created_at',{ascending:true}).limit(250);
    current.stories = getError(result) || [];
    await loadProfiles(current.stories.map(s => s.author_id));
    const map = new Map();
    current.stories.forEach(s=> {if(!map.has(s.author_id))map.set(s.author_id,[]);map.get(s.author_id).push(s);});
    current.groups = [...map.entries()].map(([id,entries])=>({id,entries,last:entries[entries.length-1].created_at})).sort((a,b)=> b.last.localeCompare(a.last));
    const selfIndex = current.groups.findIndex(g=>g.id===current.user.id);
    if(selfIndex>0)current.groups.unshift(current.groups.splice(selfIndex,1)[0]);
  }
  function storyTile(group, own = false) {
    const p = prof(group.id);
    return `<button class="shst-story-tile" type="button" data-story-user="${html(group.id)}"><span class="shst-story-ring"><img src="${html(avatar(p))}" alt=""></span><span>${own ? 'Tu historia' : html(p.username || nameOf(p))}</span></button>`;
  }
  function renderStoryTray(container) {
    if(!container)return;
    const hasMine = current.groups.some(g=>g.id===current.user.id);
    container.innerHTML = `<button class="shst-story-tile shst-new-story" type="button" data-create-story><span class="shst-story-add">＋</span><span>Nueva</span></button>` + current.groups.slice(0,page==='home'?12:50).map(g=>storyTile(g, g.id===current.user.id)).join('') + (!current.groups.length ? '<span class="shst-muted shst-tray-placeholder">Todavía no hay historias.</span>':'');
    container.onclick = e=>{ if(e.target.closest('[data-create-story]')) createPost('story'); const b=e.target.closest('[data-story-user]');if(b)openStory(b.dataset.storyUser); };
  }
  function renderStoryScreen() {
    renderStoryTray($('#storiesTray'));
    const grid=$('#storiesGrid');if(!grid)return;
    grid.innerHTML=current.groups.length?current.groups.map(g=>{
      const p=prof(g.id);
      return `<button class="shst-story-card" data-story-user="${html(g.id)}"><span class="shst-story-card-avatar"><img src="${html(avatar(p))}" alt=""></span><strong>${html(nameOf(p))}</strong><small>@${html(p.username||'usuario')} · ${g.entries.length} ${g.entries.length===1?'historia':'historias'}</small></button>`;
    }).join(''):'<div class="shst-empty">Todavía no hay historias. ¡Creá la primera!</div>';
    grid.onclick=e=>{const b=e.target.closest('[data-story-user]');if(b)openStory(b.dataset.storyUser);};
  }
  function resetStoryTimer() {cancelAnimationFrame(current.storyTimer);current.storyTimer=0;const v=$('#storyViewer video');if(v)v.pause();}
  function storyNext(direction = 1) {
    resetStoryTimer();
    const g=current.groups[current.index];if(!g)return;
    let index=current.index,part=current.part+direction;
    if(part>=g.entries.length){index++;part=0;}else if(part<0){index--;part=index>=0?current.groups[index].entries.length-1:0;}
    if(index>=current.groups.length||index<0){closeOverlay('storyViewer');return;}
    current.index=index;current.part=part;renderStoryViewer();
  }
  async function openStory(id) {
    const i=current.groups.findIndex(g=>g.id===id);if(i<0)return;
    current.index=i;current.part=0;
    openOverlay('storyViewer','<section class="shst-story-viewer" role="dialog" aria-modal="true" aria-label="Historia"><div id="shstStoryBody" class="shst-story-body"></div></section>','shst-modal-story');
    await renderStoryViewer();
  }
  async function renderStoryViewer() {
    resetStoryTimer();
    const g=current.groups[current.index], s=g?.entries[current.part], mount=$('#shstStoryBody');
    if(!g||!s||!mount)return;
    const p=prof(s.author_id),own=s.author_id===current.user.id;
    const token=`${current.index}:${current.part}:${s.id}`;
    mount.dataset.storyToken=token;
    mount.innerHTML=`<div class="shst-story-loading">Abriendo historia...</div>`;
    try {
      const url=await mediaURL('chirp-stories',s.media_path,300);
      if(!mount.isConnected||mount.dataset.storyToken!==token)return;
      mount.innerHTML=`<div class="shst-story-progress">${g.entries.map((_,i)=>`<span class="${i<current.part?'is-done':''}"><i style="width:${i<current.part?'100':'0'}%"></i></span>`).join('')}</div>
        <header class="shst-story-header"><a href="${profileLink(p)}"><img src="${html(avatar(p))}" alt=""><strong>${html(nameOf(p))}</strong></a><span>${new Date(s.created_at).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}</span>${own?'<button type="button" data-delete-story title="Eliminar historia">Eliminar</button>':''}<button class="shst-story-close" data-close type="button" aria-label="Cerrar">×</button></header>
        <div class="shst-story-media">${s.media_kind==='video'?`<video src="${html(url)}" playsinline autoplay preload="auto"></video>`:`<img src="${html(url)}" alt="Historia de ${html(nameOf(p))}">`}</div>
        ${s.caption?`<div class="shst-story-caption">${html(s.caption)}</div>`:''}
        <button class="shst-story-prev" type="button" data-story-prev aria-label="Historia anterior">‹</button><button class="shst-story-next" type="button" data-story-next aria-label="Siguiente historia">›</button>
        <footer class="shst-story-bottom">${own?'<button class="shst-story-reactions" type="button" data-story-stats>Vistas y respuestas</button>':`<form id="shstReplyForm"><input id="shstReply" maxlength="250" placeholder="Respondé esta historia..." required><button type="submit" aria-label="Enviar respuesta">➤</button></form>`}</footer>`;
      $('[data-story-prev]',mount).onclick=()=>storyNext(-1);
      $('[data-story-next]',mount).onclick=()=>storyNext(1);
      $('[data-close]',mount).onclick=()=>closeOverlay('storyViewer');
      const deleteBtn=$('[data-delete-story]',mount);
      if(deleteBtn)deleteBtn.onclick=async()=>{
        if(!confirm('¿Eliminar esta historia?'))return;
        try{ getError(await sb.from('st_stories').delete().eq('id',s.id).eq('author_id',current.user.id));
          const removal=await sb.storage.from('chirp-stories').remove([s.media_path]);if(removal.error)console.warn('Archivo pendiente de limpieza',removal.error);
          closeOverlay('storyViewer');await loadStories();if(page==='home')renderStoryTray($('#homeStories'));else renderStoryScreen();notify('Historia eliminada');
        }catch(e){showError(e);}
      };
      const stats=$('[data-story-stats]',mount);if(stats)stats.onclick=()=>openStoryStats(s.id);
      const replyForm=$('#shstReplyForm',mount);
      if(replyForm)replyForm.onsubmit=async e=>{
        e.preventDefault();const input=$('#shstReply',mount),value=input?.value.trim();if(!value)return;
        const button=$('button',replyForm);button.disabled=true;
        try{getError(await sb.from('st_replies').insert({story_id:s.id,author_id:current.user.id,content:value}));input.value='';notify('Respuesta enviada');}
        catch(err){showError(err);}finally{button.disabled=false;}
      };
      // Solo una visualización por persona y Story.
      sb.from('st_views').upsert({story_id:s.id,viewer_id:current.user.id},{onConflict:'story_id,viewer_id',ignoreDuplicates:true}).then(({error})=>{if(error)console.warn(error);});
      const fill=$$('.shst-story-progress i',mount)[current.part];
      const image=$('.shst-story-media img',mount),v=$('.shst-story-media video',mount);
      current.storyStart=performance.now();current.elapsed=0;
      if(v) {
        v.addEventListener('ended',()=>{if(mount.dataset.storyToken===token)storyNext();},{once:true});
        v.addEventListener('loadedmetadata',()=>{if(v.duration && v.duration>0)current.storyStart=performance.now();});
        v.play().catch(()=>{v.muted=true;v.play().catch(()=>{});});
      }
      function animate(now) {
        if(!mount.isConnected||mount.dataset.storyToken!==token)return;
        if(document.hidden||current.paused){current.storyStart=now;current.storyTimer=requestAnimationFrame(animate);return;}
        if(v){if(!v.paused && v.duration>0)fill.style.width=`${Math.min(100,v.currentTime/v.duration*100)}%`;}
        else {current.elapsed+=Math.max(0,Math.min(100,now-current.storyStart));current.storyStart=now;fill.style.width=`${Math.min(100,current.elapsed/(s.duration_seconds*1000)*100)}%`;if(current.elapsed>=s.duration_seconds*1000){storyNext();return;}}
        current.storyTimer=requestAnimationFrame(animate);
      }
      current.storyTimer=requestAnimationFrame(animate);
    }catch(e){showError(e);closeOverlay('storyViewer');}
  }
  async function openStoryStats(storyId) {
    const layer=openOverlay('shstStoryStats',`<section class="shst-dialog shst-stat-dialog" role="dialog" aria-modal="true" aria-label="Vistas y respuestas"><header class="shst-dialog-head"><h2>Tu historia</h2><button type="button" class="shst-close" data-close aria-label="Cerrar">×</button></header><div class="shst-stat-list" id="shstStatList">Cargando...</div></section>`);
    try{
      const [views,replies]=await Promise.all([
        sb.from('st_views').select('viewer_id,viewed_at').eq('story_id',storyId).order('viewed_at',{ascending:false}),
        sb.from('st_replies').select('author_id,content,created_at').eq('story_id',storyId).order('created_at',{ascending:false})
      ]);
      const v=getError(views),r=getError(replies);
      await loadProfiles([...v.map(e=>e.viewer_id),...r.map(e=>e.author_id)]);
      $('#shstStatList',layer).innerHTML=`<h3>Vistas (${v.length})</h3>${v.length?v.map(e=>{const p=prof(e.viewer_id);return `<a class="shst-stat-person" href="${profileLink(p)}"><img src="${html(avatar(p))}" alt=""><span>${html(nameOf(p))}</span></a>`;}).join(''):'<p class="shst-muted">Todavía no hay vistas.</p>'}
        <h3>Respuestas (${r.length})</h3>${r.length?r.map(e=>{const p=prof(e.author_id);return `<div class="shst-stat-person"><img src="${html(avatar(p))}" alt=""><div><b>${html(nameOf(p))}</b><p>${html(e.content)}</p></div></div>`;}).join(''):'<p class="shst-muted">Todavía no hay respuestas.</p>'}`;
    }catch(err){showError(err);}
  }
  document.addEventListener('keydown', e=>{
    if(e.key==='Escape'){$$('.shst-overlay').reverse().slice(0,1).forEach(x=>closeOverlay(x.id));}
    if($('#storyViewer') && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) {
      if(e.key==='ArrowRight')storyNext(1);if(e.key==='ArrowLeft')storyNext(-1);
    }
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)current.playing?.pause();else if(page==='shorts' && current.playing && !$('#shstComments'))current.playing.play().catch(()=>{});
    const sv=$('#storyViewer video');if(sv){if(document.hidden)sv.pause();else sv.play().catch(()=>{});}
  });
  async function start() {
    const session = await sb.auth.getSession();
    current.user=session.data?.session?.user;
    if(!current.user)return;
    const {data}=await sb.from('profiles').select('id,username,display_name,avatar_url').eq('id',current.user.id).maybeSingle();
    current.profile=data||{id:current.user.id};current.profiles.set(current.user.id,current.profile);
    if(page==='shorts') {
      $('#newShort')?.addEventListener('click',()=>createPost('short'));
      $('#moreShorts')?.addEventListener('click',()=>loadShortPage());
      await loadShortPage();
    }
    if(page==='stories'||page==='home') {
      $('#newStory')?.addEventListener('click',()=>createPost('story'));
      try{await loadStories();if(page==='home')renderStoryTray($('#homeStories'));else renderStoryScreen();}
      catch(e){showError(e);}
      if(page==='stories'&&new URLSearchParams(location.search).get('create')==='1')createPost('story');
    }
  }
  document.addEventListener('DOMContentLoaded',()=>start().catch(showError));
})();
