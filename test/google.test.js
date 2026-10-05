'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-google-'));
process.env.TZ = 'Europe/Berlin';
process.env.APP_PASSWORD = 'geheim-passwort';
const app = require('../src/server');
const sharp = require('sharp');

/* ---- Mini-Google zum Testen: so antwortet Google (vereinfacht) ---- */
const G = { folders: {}, log: [], failNextAuth: false, refreshInvalid: false, tokens: 0, events: {}, gcalEvents: {}, nextId: 1 };
let mock, mockUrl, server, base, cookie;
const body = req => new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
const send = (res, code, obj, headers = {}) => { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json' }, headers)); res.end(typeof obj === 'string' ? obj : JSON.stringify(obj)); };

test.before(async () => {
  mock = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x'), p = u.pathname, raw = await body(req), m = req.method;
    G.log.push({ m, p, q: u.search, auth: req.headers.authorization || '', body: raw.toString().slice(0, 4000), len: raw.length });
    if (p === '/token') {
      const f = new URLSearchParams(raw.toString());
      if (f.get('grant_type') === 'authorization_code') {
        if (f.get('code') !== 'gute-code') return send(res, 400, { error: 'invalid_grant', error_description: 'Bad code' });
        G.verifier = f.get('code_verifier'); G.redirect = f.get('redirect_uri'); G.secret = f.get('client_secret');
        return send(res, 200, { access_token: 'at' + (++G.tokens), refresh_token: 'rt1', expires_in: 3600, scope: 'x' });
      }
      if (G.refreshInvalid) return send(res, 400, { error: 'invalid_grant' });
      return send(res, 200, { access_token: 'at' + (++G.tokens), expires_in: 3600 });
    }
    if (p === '/revoke') return send(res, 200, {});
    if (p === '/v1/userinfo') return send(res, 200, { email: 'peter@example.org' });
    if (G.reject401 && req.headers.authorization === 'Bearer ' + G.reject401) return send(res, 401, { error: { message: 'expired' } });
    if (p === '/drive/v3/files' && m === 'GET') {
      const q = u.searchParams.get('q') || '', nm = /name='((?:[^'\\]|\\.)*)'/.exec(q);
      if (nm) return send(res, 200, { files: G.folders[nm[1]] ? [{ id: G.folders[nm[1]] }] : [] });
      return send(res, 200, { files: [{ id: 'ord1', name: 'Anatomie', mimeType: 'application/vnd.google-apps.folder' }, { id: 'doc1', name: 'Mitschrift', mimeType: 'application/vnd.google-apps.document', webViewLink: 'https://docs.google.com/document/d/doc1/edit', modifiedTime: '2026-10-01T10:00:00Z' }], q });
    }
    if (p === '/drive/v3/files' && m === 'POST') { const b = JSON.parse(raw); if (b.mimeType.includes('folder')) G.folders[b.name] = 'F' + b.name; return send(res, 200, { id: b.mimeType.includes('folder') ? 'F' + b.name : 'neuesDoc1', name: b.name, webViewLink: 'https://x/' + b.name }); }
    if (p === '/drive/v3/files/doc1/export') return send(res, 200, 'Plexus brachialis\nNerven des Arms', { 'Content-Type': 'text/plain' });
    if (p === '/drive/v3/files/doc1') return send(res, 200, { id: 'doc1', name: 'Mitschrift', mimeType: 'application/vnd.google-apps.document', webViewLink: 'https://docs.google.com/document/d/doc1/edit' });
    if (p === '/drive/v3/files/pdf1') return send(res, 200, { id: 'pdf1', name: 'Skript.pdf', mimeType: 'application/pdf' });
    if (p === '/upload/drive/v3/files') return send(res, 200, {}, { Location: mockUrl + '/upload/session/1' });
    if (p === '/upload/session/1') return send(res, 200, { id: 'hoch' + G.log.length, name: 'hochgeladen', webViewLink: 'https://drive.google.com/file/d/h/view' });
    if (p === '/v1/documents/doc1' && m === 'GET') return send(res, 200, { title: 'Mitschrift', body: { content: [{ endIndex: 1 }, { endIndex: 25, paragraph: { elements: [{ textRun: { content: 'Altes Thema\n' } }], paragraphStyle: { namedStyleType: 'HEADING_2' } } }, { endIndex: 40, paragraph: { elements: [{ textRun: { content: 'Text dazu\n' } }], paragraphStyle: { namedStyleType: 'NORMAL_TEXT' } } }] } });
    if (/^\/v1\/documents\/.+:batchUpdate$/.test(p)) return send(res, 200, {});
    if (p === '/calendar/v3/users/me/calendarList') return send(res, 200, { items: [{ id: 'primary@x', summary: 'Peter', primary: true }, { id: 'uni@x', summary: 'Uni' }] });
    if (p === '/calendar/v3/calendars/uni%40x/events') return send(res, 200, { items: [
      { id: 'e1', summary: 'Vorlesung Anatomie', location: 'H1', start: { dateTime: '2026-10-06T08:15:00+02:00' }, end: { dateTime: '2026-10-06T09:45:00+02:00' } },
      { id: 'e2', summary: 'Anmeldefrist', start: { date: '2026-10-09' }, end: { date: '2026-10-10' } },
      { id: 'e3', summary: 'Blockwoche', start: { date: '2026-10-12' }, end: { date: '2026-10-14' } },
      { id: 'e4', summary: 'Abgesagt', status: 'cancelled', start: { dateTime: '2026-10-07T10:00:00+02:00' }, end: { dateTime: '2026-10-07T11:00:00+02:00' } }] });
    if (p === '/calendar/v3/calendars' && m === 'POST') return send(res, 200, { id: 'lernkal@x' });
    let mm = /^\/calendar\/v3\/calendars\/lernkal%40x\/events(?:\/(.+))?$/.exec(p);
    if (mm) {
      if (m === 'POST') { const id = 'g' + G.nextId++; G.gcalEvents[id] = JSON.parse(raw); return send(res, 200, { id }); }
      if (m === 'PUT') { G.gcalEvents[mm[1]] = JSON.parse(raw); return send(res, 200, { id: mm[1] }); }
      if (m === 'DELETE') { delete G.gcalEvents[mm[1]]; return send(res, 204, ''); }
    }
    if (p === '/gmail/v1/users/me/messages') return send(res, 200, { messages: [{ id: 'm1' }], resultSizeEstimate: 7 });
    if (p === '/gmail/v1/users/me/messages/m1') return send(res, 200, { payload: { headers: [{ name: 'From', value: '"Frau Müller" <mueller@schule.de>' }, { name: 'Subject', value: 'Raumänderung' }, { name: 'Date', value: 'Mon, 5 Oct 2026 08:00:00 +0200' }] } });
    send(res, 404, { error: { message: 'unbekannt ' + p } });
  });
  await new Promise(r => mock.listen(0, r)); mockUrl = 'http://127.0.0.1:' + mock.address().port; process.env.GOOGLE_ORIGIN = mockUrl;
  await new Promise(r => { server = app.listen(0, r); }); base = 'http://127.0.0.1:' + server.address().port;
  const l = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'geheim-passwort' }) });
  cookie = l.headers.get('set-cookie').split(';')[0];
});
test.after(() => { server.close(); mock.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); });

