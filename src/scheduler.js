'use strict';
// Täglicher Stundenplan-Abgleich zur eingestellten Uhrzeit; holt einen verpassten Abgleich nach (z. B. wenn das NAS aus war).
const config = require('./config');
const sm = require('./schulmanager');
const calendars = require('./calendars');

function tick(log) {
  const now = new Date();
  if (now.getHours() < config.syncHour) return;
  if (calendars.list().length && calendars.stale()) calendars.sync().then(() => log('Kalender abgeglichen')).catch(e => log('Kalender-Fehler: ' + e.message));
  const st = sm.status();
  if (!st.configured || !st.daily) return;
  const due = new Date(now.getFullYear(), now.getMonth(), now.getDate(), config.syncHour);
  if (st.lastTime >= due.getTime()) return;
  sm.sync().then(r => log('Täglicher Abgleich: ' + (r.ok ? 'ok' : 'Fehler') + ' – ' + r.msg));
}

function start(log = console.log) {
  setTimeout(() => tick(log), 20000);
  return setInterval(() => tick(log), 10 * 60 * 1000);
}

module.exports = { start, tick };
