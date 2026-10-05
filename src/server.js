'use strict';
const express = require('express');
const path = require('path');
const config = require('./config');
const store = require('./store');
const auth = require('./auth');
const profiles = require('./profiles');
const sm = require('./schulmanager');
const scans = require('./scans');
const scheduler = require('./scheduler');
const calendars = require('./calendars');
const feed = require('./feed');
const files = require('./files');
const google = require('./google');
const fs = require('fs');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'; frame-src 'self'");
  next();
});
app.use(express.json({ limit: '5mb' }));

const wrap = fn => (req, res) => Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ error: String(e.message || e) }));

app.get('/api/health', (req, res) => res.json({ ok: true, version: config.version }));
app.post('/api/login', auth.login);
app.post('/api/logout', auth.logout);
app.get('/api/session', (req, res) => res.json({ loginRequired: auth.enabled(), authed: auth.authed(req) }));

/* Kalender-Abo fürs Handy: geheimer Link statt Anmeldung, weil Kalender-Apps kein Passwort eingeben können */
app.get('/feed/:token/termine.ics', (req, res) => {
  if (!feed.valid(req.params.token)) return res.status(404).end();
  const st = store.read('state', {}) || {};
  const profile = profiles.load((st.settings || {}).profile || config.profile);
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(feed.build(st, profile, (st.settings && st.settings.appName) || config.appName));
});

/* Rückruf von Google über die Weiterleitungsseite. Ohne Anmeldung erreichbar, weil nur der geheime Status der offenen Verbindung zählt. */
app.get('/api/google/callback', async (req, res) => {
  const page = (ok, msg) => res.status(ok ? 200 : 400).type('html').send(`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Google</title>${ok ? '<meta http-equiv="refresh" content="1;url=/?google=ok">' : ''}<body style="font:16px system-ui;max-width:30em;margin:3em auto;padding:0 1em"><h2>${ok ? 'Mit Google verbunden' : 'Das hat nicht geklappt'}</h2><p>${String(msg).replace(/[<>&]/g, '')}</p><p><a href="/${ok ? '?google=ok' : ''}">Zurück zur App</a></p></body></html>`);
  try { await google.callback(req.query.code, req.query.state, req.query.error); page(true, 'Du wirst gleich zurückgeleitet.'); }
  catch (e) { page(false, e.message); }
});

app.use('/api', auth.guard);

app.get('/api/config', wrap(async (req, res) => {
  const profile = profiles.load((store.read('state', {}).settings || {}).profile || config.profile);
  res.json({ version: config.version, appName: ((store.read('state', {}) || {}).settings || {}).appName || config.appName, profile, profiles: profiles.list(), ocr: await scans.hasTesseract(), syncHour: config.syncHour, secure: req.secure || req.headers['x-forwarded-proto'] === 'https' });
}));

/* ---- App-Daten (Termine, Fächer, Mitschriften, Einstellungen) ---- */
app.get('/api/state', (req, res) => {
  const s = store.read('state', null);
  res.json({ state: s, rev: (s && s._rev) || 0 });
});
app.put('/api/state', (req, res) => {
  const st = req.body && req.body.state;
  if (!st || typeof st !== 'object' || Array.isArray(st)) return res.status(400).json({ error: 'Ungültige Daten.' });
  st._rev = Date.now();
  store.write('state', st);
  if (google.status().push.enabled) schedulePush();
  res.json({ rev: st._rev });
});

/* ---- Stundenplan ---- */
app.get('/api/plan', (req, res) => res.json({ plan: store.read('plan', null) }));
app.post('/api/plan/import', (req, res) => {   // Notlösung: Text aus dem Lesezeichen-Skript
  const o = req.body && req.body.plan;
  if (!o || typeof o.days !== 'object') return res.status(400).json({ error: 'Das sieht nicht nach den Plan-Daten aus.' });
  const old = store.read('plan', null), days = {};
  if (old && old.days) for (const d of Object.keys(old.days)) if (!o.from || d < o.from) days[d] = old.days[d];
  Object.assign(days, o.days);
  store.write('plan', { updated: o.updated || new Date().toISOString(), source: o.source || 'import', from: (old && old.from && (!o.from || old.from < o.from)) ? old.from : o.from, to: o.to, days });
  res.json({ ok: true });
});
app.get('/api/schulmanager', (req, res) => res.json(sm.status()));
app.put('/api/schulmanager', wrap(async (req, res) => {
  const b = req.body || {};
  res.json(await sm.save(b.user, b.password, b.daily));
}));
app.delete('/api/schulmanager', (req, res) => res.json(sm.clear()));
app.post('/api/sync', wrap(async (req, res) => res.json(await sm.sync())));