const j = async (method, p, b) => {
  const r = await fetch(base + p, { method, headers: Object.assign({ cookie }, b ? { 'Content-Type': 'application/json' } : {}), body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const calls = (p, m) => G.log.filter(x => x.p === p && (!m || x.m === m));

test('Ohne Anmeldung kein Zugriff auf die Google-Funktionen', async () => {
  assert.strictEqual((await fetch(base + '/api/google/drive')).status, 401);
});

test('Verbinden: Client-ID wird geprüft, Link enthält PKCE und die gewählten Rechte', async () => {
  assert.strictEqual((await j('POST', '/api/google/begin', { clientId: 'falsch', clientSecret: 'x' })).status, 400);
  assert.strictEqual((await j('POST', '/api/google/begin', { clientId: '123-abc.apps.googleusercontent.com', clientSecret: '' })).status, 400);
  const r = await j('POST', '/api/google/begin', { clientId: '123-abc.apps.googleusercontent.com', clientSecret: 'GOCSPX-geheim', access: { drive: 'full', calendar: true, gmail: true } });
  assert.strictEqual(r.status, 200);
  const u = new URL(r.body.url);
  assert.strictEqual(u.searchParams.get('redirect_uri'), 'http://127.0.0.1:53682/');
  assert.strictEqual(u.searchParams.get('code_challenge_method'), 'S256');
  assert.strictEqual(u.searchParams.get('access_type'), 'offline');
  const sc = u.searchParams.get('scope').split(' ');
  for (const s of ['openid', 'email', 'https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/documents', 'https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/gmail.readonly']) assert.ok(sc.includes(s), s);
  G.challenge = u.searchParams.get('code_challenge'); G.state = u.searchParams.get('state');
  const st = (await j('GET', '/api/google/status')).body;
  assert.strictEqual(st.configured, true); assert.strictEqual(st.connected, false);
  assert.ok(!JSON.stringify(st).includes('GOCSPX'));            // das Secret verlässt den Server nie
});

test('Verbinden: falscher Status wird abgelehnt, richtige Adresse verbindet', async () => {
  const bad = await j('POST', '/api/google/finish', { input: 'http://127.0.0.1:53682/?code=gute-code&state=anderer' });
  assert.strictEqual(bad.status, 400);
  const wrongCode = await j('POST', '/api/google/finish', { input: `http://127.0.0.1:53682/?code=falsch&state=${G.state}` });
  assert.strictEqual(wrongCode.status, 400);
  const ok = await j('POST', '/api/google/finish', { input: `http://127.0.0.1:53682/?state=${G.state}&code=gute-code&scope=x` });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.connected, true); assert.strictEqual(ok.body.email, 'peter@example.org');
  assert.strictEqual(crypto.createHash('sha256').update(G.verifier).digest('base64url'), G.challenge);   // PKCE passt zusammen
  assert.strictEqual(G.secret, 'GOCSPX-geheim'); assert.strictEqual(G.redirect, 'http://127.0.0.1:53682/');
  const file = fs.statSync(path.join(process.env.DATA_DIR, 'google.json')).mode & 0o777;
  assert.strictEqual(file, 0o600);
});

test('Drive: Ordner anzeigen, suchen, ungültige Ordner-IDs abweisen, Text lesen', async () => {
  const r = (await j('GET', '/api/google/drive?parent=root')).body;
  assert.strictEqual(r.files[0].folder, true); assert.strictEqual(r.files[1].name, 'Mitschrift');
  assert.match(new URLSearchParams(calls('/drive/v3/files', 'GET').pop().q).get('q'), /'root' in parents/);
  await j('GET', '/api/google/drive?q=' + encodeURIComponent("Plexus' or 1=1"));
  assert.match(new URLSearchParams(calls('/drive/v3/files', 'GET').pop().q).get('q'), /fullText contains 'Plexus\\' or 1=1'/);   // Anführungszeichen sind maskiert
  assert.strictEqual((await j('GET', "/api/google/drive?parent=" + encodeURIComponent("x' or 'a'='a"))).status, 400);
  const t = (await j('GET', '/api/google/drive/text/doc1')).body;
  assert.strictEqual(t.supported, true); assert.match(t.text, /Plexus brachialis/);
  assert.strictEqual((await j('GET', '/api/google/drive/text/pdf1')).body.supported, false);
  assert.ok(G.log.filter(x => x.p.startsWith('/drive')).every(x => /^Bearer at\d+$/.test(x.auth)));
});

test('Docs: neues Dokument anlegen, Eintrag mit Überschrift anhängen, letzte Absätze lesen', async () => {
  const dd = await j('POST', '/api/google/doc', { title: 'Anatomie Mitschrift', folderId: 'ord1', text: 'Start' }); const d = dd.body;
  assert.strictEqual(d.id, 'neuesDoc1');
  const create = JSON.parse(calls('/drive/v3/files', 'POST').pop().body);
  assert.deepStrictEqual(create.parents, ['ord1']); assert.strictEqual(create.mimeType, 'application/vnd.google-apps.document');
  const heading = 'Montag, 05.10.2026 · Block 1 · Anat';
  await j('POST', '/api/google/doc/doc1/append', { heading, body: 'Thema: \n' });
  const reqs = JSON.parse(calls('/v1/documents/doc1:batchUpdate', 'POST').pop().body).requests;
  const end = 40 - 1;
  assert.strictEqual(reqs[0].insertText.location.index, end);
  assert.strictEqual(reqs[0].insertText.text, '\n' + heading + '\nThema: \n');
  assert.deepStrictEqual(reqs[1].updateParagraphStyle.range, { startIndex: end + 1, endIndex: end + 1 + heading.length + 1 });
  assert.strictEqual(reqs[1].updateParagraphStyle.paragraphStyle.namedStyleType, 'HEADING_2');
  const tail = (await j('GET', '/api/google/doc/doc1/tail')).body;
  assert.deepStrictEqual(tail.paragraphs.map(p => p.text), ['Altes Thema', 'Text dazu']);
  assert.strictEqual(tail.paragraphs[0].heading, true);
  assert.strictEqual((await j('POST', '/api/google/doc/..%2Fx/append', { heading: 'a' })).status, 400);
});

test('Drive-Upload: gescannte Seiten und Dateien kommen im Zielordner an', async () => {
  const jpg = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#ddd' } }).jpeg().toBuffer();
  const id = (await j('POST', '/api/scans')).body.id;
  await fetch(`${base}/api/scans/${id}/pages`, { method: 'POST', headers: { cookie, 'Content-Type': 'image/jpeg' }, body: jpg });
  await j('POST', `/api/scans/${id}/finish`, { subject: 'Anat', title: 'Handout', date: '2026-10-05' });
  for (let i = 0; i < 60; i++) { const s = (await j('GET', '/api/scans')).body.scans.find(x => x.id === id); if (s && s.status === 'done') break; await new Promise(r => setTimeout(r, 100)); }
  const before = calls('/upload/drive/v3/files', 'POST').length;
  const r = await j('POST', '/api/google/drive/upload', { kind: 'scan', id, folderId: 'ord1' });
  assert.strictEqual(r.status, 200); assert.ok(r.body.uploaded.length >= 1);
  const start = calls('/upload/drive/v3/files', 'POST');
  assert.strictEqual(start.length, before + r.body.uploaded.length);
  const meta = JSON.parse(start[start.length - 1].body); assert.deepStrictEqual(meta.parents, ['ord1']);
  assert.ok(calls('/upload/session/1', 'PUT').pop().len > 1000);   // der Inhalt wurde wirklich gesendet
  const up = await (await fetch(base + '/api/files?name=Skript.pdf&subject=Anat', { method: 'POST', headers: { cookie }, body: Buffer.from('%PDF-1.4 inhalt') })).json();
  assert.strictEqual((await j('POST', '/api/google/drive/upload', { kind: 'file', id: up.id })).status, 200);
  assert.strictEqual((await j('POST', '/api/google/drive/upload', { kind: 'scan', id: 'nope' })).status, 400);
});

test('Kalender lesen: Google-Termine erscheinen wie iCal-Einträge (Zeit, ganztägig, mehrtägig, abgesagt)', async () => {
  const l = (await j('GET', '/api/google/calendars')).body.calendars;
  assert.deepStrictEqual(l.map(c => c.id), ['primary@x', 'uni@x']);
  await j('PUT', '/api/google/pull', { list: [{ id: 'uni@x', name: 'Uni', kind: 'timetable' }] });
  const r = (await j('POST', '/api/calendars/sync')).body;
  assert.strictEqual(r.status.length, 1); assert.strictEqual(r.status[0].ok, true); assert.match(r.status[0].name, /Google/);
  const t = r.items.map(e => [e.date, e.start, e.end, e.title, e.status].join('|'));
  assert.ok(t.includes('2026-10-06|08:15|09:45|Vorlesung Anatomie|'));
  assert.ok(t.includes('2026-10-09|||Anmeldefrist|'));
  assert.ok(t.includes('2026-10-12|||Blockwoche|') && t.includes('2026-10-13|||Blockwoche|') && !t.some(x => x.startsWith('2026-10-14')));
  assert.ok(t.includes('2026-10-07|10:00|11:00|Abgesagt|CANCELLED'));
  assert.ok(r.items.every(e => e.kind === 'timetable'));
});

test('Kalender schreiben: Termine werden angelegt, geändert und entfernt', async () => {
  await j('PUT', '/api/state', { state: { settings: { profile: 'studium', appName: 'StudyDock' }, events: [
    { id: 'a', type: 'klausur', title: 'Analysis', date: '2026-12-01', sid: 'Analysis I' },
    { id: 'b', type: 'uebung', title: 'Blatt 3', date: '2026-11-01', steps: [{ t: 'rechnen', done: false }] }] } });
  assert.strictEqual((await j('PUT', '/api/google/push', { enabled: true })).body.push.enabled, true);
  let r = (await j('POST', '/api/google/push/now')).body;
  assert.strictEqual(r.push.last.ok, true); assert.match(r.push.last.msg, /2 neu/);
  assert.deepStrictEqual(JSON.parse(calls('/calendar/v3/calendars', 'POST').pop().body).summary, 'StudyDock');
  const evs = Object.values(G.gcalEvents);
  assert.strictEqual(evs.length, 2);
  const k = evs.find(e => e.summary === 'Klausur: Analysis');
  assert.deepStrictEqual(k.start, { date: '2026-12-01' }); assert.deepStrictEqual(k.end, { date: '2026-12-02' });
  assert.deepStrictEqual(k.reminders.overrides.map(o => o.minutes), [10080, 1440, 360]);
  assert.match(evs.find(e => e.summary === 'Übungsblatt: Blatt 3').description, /\[ \] rechnen/);
  // nichts geändert: keine weiteren Aufrufe
  const n = G.log.length; await j('POST', '/api/google/push/now'); assert.strictEqual(G.log.length, n);
  // Änderung und Löschung
  await j('PUT', '/api/state', { state: { settings: { profile: 'studium' }, events: [{ id: 'a', type: 'klausur', title: 'Analysis neu', date: '2026-12-02' }, { id: 'b', type: 'uebung', title: 'Blatt 3', date: '2026-11-01', done: true }] } });
  r = (await j('POST', '/api/google/push/now')).body;
  assert.match(r.push.last.msg, /1 geändert, 1 entfernt/);
  assert.deepStrictEqual(Object.values(G.gcalEvents).map(e => e.summary), ['Klausur: Analysis neu']);
});

test('Gmail: ungelesene Nachrichten mit Absender und Betreff', async () => {
  const r = (await j('GET', '/api/google/gmail?q=' + encodeURIComponent('from:schule.de is:unread'))).body;
  assert.strictEqual(r.total, 7); assert.strictEqual(r.messages[0].from, 'Frau Müller'); assert.strictEqual(r.messages[0].subject, 'Raumänderung');
  assert.strictEqual((await j('GET', '/api/google/status')).body.gmailQuery, 'from:schule.de is:unread');
});

test('Abgelaufenes Zugangs-Token wird still erneuert', async () => {
  const stale = 'at' + G.tokens; G.reject401 = stale;
  const cfgFile = path.join(process.env.DATA_DIR, 'google.json'), c = JSON.parse(fs.readFileSync(cfgFile)); c.tokens.access = stale; fs.writeFileSync(cfgFile, JSON.stringify(c));
  const before = calls('/token', 'POST').length;
  assert.strictEqual((await j('GET', '/api/google/drive?parent=root')).status, 200);
  assert.strictEqual(calls('/token', 'POST').length, before + 1);
  G.reject401 = null;
});

test('Fach-Mitschrift: Ordner „Lernhafen/<Fach>“ und Dokument entstehen automatisch, nichts wird doppelt angelegt', async () => {
  const r = (await j('POST', '/api/google/subject', { subject: 'Anatomie' })).body;
  assert.strictEqual(r.folderId, 'FAnatomie'); assert.strictEqual(r.doc.id, 'neuesDoc1');
  const doc = JSON.parse(calls('/drive/v3/files', 'POST').pop().body);
  assert.deepStrictEqual(doc.parents, ['FAnatomie']); assert.strictEqual(doc.name, 'Mitschrift Anatomie');
  const folderCreates = () => calls('/drive/v3/files', 'POST').filter(x => JSON.parse(x.body).mimeType.includes('folder')).map(x => JSON.parse(x.body).name);
  assert.deepStrictEqual(folderCreates().filter(n => n === 'Lernhafen' || n === 'Anatomie'), ['Lernhafen', 'Anatomie']);
  await j('POST', '/api/google/subject', { subject: 'Anatomie', doc: false });
  assert.deepStrictEqual(folderCreates().filter(n => n === 'Lernhafen' || n === 'Anatomie'), ['Lernhafen', 'Anatomie']);   // beim zweiten Mal nur wiederverwendet
  assert.strictEqual((await j('POST', '/api/google/subject', {})).status, 400);
});

test('Automatisch in Drive sichern: neue Scans landen in „Lernhafen/<Fach>/Scans“', async () => {
  assert.strictEqual((await j('PUT', '/api/google/autoupload', { enabled: true })).body.autoUpload, true);
  const jpg = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#ccc' } }).jpeg().toBuffer();
  const id = (await j('POST', '/api/scans')).body.id;
  await fetch(`${base}/api/scans/${id}/pages`, { method: 'POST', headers: { cookie, 'Content-Type': 'image/jpeg' }, body: jpg });
  const n = calls('/upload/drive/v3/files', 'POST').length;
  await j('POST', `/api/scans/${id}/finish`, { subject: 'Physik', title: 'Tafelbild', date: '2026-10-05' });
  for (let i = 0; i < 80 && calls('/upload/drive/v3/files', 'POST').length === n; i++) await new Promise(r => setTimeout(r, 100));
  const meta = JSON.parse(calls('/upload/drive/v3/files', 'POST').pop().body);
  assert.deepStrictEqual(meta.parents, ['FScans']);
  assert.ok(G.folders.Physik && G.folders.Scans);
  for (let i = 0; i < 20; i++) { const s = (await j('GET', '/api/scans')).body.scans.find(x => x.id === id); if (s.drive) break; await new Promise(r => setTimeout(r, 50)); }
  assert.strictEqual((await j('GET', '/api/scans')).body.scans.find(x => x.id === id).drive, true);
});

test('Widerrufene Verbindung: klare Meldung, Status zeigt getrennt', async () => {
  G.refreshInvalid = true;
  const cfgFile = path.join(process.env.DATA_DIR, 'google.json'), c = JSON.parse(fs.readFileSync(cfgFile)); c.tokens.expiry = 0; fs.writeFileSync(cfgFile, JSON.stringify(c));
  const r = await j('GET', '/api/google/drive?parent=root');
  assert.strictEqual(r.status, 400); assert.match(r.body.error, /7 Tagen/);
  const st = (await j('GET', '/api/google/status')).body;
  assert.strictEqual(st.connected, false); assert.match(st.error, /neu/);
  G.refreshInvalid = false;
});

test('Trennen widerruft den Zugang und löscht die gespeicherten Daten', async () => {
  await j('POST', '/api/google/begin', { clientId: '123-abc.apps.googleusercontent.com', clientSecret: '' });
  const st = (await j('DELETE', '/api/google')).body;
  assert.strictEqual(st.configured, false); assert.strictEqual(st.connected, false);
  assert.ok(!fs.existsSync(path.join(process.env.DATA_DIR, 'google.json')));
});

test('Zentral hinterlegte Google-Zugangsdaten: Nutzer müssen nichts eintragen und das Secret liegt nicht in der Datei', async () => {
  process.env.GOOGLE_CLIENT_ID = '999-zentral.apps.googleusercontent.com'; process.env.GOOGLE_CLIENT_SECRET = 'GOCSPX-zentral';
  try {
    assert.strictEqual((await j('GET', '/api/google/status')).body.preconfigured, true);
    const r = await j('POST', '/api/google/begin', { access: { drive: 'full', calendar: false, gmail: false } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(new URL(r.body.url).searchParams.get('client_id'), '999-zentral.apps.googleusercontent.com');
    const disk = fs.readFileSync(path.join(process.env.DATA_DIR, 'google.json'), 'utf8');
    assert.ok(!disk.includes('GOCSPX-zentral') && !disk.includes('999-zentral'));
  } finally { delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_SECRET; }
});
