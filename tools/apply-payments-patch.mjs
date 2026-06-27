#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const chirpJs = path.join(root, 'assets/js/chirp.js');
const vercelJson = path.join(root, 'vercel.json');

function patchChirpJs() {
  if (!fs.existsSync(chirpJs)) {
    console.warn('No encontré assets/js/chirp.js. Salteo parche de badge.');
    return;
  }

  let src = fs.readFileSync(chirpJs, 'utf8');
  let changed = false;

  if (!src.includes('function isActiveChirpGold')) {
    src = src.replace(
      /const VERIFIED_GOLD_ICON_SRC = ([^;]+);/,
      `const VERIFIED_GOLD_ICON_SRC = $1;\n\n  function isActiveChirpGold(p = {}) {\n    if (!p?.is_chirp_gold) return false;\n    if (!p.gold_until) return true;\n    const until = new Date(p.gold_until).getTime();\n    return Number.isFinite(until) && until > Date.now();\n  }`
    );
    changed = true;
  }

  if (src.includes('function chirpCheckLevel') && !src.includes('isActiveChirpGold(p)')) {
    src = src.replace(
      /function chirpCheckLevel\(p = \{\}\) \{\n\s*if \(!p\) return '';\n/,
      `function chirpCheckLevel(p = {}) {\n    if (!p) return '';\n\n    if (isActiveChirpGold(p)) return 'gold';\n`
    );
    changed = true;
  }

  for (const slug of [`'gold.html'`, `'gold-return.html'`, `'gold'`, `'gold-return'`]) {
    if (!src.includes(slug) && src.includes("'settings.html'")) {
      src = src.replace("'settings.html',", `'settings.html',\n      ${slug},`);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(chirpJs, src);
    console.log('OK: assets/js/chirp.js parcheado para Gold activo/rutas reservadas.');
  } else {
    console.log('assets/js/chirp.js ya parecía parcheado.');
  }
}

function patchVercelJson() {
  if (!fs.existsSync(vercelJson)) {
    console.warn('No encontré vercel.json. Salteo rutas limpias.');
    return;
  }

  const raw = fs.readFileSync(vercelJson, 'utf8');
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch (error) {
    console.warn('vercel.json no es JSON válido. Salteo.', error.message);
    return;
  }

  cfg.rewrites = Array.isArray(cfg.rewrites) ? cfg.rewrites : [];
  const wanted = [
    { source: '/gold', destination: '/gold.html' },
    { source: '/gold-return', destination: '/gold-return.html' },
  ];

  let changed = false;
  for (const route of wanted) {
    if (!cfg.rewrites.some((r) => r.source === route.source)) {
      cfg.rewrites.unshift(route);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(vercelJson, `${JSON.stringify(cfg, null, 2)}\n`);
    console.log('OK: vercel.json parcheado con /gold y /gold-return.');
  } else {
    console.log('vercel.json ya tenía rutas Gold.');
  }
}

patchChirpJs();
patchVercelJson();
