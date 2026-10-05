'use strict';
// Eingebautes Office (Word, Excel, PowerPoint im Browser) über Collabora Online und das WOPI-Protokoll.
// Collabora läuft als zweiter Container (docker-compose.office.yml). Lernhafen ist der WOPI-Host: Collabora holt die Datei
// bei uns ab und schickt Änderungen zurück. Die Datei bleibt dabei immer in data/library/<Fach>/ liegen.
const fs = require('fs');
const config = require('./config');
const auth = require('./auth');
const files = require('./files');

const internalUrl = () => (process.env.COLLABORA_URL || '').replace(/\/+$/, '');
const enabled = () => !!internalUrl();
const wopiBase = () => (process.env.WOPI_HOST_URL || `http://lernhafen:${config.port}`).replace(/\/+$/, '');
const b64u = s => Buffer.from(s).toString('base64url');

/* ---------- Zugangs-Token für Collabora (gilt nur für eine Datei, ist signiert und läuft ab) ---------- */
function token(fileId, write, hours = 12) {
  const p = b64u(JSON.stringify({ f: fileId, w: !!write, e: Date.now() + hours * 36e5 }));
  return p + '.' + auth.sign('wopi.' + p);
}
function verify(t, fileId) {
  const [p, sig] = String(t || '').split('.');
  if (!p || !sig || !auth.same(sig, auth.sign('wopi.' + p))) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.f === fileId && o.e > Date.now() ? o : null; } catch (e) { return null; }
}

/* ---------- Adressen der Editoren aus Collabora lesen ---------- */
let cache = { at: 0, map: null, error: '' };
async function discovery() {
  if (!enabled()) return { map: null, error: 'Office ist nicht aktiviert.' };
  if (Date.now() - cache.at < 30000 && (cache.map || cache.error)) return cache;
  try {
    const r = await fetch(internalUrl() + '/hosting/discovery', { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const xml = await r.text(), map = {};
    for (const tag of xml.match(/<action\b[^>]*>/g) || []) {
      const at = k => (new RegExp(`\\b${k}="([^"]*)"`).exec(tag) || [])[1];
      const e = at('ext'), n = at('name'), u = at('urlsrc');
      if (e && n && u && ['edit', 'view'].includes(n)) (map[e] = map[e] || {})[n] = u.replace(/&amp;/g, '&');
    }
    if (!Object.keys(map).length) throw new Error('Collabora hat keine Editoren gemeldet.');
    cache = { at: Date.now(), map, error: '' };
  } catch (e) { cache = { at: Date.now(), map: null, error: 'Der Office-Dienst antwortet nicht (' + String(e.message || e).slice(0, 80) + ').' }; }
  return cache;
}
async function status() { const d = await discovery(); return { enabled: enabled(), ok: !!d.map, message: d.error }; }
function resetCache() { cache = { at: 0, map: null, error: '' }; }

/** Adresse, unter der der Browser Collabora erreicht: gleicher Rechnername wie bei Lernhafen, Port 9980. */
function publicOrigin(req) {
  if (process.env.COLLABORA_PUBLIC_URL) return process.env.COLLABORA_PUBLIC_URL.replace(/\/+$/, '');
  return `${req.protocol}://${req.hostname}:${process.env.COLLABORA_PORT || 9980}`;
}

/** Fertige Adresse für das eingebettete Fenster. */
async function editorUrl(req, fileId) {
  const f = files.find(fileId); if (!f) throw new Error('Datei nicht gefunden.');
  const d = await discovery(); if (!d.map) throw new Error(d.error || 'Office ist nicht erreichbar.');
  const e = files.kindOf(f.name) === 'datei' ? '' : f.name.split('.').pop().toLowerCase(), acts = d.map[e];
  if (!acts) throw new Error('Diesen Dateityp kann das Office nicht öffnen.');
  const mode = acts.edit ? 'edit' : 'view', pub = new URL(publicOrigin(req)), u = new URL(acts[mode]);
  u.protocol = pub.protocol; u.host = pub.host;
  const src = encodeURIComponent(`${wopiBase()}/wopi/files/${fileId}`), tok = token(fileId, mode === 'edit');
  const str = u.toString(), base = str + (str.includes('?') ? (/[?&]$/.test(str) ? '' : '&') : '?');
  return { url: `${base}WOPISrc=${src}&access_token=${encodeURIComponent(tok)}&access_token_ttl=${Date.now() + 12 * 36e5}&lang=de`, name: f.name, mode, origin: pub.origin };
}

/* ---------- WOPI-Schnittstelle (wird von Collabora aufgerufen) ---------- */
function tokenOf(req) { return req.query.access_token || (/^Bearer (.+)$/.exec(req.headers.authorization || '') || [])[1] || ''; }
function mount(app, express) {
  const guard = (req, res, write) => {
    const t = verify(tokenOf(req), req.params.id), f = files.find(req.params.id);
    if (!t || !f) { res.status(401).json({ error: 'Zugriff verweigert.' }); return null; }
    if (write && !t.w) { res.status(401).json({ error: 'Nur lesen erlaubt.' }); return null; }
    return { f, t };
  };
  app.get('/wopi/files/:id', (req, res) => {
    const g = guard(req, res); if (!g) return;
    res.json({ BaseFileName: g.f.name, OwnerId: 'lernhafen', UserId: 'lernhafen-nutzer', UserFriendlyName: 'Ich', Size: g.f.size, Version: String(g.f.modified || g.f.created),
      LastModifiedTime: g.f.modified || g.f.created, UserCanWrite: !!g.t.w, SupportsUpdate: true, SupportsLocks: true, UserCanNotWriteRelative: true, DisablePrint: false, DisableExport: false, DisableCopy: false });
  });
  app.get('/wopi/files/:id/contents', (req, res) => {
    const g = guard(req, res); if (!g) return;
    const p = files.filePath(g.f.id); if (!p) return res.status(404).json({ error: 'Datei fehlt.' });
    res.setHeader('Content-Type', 'application/octet-stream'); res.sendFile(p);
  });
  app.post('/wopi/files/:id/contents', express.raw({ type: () => true, limit: '100mb' }), (req, res) => {
    const g = guard(req, res, true); if (!g) return;
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Leer.' });
    const f = files.replace(g.f.id, req.body);
    res.json({ LastModifiedTime: f.modified });
  });
  const locks = new Map();                    // Sperren nur im Speicher: genügt für einen einzelnen Nutzer
  app.post('/wopi/files/:id', (req, res) => {
    const g = guard(req, res); if (!g) return;
    const op = String(req.headers['x-wopi-override'] || '').toUpperCase(), lock = req.headers['x-wopi-lock'] || '', cur = locks.get(g.f.id);
    if (op === 'GET_LOCK') { res.setHeader('X-WOPI-Lock', cur || ''); return res.status(200).end(); }
    if (op === 'LOCK' || op === 'REFRESH_LOCK') { if (cur && cur !== lock && !(req.headers['x-wopi-oldlock'] === cur)) { res.setHeader('X-WOPI-Lock', cur); return res.status(409).end(); } locks.set(g.f.id, lock); return res.status(200).end(); }
    if (op === 'UNLOCK') { if (cur && cur !== lock) { res.setHeader('X-WOPI-Lock', cur); return res.status(409).end(); } locks.delete(g.f.id); return res.status(200).end(); }
    res.status(501).end();
  });
}

module.exports = { enabled, status, editorUrl, token, verify, mount, resetCache, publicOrigin };
