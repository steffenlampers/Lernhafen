'use strict';
// Google-Anbindung: Drive, Docs, Kalender, Gmail (nur lesen) mit deinem eigenen Google-Konto.
// Anmeldung wie bei Desktop-Programmen: Link öffnen, Google leitet auf http://127.0.0.1:53682/ um, die Adresse wird in die App eingefügt.
// Es gibt keinen Dienst von uns dazwischen. Die Zugangsdaten (Client-ID, Token) liegen nur in DATA_DIR/google.json (Rechte 600).
const crypto = require('crypto');
const store = require('./store');
const ical = require('./ical');

const O = () => process.env.GOOGLE_ORIGIN || '';      // nur für Tests: alle Adressen auf einen Test-Server umleiten
const URLS = {
  token: () => (O() || 'https://oauth2.googleapis.com') + '/token',
  revoke: () => (O() || 'https://oauth2.googleapis.com') + '/revoke',
  userinfo: () => (O() || 'https://openidconnect.googleapis.com') + '/v1/userinfo',
  drive: () => (O() || 'https://www.googleapis.com') + '/drive/v3',
  upload: () => (O() || 'https://www.googleapis.com') + '/upload/drive/v3',
  docs: () => (O() || 'https://docs.googleapis.com') + '/v1',
  cal: () => (O() || 'https://www.googleapis.com') + '/calendar/v3',
  gmail: () => (O() || 'https://gmail.googleapis.com') + '/gmail/v1'
};
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const REDIRECT = 'http://127.0.0.1:53682/';
const S = 'https://www.googleapis.com/auth/';
const FOLDER = 'application/vnd.google-apps.folder', DOC = 'application/vnd.google-apps.document';

const fs = require('fs');
const path = require('path');
/** Zentrale Google-App von Lernhafen: aus der Umgebung oder aus einer beim Bauen des Images eingefügten Datei. Dann müssen Nutzer nichts einrichten. */
function central() {
  let id = (process.env.GOOGLE_CLIENT_ID || '').trim(), secret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  if (!(id && secret)) { try { const f = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'google-client.json'), 'utf8')); id = String(f.clientId || '').trim(); secret = String(f.clientSecret || '').trim(); } catch (e) { /* keine eingebackene Datei */ } }
  return id && secret ? { id, secret } : null;
}
const envId = () => (central() || {}).id || '', envSecret = () => (central() || {}).secret || '';
const REDIRECT_CENTRAL = () => process.env.GOOGLE_REDIRECT_URI || 'https://steffenlampers.github.io/Lernhafen/google-callback.html';
const cfg = () => {
  const c = store.read('google', {}) || {};
  if (envId() && envSecret()) { c.clientId = envId(); c.clientSecret = envSecret(); }     // zentral hinterlegt: die Nutzer brauchen nichts einzutragen
  return c;
};
const save = c => { const o = Object.assign({}, c); if (envId() && envSecret()) { delete o.clientId; delete o.clientSecret; } store.write('google', o, 0o600); };
const b64u = b => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const idOk = id => /^[\w-]{1,200}$/.test(id || "");
const q1 = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

function scopesFor(a) {
  const s = ['openid', 'email', S + 'documents'];
  s.push(S + (a.drive === 'file' ? 'drive.file' : 'drive'));
  if (a.calendar) s.push(S + 'calendar');
  if (a.gmail) s.push(S + 'gmail.readonly');
  return s;
}

function status() {
  const c = cfg();
  return { preconfigured: !!(envId() && envSecret()), autoUpload: !!c.autoUpload, configured: !!(c.clientId && c.clientSecret), connected: !!(c.tokens && c.tokens.refresh), email: c.email || '', access: c.access || { drive: 'full', calendar: true, gmail: false }, clientId: c.clientId || '',
    mode: central() ? 'central' : 'own', push: c.push || { enabled: false }, pull: c.pull || [], gmailQuery: c.gmailQuery || 'is:unread category:primary', error: c.error || '', redirect: REDIRECT };
}

