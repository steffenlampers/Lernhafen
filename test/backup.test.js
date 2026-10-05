'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-backup-'));
process.env.DATA_DIR = DATA; process.env.BACKUP_DIR = path.join(os.tmpdir(), 'lh-backups-' + process.pid);
delete process.env.APP_PASSWORD;
const app = require('../src/server');
const backup = require('../src/backup');
let server, base;
test.before(async () => { await new Promise(r => { server = app.listen(0, r); }); base = 'http://127.0.0.1:' + server.address().port; });
test.after(() => { server.close(); fs.rmSync(DATA, { recursive: true, force: true }); fs.rmSync(process.env.BACKUP_DIR, { recursive: true, force: true }); });

test('Komplettsicherung: Dateien und Daten sind drin, Zugangsdaten nicht; Einspielen stellt alles wieder her', async () => {
  await fetch(`${base}/api/files?name=skript.txt&subject=Anatomie`, { method: 'POST', body: Buffer.from('Muskeln') });
  fs.writeFileSync(path.join(DATA, 'schulmanager.json'), '{"password":"geheim"}'); fs.writeFileSync(path.join(DATA, 'state.json'), '{"x":1}');
  const r = await fetch(base + '/api/backup'); assert.strictEqual(r.status, 200);
  const buf = Buffer.from(await r.arrayBuffer()); const f = path.join(os.tmpdir(), 'lh-test-backup.tar.gz'); fs.writeFileSync(f, buf);
  const names = require('child_process').spawnSync('tar', ['-tzf', f], { encoding: 'utf8' }).stdout;
  assert.match(names, /library\/Anatomie\/skript\.txt/); assert.match(names, /state\.json/); assert.doesNotMatch(names, /schulmanager|secret|gdrive/);
  fs.rmSync(path.join(DATA, 'library'), { recursive: true }); fs.unlinkSync(path.join(DATA, 'state.json'));
  const up = await fetch(base + '/api/backup/restore', { method: 'POST', headers: { 'Content-Type': 'application/gzip' }, body: buf });
  assert.strictEqual(up.status, 200);
  assert.strictEqual(fs.readFileSync(path.join(DATA, 'library', 'Anatomie', 'skript.txt'), 'utf8'), 'Muskeln');
  assert.strictEqual(fs.readFileSync(path.join(DATA, 'state.json'), 'utf8'), '{"x":1}');
  assert.ok(((await (await fetch(base + '/api/files')).json()).files || []).some(x => x.name === 'skript.txt'));
});

test('Einspielen lehnt Müll und gefährliche Pfade ab', async () => {
  const bad = await fetch(base + '/api/backup/restore', { method: 'POST', headers: { 'Content-Type': 'application/gzip' }, body: Buffer.from('kein archiv') });
  assert.strictEqual(bad.status, 400);
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-evil-')); fs.mkdirSync(path.join(d, 'a')); fs.writeFileSync(path.join(d, 'a', 'x'), '1');
  const f = path.join(os.tmpdir(), 'lh-evil.tar.gz');
  require('child_process').spawnSync('tar', ['-czf', f, '-C', path.join(d, 'a'), '--transform', 's,^x,../evil,', 'x']);
  const evil = await fetch(base + '/api/backup/restore', { method: 'POST', headers: { 'Content-Type': 'application/gzip' }, body: fs.readFileSync(f) });
  assert.strictEqual(evil.status, 400);
});

test('Nächtliche Sicherung wird angelegt und alte werden aufgeräumt', async () => {
  const name = await backup.run(); assert.match(name, /^lernhafen-\d{4}-\d\d-\d\d\.tar\.gz$/);
  assert.strictEqual(backup.due(new Date(2026, 0, 1, 4)), false);
  for (let i = 1; i <= 9; i++) fs.writeFileSync(path.join(backup.dir(), `lernhafen-2020-01-0${i}.tar.gz`), 'x');
  await backup.run(); assert.ok(backup.list().length <= 7);
  assert.strictEqual((await (await fetch(base + '/api/backup/list')).json()).backups.length <= 7, true);
});
