'use strict';
// Google-Drive-Abgleich, eingebaut in Lernhafen: Der Ordner data/library wird mit dem Drive-Ordner „Lernhafen“ abgeglichen.
// Anmeldung wie am Fernseher: Code auf google.com/device eingeben. Dafür braucht die App nur das Recht „drive.file“
// (Zugriff auf die Dateien, die Lernhafen selbst angelegt hat). Alles läuft im Container, es gibt keinen Dienst dazwischen.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const files = require('./files');

const O = () => process.env.GOOGLE_ORIGIN || '';      // nur für Tests: alle Adressen auf einen Test-Server umleiten
const U = {
  device: () => (O() || 'https://oauth2.googleapis.com') + '/device/code',
  token: () => (O() || 'https://oauth2.googleapis.com') + '/token',
  revoke: () => (O() || 'https://oauth2.googleapis.com') + '/revoke',
  drive: () => (O() || 'https://www.googleapis.com') + '/drive/v3',
  upload: () => (O() || 'https://www.googleapis.com') + '/upload/drive/v3'
};
const SCOPE = 'openid email https://www.googleapis.com/auth/drive.file';
const FOLDER = 'application/vnd.google-apps.folder';
const MAX_FILE = 150 * 1024 * 1024;
const ROOT_NAME = 'Lernhafen';

/** Zugangsdaten der Google-App von Lernhafen: aus der Umgebung, aus einer beim Bauen eingefügten Datei oder vom Nutzer eingetragen. */
function creds() {
  let id = (process.env.GOOGLE_CLIENT_ID || '').trim(), secret = (process.env.GOOGLE_CLIENT_SECRET || '').trim(), source = 'umgebung';
  if (!(id && secret)) { try { const f = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'google-client.json'), 'utf8')); id = String(f.clientId || '').trim(); secret = String(f.clientSecret || '').trim(); source = 'image'; } catch (e) { /* keine eingebackene Datei */ } }
  if (!(id && secret)) { const c = store.read('gdrive', {}) || {}; id = c.clientId || ''; secret = c.clientSecret || ''; source = 'eigene'; }
  return id && secret ? { id, secret, source } : null;
}
const cfg = () => store.read('gdrive', {}) || {};
const save = c => store.write('gdrive', c, 0o600);
const patch = o => { const c = Object.assign(cfg(), o); save(c); return c; };

function status() {
  const c = cfg(), cr = creds();
  return { available: !!cr, credsSource: cr ? cr.source : '', connected: !!(c.tokens && c.tokens.refresh), email: c.email || '', mode: c.mode || 'backup', auto: c.auto !== false,
    last: c.last || null, running: !!running, error: c.error || '', pending: c.device ? { userCode: c.device.userCode, url: c.device.url, expires: c.device.expires } : null };
}
function saveCreds(clientId, clientSecret) {
  clientId = String(clientId || '').trim(); clientSecret = String(clientSecret || '').trim();
  if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new Error('Die Client-ID sieht nicht richtig aus. Sie endet auf .apps.googleusercontent.com.');
  if (!clientSecret) throw new Error('Bitte den Client-Schlüssel eintragen.');
  patch({ clientId, clientSecret }); return status();
}

