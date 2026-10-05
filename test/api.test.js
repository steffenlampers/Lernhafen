'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-'));
delete process.env.APP_PASSWORD;
const app = require('../src/server');
const sharp = require('sharp');

let server, base;
test.before(async () => { await new Promise(r => { server = app.listen(0, r); }); base = 'http://127.0.0.1:' + server.address().port; });
test.after(() => { server.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); });

const j = async (method, p, body) => {
  const r = await fetch(base + '/api' + p, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};

test('Health und Konfiguration', async () => {
  assert.strictEqual((await j('GET', '/health')).body.ok, true);
  const c = (await j('GET', '/config')).body;
  assert.strictEqual(c.profile.id, 'allgemein');
  assert.strictEqual(c.appName, 'Lernhafen');
  assert.ok(c.profiles.length >= 6);
});

test('Zustand speichern und lesen', async () => {
  assert.strictEqual((await j('GET', '/state')).body.state, null);
  const put = await j('PUT', '/state', { state: { events: [{ id: 'a', title: 'Test' }] } });
  assert.strictEqual(put.status, 200);
  const got = (await j('GET', '/state')).body;
  assert.strictEqual(got.state.events[0].title, 'Test');
  assert.strictEqual(got.rev, put.body.rev);
  assert.strictEqual((await j('PUT', '/state', { state: [1] })).status, 400);
});

test('Plan-Import verbindet alte und neue Tage', async () => {
  await j('POST', '/plan/import', { plan: { from: '2026-10-05', to: '2026-10-09', days: { '2026-10-05': ['1|A|||'] } } });
  await j('POST', '/plan/import', { plan: { from: '2026-10-06', to: '2026-10-10', days: { '2026-10-06': ['1|B|||'] } } });
  const p = (await j('GET', '/plan')).body.plan;
  assert.deepStrictEqual(Object.keys(p.days).sort(), ['2026-10-05', '2026-10-06']);
  assert.strictEqual((await j('POST', '/plan/import', { plan: { x: 1 } })).status, 400);
});

test('Schulmanager: ohne Verbindung kein Abgleich', async () => {
  assert.strictEqual((await j('GET', '/schulmanager')).body.configured, false);
  const r = (await j('POST', '/sync')).body;
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /nicht verbunden/);
});

test('Scan: Foto hochladen, abschließen, Seite abrufen, löschen', async () => {
  const jpg = await sharp({ create: { width: 1200, height: 1600, channels: 3, background: '#cccccc' } }).jpeg().toBuffer();
  const id = (await j('POST', '/scans')).body.id;
  assert.match(id, /^[a-f0-9]{16}$/);
  const up = await fetch(`${base}/api/scans/${id}/pages`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: jpg });
  assert.strictEqual((await up.json()).page, 1);
  assert.strictEqual((await j('POST', `/scans/${id}/finish`, { subject: 'Anat/Phys', title: 'Handout', date: '2026-10-05' })).body.status, 'processing');
  let s;
  for (let i = 0; i < 50; i++) {
    s = (await j('GET', '/scans')).body.scans.find(x => x.id === id);
    if (s && s.status === 'done') break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.strictEqual(s.status, 'done');
  assert.ok(['ok', 'unavailable', 'failed'].includes(s.ocr));
  const img = await fetch(`${base}/api/scans/${id}/file/p1.jpg`);
  assert.strictEqual(img.status, 200);
  const meta = await sharp(Buffer.from(await img.arrayBuffer())).metadata();
  assert.ok(meta.width <= 2400 && meta.format === 'jpeg');
  assert.strictEqual((await j('DELETE', `/scans/${id}`)).body.ok, true);
  assert.strictEqual((await fetch(`${base}/api/scans/${id}/file/p1.jpg`)).status, 404);
});

test('Scan: kein Pfad außerhalb des Scan-Ordners erreichbar', async () => {
  const id = (await j('POST', '/scans')).body.id;
  for (const bad of ['..%2Fstate.json', '..%2F..%2Fetc%2Fpasswd', 'p1.jpg%00']) {
    assert.strictEqual((await fetch(`${base}/api/scans/${id}/file/${bad}`)).status, 404);
  }
  assert.strictEqual((await fetch(`${base}/api/scans/..%2F..%2Fx/file/p1.jpg`)).status, 404);
});

test('Scan ohne Seiten lässt sich nicht abschließen', async () => {
  const id = (await j('POST', '/scans')).body.id;
  const r = await j('POST', `/scans/${id}/finish`, {});
  assert.strictEqual(r.status, 400);
});

test('Suche findet Mitschriften', async () => {
  await j('PUT', '/state', { state: { notes: { 'Anat/Phys': [{ id: 'n1', title: 'Nervensystem', body: 'Plexus brachialis', date: '2026-10-05' }] } } });
  const r = (await j('GET', '/search?q=plexus')).body;
  assert.strictEqual(r.notes.length, 1);
  assert.strictEqual(r.notes[0].subject, 'Anat/Phys');
});

test('Google verbinden ist ohne App-Passwort gesperrt', async () => {
  const r = await j('POST', '/google/begin', { clientId: '1-a.apps.googleusercontent.com', clientSecret: 'x' });
  assert.strictEqual(r.status, 400);
  assert.match(r.body.error, /APP_PASSWORD/);
});