/* ---- Scannen ---- */
app.get('/api/scans', (req, res) => res.json({ scans: scans.list().filter(s => s.status !== 'draft') }));
app.post('/api/scans', (req, res) => res.json(scans.create()));
app.post('/api/scans/:id/pages', express.raw({ type: ['image/*', 'application/octet-stream'], limit: '30mb' }), wrap(async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw new Error('Kein Foto empfangen.');
  res.json({ page: await scans.addPage(req.params.id, req.body) });
}));
app.post('/api/scans/:id/finish', wrap(async (req, res) => res.json(scans.finish(req.params.id, req.body || {}))));
app.patch('/api/scans/:id', wrap(async (req, res) => {
  const b = req.body || {}, patch = {};
  if (typeof b.subject === 'string') patch.subject = b.subject.slice(0, 40);
  if (typeof b.title === 'string') patch.title = b.title.slice(0, 120);
  const s = scans.update(req.params.id, patch);
  if (!s) throw new Error('Scan nicht gefunden.');
  res.json(s);
}));
app.delete('/api/scans/:id', (req, res) => res.json({ ok: scans.remove(req.params.id) }));
app.get('/api/scans/:id/file/:name', (req, res) => {
  const f = scans.filePath(req.params.id, req.params.name);
  if (!f) return res.status(404).json({ error: 'Datei nicht gefunden.' });
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(f);
});

/* ---- Google (Drive, Docs, Kalender, Gmail) ---- */
let pushT = 0, pushRunning = false, pushDirty = false;
function schedulePush() { clearTimeout(pushT); pushT = setTimeout(runPush, 3000); }
async function runPush() {
  if (pushRunning) { pushDirty = true; return; }
  pushRunning = true;
  try {
    do {
      pushDirty = false;
      const st = store.read('state', {}) || {}, profile = profiles.load((st.settings || {}).profile || config.profile);
      const r = await google.pushEvents(st, profile, (st.settings && st.settings.appName) || config.appName);
      if (!r.skipped) google.setPushResult(true, `${r.made} neu, ${r.upd} geändert, ${r.del} entfernt`);
    } while (pushDirty);
  } catch (e) { google.setPushResult(false, e.message); } finally { pushRunning = false; }
}
scans.hooks.done = s => {
  const st = google.status();
  if (!st.connected || !st.autoUpload || !s) return;
  (async () => {
    try {
      const folderId = await google.ensureFolder(['Lernhafen', s.subject || 'Ohne Fach', 'Scans']);
      const pdf = scans.filePath(s.id, 'doc.pdf');
      if (pdf) await google.driveUpload({ name: s.title + '.pdf', mime: 'application/pdf', buf: fs.readFileSync(pdf), folderId });
      else for (let i = 1; i <= s.pages; i++) await google.driveUpload({ name: `${s.title} - Seite ${i}.jpg`, mime: 'image/jpeg', buf: fs.readFileSync(scans.filePath(s.id, `p${i}.jpg`)), folderId });
      scans.update(s.id, { drive: true });
    } catch (e) { scans.update(s.id, { driveError: String(e.message || e).slice(0, 200) }); }
  })();
};
const mimeOf = n => ({ '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.txt': 'text/plain' })[require('path').extname(n).toLowerCase()] || 'application/octet-stream';

