'use strict';
// Scannen: Foto-Seiten aufräumen (drehen, verkleinern, Kontrast), Texterkennung mit Tesseract, durchsuchbares PDF.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const config = require('./config');
const store = require('./store');
const library = require('./files');

let sharp = null;
try { sharp = require('sharp'); } catch (e) { /* ohne sharp werden Fotos unverändert gespeichert */ }

const root = () => path.join(config.dataDir, 'scans');
const dirOf = id => path.join(root(), id);
const okId = id => /^[a-f0-9]{16}$/.test(id || '');
const list = () => store.read('scans', []);
const save = a => store.write('scans', a);
const find = id => list().find(s => s.id === id);
function update(id, patch) {
  const a = list(), s = a.find(x => x.id === id);
  if (!s) return null;
  Object.assign(s, patch); save(a); return s;
}

/** Kopie in der Bibliothek (data/library/<Fach>/Scans), damit Sync-Programme sie mitnehmen. */
function mirrorOut(id) {
  try {
    const s = find(id); if (!s || s.mirror) return;
    const rels = [], pdf = filePath(id, 'doc.pdf');
    if (pdf) rels.push(library.mirror(s.subject, s.title + '.pdf', fs.readFileSync(pdf), 'Scans'));
    else for (let i = 1; i <= s.pages; i++) rels.push(library.mirror(s.subject, `${s.title} - Seite ${i}.jpg`, fs.readFileSync(filePath(id, `p${i}.jpg`)), 'Scans'));
    update(id, { mirror: rels });
  } catch (e) { /* die Kopie ist ein Zusatz */ }
}
const hooks = { done: () => {} };      // der Server hängt hier z. B. das Sichern in Google Drive ein
let ocrAvailable = null;
function hasTesseract() {
  if (ocrAvailable !== null) return Promise.resolve(ocrAvailable);
  return new Promise(res => execFile('tesseract', ['--version'], { timeout: 10000 }, e => { ocrAvailable = !e; res(ocrAvailable); }));
}

function create() {
  const id = crypto.randomBytes(8).toString('hex');
  fs.mkdirSync(dirOf(id), { recursive: true });
  const s = { id, created: new Date().toISOString(), status: 'draft', pages: 0, subject: '', title: '', date: '', ocr: '', snippet: '' };
  save(list().concat(s));
  return s;
}

async function addPage(id, buf) {
  const s = find(id);
  if (!s || s.status !== 'draft') throw new Error('Scan nicht gefunden oder schon abgeschlossen.');
  if (s.pages >= 60) throw new Error('Mehr als 60 Seiten pro Scan sind nicht möglich.');
  const n = s.pages + 1, out = path.join(dirOf(id), `p${n}.jpg`);
  if (sharp) {
    await sharp(buf, { failOn: 'none' }).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .normalise().jpeg({ quality: 85 }).toFile(out);
  } else fs.writeFileSync(out, buf);
  update(id, { pages: n });
  return n;
}

function run(cmd, args, opts) {
  return new Promise((res, rej) => execFile(cmd, args, Object.assign({ timeout: 15 * 60 * 1000, maxBuffer: 8 << 20 }, opts), (e, so, se) => e ? rej(new Error((se || e.message).toString().slice(0, 300))) : res(so)));
}

let queue = Promise.resolve();
async function ocr(id) {
  const s = find(id), d = dirOf(id);
  if (!s) return;
  try {
    if (!(await hasTesseract())) { update(id, { status: 'done', ocr: 'unavailable' }); mirrorOut(id); hooks.done(find(id)); return; }
    const files = Array.from({ length: s.pages }, (_, i) => path.join(d, `p${i + 1}.jpg`));
    fs.writeFileSync(path.join(d, 'list.txt'), files.join('\n') + '\n');
    await run('tesseract', [path.join(d, 'list.txt'), path.join(d, 'doc'), '-l', config.ocrLang, 'pdf', 'txt'], { cwd: d });
    const text = fs.existsSync(path.join(d, 'doc.txt')) ? fs.readFileSync(path.join(d, 'doc.txt'), 'utf8') : '';
    update(id, { status: 'done', ocr: 'ok', snippet: text.replace(/\s+/g, ' ').trim().slice(0, 300) });
    mirrorOut(id); hooks.done(find(id));
  } catch (e) {
    update(id, { status: 'done', ocr: 'failed', error: String(e.message || e).slice(0, 300) });
  }
}

