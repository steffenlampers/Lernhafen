'use strict';
// Komplettsicherung: alles aus DATA_DIR (Daten, Dateien, Scans) als .tar.gz, von Hand oder jede Nacht automatisch.
// Zugangsdaten (Passwörter, Tokens, geheime Schlüssel) sind bewusst nicht enthalten.
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const config = require('./config');

const SKIP = new Set(['backups', 'secret.json', 'schulmanager.json', 'gdrive.json', '.restore', '.upload']);
const dir = () => process.env.BACKUP_DIR || path.join(config.dataDir, 'backups');
const keep = () => Math.max(1, parseInt(process.env.BACKUP_KEEP, 10) || 7);
const today = () => new Date().toISOString().slice(0, 10);
const members = () => fs.readdirSync(config.dataDir).filter(n => !SKIP.has(n) && !n.endsWith('.tmp'));

function tarArgs(out) { return ['-czf', out, '-C', config.dataDir, ...members()]; }

/** Sicherung als Datenstrom zum Herunterladen. */
function stream() {
  const m = members(); if (!m.length) throw new Error('Es gibt noch nichts zu sichern.');
  const p = spawn('tar', tarArgs('-'), { stdio: ['ignore', 'pipe', 'ignore'] });
  return p;
}

/** Sicherung in den Sicherungsordner schreiben und alte löschen (läuft im Hintergrund, blockiert den Server nicht). */
async function run() {
  fs.mkdirSync(dir(), { recursive: true });
  const name = `lernhafen-${today()}.tar.gz`, out = path.join(dir(), name), tmp = out + '.tmp';
  if (!members().length) return null;
  const code = await new Promise(ok => { const p = spawn('tar', tarArgs(tmp), { stdio: 'ignore' }); p.on('error', () => ok(2)); p.on('close', ok); });
  if (code !== 0 && code !== 1) { try { fs.unlinkSync(tmp); } catch (e) { /* weg */ } throw new Error('Sicherung fehlgeschlagen.'); }
  fs.renameSync(tmp, out);
  const old = fs.readdirSync(dir()).filter(n => /^lernhafen-\d{4}-\d\d-\d\d\.tar\.gz$/.test(n)).sort().reverse().slice(keep());
  for (const n of old) try { fs.unlinkSync(path.join(dir(), n)); } catch (e) { /* weg */ }
  return name;
}
function list() {
  try {
    return fs.readdirSync(dir()).filter(n => /^lernhafen-\d{4}-\d\d-\d\d\.tar\.gz$/.test(n)).sort().reverse()
      .map(n => ({ name: n, size: fs.statSync(path.join(dir(), n)).size }));
  } catch (e) { return []; }
}
/** Nachts einmal pro Tag; läuft vom Zeitplan aus. */
function due(now = new Date()) { return now.getHours() >= 3 && !list().some(b => b.name === `lernhafen-${today()}.tar.gz`); }

/** Sicherung einspielen (Dateien werden ersetzt bzw. ergänzt). Prüft vorher jeden Pfad. */
function restore(file) {
  const l = spawnSync('tar', ['-tzf', file], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (l.status !== 0) throw new Error('Das ist keine Sicherungsdatei von Lernhafen.');
  const names = l.stdout.split('\n').filter(Boolean);
  if (!names.length) throw new Error('Die Sicherung ist leer.');
  for (const n of names) {
    const parts = n.replace(/^\.\//, '').split('/');
    if (n.startsWith('/') || parts.includes('..') || SKIP.has(parts[0])) throw new Error('Die Sicherung enthält unerlaubte Pfade.');
  }
  if (!names.some(n => /^(\.\/)?(state|library|scans)(\.json)?(\/|$)/.test(n))) throw new Error('Das ist keine Sicherungsdatei von Lernhafen.');
  const x = spawnSync('tar', ['-xzf', file, '-C', config.dataDir, '--no-same-owner'], { stdio: 'ignore' });
  if (x.status !== 0) throw new Error('Einspielen fehlgeschlagen.');
  return names.length;
}
module.exports = { stream, run, list, due, restore, dir };