/** Schritt 1: Zugangsdaten speichern und den Anmelde-Link bauen. */
function begin({ clientId, clientSecret, access, origin }) {
  if (envId() && envSecret()) { clientId = envId(); clientSecret = envSecret(); }
  clientId = String(clientId || '').trim(); clientSecret = String(clientSecret || '').trim();
  if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new Error('Die Client-ID sieht nicht richtig aus. Sie endet auf .apps.googleusercontent.com.');
  const old = store.read('google', {}) || {};
  if (!clientSecret && old.clientId === clientId) clientSecret = old.clientSecret;
  if (!clientSecret) throw new Error('Bitte das Client-Secret eintragen.');
  const a = { drive: access && access.drive === 'file' ? 'file' : 'full', calendar: !!(access && access.calendar), gmail: !!(access && access.gmail) };
  const state = b64u(crypto.randomBytes(16)), verifier = b64u(crypto.randomBytes(48)), mode = central() ? 'central' : 'own';
  let redirect = REDIRECT, stateParam = state;
  if (mode === 'central') {                  // Rücksprung über die Weiterleitungsseite, die den Code an dieses Gerät zurückgibt
    let o; try { o = new URL(String(origin || '')); } catch (e) { throw new Error('Die Adresse dieser App ist unbekannt. Öffne die App im Browser und versuche es noch einmal.'); }
    if (!/^https?:$/.test(o.protocol)) throw new Error('Ungültige Adresse.');
    redirect = REDIRECT_CENTRAL(); stateParam = b64u(Buffer.from(JSON.stringify({ o: o.origin, s: state })));
  }
  const c = Object.assign({}, old, { clientId, clientSecret, access: a, pending: { state, verifier, at: Date.now(), redirect, mode }, error: '' });
  save(c);
  const p = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: scopesFor(a).join(' '), access_type: 'offline', prompt: 'consent', state: stateParam, code_challenge: b64u(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256' });
  return { url: AUTH_URL + '?' + p };
}

async function tokenCall(params) {
  const c = cfg();
  const r = await fetch(URLS.token(), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(Object.assign({ client_id: c.clientId, client_secret: c.clientSecret }, params)), signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error_description || j.error || ('HTTP ' + r.status)); e.code = j.error; throw e; }
  return j;
}

/** Schritt 2: Die Adresse (oder nur den Code) aus dem Browser einfügen und gegen Token tauschen. */
async function finish(input) {
  const c = cfg(); input = String(input || '').trim();
  if (!c.pending) throw new Error('Starte die Verbindung zuerst mit „Weiter“.');
  if (Date.now() - c.pending.at > 15 * 60000) throw new Error('Der Anmelde-Link ist abgelaufen. Starte noch einmal.');
  let code = input;
  if (/^https?:\/\//i.test(input)) {
    const u = new URL(input);
    if (u.searchParams.get('error')) throw new Error('Google hat die Anmeldung abgelehnt: ' + u.searchParams.get('error'));
    if (u.searchParams.get('state') !== c.pending.state) throw new Error('Die Adresse gehört nicht zu dieser Anmeldung. Starte noch einmal.');
    code = u.searchParams.get('code') || '';
  }
  if (!code) throw new Error('In der Adresse fehlt der Code. Kopiere die komplette Adresse aus der Adresszeile.');
  let t;
  try { t = await tokenCall({ grant_type: 'authorization_code', code, redirect_uri: c.pending.redirect || REDIRECT, code_verifier: c.pending.verifier }); }
  catch (e) { throw new Error('Google hat den Code nicht angenommen: ' + e.message); }
  if (!t.refresh_token) throw new Error('Google hat keinen dauerhaften Zugang geliefert. Entferne unter myaccount.google.com/permissions den Zugriff dieser App und verbinde neu.');
  const next = Object.assign({}, c, { tokens: { refresh: t.refresh_token, access: t.access_token, expiry: Date.now() + (t.expires_in || 3600) * 1000 }, grantedScope: t.scope || '', connectedAt: new Date().toISOString(), error: '' });
  delete next.pending; save(next);
  try { const u = await (await fetch(URLS.userinfo(), { headers: { Authorization: 'Bearer ' + t.access_token } })).json(); next.email = u.email || ''; save(next); } catch (e) { /* E-Mail ist nur Anzeige */ }
  return status();
}

/** Rückruf der Weiterleitungsseite: Code und Status prüfen, dann wie beim manuellen Weg verbinden. */
async function callback(code, stateParam, error) {
  if (error) throw new Error('Google hat die Anmeldung abgelehnt: ' + error);
  let s = '';
  try { s = JSON.parse(Buffer.from(String(stateParam || ''), 'base64url').toString()).s; } catch (e) { /* unten abgelehnt */ }
  const c = cfg();
  if (!c.pending || !s || s !== c.pending.state) throw new Error('Diese Anmeldung gehört zu keiner offenen Verbindung. Starte sie noch einmal in der App.');
  return finish(`${c.pending.redirect}?code=${encodeURIComponent(code || '')}&state=${encodeURIComponent(c.pending.state)}`);
}

