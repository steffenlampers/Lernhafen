'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const JSZip = require('jszip');

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-edit-'));
process.env.DATA_DIR = DATA;
delete process.env.APP_PASSWORD;
const app = require('../src/server');

let server, base;
test.before(async () => { await new Promise(r => { server = app.listen(0, r); }); base = 'http://127.0.0.1:' + server.address().port; });
test.after(() => { server.close(); fs.rmSync(DATA, { recursive: true, force: true }); });
const j = async (method, p, b) => { const r = await fetch(base + p, { method, headers: b ? { 'Content-Type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };
const make = async (kind, subject = 'Anatomie', name) => (await j('POST', '/api/library/new', { kind, subject, name })).body;
const disk = f => fs.readFileSync(path.join(DATA, 'library', ...f.path.split('/')));

test('Neue Dateien aus den Vorlagen sind gültige Office-Dateien', async () => {
  for (const [kind, part] of [['dokument', 'word/document.xml'], ['tabelle', 'xl/workbook.xml'], ['praesentation', 'ppt/slides/slide1.xml']]) {
    const f = await make(kind); const zip = await JSZip.loadAsync(disk(f));
    assert.ok(zip.file(part), kind + ' enthält ' + part);
  }
  assert.strictEqual((await j('POST', '/api/library/new', { kind: 'exe', subject: 'x' })).status, 400);
});

test('Text: Überschrift, Absatz, fett, kursiv, Liste, Tabelle bleiben beim Speichern und Öffnen erhalten', async () => {
  const f = await make('dokument', 'Anatomie', 'Nerven');
  const html = '<h1>Plexus brachialis</h1><p>Der <strong>Plexus</strong> versorgt den <em>Arm</em> und <u>Hand</u>.</p><ul><li>Nervus radialis</li><li>Nervus ulnaris</li></ul><ol><li>Erstens</li></ol><table><tr><td>A</td><td>B</td></tr></table>';
  const put = await j('PUT', `/api/editor/doc/${f.id}`, { html }); assert.strictEqual(put.status, 200);
  const zip = await JSZip.loadAsync(disk(f)); const xml = await zip.file('word/document.xml').async('string');
  assert.match(xml, /Plexus brachialis/); assert.match(xml, /w:tbl/);
  const back = (await j('GET', `/api/editor/doc/${f.id}`)).body.html;
  assert.match(back, /<h1>.*Plexus brachialis.*<\/h1>/); assert.match(back, /<strong>Plexus<\/strong>/); assert.match(back, /<em>Arm<\/em>/); assert.match(back, /<u>Hand<\/u>/);
  assert.match(back, /<ul>.*<li>.*Nervus radialis.*<\/li>.*<li>.*Nervus ulnaris/s); assert.match(back, /<ol>.*Erstens/s); assert.match(back, /<table>/);
  const list = (await j('GET', '/api/files')).body.files.find(x => x.id === f.id); assert.ok(list.size > 1000 && list.modified);
});

test('Text: Umlaute, Sonderzeichen und sehr leere Dokumente', async () => {
  const f = await make('dokument', 'Chemie');
  assert.strictEqual((await j('GET', `/api/editor/doc/${f.id}`)).status, 200);
  await j('PUT', `/api/editor/doc/${f.id}`, { html: '<p>Größe &amp; Äpfel &lt;b&gt; ü ß € 10 % „Zitat“</p>' });
  assert.match((await j('GET', `/api/editor/doc/${f.id}`)).body.html, /Größe &amp; Äpfel &lt;b&gt; ü ß € 10 % „Zitat“/);
  assert.strictEqual((await j('PUT', `/api/editor/doc/${f.id}`, { html: '' })).status, 200);
});

test('Editoren öffnen nur passende Dateitypen und keine fremden Pfade', async () => {
  const t = await make('tabelle');
  assert.strictEqual((await j('GET', `/api/editor/doc/${t.id}`)).status, 400);
  assert.strictEqual((await j('GET', '/api/editor/doc/..%2F..%2Fstate')).status, 400);
  assert.strictEqual((await j('GET', '/api/editor/sheet/nope')).status, 400);
});

test('Tabelle: Werte, Zahlen und Formeln werden gespeichert und wieder gelesen', async () => {
  const f = await make('tabelle', 'Physik', 'Messwerte');
  const sheets = [{ name: 'Messung', data: [['Messung', 'Wert'], ['1', '2,5'], ['2', 3], ['Summe', '=SUM(B2:B3)']] }, { name: 'Notizen', data: [['Hallo']] }];
  assert.strictEqual((await j('PUT', `/api/editor/sheet/${f.id}`, { sheets })).status, 200);
  const r = (await j('GET', `/api/editor/sheet/${f.id}`)).body;
  assert.deepStrictEqual(r.sheets.map(s => s.name), ['Messung', 'Notizen']);
  assert.deepStrictEqual(r.sheets[0].data[0], ['Messung', 'Wert']);
  assert.deepStrictEqual(r.sheets[0].data[1], [1, 2.5]);          // Zahlen als Text eingegeben werden zu Zahlen, Komma wird Punkt
  assert.strictEqual(r.sheets[0].data[3][1], '=SUM(B2:B3)');       // Formel bleibt Formel
  assert.strictEqual(r.sheets[1].data[0][0], 'Hallo');
  assert.strictEqual((await j('PUT', `/api/editor/sheet/${f.id}`, { sheets: [] })).status, 400);
  assert.strictEqual((await j('PUT', `/api/editor/sheet/${f.id}`, { sheets: [{ name: 'a/b:c?*', data: [[1]] }] })).status, 200);
  assert.strictEqual((await j('GET', `/api/editor/sheet/${f.id}`)).body.sheets[0].name, 'a_b_c__');
});

test('Folien: Titel und Stichpunkte, Reihenfolge und Löschen', async () => {
  const f = await make('praesentation', 'Biologie', 'Zelle');
  const first = (await j('GET', `/api/editor/slides/${f.id}`)).body;
  assert.strictEqual(first.ours, true); assert.strictEqual(first.slides[0].title, 'Titel der Präsentation'); assert.match(first.slides[0].body, /Erster Punkt/);
  const slides = [{ title: 'Die Zelle', body: 'Zellkern\nMitochondrien' }, { title: 'Organellen', body: 'Ribosomen' }, { title: 'Ende', body: '' }];
  assert.strictEqual((await j('PUT', `/api/editor/slides/${f.id}`, { slides })).status, 200);
  const r = (await j('GET', `/api/editor/slides/${f.id}`)).body;
  assert.deepStrictEqual(r.slides.map(s => s.title), ['Die Zelle', 'Organellen', 'Ende']);
  assert.strictEqual(r.slides[0].body, 'Zellkern\nMitochondrien'); assert.strictEqual(r.slides[2].body, '');
  const zip = await JSZip.loadAsync(disk(f)); assert.ok(zip.file('ppt/slides/slide3.xml') && !zip.file('ppt/slides/slide4.xml'));
  assert.strictEqual((await j('PUT', `/api/editor/slides/${f.id}`, { slides: [] })).status, 400);
});

test('Fremde Dateien: Beim ersten Speichern bleibt das Original als Kopie erhalten, danach nicht mehr', async () => {
  const orig = fs.readFileSync(path.join(__dirname, '..', 'templates', 'praesentation.pptx'));
  const up = await (await fetch(`${base}/api/files?name=Fremd.pptx&subject=Biologie`, { method: 'POST', body: orig })).json();
  const fr = (await j('GET', `/api/editor/slides/${up.id}`)).body; assert.strictEqual(fr.ours, false);
  assert.strictEqual((await j('PUT', `/api/editor/slides/${up.id}`, { slides: [{ title: 'Neu', body: '' }] })).status, 200);
  const dir = path.join(DATA, 'library', 'Biologie');
  assert.deepStrictEqual(fs.readFileSync(path.join(dir, 'Fremd (Original).pptx')), orig);                    // unveränderte Kopie
  assert.strictEqual((await j('GET', `/api/editor/slides/${up.id}`)).body.slides[0].title, 'Neu');
  await j('PUT', `/api/editor/slides/${up.id}`, { slides: [{ title: 'Noch neuer', body: '' }] });
  assert.ok(!fs.existsSync(path.join(dir, 'Fremd (Original) (2).pptx')));                                      // nur einmal
  // eigene Dateien bekommen keine Kopie
  const mine = await make('dokument', 'Biologie', 'Eigenes'); await j('PUT', `/api/editor/doc/${mine.id}`, { html: '<p>x</p>' });
  assert.ok(!fs.readdirSync(dir).some(n => n.startsWith('Eigenes (Original)')));
  // Word fremd
  const w = await (await fetch(`${base}/api/files?name=Skript.docx&subject=Biologie`, { method: 'POST', body: fs.readFileSync(path.join(__dirname, '..', 'templates', 'dokument.docx')) })).json();
  await j('PUT', `/api/editor/doc/${w.id}`, { html: '<p>geändert</p>' }); assert.ok(fs.existsSync(path.join(dir, 'Skript (Original).docx')));
});
