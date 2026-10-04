'use strict';
// Termine als iCal-Abo für das Handy-Kalender-Programm (mit Erinnerungen), geschützt durch einen geheimen Link.
const crypto = require('crypto');
const store = require('./store');

function token() {
  let t = (store.read('feed', {}) || {}).token;
  if (!t) { t = crypto.randomBytes(18).toString('hex'); store.write('feed', { token: t }, 0o600); }
  return t;
}
function rotate() { store.write('feed', { token: crypto.randomBytes(18).toString('hex') }, 0o600); return token(); }
const valid = t => { const x = Buffer.from(String(t || '')), y = Buffer.from(token()); return x.length === y.length && crypto.timingSafeEqual(x, y); };

const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) {
  const out = []; let b = Buffer.from(line);
  while (b.length > 74) { let n = 74; while ((b[n] & 0xc0) === 0x80) n--; out.push(b.subarray(0, n).toString()); b = Buffer.concat([Buffer.from(' '), b.subarray(n)]); }
  out.push(b.toString()); return out.join('\r\n');
}
const day = s => s.replace(/-/g, '');
function nextDay(s) { const [y, m, d] = s.split('-').map(Number), x = new Date(Date.UTC(y, m - 1, d + 1)); return x.toISOString().slice(0, 10).replace(/-/g, ''); }

/** Erinnerungen in Minuten vor Mitternacht des Termintags (360 = Vorabend 18 Uhr). */
function reminders(type) { return type.exam ? [10080, 1440, 360] : [360]; }

function build(state, profile, appName) {
  const types = Object.fromEntries((profile.eventTypes || []).map(t => [t.id, t]));
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${appName}//DE`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + esc(appName), 'X-WR-TIMEZONE:' + (process.env.TZ || 'Europe/Berlin')];
  for (const e of (state && state.events) || []) {
    const date = e.eff || e.date; if (e.done || !/^\d{4}-\d\d-\d\d$/.test(date || '')) continue;
    const t = types[e.type] || { label: '', exam: false };
    const desc = [e.sid ? 'Fach: ' + e.sid : '', ...(e.steps || []).map(s => (s.done ? '[x] ' : '[ ] ') + s.t)].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:${e.id}@lernhafen`, 'DTSTAMP:' + new Date().toISOString().replace(/[-:]|\.\d+/g, ''), `DTSTART;VALUE=DATE:${day(date)}`, `DTEND;VALUE=DATE:${nextDay(date)}`,
      'SUMMARY:' + esc((t.label ? t.label + ': ' : '') + e.title), ...(desc ? ['DESCRIPTION:' + esc(desc)] : []));
    for (const m of reminders(t)) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(e.title), `TRIGGER:-PT${m}M`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

module.exports = { token, rotate, valid, build };
