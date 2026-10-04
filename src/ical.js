'use strict';
// Kleiner iCalendar-Leser (RFC 5545) für Stundenpläne und Termine aus Moodle, Uni-Systemen, Google Kalender, Nextcloud usw.
// Unterstützt: Zeitzonen (TZID und UTC), ganztägige Termine, Wiederholungen (täglich, wöchentlich mit BYDAY, monatlich, jährlich,
// INTERVAL, COUNT, UNTIL), ausgenommene Tage (EXDATE) und geänderte oder abgesagte Einzeltermine (RECURRENCE-ID).

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const noon = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const addDays = (s, n) => { const d = noon(s); d.setDate(d.getDate() + n); return ymd(d); };

function unfold(text) { return String(text).replace(/\r?\n[ \t]/g, '').split(/\r?\n/); }
function unescapeText(t) { return String(t || '').replace(/\\[nN]/g, ' ').replace(/\\([,;\\])/g, '$1').trim(); }

function parseLine(line) {
  const i = line.indexOf(':'); if (i < 0) return null;
  const head = line.slice(0, i), value = line.slice(i + 1), parts = head.split(';'), params = {};
  for (const p of parts.slice(1)) { const [k, ...v] = p.split('='); params[k.toUpperCase()] = v.join('=').replace(/^"|"$/g, ''); }
  return { name: parts[0].toUpperCase(), params, value };
}

const TARGET_TZ = () => process.env.TZ || 'Europe/Berlin';

/** Zeitpunkt als Datum und Uhrzeit in der eingestellten Zeitzone (TZ). */
function inTarget(instant) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TARGET_TZ(), hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(instant).map(x => [x.type, +x.value]));
    return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
  } catch (e) { return { date: ymd(instant), time: hm(instant) }; }
}

/** Uhrzeit in einer benannten Zeitzone in einen Zeitpunkt umrechnen (ohne Bibliothek); null bei unbekannter Zone. */
function zonedInstant(y, mo, d, h, mi, tz) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
    const asUtc = Date.UTC(y, mo - 1, d, h, mi);
    const p = Object.fromEntries(fmt.formatToParts(new Date(asUtc)).map(x => [x.type, +x.value]));
    return new Date(asUtc - (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - asUtc));
  } catch (e) { return null; }
}

/** DTSTART/DTEND lesen: { allDay, date, time } in der eingestellten Zeitzone. Zeiten ohne Zone gelten als lokale Uhrzeit. */
function parseDate(prop) {
  if (!prop) return null;
  const m = /^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?$/.exec(prop.value.trim());
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  if (m[4] === undefined) return { allDay: true, date: `${m[1]}-${m[2]}-${m[3]}`, time: '' };
  const h = +m[4], mi = +m[5];
  if (m[7]) return Object.assign({ allDay: false }, inTarget(new Date(Date.UTC(y, mo - 1, d, h, mi))));
  if (prop.params.TZID && prop.params.TZID !== TARGET_TZ()) {
    const inst = zonedInstant(y, mo, d, h, mi, prop.params.TZID);
    if (inst) return Object.assign({ allDay: false }, inTarget(inst));
  }
  return { allDay: false, date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };
}

