'use strict';
// Kalender-Quellen per iCal-Link: Stundenplan (Vorlesungen, Unterricht) oder Termine (Fristen, Familie, Moodle).
const crypto = require('crypto');
const store = require('./store');
const ical = require('./ical');
const google = require('./google');

const MAX_BYTES = 5 * 1024 * 1024;
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shift = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

const list = () => store.read('calendars', []);
const gpulls = () => { const st = google.status(); return st.connected ? st.pull.map(p => ({ id: 'g' + Buffer.from(p.id).toString('hex').slice(0, 30), calId: p.id, name: p.name + ' (Google)', kind: p.kind, google: true })) : []; };
const all = () => list().concat(gpulls());

function validate(input) {
  if (!Array.isArray(input) || input.length > 10) throw new Error('Höchstens 10 Kalender sind möglich.');
  return input.map(c => {
    const url = String(c.url || '').trim().replace(/^webcal:/i, 'https:');
    if (!/^https?:\/\/[^\s]+$/i.test(url)) throw new Error('Der Link muss mit https:// oder webcal:// beginnen.');
    return { id: /^[a-f0-9]{8}$/.test(c.id || '') ? c.id : crypto.randomBytes(4).toString('hex'), name: String(c.name || '').trim().slice(0, 60) || 'Kalender', url, kind: c.kind === 'events' ? 'events' : 'timetable' };
  });
}
function save(input) {
  const next = validate(input), cache = store.read('ical_cache', {});
  for (const id of Object.keys(cache)) if (!next.some(c => c.id === id) && !gpulls().some(c => c.id === id)) delete cache[id];
  store.write('calendars', next); store.write('ical_cache', cache);
  return next;
}

async function fetchText(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { Accept: 'text/calendar, text/plain, */*' }, redirect: 'follow' });
  if (!r.ok) throw new Error('Kalender nicht erreichbar (HTTP ' + r.status + ').');
  const len = Number(r.headers.get('content-length') || 0);
  if (len > MAX_BYTES) throw new Error('Der Kalender ist größer als 5 MB.');
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error('Der Kalender ist größer als 5 MB.');
  const text = buf.toString('utf8');
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Das ist kein iCal-Kalender.');
  return text;
}

let running = null;
function sync() {
  if (running) return running;
  running = (async () => {
    const cache = store.read('ical_cache', {}), from = shift(-14), to = shift(200);
    for (const c of all()) {
      const old = cache[c.id] || {};
      try {
        const events = c.google ? await google.calendarEvents(c.calId, from, to) : ical.expand(await fetchText(c.url), from, to);
        cache[c.id] = { updated: Date.now(), ok: true, msg: events.length + ' Einträge gelesen.', events };
      } catch (e) {
        cache[c.id] = { updated: old.updated || 0, tried: Date.now(), ok: false, msg: String(e.message || e).slice(0, 200), events: old.events || [] };
      }
    }
    store.write('ical_cache', cache);
    return events();
  })().finally(() => { running = null; });
  return running;
}

function events() {
  const cache = store.read('ical_cache', {}), items = [], status = [];
  for (const c of all()) {
    const e = cache[c.id] || { ok: null, msg: 'Noch nicht abgerufen.', events: [] };
    status.push({ id: c.id, name: c.name, kind: c.kind, ok: e.ok, msg: e.msg, updated: e.updated || 0 });
    for (const ev of e.events || []) items.push(Object.assign({ cal: c.id, kind: c.kind, calName: c.name }, ev));
  }
  return { status, items };
}

/** Beim Scheduler: veraltet, wenn der letzte erfolgreiche Abruf mehr als 20 Stunden zurückliegt. */
function stale() {
  const cache = store.read('ical_cache', {});
  return all().some(c => !cache[c.id] || Date.now() - (cache[c.id].tried || cache[c.id].updated || 0) > 20 * 36e5);
}

module.exports = { list, all, save, sync, events, stale, validate };
