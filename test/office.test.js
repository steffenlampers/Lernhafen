'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-office-'));
process.env.DATA_DIR = DATA;
delete process.env.APP_PASSWORD;
const app = require('../src/server');
const office = require('../src/office');
const files = require('../src/files');
const sharp = require('sharp');

const DISCOVERY = `<?xml version="1.0" encoding="utf-8"?><wopi-discovery><net-zone name="external-http"><app name="writer">
<action default="true" ext="docx" name="edit" urlsrc="http://collabora:9980/browser/abc123/cool.html?"/><action ext="odt" name="edit" urlsrc="http://collabora:9980/browser/abc123/cool.html?"/></app>
<app name="calc"><action default="true" ext="xlsx" name="edit" urlsrc="http://collabora:9980/browser/abc123/cool.html?"/></app>
<app name="impress"><action ext="pptx" name="edit" urlsrc="http://collabora:9980/browser/abc123/cool.html?"/></app>
<app name="draw"><action ext="pdf" name="view" urlsrc="http://collabora:9980/browser/abc123/cool.html?a=1&amp;b=2"/></app></net-zone></wopi-discovery>`;
let server, base, collabora, up = true;

test.before(async () => {
  collabora = http.createServer((q, s) => { if (!up) { s.writeHead(503); return s.end(); } s.writeHead(200, { 'Content-Type': 'text/xml' }); s.end(DISCOVERY); });
  await new Promise(r => collabora.listen(0, r));
  process.env.COLLABORA_URL = 'http://127.0.0.1:' + collabora.address().port;
  await new Promise(r => { server = app.listen(0, r); }); base = 'http://127.0.0.1:' + server.address().port;
  process.env.WOPI_HOST_URL = 'http://lernhafen:8088';
});
test.after(() => { server.close(); collabora.close(); fs.rmSync(DATA, { recursive: true, force: true }); });

