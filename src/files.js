'use strict';
// Eigene Dateien zu Fächern (Skripte, Handouts, PDFs, Folien). Liegen unverändert im Datenordner.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const store = require('./store');

const dir = () => path.join(config.dataDir, 'files');
const okId = id => /^[a-f0-9]{16}$/.test(id || '');
const list = () => store.read('files', []);
const INLINE = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8' };

function add(buf, name, subject) {
  if (!buf.length) throw new Error('Die Datei ist leer.');
  const clean = String(name || 'Datei').replace(/[\\/\0]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Datei';
  const id = crypto.randomBytes(8).toString('hex');
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(path.join(dir(), id + '.bin'), buf);
  const rec = { id, name: clean, subject: String(subject || '').slice(0, 40), size: buf.length, created: new Date().toISOString() };
  store.write('files', list().concat(rec));
  return rec;
}
function find(id) { return okId(id) ? list().find(f => f.id === id) : null; }
function filePath(id) { const f = find(id); const p = f && path.join(dir(), id + '.bin'); return p && fs.existsSync(p) ? p : null; }
function update(id, patch) { const a = list(), f = a.find(x => x.id === id); if (!f) return null; if (typeof patch.subject === 'string') f.subject = patch.subject.slice(0, 40); store.write('files', a); return f; }
function remove(id) {
  if (!okId(id)) return false;
  store.write('files', list().filter(f => f.id !== id));
  fs.rmSync(path.join(dir(), id + '.bin'), { force: true });
  return true;
}
/** Nur harmlose Typen werden im Browser angezeigt; alles andere (z. B. HTML) wird zum Herunterladen ausgeliefert. */
function sendHeaders(f) {
  const type = INLINE[path.extname(f.name).toLowerCase()];
  const enc = encodeURIComponent(f.name);
  return type ? { 'Content-Type': type, 'Content-Disposition': `inline; filename*=UTF-8''${enc}` }
    : { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${enc}` };
}

module.exports = { list, add, find, filePath, update, remove, sendHeaders };