async function disconnect() {
  const c = cfg();
  if (c.tokens && c.tokens.refresh) { try { await fetch(URLS.revoke(), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: c.tokens.refresh }), signal: AbortSignal.timeout(15000) }); } catch (e) { /* Widerruf ist ein Zusatz */ } }
  store.remove('google'); store.remove('gcal_map');
  return status();
}

async function accessToken() {
  const c = cfg();
  if (!c.tokens || !c.tokens.refresh) throw new Error('Google ist nicht verbunden.');
  if (c.tokens.access && c.tokens.expiry > Date.now() + 60000) return c.tokens.access;
  try {
    const t = await tokenCall({ grant_type: 'refresh_token', refresh_token: c.tokens.refresh });
    c.tokens.access = t.access_token; c.tokens.expiry = Date.now() + (t.expires_in || 3600) * 1000; c.error = ''; save(c);
    return t.access_token;
  } catch (e) {
    if (e.code === 'invalid_grant') {
      const n = cfg(); delete n.tokens; n.error = 'Die Verbindung ist abgelaufen oder widerrufen. Verbinde Google neu. (Steht deine Google-App noch auf „Testing“, läuft sie nach 7 Tagen ab.)'; save(n);
      throw new Error(n.error);
    }
    throw new Error('Google antwortet nicht: ' + e.message);
  }
}

async function call(method, url, opt = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const headers = Object.assign({ Authorization: 'Bearer ' + await accessToken() }, opt.headers || {});
    let body = opt.body;
    if (opt.json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opt.json); }
    const r = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(opt.timeout || 60000) });
    if (r.status === 401 && attempt === 0) { const c = cfg(); if (c.tokens) { c.tokens.expiry = 0; save(c); } continue; }
    if (opt.raw) return r;
    if (r.status === 204) return {};
    const text = await r.text(); let j = {}; try { j = text ? JSON.parse(text) : {}; } catch (e) { j = { text }; }
    if (!r.ok) {
      const msg = (j.error && (j.error.message || j.error)) || ('HTTP ' + r.status);
      const e = new Error(r.status === 403 ? 'Google verweigert den Zugriff: ' + msg + ' Prüfe, ob die API in deinem Google-Projekt aktiviert ist.' : String(msg));
      e.status = r.status; throw e;
    }
    return j;
  }
}