function finish(id, { subject, title, date }) {
  const s = find(id);
  if (!s || s.status !== 'draft') throw new Error('Scan nicht gefunden oder schon abgeschlossen.');
  if (!s.pages) throw new Error('Der Scan hat noch keine Seiten.');
  const t = String(title || '').trim().slice(0, 120) || `Scan ${new Date().toLocaleDateString('de-DE')}`;
  const r = update(id, { status: 'processing', subject: String(subject || '').slice(0, 40), title: t, date: /^\d{4}-\d\d-\d\d$/.test(date || '') ? date : '' });
  queue = queue.then(() => ocr(id)).catch(() => {});
  return r;
}

/** Umbenennen oder einem anderen Fach zuordnen; die Kopie in der Bibliothek wird mitgenommen. */
function edit(id, { title, subject }) {
  const s = find(id); if (!s) return null;
  const patch = {};
  if (typeof title === 'string' && title.trim()) patch.title = title.trim().slice(0, 120);
  if (typeof subject === 'string') patch.subject = subject.slice(0, 40);
  if (!Object.keys(patch).length) return s;
  if (s.mirror) { library.unmirror(s.mirror); patch.mirror = null; }
  update(id, patch); if (s.mirror) mirrorOut(id);
  hooks.done(find(id)); return find(id);
}
/** Reihenfolge der Scans eines Fachs festlegen. */
function reorder(subject, ids) {
  const a = list(), slots = [], mine = [];
  a.forEach((s, i) => { if ((s.subject || '') === (subject || '')) { slots.push(i); mine.push(s); } });
  const byId = new Map(mine.map(s => [s.id, s])), first = (Array.isArray(ids) ? ids : []).filter(i => byId.has(i));
  const ordered = first.map(i => byId.get(i)).concat(mine.filter(s => !first.includes(s.id)));
  slots.forEach((pos, k) => { a[pos] = ordered[k]; });
  save(a);
}

function remove(id) {
  if (!okId(id)) return false;
  library.unmirror((find(id) || {}).mirror);
  save(list().filter(s => s.id !== id));
  fs.rmSync(dirOf(id), { recursive: true, force: true });
  return true;
}

/** Datei eines Scans (Seite, PDF oder Text) – nur feste Namen, kein freier Pfad. */
function filePath(id, name) {
  if (!okId(id) || !/^(p\d{1,2}\.jpg|doc\.pdf|doc\.txt)$/.test(name)) return null;
  const f = path.join(dirOf(id), name);
  return fs.existsSync(f) ? f : null;
}

function search(q) {
  q = String(q || '').toLowerCase().trim();
  if (!q) return [];
  return list().filter(s => s.status === 'done').filter(s => {
    if ((s.title + ' ' + s.subject).toLowerCase().includes(q)) return true;
    const f = filePath(s.id, 'doc.txt');
    return f && fs.readFileSync(f, 'utf8').toLowerCase().includes(q);
  });
}

/** Nach einem Neustart: Scans, die noch in Arbeit waren, erneut erkennen. */
function resume() {
  list().filter(s => s.status === 'processing').forEach(s => { queue = queue.then(() => ocr(s.id)).catch(() => {}); });
  // Angefangene, nie abgeschlossene Scans nach einem Tag aufräumen
  list().filter(s => s.status === 'draft' && Date.now() - Date.parse(s.created) > 864e5).forEach(s => remove(s.id));
}

module.exports = { hooks, list, find, create, addPage, finish, update, edit, reorder, remove, filePath, search, resume, hasTesseract };
