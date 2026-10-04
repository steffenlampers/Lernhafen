'use strict';
// Kleiner JSON-Speicher: eine Datei pro Schlüssel in DATA_DIR, atomar geschrieben.
const fs = require('fs');
const path = require('path');
const config = require('./config');

function file(name) {
  if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error('Ungültiger Name');
  return path.join(config.dataDir, name + '.json');
}

function read(name, fallback) {
  try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); }
  catch (e) { return fallback; }
}

function write(name, data, mode) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const f = file(name), tmp = f + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: mode || 0o644 });
  fs.renameSync(tmp, f);
}

function remove(name) { try { fs.unlinkSync(file(name)); } catch (e) { /* war nicht da */ } }

module.exports = { read, write, remove };
