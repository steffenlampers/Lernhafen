'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-auth-'));
process.env.APP_PASSWORD = 'richtiges-passwort';
const app = require('../src/server');

let server, base;
test.before(async () => { await new Promise(r => { server = app.listen(0, r); }); base = 'http://127.0.0.1:' + server.address().port; });
test.after(() => { server.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); });

test('Ohne Anmeldung sind Daten gesperrt, Health und Startseite offen', async () => {
  assert.strictEqual((await fetch(base + '/api/health')).status, 200);
  assert.strictEqual((await fetch(base + '/')).status, 200);
  for (const p of ['/api/state', '/api/plan', '/api/scans', '/api/config', '/api/schulmanager']) {
    assert.strictEqual((await fetch(base + p)).status, 401, p);
  }
  const s = await (await fetch(base + '/api/session')).json();
  assert.deepStrictEqual(s, { loginRequired: true, authed: false });
});

test('Falsches Passwort wird abgelehnt, richtiges setzt ein Cookie', async () => {
  const bad = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'falsch' }) });
  assert.strictEqual(bad.status, 401);
  const ok = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'richtiges-passwort' }) });
  assert.strictEqual(ok.status, 200);
  const cookie = ok.headers.get('set-cookie').split(';')[0];
  assert.match(ok.headers.get('set-cookie'), /HttpOnly/);
  const st = await fetch(base + '/api/state', { headers: { cookie } });
  assert.strictEqual(st.status, 200);
  const forged = await fetch(base + '/api/state', { headers: { cookie: 'lh=' + (Date.now() + 1e9) + '.abc' } });
  assert.strictEqual(forged.status, 401);
});

test('Nach fünf Fehlversuchen wird gesperrt', async () => {
  let last;
  for (let i = 0; i < 7; i++) last = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'x' + i }) });
  assert.strictEqual(last.status, 429);
});
