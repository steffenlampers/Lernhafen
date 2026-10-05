'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-gdrive-'));
process.env.DATA_DIR = DATA;
delete process.env.APP_PASSWORD; delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_SECRET;
const app = require('../src/server');
const gdrive = require('../src/gdrive');
const M = require('./mock-google');
const { G } = M;

let mock, server, base;
test.before(async () => {
  mock = M.create(); await new Promise(r => mock.listen(0, r)); const url = 'http://127.0.0.1:' + mock.address().port; M.setUrl(url); process.env.GOOGLE_ORIGIN = url;
  await new Promise(r => { server = app.listen(0, r); }); base = 'http://127.0.0.1:' + server.address().port;
});
test.after(() => { server.close(); mock.close(); fs.rmSync(DATA, { recursive: true, force: true }); });

const j = async (method, p, b) => { const r = await fetch(base + p, { method, headers: b ? { 'Content-Type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };
const lib = (...p) => path.join(DATA, 'library', ...p);
const up = async (name, subject, data) => (await (await fetch(`${base}/api/files?name=${encodeURIComponent(name)}&subject=${encodeURIComponent(subject)}`, { method: 'POST', body: Buffer.from(data) })).json());
const sync = async () => (await j('POST', '/api/gdrive/sync')).body;
const uploads = () => G.log.filter(x => x.p.startsWith('/upload/session/') && x.m === 'PUT').length;

test('Ohne Google-App in der Installation: nicht verfügbar, eigene Zugangsdaten lassen sich eintragen', async () => {
  assert.strictEqual((await j('GET', '/api/gdrive/status')).body.available, false);
  assert.strictEqual((await j('PUT', '/api/gdrive/creds', { clientId: 'quatsch', clientSecret: 'x' })).status, 400);
  assert.strictEqual((await j('PUT', '/api/gdrive/creds', { clientId: '1-abc.apps.googleusercontent.com', clientSecret: '' })).status, 400);
  const st = (await j('PUT', '/api/gdrive/creds', { clientId: '1-abc.apps.googleusercontent.com', clientSecret: 'GOCSPX-x' })).body;
  assert.strictEqual(st.available, true); assert.strictEqual(st.credsSource, 'eigene'); assert.ok(!JSON.stringify(st).includes('GOCSPX'));
  assert.strictEqual((await j('POST', '/api/gdrive/sync')).body.result.ok, false);        // ohne Verbindung: klare Meldung statt Absturz
  assert.match((await j('GET', '/api/gdrive/status')).body.last.msg, /nicht verbunden/);
});

test('Anmeldung mit Code: Code anzeigen, warten, verbunden', async () => {
  const c = (await j('POST', '/api/gdrive/connect')).body;
  assert.strictEqual(c.pending.userCode, 'ABCD-EFGH'); assert.match(c.pending.url, /google\.com\/device/);
  assert.match(G.deviceScope, /drive\.file/); assert.ok(!/auth\/drive(\s|$)/.test(G.deviceScope));    // nur das kleine Recht, nie voller Drive-Zugriff
  assert.strictEqual((await j('GET', '/api/gdrive/poll')).body.state, 'pending');
  G.authorized = true;
  const ok = (await j('GET', '/api/gdrive/poll')).body;
  assert.strictEqual(ok.state, 'connected'); assert.strictEqual(ok.connected, true); assert.strictEqual(ok.email, 'peter@example.org'); assert.strictEqual(ok.pending, null);
  assert.strictEqual(fs.statSync(path.join(DATA, 'gdrive.json')).mode & 0o777, 0o600);
});

test('Erster Abgleich (Sicherung): Ordnerstruktur Lernhafen/<Fach>/<Datei> entsteht, zweiter Lauf tut nichts', async () => {
  await up('Skript.pdf', 'Anatomie', 'pdf-inhalt'); await up('Formeln.txt', 'Physik', 'e=mc2'); await up('Lose.txt', '', 'ohne fach');
  const r = (await sync()).result; assert.strictEqual(r.ok, true); assert.strictEqual(r.up, 3);
  assert.deepStrictEqual(M.tree(), ['Lernhafen/Anatomie/Skript.pdf', 'Lernhafen/Ohne Fach/Lose.txt', 'Lernhafen/Physik/Formeln.txt']);
  assert.strictEqual(M.find('Lernhafen/Anatomie/Skript.pdf').content.toString(), 'pdf-inhalt');
  const n = uploads(); const r2 = (await sync()).result; assert.strictEqual(r2.up + r2.down + r2.trashed + r2.conflicts, 0); assert.strictEqual(uploads(), n);
  assert.ok(G.log.filter(x => x.p.startsWith('/drive') || x.p.startsWith('/upload')).every(x => /^Bearer at\d+$/.test(x.auth)));
});

test('Änderung und Löschung lokal werden in Drive nachgezogen (Löschen = Drive-Papierkorb)', async () => {
  fs.writeFileSync(lib('Physik', 'Formeln.txt'), 'e=mc2 und mehr');
  let r = (await sync()).result; assert.strictEqual(r.up, 1); assert.strictEqual(M.find('Lernhafen/Physik/Formeln.txt').content.toString(), 'e=mc2 und mehr');
  const f = (await j('GET', '/api/files')).body.files.find(x => x.name === 'Lose.txt');
  await j('DELETE', `/api/files/${f.id}`); r = (await sync()).result; assert.strictEqual(r.trashed, 1);
  assert.ok(!M.tree().includes('Lernhafen/Ohne Fach/Lose.txt')); assert.ok(M.find('Lernhafen/Physik/Formeln.txt'));
});

test('Sicherungsmodus überschreibt nichts lokal, auch wenn Drive etwas ändert', async () => {
  M.put('Lernhafen/Physik/Formeln.txt', 'in Drive geändert'); M.put('Lernhafen/Physik/Neu aus Drive.txt', 'neu');
  const r = (await sync()).result; assert.strictEqual(r.down, 0);
  assert.strictEqual(fs.readFileSync(lib('Physik', 'Formeln.txt'), 'utf8'), 'e=mc2 und mehr'); assert.ok(!fs.existsSync(lib('Physik', 'Neu aus Drive.txt')));
});

test('Zwei-Wege: Änderungen und neue Dateien aus Drive kommen herunter und erscheinen in der Dateiliste', async () => {
  assert.strictEqual((await j('PUT', '/api/gdrive/settings', { mode: 'twoway' })).body.mode, 'twoway');
  // lokale Datei unverändert zum letzten Stand, Drive hat sie geändert (der Sicherungslauf hat den Drive-Stand nicht übernommen)
  fs.writeFileSync(lib('Physik', 'Formeln.txt'), 'e=mc2 und mehr'); const t = new Date(Date.now() - 3600e3); fs.utimesSync(lib('Physik', 'Formeln.txt'), t, t);
  M.put('Lernhafen/Anatomie/Skript.pdf', 'neue Fassung aus Drive');
  const r = (await sync()).result; assert.strictEqual(r.ok, true); assert.ok(r.down >= 2, 'heruntergeladen: ' + r.down);
  assert.strictEqual(fs.readFileSync(lib('Anatomie', 'Skript.pdf'), 'utf8'), 'neue Fassung aus Drive');
  assert.strictEqual(fs.readFileSync(lib('Physik', 'Neu aus Drive.txt'), 'utf8'), 'neu');
  const list = (await j('GET', '/api/files')).body.files;
  const neu = list.find(f => f.name === 'Neu aus Drive.txt'); assert.ok(neu && neu.subject === 'Physik' && neu.size === 3);
});

test('Zwei-Wege: Änderung auf beiden Seiten behält beide Fassungen', async () => {
  fs.writeFileSync(lib('Anatomie', 'Skript.pdf'), 'lokal geändert'); M.put('Lernhafen/Anatomie/Skript.pdf', 'in Drive anders geändert');
  const r = (await sync()).result; assert.strictEqual(r.conflicts, 1);
  assert.strictEqual(fs.readFileSync(lib('Anatomie', 'Skript.pdf'), 'utf8'), 'lokal geändert');
  const copy = fs.readdirSync(lib('Anatomie')).find(f => /Skript \(Drive .*\)\.pdf/.test(f)); assert.ok(copy, 'Konfliktkopie vorhanden');
  assert.strictEqual(fs.readFileSync(lib('Anatomie', copy), 'utf8'), 'in Drive anders geändert');
  assert.strictEqual(M.find('Lernhafen/Anatomie/Skript.pdf').content.toString(), 'lokal geändert');
});

test('Zwei-Wege: in Drive gelöscht → lokal im Papierkorb-Ordner, nicht endgültig weg', async () => {
  await sync(); M.find('Lernhafen/Physik/Neu aus Drive.txt').trashed = true;
  const r = (await sync()).result; assert.strictEqual(r.trashed, 1);
  assert.ok(!fs.existsSync(lib('Physik', 'Neu aus Drive.txt'))); assert.strictEqual(fs.readFileSync(lib('.papierkorb', 'Physik', 'Neu aus Drive.txt'), 'utf8'), 'neu');
  assert.ok(!(await j('GET', '/api/files')).body.files.some(f => f.name === 'Neu aus Drive.txt'));
});

test('Schutz: Ist der Drive-Ordner plötzlich leer oder neu, wird lokal nichts gelöscht, sondern neu hochgeladen', async () => {
  await sync(); const before = fs.readdirSync(lib('Anatomie')).length;
  for (const n of Object.values(G.nodes)) n.trashed = true;                 // jemand hat den ganzen Drive-Ordner gelöscht
  const r = (await sync()).result; assert.strictEqual(r.ok, true);
  assert.strictEqual(fs.readdirSync(lib('Anatomie')).length, before);        // lokal unverändert
  assert.ok(M.tree().includes('Lernhafen/Anatomie/Skript.pdf') && M.tree().includes('Lernhafen/Physik/Formeln.txt'));   // alles wieder oben
});

test('Fehler bei einer Datei stoppen den Rest nicht und werden angezeigt', async () => {
  await up('Gut.txt', 'Chemie', 'ok'); await up('Kaputt.txt', 'Chemie', 'x');
  G.failUpload = /Kaputt/; const r = (await sync()).result; G.failUpload = null;
  assert.strictEqual(r.ok, false); assert.ok(r.errors[0].includes('Kaputt.txt')); assert.ok(M.tree().includes('Lernhafen/Chemie/Gut.txt'));
  const st = (await j('GET', '/api/gdrive/status')).body; assert.strictEqual(st.last.ok, false); assert.match(st.last.msg, /Kaputt/);
  const r2 = (await sync()).result; assert.strictEqual(r2.ok, true); assert.ok(M.tree().includes('Lernhafen/Chemie/Kaputt.txt'));     // beim nächsten Lauf nachgeholt
});

test('Zugangs-Token wird still erneuert; ein widerrufener Zugang gibt eine klare Meldung', async () => {
  const cfgFile = path.join(DATA, 'gdrive.json'), set = f => { const c = JSON.parse(fs.readFileSync(cfgFile)); f(c); fs.writeFileSync(cfgFile, JSON.stringify(c)); };
  set(c => { c.tokens.expiry = 0; }); const before = G.log.filter(x => x.p === '/token').length;
  assert.strictEqual((await sync()).result.ok, true); assert.strictEqual(G.log.filter(x => x.p === '/token').length, before + 1);
  G.refreshInvalid = true; set(c => { c.tokens.expiry = 0; });
  const r = (await sync()).result; assert.strictEqual(r.ok, false);
  const st = (await j('GET', '/api/gdrive/status')).body; assert.strictEqual(st.connected, false); assert.match(st.error, /neu/);
  G.refreshInvalid = false;
});

test('Trennen widerruft den Zugang; lokale Dateien bleiben', async () => {
  await j('POST', '/api/gdrive/connect'); G.authorized = true; await j('GET', '/api/gdrive/poll');
  const st = (await j('DELETE', '/api/gdrive')).body; assert.strictEqual(st.connected, false); assert.strictEqual(G.revoked, 1);
  assert.strictEqual(st.available, true);                                     // eigene Zugangsdaten bleiben
  assert.ok(fs.existsSync(lib('Anatomie', 'Skript.pdf')));
});