app.get('/api/google/status', (req, res) => res.json(google.status()));
app.post('/api/google/begin', wrap(async (req, res) => {
  if (!auth.enabled()) throw new Error('Setze zuerst ein Passwort für die App (APP_PASSWORD). Sonst könnte jeder im Netzwerk auf dein Google-Konto zugreifen.');
  res.json(google.begin(Object.assign({}, req.body || {}, { origin: (req.body || {}).origin })));
}));
app.post('/api/google/finish', wrap(async (req, res) => res.json(await google.finish((req.body || {}).input))));
app.delete('/api/google', wrap(async (req, res) => res.json(await google.disconnect())));
app.get('/api/google/drive', wrap(async (req, res) => res.json(await google.driveList({ parent: req.query.parent, q: String(req.query.q || '').slice(0, 100) }))));
app.get('/api/google/drive/text/:id', wrap(async (req, res) => res.json(await google.driveText(req.params.id))));
app.post('/api/google/drive/folder', wrap(async (req, res) => res.json(await google.folderCreate((req.body || {}).name || 'Neuer Ordner', (req.body || {}).parent))));
app.post('/api/google/drive/upload', wrap(async (req, res) => {
  const b = req.body || {}, out = [];
  if (!b.folderId && b.subject) b.folderId = await google.ensureFolder(['Lernhafen', String(b.subject).slice(0, 60)]);
  if (b.kind === 'scan') {
    const s = scans.find(b.id); if (!s || s.status !== 'done') throw new Error('Der Scan ist noch nicht fertig.');
    const pdf = scans.filePath(s.id, 'doc.pdf');
    if (pdf) out.push(await google.driveUpload({ name: s.title + '.pdf', mime: 'application/pdf', buf: fs.readFileSync(pdf), folderId: b.folderId }));
    else for (let i = 1; i <= s.pages; i++) out.push(await google.driveUpload({ name: `${s.title} - Seite ${i}.jpg`, mime: 'image/jpeg', buf: fs.readFileSync(scans.filePath(s.id, `p${i}.jpg`)), folderId: b.folderId }));
  } else if (b.kind === 'file') {
    const f = files.find(b.id), p = files.filePath(b.id); if (!f || !p) throw new Error('Datei nicht gefunden.');
    out.push(await google.driveUpload({ name: f.name, mime: mimeOf(f.name), buf: fs.readFileSync(p), folderId: b.folderId }));
  } else throw new Error('Unbekannte Art.');
  res.json({ uploaded: out });
}));
/** Fach-Mitschrift in Drive: Ordner „Lernhafen/<Fach>“ und ein Google Doc darin, alles automatisch. */
app.post('/api/google/subject', wrap(async (req, res) => {
  const subject = String((req.body || {}).subject || '').slice(0, 60);
  if (!subject) throw new Error('Kein Fach angegeben.');
  const folderId = await google.ensureFolder(['Lernhafen', subject]);
  const doc = (req.body || {}).doc === false ? null : await google.docCreate({ title: 'Mitschrift ' + subject, folderId });
  res.json({ folderId, folderUrl: 'https://drive.google.com/drive/folders/' + folderId, doc });
}));
app.put('/api/google/autoupload', wrap(async (req, res) => { google.setAutoUpload((req.body || {}).enabled); res.json(google.status()); }));
app.post('/api/google/doc', wrap(async (req, res) => res.json(await google.docCreate(req.body || {}))));
app.post('/api/google/doc/:id/append', wrap(async (req, res) => res.json(await google.docAppend(req.params.id, (req.body || {}).heading || 'Eintrag', (req.body || {}).body || ''))));
app.get('/api/google/doc/:id/tail', wrap(async (req, res) => res.json(await google.docTail(req.params.id))));
app.get('/api/google/calendars', wrap(async (req, res) => res.json(await google.calendarList())));
app.put('/api/google/pull', wrap(async (req, res) => { google.setPull((req.body || {}).list); res.json(google.status()); }));
app.put('/api/google/push', wrap(async (req, res) => { google.setPush((req.body || {}).enabled); if ((req.body || {}).enabled) schedulePush(); res.json(google.status()); }));
app.post('/api/google/push/now', wrap(async (req, res) => { await runPush(); res.json(google.status()); }));
app.get('/api/google/gmail', wrap(async (req, res) => res.json(await google.gmailInbox(req.query.q))));

