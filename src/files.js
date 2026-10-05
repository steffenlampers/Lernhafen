'use strict';
// Bibliothek: Dokumente, Tabellen, Folien, PDFs und Scans liegen als ganz normale Dateien in Ordnern pro Fach:
//   data/library/<Fach>/<Datei>      (Scans zusätzlich unter data/library/<Fach>/Scans/)
// So kann jedes Sync-Programm (QNAP Hybrid Backup Sync, Synology Cloud Sync, rclone, Syncthing) den Ordner mit Google Drive abgleichen.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const store = require('./store');

const root = () => path.join(config.dataDir, 'library');
const okId = id => /^[a-f0-9]{16}$/.test(id || '');
const list = () => store.read('files', []);
const INLINE = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8' };
const KINDS = {
  text: ['docx', 'doc', 'odt', 'rtf', 'txt'], tabelle: ['xlsx', 'xls', 'ods', 'csv'], praesentation: ['pptx', 'ppt', 'odp'],
  pdf: ['pdf'], bild: ['png', 'jpg', 'jpeg', 'gif', 'webp']
};
const TEMPLATES = { dokument: ['dokument.docx', 'Neues Dokument', '.docx'], tabelle: ['tabelle.xlsx', 'Neue Tabelle', '.xlsx'], praesentation: ['praesentation.pptx', 'Neue Präsentation', '.pptx'] };

const safe = (s, d) => String(s || '').replace(/[\\/:*?"<>|\0]/g, '_').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 80) || d;
const ext = n => path.extname(n).slice(1).toLowerCase();
function kindOf(name) { const e = ext(name); for (const [k, l] of Object.entries(KINDS)) if (l.includes(e)) return k; return 'datei'; }
const editable = name => ['text', 'tabelle', 'praesentation'].includes(kindOf(name));

/** Pfad innerhalb der Bibliothek, der nie aus ihr herausführt. */
function abs(rel) { const p = path.resolve(root(), rel); return p.startsWith(root() + path.sep) ? p : null; }
function unique(rel) {
  const e = path.extname(rel), base = rel.slice(0, rel.length - e.length); let n = 1, cand = rel;
  while (fs.existsSync(path.join(root(), cand))) cand = `${base} (${++n})${e}`;
  return cand;
}
function relFor(subject, name, sub) { return unique(path.posix.join(safe(subject, 'Ohne Fach'), ...(sub ? [sub] : []), safe(name, 'Datei'))); }
function put(rel, buf) { const p = path.join(root(), rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); }

function add(buf, name, subject) {
  if (!buf.length) throw new Error('Die Datei ist leer.');
  const rel = relFor(subject, name);
  put(rel, buf);
  const rec = { id: crypto.randomBytes(8).toString('hex'), name: path.posix.basename(rel), subject: String(subject || '').slice(0, 60), path: rel, size: buf.length, created: new Date().toISOString(), modified: new Date().toISOString() };
  store.write('files', list().concat(rec));
  return rec;
}
/** Leeres Dokument, leere Tabelle oder leere Präsentation aus der Vorlage anlegen. */
function create(kind, subject, name) {
  const t = TEMPLATES[kind]; if (!t) throw new Error('Unbekannte Art.');
  const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', t[0]));
  let n = safe(name, t[1]).replace(/\.(docx|xlsx|pptx)$/i, '') + t[2];
  return add(buf, n, subject);
}
function find(id) { return okId(id) ? list().find(f => f.id === id) : null; }
function filePath(id) { const f = find(id); const p = f && f.path && abs(f.path); return p && fs.existsSync(p) ? p : null; }
/** Neuer Inhalt (z. B. aus dem Office-Editor). */
function replace(id, buf) {
  const a = list(), f = a.find(x => x.id === id), p = f && f.path && abs(f.path);
  if (!f || !p) throw new Error('Datei nicht gefunden.');
  fs.writeFileSync(p, buf); f.size = buf.length; f.modified = new Date().toISOString(); store.write('files', a); return f;
}
function update(id, patch) {
  const a = list(), f = a.find(x => x.id === id); if (!f) return null;
  if (typeof patch.subject === 'string' && patch.subject !== f.subject) {      // in den Ordner des neuen Fachs verschieben
    const oldP = abs(f.path), rel = relFor(patch.subject, f.name), np = path.join(root(), rel);
    if (oldP && fs.existsSync(oldP)) { fs.mkdirSync(path.dirname(np), { recursive: true }); fs.renameSync(oldP, np); f.path = rel; }
    f.subject = patch.subject.slice(0, 60);
  }
  store.write('files', a); return f;
}
function remove(id) {
  const f = find(id); if (!f) return false;
  store.write('files', list().filter(x => x.id !== id));
  const p = f.path && abs(f.path); if (p) fs.rmSync(p, { force: true });
  return true;
}
/** Kopie in die Bibliothek legen, ohne sie in der Dateiliste zu führen (Scans). Gibt den relativen Pfad zurück. */
function mirror(subject, name, buf, sub) { const rel = relFor(subject, name, sub); put(rel, buf); return rel; }
function unmirror(rels) { for (const r of rels || []) { const p = abs(r); if (p) fs.rmSync(p, { force: true }); } }
/** Alte Dateien (data/files/<id>.bin) in die Ordnerstruktur übernehmen. */
function migrate() {
  const a = list(); let ch = false;
  for (const f of a) {
    if (f.path) continue;
    const old = path.join(config.dataDir, 'files', f.id + '.bin');
    if (!fs.existsSync(old)) continue;
    const rel = relFor(f.subject, f.name); put(rel, fs.readFileSync(old)); fs.rmSync(old, { force: true });
    f.path = rel; f.modified = f.created; ch = true;
  }
  if (ch) store.write('files', a);
}
/** Nur harmlose Typen werden im Browser angezeigt; alles andere (z. B. HTML) wird zum Herunterladen ausgeliefert. */
function sendHeaders(f) {
  const type = INLINE[path.extname(f.name).toLowerCase()];
  const enc = encodeURIComponent(f.name);
  return type ? { 'Content-Type': type, 'Content-Disposition': `inline; filename*=UTF-8''${enc}` }
    : { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${enc}` };
}
const out = f => Object.assign({}, f, { kind: kindOf(f.name), editable: editable(f.name) });

module.exports = { list: () => list().map(out), add, create, find, filePath, replace, update, remove, mirror, unmirror, migrate, sendHeaders, kindOf, editable, root, safe };