const j = async (method, p, b) => {
  const r = await fetch(base + p, { method, headers: b ? { 'Content-Type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
};
const lib = (...p) => path.join(DATA, 'library', ...p);

test('Vorlagen sind echte Word-, Excel- und PowerPoint-Dateien', () => {
  const need = { 'dokument.docx': ['word/document.xml', '[Content_Types].xml'], 'tabelle.xlsx': ['xl/workbook.xml', 'xl/worksheets/sheet1.xml'], 'praesentation.pptx': ['ppt/presentation.xml', 'ppt/slides/slide1.xml'] };
  for (const [f, parts] of Object.entries(need)) {
    const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', f));
    assert.strictEqual(buf.subarray(0, 2).toString(), 'PK', f);
    for (const part of parts) assert.ok(buf.includes(Buffer.from(part)), f + ' enthält ' + part);
  }
});

test('Bibliothek: Dateien liegen als normale Dateien in Ordnern pro Fach, nichts wird überschrieben', async () => {
  const up = async (name, subject, data) => (await (await fetch(`${base}/api/files?name=${encodeURIComponent(name)}&subject=${encodeURIComponent(subject)}`, { method: 'POST', body: Buffer.from(data) })).json());
  const a = await up('Skript.pdf', 'Anatomie', 'eins'), b = await up('Skript.pdf', 'Anatomie', 'zwei');
  assert.strictEqual(a.path, 'Anatomie/Skript.pdf'); assert.strictEqual(b.path, 'Anatomie/Skript (2).pdf');
  assert.strictEqual(fs.readFileSync(lib('Anatomie', 'Skript.pdf'), 'utf8'), 'eins'); assert.strictEqual(fs.readFileSync(lib('Anatomie', 'Skript (2).pdf'), 'utf8'), 'zwei');
  const o = await up('Notiz.txt', '', 'x'); assert.strictEqual(o.path, 'Ohne Fach/Notiz.txt');
  const evil = await up('..\\..\\x.txt', '../../etc', 'x'); assert.ok(evil.path.split('/').every(seg => seg !== '..' && seg !== '.') && fs.existsSync(lib(evil.path)) && path.resolve(lib(evil.path)).startsWith(lib() + path.sep));
  // Fachwechsel verschiebt die Datei
  const m = (await j('POST', `/api/files/${a.id}/subject`, { subject: 'Physiologie' })).body;
  assert.strictEqual(m.path, 'Physiologie/Skript.pdf'); assert.ok(!fs.existsSync(lib('Anatomie', 'Skript.pdf')) && fs.existsSync(lib('Physiologie', 'Skript.pdf')));
  // Löschen entfernt die Datei
  await j('DELETE', `/api/files/${b.id}`); assert.ok(!fs.existsSync(lib('Anatomie', 'Skript (2).pdf')));
  // Arten
  const list = (await j('GET', '/api/files')).body.files;
  assert.strictEqual(list.find(f => f.id === a.id).kind, 'pdf'); assert.strictEqual(list.find(f => f.id === a.id).editable, false);
});

test('Alte Dateien (Version 0.1) werden in die Ordnerstruktur übernommen', () => {
  const id = 'aabbccddeeff0011';
  fs.mkdirSync(path.join(DATA, 'files'), { recursive: true }); fs.writeFileSync(path.join(DATA, 'files', id + '.bin'), 'alt');
  const idx = JSON.parse(fs.readFileSync(path.join(DATA, 'files.json'))); idx.push({ id, name: 'Alt.pdf', subject: 'Chemie', size: 3, created: '2026-01-01T00:00:00Z' });
  fs.writeFileSync(path.join(DATA, 'files.json'), JSON.stringify(idx));
  files.migrate();
  assert.strictEqual(fs.readFileSync(lib('Chemie', 'Alt.pdf'), 'utf8'), 'alt'); assert.ok(!fs.existsSync(path.join(DATA, 'files', id + '.bin')));
  assert.strictEqual(files.find(id).path, 'Chemie/Alt.pdf');
});

test('Neues Dokument, Tabelle und Präsentation aus den Vorlagen', async () => {
  const d = (await j('POST', '/api/library/new', { kind: 'dokument', subject: 'Anatomie', name: 'Mitschrift Nerven' })).body;
  assert.strictEqual(d.name, 'Mitschrift Nerven.docx'); assert.ok(fs.statSync(lib('Anatomie', 'Mitschrift Nerven.docx')).size > 5000);
  const t = (await j('POST', '/api/library/new', { kind: 'tabelle', subject: 'Anatomie' })).body; assert.strictEqual(t.name, 'Neue Tabelle.xlsx');
  const p = (await j('POST', '/api/library/new', { kind: 'praesentation', subject: 'Anatomie' })).body; assert.strictEqual(p.name, 'Neue Präsentation.pptx');
  assert.strictEqual((await j('POST', '/api/library/new', { kind: 'virus', subject: 'x' })).status, 400);
  const list = (await j('GET', '/api/files')).body.files;
  assert.ok(['dokument', 'tabelle', 'praesentation'].length && list.find(f => f.id === d.id).editable && list.find(f => f.id === d.id).kind === 'text' && list.find(f => f.id === t.id).kind === 'tabelle' && list.find(f => f.id === p.id).kind === 'praesentation');
});

test('Office: Status, Adresse des Editors (Rechnername der App, Port 9980, WOPISrc, Token)', async () => {
  assert.deepStrictEqual((await j('GET', '/api/office/status')).body, { enabled: true, ok: true, message: '' });
  const d = (await j('POST', '/api/library/new', { kind: 'dokument', subject: 'Physik' })).body;
  const r = (await j('POST', '/api/office/open', { id: d.id })).body;
  assert.strictEqual(r.mode, 'edit'); assert.strictEqual(r.origin, 'http://127.0.0.1:9980');
  const u = new URL(r.url);
  assert.strictEqual(u.origin, 'http://127.0.0.1:9980'); assert.strictEqual(u.pathname, '/browser/abc123/cool.html'); assert.ok(!r.url.includes('??'));
  assert.strictEqual(u.searchParams.get('WOPISrc'), `http://lernhafen:8088/wopi/files/${d.id}`);
  assert.ok(office.verify(u.searchParams.get('access_token'), d.id).w);
  assert.strictEqual(office.verify(u.searchParams.get('access_token'), 'andere'), null);       // gilt nur für diese Datei
  // PDF kann Collabora nur ansehen; Fremdes wird abgelehnt
  const pdf = await (await fetch(base + '/api/files?name=a.pdf&subject=Physik', { method: 'POST', body: Buffer.from('%PDF') })).json();
  assert.strictEqual((await j('POST', '/api/office/open', { id: pdf.id })).body.mode, 'view');
  const exe = await (await fetch(base + '/api/files?name=a.exe&subject=Physik', { method: 'POST', body: Buffer.from('MZ') })).json();
  assert.strictEqual((await j('POST', '/api/office/open', { id: exe.id })).status, 400);
  assert.strictEqual((await j('POST', '/api/office/open', { id: 'nope' })).status, 400);
});

test('Office: Sicherheits-Kopfzeile erlaubt das Editor-Fenster, und nur dieses', async () => {
  const csp = (await fetch(base + '/')).headers.get('content-security-policy');
  assert.match(csp, /frame-src 'self' http:\/\/127\.0\.0\.1:9980/);
});

test('WOPI: Collabora liest und speichert Dateien, jeweils nur mit gültigem Token', async () => {
  const d = (await j('POST', '/api/library/new', { kind: 'dokument', subject: 'Chemie', name: 'Protokoll' })).body;
  const tok = office.token(d.id, true), ro = office.token(d.id, false), url = (suffix = '', t = tok) => `${base}/wopi/files/${d.id}${suffix}?access_token=${encodeURIComponent(t)}`;
  const info = await (await fetch(url())).json();
  assert.strictEqual(info.BaseFileName, 'Protokoll.docx'); assert.strictEqual(info.UserCanWrite, true); assert.strictEqual(info.SupportsUpdate, true); assert.strictEqual(info.Size, d.size);
  assert.strictEqual((await (await fetch(url('', ro))).json()).UserCanWrite, false);
  const got = Buffer.from(await (await fetch(url('/contents'))).arrayBuffer()); assert.strictEqual(got.subarray(0, 2).toString(), 'PK');
  // Speichern
  const neu = Buffer.concat([got, Buffer.from('Änderung')]);
  const put = await fetch(url('/contents'), { method: 'POST', headers: { 'X-WOPI-Override': 'PUT' }, body: neu });
  assert.strictEqual(put.status, 200); assert.ok((await put.json()).LastModifiedTime);
  assert.deepStrictEqual(fs.readFileSync(lib('Chemie', 'Protokoll.docx')), neu);
  assert.strictEqual((await (await fetch(url())).json()).Size, neu.length);
  // Zugriff verweigert
  assert.strictEqual((await fetch(`${base}/wopi/files/${d.id}`)).status, 401);
  assert.strictEqual((await fetch(url('', 'quatsch'))).status, 401);
  assert.strictEqual((await fetch(url('/contents', ro), { method: 'POST', body: neu })).status, 401);          // nur-lesen-Token darf nicht speichern
  assert.strictEqual((await fetch(url('/contents', office.token('anderedatei', true)))).status, 401);
  const abgelaufen = (() => { const p = Buffer.from(JSON.stringify({ f: d.id, w: true, e: Date.now() - 1000 })).toString('base64url'); return p + '.' + require('../src/auth').sign('wopi.' + p); })();
  assert.strictEqual((await fetch(url('', abgelaufen))).status, 401);
  assert.strictEqual((await fetch(url('/contents'), { method: 'POST', body: Buffer.alloc(0) })).status, 400);
  // Sperren
  const lock = (op, l, extra = {}) => fetch(url(), { method: 'POST', headers: Object.assign({ 'X-WOPI-Override': op, 'X-WOPI-Lock': l }, extra) });
  assert.strictEqual((await lock('LOCK', 'a')).status, 200); assert.strictEqual((await lock('LOCK', 'b')).status, 409);
  assert.strictEqual((await lock('UNLOCK', 'a')).status, 200); assert.strictEqual((await lock('LOCK', 'b')).status, 200);
});

test('Office nicht erreichbar: klare Meldung statt Fehlerseite', async () => {
  up = false; office.resetCache();
  const s = (await j('GET', '/api/office/status')).body; assert.strictEqual(s.enabled, true); assert.strictEqual(s.ok, false); assert.match(s.message, /antwortet nicht/);
  const d = (await j('POST', '/api/library/new', { kind: 'tabelle', subject: 'x' })).body;
  const r = await j('POST', '/api/office/open', { id: d.id }); assert.strictEqual(r.status, 400); assert.match(r.body.error, /antwortet nicht/);
  up = true; office.resetCache();
});

test('Scans erscheinen zusätzlich als normale Dateien im Fach-Ordner und verschwinden mit dem Scan', async () => {
  const jpg = await sharp({ create: { width: 500, height: 700, channels: 3, background: '#ddd' } }).jpeg().toBuffer();
  const id = (await j('POST', '/api/scans')).body.id;
  await fetch(`${base}/api/scans/${id}/pages`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: jpg });
  await j('POST', `/api/scans/${id}/finish`, { subject: 'Biologie', title: 'Tafelbild / Zelle', date: '2026-10-05' });
  let s; for (let i = 0; i < 60; i++) { s = (await j('GET', '/api/scans')).body.scans.find(x => x.id === id); if (s && s.status === 'done' && s.mirror) break; await new Promise(r => setTimeout(r, 100)); }
  assert.ok(s.mirror && s.mirror.length === 1);
  const mirrored = lib(...s.mirror[0].split('/')); assert.ok(fs.existsSync(mirrored)); assert.match(s.mirror[0], /^Biologie\/Scans\/Tafelbild _ Zelle( - Seite 1\.jpg|\.pdf)$/);
  await j('DELETE', `/api/scans/${id}`); assert.ok(!fs.existsSync(mirrored));
});