/* ---- Kalender-Quellen (iCal) und Abo-Link ---- */
app.get('/api/calendars', (req, res) => res.json({ calendars: calendars.list(), ...calendars.events() }));
app.post('/api/calendars/resync', wrap(async (req, res) => res.json({ calendars: calendars.list(), ...(await calendars.sync()) })));
app.put('/api/calendars', wrap(async (req, res) => { calendars.save((req.body || {}).calendars); res.json({ calendars: calendars.list(), ...calendars.events() }); }));
app.post('/api/calendars/sync', wrap(async (req, res) => res.json({ calendars: calendars.list(), ...(await calendars.sync()) })));
app.get('/api/feed', (req, res) => res.json({ path: `/feed/${feed.token()}/termine.ics` }));
app.post('/api/feed/rotate', (req, res) => { feed.rotate(); res.json({ path: `/feed/${feed.token()}/termine.ics` }); });

/* ---- Dateien zu Fächern ---- */
app.get('/api/files', (req, res) => res.json({ files: files.list() }));
app.post('/api/files', express.raw({ type: () => true, limit: '100mb' }), wrap(async (req, res) => {
  if (!Buffer.isBuffer(req.body)) throw new Error('Keine Datei empfangen.');
  res.json(files.add(req.body, req.query.name, req.query.subject));
}));
app.patch('/api/files/:id', wrap(async (req, res) => { const f = files.update(req.params.id, req.body || {}); if (!f) throw new Error('Datei nicht gefunden.'); res.json(f); }));
app.delete('/api/files/:id', (req, res) => res.json({ ok: files.remove(req.params.id) }));
app.get('/api/files/:id/download', (req, res) => {
  const f = files.find(req.params.id), p = files.filePath(req.params.id);
  if (!f || !p) return res.status(404).json({ error: 'Datei nicht gefunden.' });
  res.set(files.sendHeaders(f)); res.set('Cache-Control', 'private, max-age=3600'); res.sendFile(p);
});

/* ---- Sicherung: Daten als eine Datei herunterladen und wieder einspielen (Scans und Dateien liegen im Ordner data/) ---- */
app.get('/api/export', (req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="lernhafen-sicherung-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ app: 'lernhafen', version: config.version, exported: new Date().toISOString(), state: store.read('state', null), plan: store.read('plan', null), calendars: calendars.list() });
});
app.post('/api/import', express.json({ limit: '20mb' }), wrap(async (req, res) => {
  const b = req.body || {};
  if (b.app !== 'lernhafen' || !b.state || typeof b.state !== 'object') throw new Error('Das ist keine Sicherungsdatei von Lernhafen.');
  b.state._rev = Date.now(); store.write('state', b.state);
  if (b.plan && typeof b.plan.days === 'object') store.write('plan', b.plan);
  if (Array.isArray(b.calendars)) calendars.save(b.calendars);
  res.json({ ok: true });
}));

/* ---- Suche über Mitschriften und Scans ---- */
app.get('/api/search', (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  if (q.length < 2) return res.json({ notes: [], scans: [] });
  const st = store.read('state', {}) || {}, notes = [];
  for (const [subject, list] of Object.entries(st.notes || {})) {
    for (const n of list || []) if ((n.title + ' ' + n.body).toLowerCase().includes(q)) notes.push({ subject, id: n.id, title: n.title, date: n.date });
  }
  res.json({ notes: notes.slice(0, 30), scans: scans.search(q).slice(0, 30) });
});

app.get('/manifest.webmanifest', (req, res) => {
  const name = ((store.read('state', {}) || {}).settings || {}).appName || config.appName;
  res.type('application/manifest+json').json({ name, short_name: name.slice(0, 12), start_url: '/', display: 'standalone', background_color: '#EEF3F3', theme_color: '#0E7C7B', lang: 'de',
    icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] });
});
app.use('/api', (req, res) => res.status(404).json({ error: 'Nicht gefunden.' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '5m' }));
app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.status === 413 ? 'Datei zu groß.' : 'Serverfehler.' }));

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`${config.appName} ${config.version} läuft auf Port ${config.port}, Daten in ${config.dataDir}`);
    scans.resume();
    scheduler.start();
  });
}

module.exports = app;
