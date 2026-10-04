'use strict';
// Stundenplan und Vertretungen aus Schulmanager Online holen (nicht offizielle Schnittstelle, kann sich ändern).
// Zugangsdaten liegen nur in DATA_DIR/schulmanager.json (Rechte 600) auf deinem NAS und gehen nur an Schulmanager.
const crypto = require('crypto');
const store = require('./store');

const SM = 'https://login.schulmanager-online.de';
const WEEKS = 6;
const FALLBACK_BUNDLE = '3505280ee7';

async function post(path, body, jwt) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json', Origin: SM, Referer: SM + '/' };
  if (jwt) headers.Authorization = 'Bearer ' + jwt;
  return fetch(SM + path, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
}

function hashPassword(password, salt) {
  return new Promise((res, rej) => crypto.pbkdf2(password, salt, 99999, 512, 'sha512', (e, k) => e ? rej(e) : res(k.toString('hex'))));
}

async function getSalt(user) {
  const r = await post('/api/get-salt', { emailOrUsername: user, mobileApp: false, institutionId: null });
  if (!r.ok) throw new Error('Schulmanager kennt dieses Konto nicht (HTTP ' + r.status + ').');
  const text = (await r.text()).trim();
  let salt = text;
  try {
    const j = JSON.parse(text);
    if (typeof j === 'string') salt = j;
    else if (j && typeof j === 'object') {
      salt = j.salt || j.data || '';
      if (!salt) for (const k in j) if (typeof j[k] === 'string') { salt = j[k]; break; }
    }
  } catch (e) { salt = text.replace(/^"|"$/g, ''); }
  if (!salt) throw new Error('Keine Antwort von Schulmanager erhalten.');
  return salt;
}

let bundleCache = { v: '', t: 0 };
async function bundleVersion() {
  if (bundleCache.v && Date.now() - bundleCache.t < 36e5) return bundleCache.v;
  let found = FALLBACK_BUNDLE;
  try {
    const html = await (await fetch(SM + '/', { signal: AbortSignal.timeout(20000) })).text();
    const urls = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]).slice(0, 12);
    for (let u of urls) {
      if (!/^http/.test(u)) u = SM + (u.startsWith('/') ? '' : '/') + u;
      const js = await (await fetch(u, { signal: AbortSignal.timeout(20000) })).text();
      const m = js.match(/bundleVersion["']?\s*[:=]\s*["']([a-f0-9]{8,})["']/);
      if (m) { found = m[1]; break; }
    }
  } catch (e) { /* Rückfallwert */ }
  bundleCache = { v: found, t: Date.now() };
  return found;
}

const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function monday(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }

/** Eine Stunde aus der Schulmanager-Antwort in die Zeile "Nr|Fach|Lehrkraft|Raum|Status" umwandeln. */
function lessonLine(l) {
  const type = String(l.type || 'regularLesson');
  const cancelled = /cancel/i.test(type);
  const act = l.actualLesson || {}, orig = (l.originalLessons && l.originalLessons[0]) || {};
  const src = (cancelled && orig.subject) ? orig : (act.subject ? act : orig);
  const sub = src.subject || {};
  const name = sub.abbreviation || sub.shortName || sub.short || sub.name || '?';
  const room = (src.room && (src.room.name || src.room.abbreviation || src.room.short)) || '';
  const teachers = (src.teachers || []).map(x => x.abbreviation || x.shortName || x.short || x.lastname || x.name || '').filter(Boolean).join(', ');
  const n = parseInt((l.classHour && l.classHour.number) || 0, 10);
  const flag = cancelled ? 'cancelled' : (/regular/i.test(type) ? '' : 'substitution');
  return { date: String(l.date || '').slice(0, 10), line: [n, name, teachers, room, flag].join('|') };
}

function collect(results) {
  const days = {}; let count = 0, sample = '';
  for (const r of results || []) {
    const list = (r && (r.data || r.lessons)) || [];
    if (!sample && list.length) sample = JSON.stringify(list[0]).slice(0, 500);
    for (const l of list) {
      const o = lessonLine(l);
      if (!/^\d{4}-\d\d-\d\d$/.test(o.date)) continue;
      (days[o.date] = days[o.date] || []).push(o.line); count++;
    }
  }
  return { days, count, sample };
}

