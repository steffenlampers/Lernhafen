'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-feat-'));
process.env.TZ = 'Europe/Berlin';
delete process.env.APP_PASSWORD;
const app = require('../src/server');
const ical = require('../src/ical');
const feed = require('../src/feed');
const calendars = require('../src/calendars');

let server, base, ics;
const ICS = ['BEGIN:VCALENDAR', 'VERSION:2.0',
  'BEGIN:VEVENT', 'UID:v1', 'DTSTART;TZID=Europe/Berlin:20261005T081500', 'DTEND;TZID=Europe/Berlin:20261005T094500', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4', 'EXDATE;TZID=Europe/Berlin:20261007T081500', 'SUMMARY:Analysis I\\, Vorlesung', 'LOCATION:H1', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:v1', 'RECURRENCE-ID;TZID=Europe/Berlin:20261012T081500', 'DTSTART;TZID=Europe/Berlin:20261012T100000', 'DTEND;TZID=Europe/Berlin:20261012T113000', 'SUMMARY:Analysis I (verlegt)', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:b', 'DTSTART;VALUE=DATE:20261020', 'DTEND;VALUE=DATE:20261022', 'SUMMARY:Blockwoche', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:c', 'DTSTART:20261006T060000Z', 'DTEND:20261006T073000Z', 'SUMMARY:UTC-Termin', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');

test.before(async () => {
  await new Promise(r => { server = app.listen(0, r); }); base = 'http://127.0.0.1:' + server.address().port;
  await new Promise(r => { ics = http.createServer((q, s) => { s.setHeader('Content-Type', 'text/calendar'); s.end(q.url === '/bad' ? 'kein kalender' : ICS); }).listen(0, r); });
});
test.after(() => { server.close(); ics.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); });

