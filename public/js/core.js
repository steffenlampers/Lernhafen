'use strict';
/* Lernhafen – Kern: Hilfsfunktionen, Server-Zugriff, Daten, Stundenplan. */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / 864e5);
const today = () => iso(new Date());
const MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const dowOf = s => (parse(s).getDay() + 6) % 7;
const fmtDate = s => { const d = parse(s); return `${DAYS[dowOf(s)].slice(0, 2)}, ${d.getDate()}. ${MON[d.getMonth()].slice(0, 3)}.`; };
const url = u => { u = String(u || '').trim(); if (!u || /^(javascript|data|vbscript):/i.test(u)) return ''; return /^https?:\/\//i.test(u) ? u : 'https://' + u; };
const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const nbsp = s => String(s).replace(/ /g, ' ');       // Fachnamen mit Leerzeichen bleiben ein Schlüssel
const COLORS = ['#0E7C7B', '#3B82F6', '#E0475B', '#F59E0B', '#8B5CF6', '#10B981', '#EC6B2D', '#6B7FD7', '#D946A8', '#64748B'];
const baseKey = s => String(s).split(' ')[0];
const colorOf = k => { let h = 0; for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
const num = v => parseFloat(String(v).replace(',', '.'));
const fnum = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace('.', ',');
const pb = v => (/^\d+$/.test(String(v)) ? +v : String(v));  // Block-Kennung: Zahl (Doppelstunde) oder Uhrzeit

/* ---------- Server ---------- */
let CFG = null, P = null, S = null, PLAN = null, SM = null, SCANS = [], FILES = [], CAL = { calendars: [], status: [], items: [] };
let rev = 0, dirty = false, saveT = 0;

async function api(method, path, body) {
  const opt = { method, headers: {} };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch('/api' + path, opt);
  let j = {}; try { j = await r.json(); } catch (e) { /* leer */ }
  if (r.status === 401 && j.loginRequired) { showLogin(); throw new Error('login'); }
  if (!r.ok) throw new Error(j.error || 'Das hat nicht geklappt (' + r.status + ').');
  return j;
}

const defaults = () => ({
  settings: { profile: '', appName: '', theme: 'auto', blocks: P.blocks, practicumTarget: null, creditsTarget: null, sm: 'https://www.schulmanager-online.de/', links: [] },
  subjects: {}, events: [], notes: {}, practicum: { entries: [] }, focus: { date: '', count: 0, min: 0 },
  timetable: [], cards: [], grades: []
});
function fixState(o) {
  const d = defaults();
  o.settings = Object.assign(d.settings, o.settings || {});
  for (const k of ['subjects', 'events', 'notes', 'practicum', 'focus', 'timetable', 'cards', 'grades']) if (o[k] == null) o[k] = d[k];
  if (!o.practicum.entries) o.practicum.entries = [];
  if (!Array.isArray(o.settings.links)) o.settings.links = [];
  return o;
}
function save() {
  dirty = true; clearTimeout(saveT);
  saveT = setTimeout(async () => {
    try { const r = await api('PUT', '/state', { state: S }); rev = r.rev; dirty = false; }
    catch (e) { if (e.message !== 'login') toast('Speichern hat nicht geklappt. Prüfe die Verbindung zum Server.'); }
  }, 400);
}

/* ---------- Profil ---------- */
const types = () => P.eventTypes;
const typeOf = id => types().find(t => t.id === id) || types()[types().length - 1];
const T = id => typeOf(id).label;
const tone = id => 'tone-' + typeOf(id).tone;
const isExam = id => !!typeOf(id).exam;
const studyType = () => types().find(t => t.study);
const appName = () => (S && S.settings.appName) || (CFG && CFG.appName) || 'Lernhafen';

/* ---------- Stundenplan ----------
   Quellen in dieser Reihenfolge: 1) Schulmanager, 2) Kalender-Link (Stundenplan), 3) Wochenplan von Hand.
   Eine Stunde: { n, s (Fach), t (Lehrkraft), r (Raum), x (Status), start, end }. Ohne start/end gilt die Doppelstunden-Nummer n. */
const bn = n => Math.ceil(n / 2);
const bfOf = l => (l.start ? l.start : bn(l.n));
const cancelled = l => /cancel/.test(l.x || '');
const changed = l => !!(l.x && !cancelled(l));
const parseLine = s => { const [n, sj, t, r, x, st, en] = s.split('|'); return { n: +n, s: sj, t, r, x, start: st || '', end: en || '' }; };
const CANCEL_RE = /^(abgesagt|entfällt|entfaellt|ausfall|cancel(l)?ed)\b/i;

function calLessons(d) {
  return CAL.items.filter(e => e.kind === 'timetable' && e.date === d && !e.allDay && e.start)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((e, i) => ({ n: i + 1, s: nbsp(e.title.replace(CANCEL_RE, '').replace(/^[\s:–-]+/, '') || e.title), t: '', r: e.location || '', x: e.status === 'CANCELLED' || CANCEL_RE.test(e.title) ? 'cancelled' : '', start: e.start, end: e.end }));
}
function manualLessons(d) {
  const w = dowOf(d);
  return (S.timetable || []).filter(e => e.dow === w && (!e.from || d >= e.from) && (!e.to || d <= e.to))
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((e, i) => ({ n: i + 1, s: nbsp(e.subject), t: e.teacher || '', r: e.room || '', x: '', start: e.start, end: e.end }));
}
function lessonsOn(d) {
  const raw = (PLAN && PLAN.days && PLAN.days[d]) || [];
  if (raw.length) return raw.map(parseLine);
  const c = calLessons(d);
  return c.length ? c : manualLessons(d);
}
const extOn = d => CAL.items.filter(e => e.kind === 'events' && e.date === d);

function blocksOn(d) {
  const ls = lessonsOn(d), out = [], B = S.settings.blocks;
  const by = {}; ls.filter(l => !l.start).forEach(l => (by[l.n] = by[l.n] || []).push(l));
  Object.keys(by).map(Number).sort((a, b) => a - b).forEach(n => {
    const v = by[n], key = v.map(l => [l.s, l.t, l.r, l.x].join('|')).join('~'), last = out[out.length - 1];
    if (last && !last.timed && last.key === key && last.to === n - 1 && bn(last.to) === bn(n)) last.to = n; else out.push({ key, from: n, to: n, v });
  });
  out.forEach(b => { b.bf = bn(b.from); b.bt = bn(b.to); b.start = (B[b.bf - 1] || [])[0] || ''; b.end = (B[b.bt - 1] || [])[1] || ''; });
  const tb = {}; ls.filter(l => l.start).forEach(l => (tb[l.start + '-' + l.end] = tb[l.start + '-' + l.end] || []).push(l));
  Object.values(tb).forEach(v => out.push({ key: v[0].start, from: v[0].n, to: v[0].n, v, bf: v[0].start, bt: v[0].start, start: v[0].start, end: v[0].end, timed: true }));
  return out.sort((a, b) => (a.start || '99:99').localeCompare(b.start || '99:99') || a.from - b.from);
}
const hasTimetableCal = () => CAL.status.some(s => s.kind === 'timetable' && s.ok);
const covered = d => !!(PLAN && PLAN.from && PLAN.to && d >= PLAN.from && d <= PLAN.to) || (hasTimetableCal() && d >= addDays(today(), -14) && d <= addDays(today(), 200));
const hasLesson = (d, bf, k) => lessonsOn(d).some(l => bfOf(l) === bf && baseKey(l.s) === k && !cancelled(l));
/* Termine, die an eine Stunde gebunden sind, wandern mit dem Plan mit */
function resolve(e) {
  const sl = e.slot;
  if (!sl) return { date: e.date, block: 0, moved: false };
  if (!covered(sl.date) || hasLesson(sl.date, sl.block, sl.key)) return { date: sl.date, block: sl.block, moved: false };
  for (let i = 0; i <= 120; i++) {
    const d = addDays(sl.date, i);
    const l = lessonsOn(d).filter(x => baseKey(x.s) === sl.key && !cancelled(x)).sort((a, b) => a.n - b.n)[0];
    if (l) return { date: d, block: bfOf(l), moved: true };
  }
  return { date: sl.date, block: sl.block, moved: false, orphan: true };
}
const ed = e => resolve(e).date;
/* Der Kalender-Abo-Link auf dem Server kennt den Plan nicht; deshalb merkt sich der Termin sein aktuelles Datum. */
function syncEffectiveDates() {
  let ch = false;
  S.events.forEach(e => { if (e.slot) { const d = resolve(e).date; if (e.eff !== d) { e.eff = d; ch = true; } } });
  if (ch) save();
}