/* ---------- Drive ---------- */
const FILEF = 'id,name,mimeType,modifiedTime,webViewLink,size';
async function driveList({ parent, q }) {
  const parts = ['trashed=false'];
  if (q) parts.push(`(name contains '${q1(q)}' or fullText contains '${q1(q)}')`);
  else { if (!idOk(parent || 'root')) throw new Error('Ungültiger Ordner.'); parts.push(`'${parent || 'root'}' in parents`); }
  const u = `${URLS.drive()}/files?` + new URLSearchParams({ q: parts.join(' and '), pageSize: '100', orderBy: 'folder,name', fields: `nextPageToken,files(${FILEF})`, supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' });
  const j = await call('GET', u);
  return { files: (j.files || []).map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType, folder: f.mimeType === FOLDER, modified: f.modifiedTime || '', url: f.webViewLink || '', size: +f.size || 0 })) };
}
async function driveMeta(id) {
  if (!idOk(id)) throw new Error('Ungültige Datei.');
  return call('GET', `${URLS.drive()}/files/${id}?` + new URLSearchParams({ fields: FILEF + ',parents', supportsAllDrives: 'true' }));
}
/** Text einer Google-Datei (Doc, Folien, Tabelle) oder Textdatei; für PDF und Bilder nicht möglich. */
async function driveText(id) {
  const m = await driveMeta(id), t = m.mimeType;
  let r;
  if (t === DOC || t === 'application/vnd.google-apps.presentation') r = await call('GET', `${URLS.drive()}/files/${id}/export?mimeType=text/plain`, { raw: true });
  else if (t === 'application/vnd.google-apps.spreadsheet') r = await call('GET', `${URLS.drive()}/files/${id}/export?mimeType=text/csv`, { raw: true });
  else if (/^text\//.test(t)) r = await call('GET', `${URLS.drive()}/files/${id}?alt=media`, { raw: true });
  else return { name: m.name, url: m.webViewLink, text: '', supported: false };
  if (!r.ok) throw new Error('Google konnte den Text nicht liefern (HTTP ' + r.status + ').');
  const text = (await r.text()).slice(0, 200000);
  return { name: m.name, url: m.webViewLink, text, supported: true };
}
/** Datei per fortsetzbarem Upload in einen Drive-Ordner legen. */
async function driveUpload({ name, mime, buf, folderId }) {
  if (folderId && !idOk(folderId)) throw new Error('Ungültiger Ordner.');
  const meta = { name: String(name).slice(0, 200) }; if (folderId) meta.parents = [folderId];
  const start = await call('POST', `${URLS.upload()}/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink`, { json: meta, headers: { 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(buf.length) }, raw: true });
  if (!start.ok) throw new Error('Drive hat den Upload nicht gestartet (HTTP ' + start.status + ').');
  const loc = start.headers.get('location'); if (!loc) throw new Error('Drive hat keine Upload-Adresse geliefert.');
  const put = await call('PUT', loc, { body: buf, headers: { 'Content-Type': mime }, raw: true, timeout: 15 * 60000 });
  if (!put.ok) throw new Error('Der Upload zu Drive ist fehlgeschlagen (HTTP ' + put.status + ').');
  const j = await put.json();
  return { id: j.id, name: j.name, url: j.webViewLink || `https://drive.google.com/file/d/${j.id}/view` };
}
async function folderCreate(name, parent) {
  const body = { name: String(name).slice(0, 200), mimeType: FOLDER }; if (parent) { if (!idOk(parent)) throw new Error('Ungültiger Ordner.'); body.parents = [parent]; }
  const j = await call('POST', `${URLS.drive()}/files?fields=id,name,webViewLink&supportsAllDrives=true`, { json: body });
  return { id: j.id, name: j.name, url: j.webViewLink };
}

/** Ordnerpfad (z. B. ["Lernhafen", "Anatomie"]) in Drive anlegen, falls er fehlt. Die Kennungen werden gemerkt. */
async function ensureFolder(names) {
  const map = store.read('gfolders', {}) || {}; let parent = 'root', key = '';
  for (const raw of names) {
    const name = String(raw).replace(/[\\/]/g, '-').trim().slice(0, 100) || 'Ohne Namen'; key += '/' + name;
    if (map[key]) { parent = map[key]; continue; }
    const found = await call('GET', `${URLS.drive()}/files?` + new URLSearchParams({ q: `mimeType='${FOLDER}' and trashed=false and name='${q1(name)}' and '${parent}' in parents`, fields: 'files(id)', pageSize: '1', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' }));
    let id = found.files && found.files[0] && found.files[0].id;
    if (!id) id = (await folderCreate(name, parent === 'root' ? '' : parent)).id;
    map[key] = id; parent = id;
  }
  store.write('gfolders', map);
  return parent;
}
function setAutoUpload(on) { const c = cfg(); c.autoUpload = !!on; save(c); return c.autoUpload; }

/* ---------- Docs ---------- */
async function docCreate({ title, folderId, text }) {
  const body = { name: String(title || 'Mitschrift').slice(0, 200), mimeType: DOC }; if (folderId) { if (!idOk(folderId)) throw new Error('Ungültiger Ordner.'); body.parents = [folderId]; }
  const j = await call('POST', `${URLS.drive()}/files?fields=id,name,webViewLink&supportsAllDrives=true`, { json: body });
  if (text) await call('POST', `${URLS.docs()}/documents/${j.id}:batchUpdate`, { json: { requests: [{ insertText: { location: { index: 1 }, text: String(text) } }] } });
  return { id: j.id, name: j.name, url: j.webViewLink || `https://docs.google.com/document/d/${j.id}/edit` };
}
/** Eintrag mit Überschrift (Überschrift 2) und Text ans Ende eines Docs hängen. */
async function docAppend(id, heading, body) {
  if (!idOk(id)) throw new Error('Ungültiges Dokument.');
  const d = await call('GET', `${URLS.docs()}/documents/${id}?` + new URLSearchParams({ fields: 'title,body(content(endIndex))' }));
  const cont = (d.body && d.body.content) || [], end = (cont.length ? cont[cont.length - 1].endIndex : 2) - 1;
  const H = String(heading), T = '\n' + H + '\n' + String(body || '');
  const hs = end + 1, he = hs + H.length + 1, te = end + T.length;
  await call('POST', `${URLS.docs()}/documents/${id}:batchUpdate`, { json: { requests: [
    { insertText: { location: { index: end }, text: T } },
    { updateParagraphStyle: { range: { startIndex: hs, endIndex: he }, paragraphStyle: { namedStyleType: 'HEADING_2' }, fields: 'namedStyleType' } },
    { updateParagraphStyle: { range: { startIndex: he, endIndex: te }, paragraphStyle: { namedStyleType: 'NORMAL_TEXT' }, fields: 'namedStyleType' } },
    { updateTextStyle: { range: { startIndex: he, endIndex: te }, textStyle: {}, fields: 'bold,italic' } }] } });
  return { title: d.title || '', url: `https://docs.google.com/document/d/${id}/edit` };
}
async function docTail(id, n = 40) {
  if (!idOk(id)) throw new Error('Ungültiges Dokument.');
  const d = await call('GET', `${URLS.docs()}/documents/${id}?` + new URLSearchParams({ fields: 'title,body(content(paragraph(elements(textRun(content)),paragraphStyle(namedStyleType))))' }));
  const ps = ((d.body && d.body.content) || []).filter(c => c.paragraph).map(c => ({ heading: /^(HEADING|TITLE)/.test((c.paragraph.paragraphStyle || {}).namedStyleType || ''), text: (c.paragraph.elements || []).map(e => (e.textRun && e.textRun.content) || '').join('').replace(/\n$/, '') }));
  return { title: d.title || '', paragraphs: ps.slice(-n), url: `https://docs.google.com/document/d/${id}/edit` };
}

/* ---------- Kalender ---------- */
async function calendarList() {
  const j = await call('GET', `${URLS.cal()}/users/me/calendarList?minAccessRole=reader`);
  return { calendars: (j.items || []).map(c => ({ id: c.id, name: c.summaryOverride || c.summary || c.id, primary: !!c.primary })) };
}
const dayAfter = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10); };
/** Google-Termine in dieselbe Form bringen wie iCal-Einträge. */
function toEntries(ev) {
  const title = ev.summary || 'Ohne Titel', status = ev.status === 'cancelled' ? 'CANCELLED' : '', base = { uid: ev.id, title, location: ev.location || '', status };
  const s = ev.start || {}, e = ev.end || {};
  if (s.date) { const out = []; for (let d = s.date, i = 0; d < (e.date || dayAfter(s.date)) && i < 14; d = dayAfter(d), i++) out.push(Object.assign({}, base, { allDay: true, date: d, start: '', end: '' })); return out; }
  if (!s.dateTime) return [];
  const a = ical.inTarget(new Date(s.dateTime)), b = e.dateTime ? ical.inTarget(new Date(e.dateTime)) : null;
  return [Object.assign({}, base, { allDay: false, date: a.date, start: a.time, end: b && b.date === a.date ? b.time : '' })];
}
async function calendarEvents(calId, from, to) {
  const out = []; let page = '';
  for (let i = 0; i < 5; i++) {
    const p = new URLSearchParams({ timeMin: from + 'T00:00:00Z', timeMax: to + 'T23:59:59Z', singleEvents: 'true', orderBy: 'startTime', maxResults: '500' }); if (page) p.set('pageToken', page);
    const j = await call('GET', `${URLS.cal()}/calendars/${encodeURIComponent(calId)}/events?` + p);
    (j.items || []).forEach(ev => out.push(...toEntries(ev)));
    page = j.nextPageToken; if (!page) break;
  }
  return out;
}
function setPull(list) {
  const c = cfg(); c.pull = (Array.isArray(list) ? list : []).slice(0, 10).map(x => ({ id: String(x.id).slice(0, 200), name: String(x.name || x.id).slice(0, 80), kind: x.kind === 'timetable' ? 'timetable' : 'events' })); save(c); return c.pull;
}

/** Eigene Termine als Ganztagstermine in einen eigenen Google-Kalender schreiben (nur Änderungen). */
const fp = o => crypto.createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 16);
function pushBody(e, type) {
  const date = e.eff || e.date, desc = [e.sid ? 'Fach: ' + e.sid : '', ...(e.steps || []).map(s => (s.done ? '[x] ' : '[ ] ') + s.t)].filter(Boolean).join('\n');
  const mins = type && type.exam ? [10080, 1440, 360] : [360];
  return { date, body: { summary: (type && type.label ? type.label + ': ' : '') + e.title, description: desc, start: { date }, end: { date: dayAfter(date) }, reminders: { useDefault: false, overrides: mins.map(m => ({ method: 'popup', minutes: m })) } } };
}
async function pushEvents(state, profile, appName) {
  const c = cfg(); if (!c.push || !c.push.enabled || !(c.tokens && c.tokens.refresh)) return { skipped: true };
  return (async () => {
    let calId = c.push.calendarId;
    if (!calId) { const j = await call('POST', `${URLS.cal()}/calendars`, { json: { summary: appName || 'Lernhafen', description: 'Termine aus der Lernzentrale' } }); calId = j.id; const n = cfg(); n.push.calendarId = calId; save(n); }
    const map = store.read('gcal_map', {}) || {}, types = Object.fromEntries(((profile && profile.eventTypes) || []).map(t => [t.id, t])), seen = new Set(); let made = 0, upd = 0, del = 0;
    for (const e of (state && state.events) || []) {
      const d = e.eff || e.date; if (e.done || !/^\d{4}-\d\d-\d\d$/.test(d || '')) continue;
      const { body } = pushBody(e, types[e.type]), h = fp(body); seen.add(e.id);
      const m = map[e.id];
      if (m && m.fp === h) continue;
      if (m && m.gid) { try { await call('PUT', `${URLS.cal()}/calendars/${encodeURIComponent(calId)}/events/${m.gid}`, { json: body }); map[e.id] = { gid: m.gid, fp: h }; upd++; continue; } catch (er) { if (er.status !== 404 && er.status !== 410) throw er; } }
      const j = await call('POST', `${URLS.cal()}/calendars/${encodeURIComponent(calId)}/events`, { json: body }); map[e.id] = { gid: j.id, fp: h }; made++;
    }
    for (const id of Object.keys(map)) if (!seen.has(id)) { try { await call('DELETE', `${URLS.cal()}/calendars/${encodeURIComponent(calId)}/events/${map[id].gid}`); } catch (er) { if (er.status !== 404 && er.status !== 410) throw er; } delete map[id]; del++; }
    store.write('gcal_map', map);
    return { made, upd, del };
  })();
}
function setPushResult(ok, msg) { const c = cfg(); if (!c.push) return; c.push.last = { time: Date.now(), ok, msg: String(msg || '').slice(0, 200) }; save(c); }
function setPush(enabled) { const c = cfg(); c.push = Object.assign({}, c.push, { enabled: !!enabled }); save(c); return c.push; }

/* ---------- Gmail (nur lesen) ---------- */
async function gmailInbox(q) {
  const c = cfg(); if (q) { c.gmailQuery = String(q).slice(0, 200); save(c); }
  const query = c.gmailQuery || 'is:unread category:primary';
  const list = await call('GET', `${URLS.gmail()}/users/me/messages?` + new URLSearchParams({ q: query, maxResults: '5' }));
  const messages = [];
  for (const m of list.messages || []) {
    const j = await call('GET', `${URLS.gmail()}/users/me/messages/${m.id}?` + new URLSearchParams([['format', 'metadata'], ['metadataHeaders', 'From'], ['metadataHeaders', 'Subject'], ['metadataHeaders', 'Date']]));
    const h = Object.fromEntries(((j.payload && j.payload.headers) || []).map(x => [x.name.toLowerCase(), x.value]));
    messages.push({ id: m.id, from: (h.from || '').replace(/<.*>/, '').replace(/"/g, '').trim() || h.from || '', subject: h.subject || '(ohne Betreff)', date: h.date || '', url: `https://mail.google.com/mail/u/0/#inbox/${m.id}` });
  }
  return { query, total: list.resultSizeEstimate || messages.length, messages };
}

module.exports = { status, begin, finish, callback, disconnect, driveList, driveMeta, driveText, driveUpload, folderCreate, docCreate, docAppend, docTail, ensureFolder, setAutoUpload, calendarList, calendarEvents, setPull, setPush, setPushResult, pushEvents, gmailInbox, scopesFor, REDIRECT };