/* ---------- Anmeldung mit Code (Geräte-Weg) ---------- */
async function post(url, params) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params), signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, j };
}
async function connect() {
  const cr = creds(); if (!cr) throw new Error('In dieser Installation ist keine Google-App hinterlegt.');
  const r = await post(U.device(), { client_id: cr.id, scope: SCOPE });
  if (!r.ok) throw new Error('Google hat die Anmeldung nicht gestartet: ' + (r.j.error_description || r.j.error || 'HTTP ' + r.status));
  patch({ error: '', device: { code: r.j.device_code, userCode: r.j.user_code, url: r.j.verification_url || r.j.verification_uri || 'https://www.google.com/device', interval: r.j.interval || 5, expires: Date.now() + (r.j.expires_in || 900) * 1000 } });
  return status();
}
/** Wird von der App alle paar Sekunden gefragt: ist der Code schon eingegeben? */
async function poll() {
  const c = cfg(), cr = creds();
  if (!c.device) return Object.assign(status(), { state: c.tokens ? 'connected' : 'idle' });
  if (Date.now() > c.device.expires) { patch({ device: null }); return Object.assign(status(), { state: 'expired' }); }
  const r = await post(U.token(), { client_id: cr.id, client_secret: cr.secret, device_code: c.device.code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
  if (r.ok && r.j.refresh_token) {
    let email = ''; try { email = JSON.parse(Buffer.from(String(r.j.id_token).split('.')[1], 'base64url').toString()).email || ''; } catch (e) { /* nur Anzeige */ }
    if (c.email && email && c.email !== email) patch({ files: {}, rootId: '' });
    patch({ device: null, email, tokens: { refresh: r.j.refresh_token, access: r.j.access_token, expiry: Date.now() + (r.j.expires_in || 3600) * 1000 }, error: '' });
    schedule(2000); return Object.assign(status(), { state: 'connected' });
  }
  const e = r.j.error;
  if (e === 'authorization_pending' || e === 'slow_down') return Object.assign(status(), { state: 'pending' });
  patch({ device: null });
  return Object.assign(status(), { state: e === 'access_denied' ? 'denied' : 'expired' });
}
async function disconnect() {
  const c = cfg();
  if (c.tokens && c.tokens.refresh) { try { await post(U.revoke(), { token: c.tokens.refresh }); } catch (e) { /* Widerruf ist ein Zusatz */ } }
  const keep = { clientId: c.clientId, clientSecret: c.clientSecret };
  store.remove('gdrive'); if (keep.clientId) save(keep);
  return status();
}
function setSettings({ mode, auto }) { const o = {}; if (mode === 'backup' || mode === 'twoway') o.mode = mode; if (typeof auto === 'boolean') o.auto = auto; patch(o); return status(); }

async function accessToken() {
  const c = cfg(), cr = creds();
  if (!c.tokens || !c.tokens.refresh) throw new Error('Google Drive ist nicht verbunden.');
  if (c.tokens.access && c.tokens.expiry > Date.now() + 60000) return c.tokens.access;
  const r = await post(U.token(), { client_id: cr.id, client_secret: cr.secret, refresh_token: c.tokens.refresh, grant_type: 'refresh_token' });
  if (!r.ok) {
    if (r.j.error === 'invalid_grant') { const n = cfg(); delete n.tokens; n.error = 'Die Verbindung zu Google Drive ist abgelaufen oder wurde widerrufen. Verbinde sie neu.'; save(n); throw new Error(n.error); }
    throw new Error('Google antwortet nicht: ' + (r.j.error_description || r.j.error || 'HTTP ' + r.status));
  }
  c.tokens.access = r.j.access_token; c.tokens.expiry = Date.now() + (r.j.expires_in || 3600) * 1000; save(c); return c.tokens.access;
}
async function call(method, url, opt = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const headers = Object.assign({ Authorization: 'Bearer ' + await accessToken() }, opt.headers || {});
    let body = opt.body; if (opt.json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opt.json); }
    const r = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(opt.timeout || 120000) });
    if (r.status === 401 && attempt === 0) { const c = cfg(); if (c.tokens) { c.tokens.expiry = 0; save(c); } continue; }
    if (opt.raw) return r;
    if (r.status === 204) return {};
    const text = await r.text(); let j = {}; try { j = text ? JSON.parse(text) : {}; } catch (e) { j = { text }; }
    if (!r.ok) { const e = new Error((j.error && (j.error.message || j.error)) || 'HTTP ' + r.status); e.status = r.status; throw e; }
    return j;
  }
}

/* ---------- Drive-Zugriffe ---------- */
const q1 = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
async function listChildren(folderId) {
  const out = []; let page = '';
  do {
    const p = new URLSearchParams({ q: `'${folderId}' in parents and trashed=false`, fields: 'nextPageToken,files(id,name,mimeType,md5Checksum,modifiedTime,size)', pageSize: '1000' }); if (page) p.set('pageToken', page);
    const j = await call('GET', `${U.drive()}/files?${p}`); out.push(...(j.files || [])); page = j.nextPageToken;
  } while (page);
  return out;
}
async function makeFolder(name, parent) { return (await call('POST', `${U.drive()}/files?fields=id`, { json: { name, mimeType: FOLDER, parents: parent ? [parent] : undefined } })).id; }
async function findFolder(name, parent) {
  const j = await call('GET', `${U.drive()}/files?` + new URLSearchParams({ q: `mimeType='${FOLDER}' and trashed=false and name='${q1(name)}'${parent ? ` and '${parent}' in parents` : ''}`, fields: 'files(id)', pageSize: '1' }));
  return j.files && j.files[0] && j.files[0].id;
}
async function uploadFile({ id, name, parent, buf, mime }) {
  const url = id ? `${U.upload()}/files/${id}?uploadType=resumable&fields=id,md5Checksum,modifiedTime` : `${U.upload()}/files?uploadType=resumable&fields=id,md5Checksum,modifiedTime`;
  const start = await call(id ? 'PATCH' : 'POST', url, { json: id ? {} : { name, parents: [parent] }, headers: { 'X-Upload-Content-Type': mime || 'application/octet-stream', 'X-Upload-Content-Length': String(buf.length) }, raw: true });
  if (!start.ok) { const e = new Error('Drive hat den Upload nicht gestartet (HTTP ' + start.status + ').'); e.status = start.status; throw e; }
  const loc = start.headers.get('location'); if (!loc) throw new Error('Drive hat keine Upload-Adresse geliefert.');
  const put = await call('PUT', loc, { body: buf, headers: { 'Content-Type': mime || 'application/octet-stream' }, raw: true, timeout: 20 * 60000 });
  if (!put.ok) throw new Error('Der Upload zu Drive ist fehlgeschlagen (HTTP ' + put.status + ').');
  return put.json();
}
async function download(id, dest) {
  const r = await call('GET', `${U.drive()}/files/${id}?alt=media`, { raw: true, timeout: 20 * 60000 });
  if (!r.ok) throw new Error('Download von Drive fehlgeschlagen (HTTP ' + r.status + ').');
  const tmp = dest + '.lh-tmp'; fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer())); fs.renameSync(tmp, dest);
}
const trash = id => call('PATCH', `${U.drive()}/files/${id}`, { json: { trashed: true } });

