'use strict';
// Profil-Pakete: alles Berufsspezifische steht in profiles/<id>.json (Fächerhinweise, Terminarten, Lernlinks, Praktikum).
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'profiles');

function list() {
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
    try { const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); return { id: p.id, name: p.name }; }
    catch (e) { return null; }
  }).filter(Boolean);
}

function load(id) {
  const safe = /^[a-z0-9_-]+$/i.test(id || '') ? id : 'allgemein';
  for (const n of [safe, 'allgemein']) {
    try { return JSON.parse(fs.readFileSync(path.join(dir, n + '.json'), 'utf8')); } catch (e) { /* nächster */ }
  }
  throw new Error('Kein Profil gefunden');
}

module.exports = { list, load };