const DAYIDX = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function parseEvents(text) {
  const events = []; let cur = null;
  for (const raw of unfold(text)) {
    if (raw === 'BEGIN:VEVENT') { cur = { ex: [], props: {} }; continue; }
    if (raw === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const p = parseLine(raw); if (!p) continue;
    if (p.name === 'EXDATE') p.value.split(',').forEach(v => { const d = parseDate({ value: v, params: p.params }); if (d) cur.ex.push(d.date); });
    else if (!(p.name in cur.props)) cur.props[p.name] = p;
  }
  return events;
}

/** Wiederholungen eines Termins in [from, to] aufzählen (Datumstexte JJJJ-MM-TT). */
function occurrences(startDate, rule, from, to, exdates) {
  if (!rule || !rule.FREQ) return [startDate];
  const interval = Math.max(1, parseInt(rule.INTERVAL || '1', 10) || 1), count = rule.COUNT ? parseInt(rule.COUNT, 10) : Infinity;
  let until = '9999-12-31';
  if (rule.UNTIL) { const u = parseDate({ value: rule.UNTIL, params: {} }); if (u) until = u.date; }
  const out = []; let n = 0, guard = 0;
  const push = d => { if (d < startDate || d > until || n >= count) return false; n++; out.push(d); return true; };
  const limit = to < until ? to : until;
  if (rule.FREQ === 'WEEKLY') {
    const days = rule.BYDAY ? rule.BYDAY.split(',').map(x => DAYIDX[x.slice(-2)]).filter(x => x !== undefined) : [noon(startDate).getDay()];
    const s0 = noon(startDate); s0.setDate(s0.getDate() - ((s0.getDay() + 6) % 7));   // Montag der Startwoche
    for (let w = 0; guard++ < 5000; w += interval) {
      const mon = new Date(s0); mon.setDate(mon.getDate() + 7 * w);
      if (ymd(mon) > limit) break;
      for (const di of days.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))) {
        const d = new Date(mon); d.setDate(d.getDate() + ((di + 6) % 7));
        if (!push(ymd(d)) && ymd(d) > until) return out.filter(x => x >= from && x <= to && !exdates.includes(x));
      }
    }
  } else {
    const base = noon(startDate);
    for (let i = 0; guard++ < 5000; i += interval) {
      const d = new Date(base);
      if (rule.FREQ === 'DAILY') d.setDate(d.getDate() + i);
      else if (rule.FREQ === 'MONTHLY') d.setMonth(d.getMonth() + i);
      else if (rule.FREQ === 'YEARLY') d.setFullYear(d.getFullYear() + i);
      else { push(startDate); break; }
      if (ymd(d) > limit) break;
      push(ymd(d));
    }
  }
  return out.filter(x => x >= from && x <= to && !exdates.includes(x));
}

/** Alle Termine im Zeitraum als einfache Einträge: { uid, title, location, status, allDay, date, start, end }. */
function expand(text, from, to) {
  const evs = parseEvents(text), out = [], overrides = new Set();
  const make = (e, date, dur) => {
    const p = e.props, s = parseDate(p.DTSTART), en = parseDate(p.DTEND);
    const endTime = s.allDay ? '' : (dur != null ? `${pad(Math.floor(((mins(s.time) + dur) % 1440) / 60))}:${pad((mins(s.time) + dur) % 60)}` : (en && en.date === s.date ? en.time : ''));
    return {
      uid: (p.UID && p.UID.value) || '', title: unescapeText(p.SUMMARY && p.SUMMARY.value) || 'Ohne Titel', location: unescapeText(p.LOCATION && p.LOCATION.value),
      status: ((p.STATUS && p.STATUS.value) || '').toUpperCase(), allDay: s.allDay, date, start: s.time, end: endTime
    };
  };
  const duration = e => { const s = parseDate(e.props.DTSTART), en = parseDate(e.props.DTEND); if (!s || !en || s.allDay || en.allDay) return null; const a = mins(s.time), b = mins(en.time) + 1440 * Math.round((noon(en.date) - noon(s.date)) / 864e5); return Math.max(0, b - a); };
  const mins = t => +t.slice(0, 2) * 60 + +t.slice(3);
  for (const e of evs) if (e.props['RECURRENCE-ID']) { const r = parseDate(e.props['RECURRENCE-ID']); if (r) overrides.add(((e.props.UID && e.props.UID.value) || '') + '|' + r.date); }
  for (const e of evs) {
    const s = parseDate(e.props.DTSTART); if (!s) continue;
    const uid = (e.props.UID && e.props.UID.value) || '';
    if (e.props['RECURRENCE-ID']) {                        // geänderter oder abgesagter Einzeltermin
      if (s.date >= from && s.date <= to) out.push(make(e, s.date, duration(e)));
      continue;
    }
    const rule = {};
    if (e.props.RRULE) e.props.RRULE.value.split(';').forEach(kv => { const [k, v] = kv.split('='); if (k) rule[k.toUpperCase()] = v; });
    const dur = duration(e), spanDays = s.allDay && parseDate(e.props.DTEND) ? Math.round((noon(parseDate(e.props.DTEND).date) - noon(s.date)) / 864e5) : 1;
    for (const d of occurrences(s.date, rule, addDays(from, -Math.max(spanDays, 1)), to, e.ex)) {
      if (overrides.has(uid + '|' + d)) continue;
      if (s.allDay && spanDays > 1) { for (let k = 0; k < Math.min(spanDays, 14); k++) { const dd = addDays(d, k); if (dd >= from && dd <= to) out.push(make(e, dd, null)); } }
      else if (d >= from && d <= to) out.push(make(e, d, dur));
    }
  }
  return out.sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
}

module.exports = { expand, parseEvents, parseDate, occurrences };