/* ---------- Abgleich ---------- */
const md5 = p => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const MIME = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.txt': 'text/plain', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };

function walkLocal(root) {
  const out = {};
  (function rec(dir, rel) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name.endsWith('.lh-tmp')) continue;
      const r = rel ? rel + '/' + e.name : e.name, p = path.join(dir, e.name);
      if (e.isDirectory()) rec(p, r); else if (e.isFile()) { const st = fs.statSync(p); out[r] = { p, size: st.size, mtime: st.mtimeMs }; }
    }
  })(root, '');
  return out;
}
async function walkRemote(rootId) {
  const out = {}, folders = { '': rootId }, queue = [['', rootId]];
  while (queue.length) {
    const [rel, id] = queue.shift();
    for (const f of await listChildren(id)) {
      const r = rel ? rel + '/' + f.name : f.name;
      if (f.mimeType === FOLDER) { folders[r] = f.id; queue.push([r, f.id]); } else if (!/^application\/vnd\.google-apps\./.test(f.mimeType)) out[r] = { id: f.id, md5: f.md5Checksum || '', size: +f.size || 0, modified: f.modifiedTime };
    }
  }
  return { files: out, folders };
}
async function ensureRoot(c) {
  if (c.rootId) { try { const j = await call('GET', `${U.drive()}/files/${c.rootId}?fields=id,trashed`); if (j.id && !j.trashed) return { id: c.rootId, fresh: false }; } catch (e) { if (e.status !== 404) throw e; } }
  const found = await findFolder(ROOT_NAME), id = found || await makeFolder(ROOT_NAME); patch({ rootId: id });
  return { id, fresh: !found };
}
async function ensureDir(folders, rel) {
  if (folders[rel] !== undefined) return folders[rel];
  const i = rel.lastIndexOf('/'), parent = await ensureDir(folders, i < 0 ? '' : rel.slice(0, i));
  const id = await makeFolder(i < 0 ? rel : rel.slice(i + 1), parent); folders[rel] = id; return id;
}
const conflictName = (rel, tag) => { const e = path.posix.extname(rel); return rel.slice(0, rel.length - e.length) + ` (${tag} ${new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '-')})` + e; };

