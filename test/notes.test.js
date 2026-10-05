'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-notes-'));
process.env.DATA_DIR = DATA; delete process.env.APP_PASSWORD;
const app = require('../src/server');
const store = require('../src/store');
const editors = require('../src/editors');
let server, base;
test.before(async () => { await new Promise(r => { server = app.listen(0, r); }); base = 'http://127.0.0.1:' + server.address().port; });
test.after(() => { server.close(); fs.rmSync(DATA, { recursive: true, force: true }); });
const j = async (m, p, b) => { const r = await fetch(base + p, { method: m, headers: b ? { 'Content-Type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json() }; };
const up = async (name, subject) => (await (await fetch(`${base}/api/files?name=${encodeURIComponent(name)}&subject=${encodeURIComponent(subject)}`, { method: 'POST', body: Buffer.from('x' + name) })).json());

test('Mitschrift ist ein Word-Dokument im Fach, mit Text, und für dieselbe Stunde nur einmal', async () => {
  const a = (await j('POST', '/api/library/note', { subject: 'Anatomie', title: 'Muskeln', date: '2026-10-05', slot: '2026-10-05|1|Anatomie', text: 'Zeile eins\nZeile <zwei>' })).body;
  assert.strictEqual(a.note, true); assert.match(a.name, /^2026-10-05 Muskeln\.docx$/);
  assert.ok(fs.existsSync(path.join(DATA, 'library', 'Anatomie', a.name)));
  const d = (await j('GET', '/api/editor/doc/' + a.id)).body; assert.match(d.html, /Zeile eins/); assert.match(d.html, /Zeile &lt;zwei&gt;/);
  const b = (await j('POST', '/api/library/note', { subject: 'Anatomie', title: 'Anders', date: '2026-10-05', slot: '2026-10-05|1|Anatomie', text: '' })).body;
  assert.strictEqual(b.id, a.id);
  const s = (await j('GET', '/api/search?q=muskeln')).body; assert.ok(s.docs.some(x => x.id === a.id));
  const s2 = (await j('GET', '/api/search?q=' + encodeURIComponent('zeile eins'))).body; assert.ok(s2.docs.some(x => x.id === a.id && /Zeile eins/.test(x.snippet)));
});

test('Alte Mitschriften werden einmal in Dokumente umgewandelt', async () => {
  store.write('state', { notes: { Chemie: [{ id: 'n1', title: 'Salze', date: '2026-09-01', body: 'NaCl', scans: [] }] }, _rev: 1 });
  assert.strictEqual(await editors.notesMigrate(store), 1); assert.strictEqual(await editors.notesMigrate(store), 0);
  assert.deepStrictEqual(store.read('state').notes.Chemie, []);
  assert.ok(fs.existsSync(path.join(DATA, 'library', 'Chemie', '2026-09-01 Salze.docx')));
});

test('Umbenennen (Endung bleibt), Verschieben und Umsortieren', async () => {
  const f1 = await up('a.pdf', 'Bio'), f2 = await up('b.pdf', 'Bio'), f3 = await up('c.pdf', 'Bio');
  const r = (await j('PATCH', '/api/files/' + f1.id, { name: 'Zelle Skript' })).body; assert.strictEqual(r.name, 'Zelle Skript.pdf');
  assert.ok(fs.existsSync(path.join(DATA, 'library', 'Bio', 'Zelle Skript.pdf')) && !fs.existsSync(path.join(DATA, 'library', 'Bio', 'a.pdf')));
  assert.strictEqual((await j('PATCH', '/api/files/' + f2.id, { name: 'Zelle Skript' })).body.name, 'Zelle Skript (2).pdf');          // kein Überschreiben
  assert.strictEqual((await j('PATCH', '/api/files/' + f3.id, { name: '../../evil' })).body.path.startsWith('Bio/'), true);
  const m = (await j('PATCH', '/api/files/' + f3.id, { subject: 'Chemie' })).body; assert.strictEqual(m.subject, 'Chemie'); assert.ok(fs.existsSync(path.join(DATA, 'library', 'Chemie', m.name)));
  const o = (await j('POST', '/api/files/order', { subject: 'Bio', ids: [f2.id, f1.id] })).body.files.filter(f => f.subject === 'Bio').map(f => f.id);
  assert.deepStrictEqual(o, [f2.id, f1.id]);
});