const j = async (method, p, body) => {
  const r = await fetch(base + p, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};

test('iCal: Wiederholungen, Ausnahmen, Verlegung, Zeitzonen, mehrtägig', () => {
  const ev = ical.expand(ICS, '2026-10-01', '2026-11-30').map(e => [e.date, e.start, e.end, e.title].join(' '));
  assert.deepStrictEqual(ev, [
    '2026-10-05 08:15 09:45 Analysis I, Vorlesung',
    '2026-10-06 08:00 09:30 UTC-Termin',          // 06:00 UTC = 08:00 Berlin (Sommerzeit)
    '2026-10-12 10:00 11:30 Analysis I (verlegt)',  // geänderter Einzeltermin ersetzt den regulären
    '2026-10-14 08:15 09:45 Analysis I, Vorlesung',  // 07.10. ist per EXDATE ausgenommen, COUNT=4 zählt ihn mit
    '2026-10-20   Blockwoche', '2026-10-21   Blockwoche']);
});

test('iCal: Zeitzone wird auf die eingestellte Zone umgerechnet', () => {
  const t = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x\r\nDTSTART;TZID=America/New_York:20261005T090000\r\nDTEND;TZID=America/New_York:20261005T100000\r\nSUMMARY:Webinar\r\nEND:VEVENT\r\nEND:VCALENDAR';
  const e = ical.expand(t, '2026-10-01', '2026-10-31')[0];
  assert.strictEqual(e.start, '15:00');
});

test('Kalender-Quellen: speichern, abrufen, Fehler bleiben sichtbar', async () => {
  const port = ics.address().port;
  assert.strictEqual((await j('PUT', '/api/calendars', { calendars: [{ name: 'Vorlesungen', url: `http://127.0.0.1:${port}/ok`, kind: 'timetable' }, { name: 'Kaputt', url: `http://127.0.0.1:${port}/bad`, kind: 'events' }] })).status, 200);
  const r = (await j('POST', '/api/calendars/sync')).body;
  assert.strictEqual(r.status.find(s => s.name === 'Vorlesungen').ok, true);
  assert.strictEqual(r.status.find(s => s.name === 'Kaputt').ok, false);
  assert.ok(r.items.some(e => e.title === 'Analysis I, Vorlesung' && e.kind === 'timetable'));
  assert.strictEqual((await j('PUT', '/api/calendars', { calendars: [{ name: 'x', url: 'ftp://nope' }] })).status, 400);
});

test('Handy-Abo: gültiger Link liefert Termine mit Erinnerungen, falscher Link nicht', async () => {
  await j('PUT', '/api/state', { state: { settings: { profile: 'studium' }, events: [
    { id: 'e1', type: 'klausur', title: 'Analysis, Klausur', date: '2026-12-01', sid: 'Analysis I', steps: [{ t: 'Skript lesen', done: true }] },
    { id: 'e2', type: 'uebung', title: 'Blatt 3', date: '2026-11-01', done: true },
    { id: 'e3', type: 'uebung', title: 'Blatt 4', date: '2026-11-08', eff: '2026-11-10' }] } });
  const p = (await j('GET', '/api/feed')).body.path;
  const ok = await fetch(base + p);
  assert.strictEqual(ok.status, 200);
  assert.match(ok.headers.get('content-type'), /text\/calendar/);
  const txt = await ok.text();
  assert.match(txt, /SUMMARY:Klausur: Analysis\\, Klausur/);
  assert.match(txt, /DTSTART;VALUE=DATE:20261201/);
  assert.match(txt, /DTSTART;VALUE=DATE:20261110/);       // gemerktes Datum nach Plan-Verschiebung
  assert.ok(!txt.includes('Blatt 3'));                    // erledigte Termine fehlen
  assert.strictEqual((txt.match(/BEGIN:VALARM/g) || []).length, 3 + 1);   // Klausur: 3 Erinnerungen, Übung: 1
  assert.strictEqual((await fetch(base + '/feed/falsch/termine.ics')).status, 404);
  const p2 = (await j('POST', '/api/feed/rotate')).body.path;
  assert.notStrictEqual(p, p2);
  assert.strictEqual((await fetch(base + p)).status, 404);
});

test('Handy-Abo: lange Zeilen werden gefaltet', () => {
  const out = feed.build({ events: [{ id: 'z', type: 'x', title: 'ä'.repeat(100), date: '2026-12-01' }] }, { eventTypes: [] }, 'Test');
  assert.ok(out.split('\r\n').every(l => Buffer.byteLength(l) <= 75));
});

test('Dateien: hochladen, laden, HTML wird nie angezeigt, löschen', async () => {
  const up = await fetch(base + '/api/files?name=' + encodeURIComponent('Skript Kapitel 1.pdf') + '&subject=Analysis', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: Buffer.from('%PDF-1.4 test') });
  const rec = await up.json();
  assert.strictEqual(rec.name, 'Skript Kapitel 1.pdf');
  const dl = await fetch(`${base}/api/files/${rec.id}/download`);
  assert.strictEqual(dl.headers.get('content-type'), 'application/pdf');
  assert.match(dl.headers.get('content-disposition'), /^inline/);
  const html = await (await fetch(base + '/api/files?name=evil.html&subject=', { method: 'POST', body: Buffer.from('<script>alert(1)</script>') })).json();
  const hd = await fetch(`${base}/api/files/${html.id}/download`);
  assert.strictEqual(hd.headers.get('content-type'), 'application/octet-stream');
  assert.match(hd.headers.get('content-disposition'), /^attachment/);
  const bad = await fetch(base + '/api/files?name=' + encodeURIComponent('../../etc/passwd') + '&subject=', { method: 'POST', body: Buffer.from('x') });
  assert.ok(!(await bad.json()).name.includes('/'));
  assert.strictEqual((await fetch(base + '/api/files/..%2Fstate/download')).status, 404);
  assert.strictEqual((await j('DELETE', '/api/files/' + rec.id)).body.ok, true);
  assert.strictEqual((await fetch(`${base}/api/files/${rec.id}/download`)).status, 404);
  assert.strictEqual((await fetch(base + '/api/files', { method: 'POST', body: Buffer.alloc(0) })).status, 400);
});

test('Sicherung: exportieren und einspielen', async () => {
  const exp = (await j('GET', '/api/export')).body;
  assert.strictEqual(exp.app, 'lernhafen');
  assert.ok(exp.state.events.length >= 3);
  await j('PUT', '/api/state', { state: { events: [] } });
  assert.strictEqual((await j('POST', '/api/import', exp)).status, 200);
  assert.ok((await j('GET', '/api/state')).body.state.events.length >= 3);
  assert.strictEqual((await j('POST', '/api/import', { app: 'anderes', state: {} })).status, 400);
});

test('Manifest trägt den Namen der App', async () => {
  const m = (await j('GET', '/manifest.webmanifest')).body;
  assert.strictEqual(m.name, 'Lernhafen');
  assert.ok(m.icons.length >= 2);
});

test('Kalender-Validierung', () => {
  assert.throws(() => calendars.validate([{ url: 'javascript:alert(1)' }]));
  assert.strictEqual(calendars.validate([{ url: 'webcal://x.de/a.ics', kind: 'events' }])[0].url, 'https://x.de/a.ics');
});