let running = null, timer = 0, loopT = 0;
async function runOnce() {
  const c0 = cfg(), mode = c0.mode || 'backup', root = files.root(), res = { time: Date.now(), up: 0, down: 0, trashed: 0, conflicts: 0, errors: [], ok: true };
  const rt = await ensureRoot(c0), rootId = rt.id;
  let state = rt.fresh ? {} : ((cfg().files) || {});          // rel -> { id, md5, rmd5, size, mtime } = Stand beim letzten Abgleich; neuer Drive-Ordner = alles neu hochladen
  const local = walkLocal(root), remote = await walkRemote(rootId), next = {};
  // Schutz: Ist der Drive-Ordner plötzlich leer, obwohl wir viel abgeglichen hatten, wird nichts lokal gelöscht
  const suspicious = !Object.keys(remote.files).length && Object.keys(state).length > 0;
  const effMode = suspicious ? 'backup' : mode;
  const rec = (rel, id, md5v, rmd5) => { const st = fs.statSync(local[rel] ? local[rel].p : path.join(root, ...rel.split('/'))); return { id, md5: md5v, rmd5, size: st.size, mtime: st.mtimeMs }; };
  const note = (rel, e) => { res.errors.push(`${rel}: ${String(e.message || e).slice(0, 120)}`); };
  const lhash = rel => { const l = local[rel], b = state[rel]; if (!l.h) l.h = (b && b.size === l.size && b.mtime === l.mtime && b.md5) ? b.md5 : md5(l.p); return l.h; };
  const all = new Set([...Object.keys(local), ...Object.keys(remote.files), ...Object.keys(state)]);
  for (const rel of [...all].sort()) {
    const L = local[rel], R = remote.files[rel], B = state[rel];
    try {
      if (L && L.size > MAX_FILE) { next[rel] = B; continue; }
      if (L && !R) {
        if (B && effMode === 'twoway') { const trashDir = path.join(root, '.papierkorb'); fs.mkdirSync(path.join(trashDir, path.dirname(rel)), { recursive: true }); fs.renameSync(L.p, path.join(trashDir, rel)); res.trashed++; continue; }   // in Drive gelöscht: lokal in den Papierkorb
        const i = rel.lastIndexOf('/'), parent = await ensureDir(remote.folders, i < 0 ? '' : rel.slice(0, i));
        const j = await uploadFile({ name: rel.slice(i + 1), parent, buf: fs.readFileSync(L.p), mime: MIME[path.extname(rel).toLowerCase()] });
        next[rel] = rec(rel, j.id, lhash(rel), j.md5Checksum || lhash(rel)); res.up++; continue;
      }
      if (!L && R) {
        if (B) { await trash(R.id); res.trashed++; continue; }                         // lokal gelöscht: in Drive in den Papierkorb
        if (effMode === 'twoway') { const dst = path.join(root, ...rel.split('/')); await download(R.id, dst); next[rel] = rec(rel, R.id, md5(dst), R.md5); res.down++; }
        continue;
      }
      if (!L && !R) continue;                                                           // beidseitig weg: Eintrag verfällt
      const h = lhash(rel), localChanged = !B || B.md5 !== h, remoteChanged = !B || B.rmd5 !== R.md5;
      if (h === R.md5 || (B && !localChanged && !remoteChanged)) { next[rel] = rec(rel, R.id, h, R.md5); continue; }   // gleich
      if (localChanged && (!remoteChanged || effMode === 'backup')) {                       // lokal neuer → Drive aktualisieren
        const j = await uploadFile({ id: R.id, buf: fs.readFileSync(L.p), mime: MIME[path.extname(rel).toLowerCase()] });
        next[rel] = rec(rel, R.id, h, j.md5Checksum || h); res.up++; continue;
      }
      if (!localChanged && remoteChanged) {                                             // Drive neuer → herunterladen (nur im Zwei-Wege-Modus)
        if (effMode !== 'twoway') { next[rel] = B; continue; }
        await download(R.id, L.p); next[rel] = rec(rel, R.id, md5(L.p), R.md5); res.down++; continue;
      }
      // beides geändert: beide Fassungen behalten
      const copy = path.join(root, ...conflictName(rel, 'Drive').split('/')); await download(R.id, copy);
      const j = await uploadFile({ id: R.id, buf: fs.readFileSync(L.p), mime: MIME[path.extname(rel).toLowerCase()] });
      next[rel] = rec(rel, R.id, h, j.md5Checksum || h); res.conflicts++;
    } catch (e) { note(rel, e); if (B) next[rel] = B; if (e.status === 401 || /nicht verbunden|abgelaufen/.test(e.message)) throw e; }
  }
  res.ok = !res.errors.length;
  if (res.down || res.conflicts || res.trashed) files.reindex();
  patch({ files: next, last: { time: res.time, ok: res.ok, up: res.up, down: res.down, trashed: res.trashed, conflicts: res.conflicts, errors: res.errors.slice(0, 5), msg: res.ok ? '' : res.errors[0] } });
  return res;
}
/** Abgleich starten; läuft nie doppelt. */
function sync() {
  if (running) return running;
  running = (async () => {
    try { return await runOnce(); }
    catch (e) { patch({ last: { time: Date.now(), ok: false, up: 0, down: 0, trashed: 0, conflicts: 0, errors: [], msg: String(e.message || e).slice(0, 200) } }); return { ok: false, errors: [String(e.message || e)] }; }
    finally { running = null; }
  })();
  return running;
}
/** Kurz nach Änderungen im Hintergrund abgleichen. */
function schedule(ms = 45000) {
  const c = cfg(); if (!(c.tokens && c.tokens.refresh) || c.auto === false) return;
  clearTimeout(timer); timer = setTimeout(() => { sync().catch(() => {}); }, ms);
}
/** Regelmäßig und nach dem Start. */
function start(minutes = parseInt(process.env.GDRIVE_SYNC_MINUTES, 10) || 30) {
  clearInterval(loopT); loopT = setInterval(() => { const c = cfg(); if (c.tokens && c.tokens.refresh && c.auto !== false) sync().catch(() => {}); }, Math.max(1, minutes) * 60000);
  setTimeout(() => schedule(1000), 15000);
}

module.exports = { status, saveCreds, connect, poll, disconnect, setSettings, sync, schedule, start, creds };