/** Neue Tage in den bestehenden Plan einsortieren; ältere Tage bleiben erhalten. */
function mergePlan(old, days, from, to) {
  const merged = {};
  if (old && old.days) for (const d of Object.keys(old.days)) if (d < from) merged[d] = old.days[d];
  Object.assign(merged, days);
  return {
    updated: new Date().toISOString(), source: 'schulmanager-api',
    from: old && old.from && old.from < from ? old.from : from, to, days: merged
  };
}

function creds() { return store.read('schulmanager', null); }
function status() {
  const c = creds(), st = store.read('sm_status', {});
  return { configured: !!(c && c.hash), user: (c && c.user) || '', daily: !!(c && c.daily), lastOk: st.ok ? st.time : (st.lastOk || 0), lastTime: st.time || 0, ok: !!st.ok, msg: st.msg || '' };
}

async function save(user, password, daily) {
  const old = creds() || {};
  user = String(user || old.user || '').trim();
  if (!user) throw new Error('Bitte E-Mail oder Benutzername eintragen.');
  let hash = old.hash, pw = old.password;
  if (password) { hash = await hashPassword(password, await getSalt(user)); pw = password; }
  if (!hash) throw new Error('Bitte das Passwort eintragen.');
  store.write('schulmanager', { user, hash, password: pw, daily: !!daily }, 0o600);
  return status();
}
function clear() { store.remove('schulmanager'); store.remove('sm_status'); return status(); }

async function run() {
  const c = creds();
  if (!c || !c.hash) throw new Error('Schulmanager ist noch nicht verbunden.');
  const body = { emailOrUsername: c.user, hash: c.hash, mobileApp: false, institutionId: null };
  if (c.password) body.password = c.password;
  const login = await post('/api/login', body);
  if (!login.ok) throw new Error('Anmeldung bei Schulmanager fehlgeschlagen (HTTP ' + login.status + '). Passwort geändert? Dann speichere die Zugangsdaten neu.');
  const data = await login.json();
  if (data.multipleAccounts) throw new Error('Dein Konto gehört zu mehreren Schulen. Das wird noch nicht unterstützt.');
  const jwt = data.jwt || data.token, u = data.user || {};
  if (!jwt) throw new Error('Schulmanager hat kein Anmelde-Token geliefert.');
  let student = u.associatedStudent;
  if (!student && u.associatedParents && u.associatedParents.length) student = u.associatedParents[0].student || u.associatedParents[0];
  if (!student) throw new Error('In deinem Konto ist kein Schüler hinterlegt.');
  const mon = monday(new Date()), requests = [], weeks = [];
  for (let w = 0; w < WEEKS; w++) {
    const from = new Date(mon), to = new Date(mon);
    from.setDate(from.getDate() + 7 * w); to.setDate(to.getDate() + 7 * w + 6);
    weeks.push({ from: isoDate(from), to: isoDate(to) });
    requests.push({ moduleName: 'schedules', endpointName: 'get-actual-lessons', parameters: { student, start: isoDate(from), end: isoDate(to) } });
  }
  const res = await post('/api/calls', { bundleVersion: await bundleVersion(), requests }, jwt);
  if (!res.ok) throw new Error('Stundenplan konnte nicht geladen werden (HTTP ' + res.status + '). Die Schnittstelle hat sich eventuell geändert.');
  const { days, count, sample } = collect((await res.json()).results);
  if (!count) throw new Error('Keine Stunden erkannt.' + (sample ? ' Beispielantwort: ' + sample : ' Die Antwort war leer.'));
  store.write('plan', mergePlan(store.read('plan', null), days, weeks[0].from, weeks[weeks.length - 1].to));
  return count;
}

let running = null;
/** Wird von der App und vom täglichen Zeitplan aufgerufen. Läuft nie doppelt. */
function sync() {
  if (running) return running;
  running = (async () => {
    let res;
    try { res = { ok: true, time: Date.now(), msg: (await run()) + ' Stunden gelesen.' }; }
    catch (e) {
      const old = store.read('sm_status', {});
      res = { ok: false, time: Date.now(), lastOk: old.ok ? old.time : (old.lastOk || 0), msg: String(e.message || e) };
    }
    store.write('sm_status', res);
    return res;
  })().finally(() => { running = null; });
  return running;
}

module.exports = { save, clear, status, sync, lessonLine, collect, mergePlan, hashPassword };
