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
const fs = require('fs');
const editors = require('./editors');
const gdrive = require('./gdrive');
const backup = require('./backup');

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

/* ---- Kalender-Quellen (iCal) und Abo-Link ---- */
app.get('/api/calendars', (req, res) => res.json({ calendars: calendars.list(), ...calendars.events() }));
app.post('/api/calendars/resync', wrap(async (req, res) => res.json({ calendars: calendars.list(), ...(await calendars.sync()) })));
app.put('/api/calendars', wrap(async (req, res) => { calendars.save((req.body || {}).calendars); res.json({ calendars: calendars.list(), ...calendars.events() }); }));
app.post('/api/calendars/sync', wrap(async (req, res) => res.json({ calendars: calendars.list(), ...(await calendars.sync()) })));
app.get('/api/feed', (req, res) => res.json({ path: `/feed/${feed.token()}/termine.ics` }));
app.post('/api/feed/rotate', (req, res) => { feed.rotate(); res.json({ path: `/feed/${feed.token()}/termine.ics` }); });

/* ---- Google Drive (in der App eingebaut) ---- */
app.get('/api/gdrive/status', (req, res) => res.json(gdrive.status()));
app.put('/api/gdrive/creds', wrap(async (req, res) => res.json(gdrive.saveCreds((req.body || {}).clientId, (req.body || {}).clientSecret))));
app.post('/api/gdrive/connect', wrap(async (req, res) => res.json(await gdrive.connect())));
app.get('/api/gdrive/poll', wrap(async (req, res) => res.json(await gdrive.poll())));
app.put('/api/gdrive/settings', wrap(async (req, res) => res.json(gdrive.setSettings(req.body || {}))));
app.post('/api/gdrive/sync', wrap(async (req, res) => { const r = await gdrive.sync(); res.json({ result: r, status: gdrive.status() }); }));
app.delete('/api/gdrive', wrap(async (req, res) => res.json(await gdrive.disconnect())));

/* ---- Eingebaute Editoren (Text, Tabellen, Folien) ---- */
app.post('/api/library/new', wrap(async (req, res) => {
  const b = req.body || {};
  res.json(files.create(b.kind, b.subject, b.name, b.kind === 'praesentation' ? await editors.slidesTemplate() : undefined));
}));
app.post('/api/library/note', wrap(async (req, res) => res.json(await editors.noteCreate(req.body || {}))));
app.get('/api/editor/doc/:id', wrap(async (req, res) => res.json(await editors.docRead(req.params.id))));
app.put('/api/editor/doc/:id', express.json({ limit: '8mb' }), wrap(async (req, res) => { const f = await editors.docWrite(req.params.id, (req.body || {}).html); res.json({ modified: f.modified, size: f.size }); }));
app.get('/api/editor/sheet/:id', wrap(async (req, res) => res.json(await editors.sheetRead(req.params.id))));
app.put('/api/editor/sheet/:id', express.json({ limit: '8mb' }), wrap(async (req, res) => { const f = await editors.sheetWrite(req.params.id, (req.body || {}).sheets); res.json({ modified: f.modified, size: f.size }); }));
app.get('/api/editor/slides/:id', wrap(async (req, res) => res.json(await editors.slidesRead(req.params.id))));
app.put('/api/editor/slides/:id', express.json({ limit: '8mb' }), wrap(async (req, res) => { const f = await editors.slidesWrite(req.params.id, (req.body || {}).slides); res.json({ modified: f.modified, size: f.size }); }));

/* ---- Dateien zu Fächern ---- */
app.post('/api/files/order', wrap(async (req, res) => { files.reorder(String((req.body || {}).subject || ''), (req.body || {}).ids); res.json({ files: files.list() }); }));
app.get('/api/files', (req, res) => res.json({ files: files.list() }));
app.post('/api/files/:id/subject', wrap(async (req, res) => { const f = files.update(req.params.id, { subject: String((req.body || {}).subject || '') }); if (!f) throw new Error('Datei nicht gefunden.'); res.json(f); }));
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

/* ---- Komplettsicherung (Daten, Dateien, Scans) ---- */
app.get('/api/backup', wrap(async (req, res) => {
  const p = backup.stream();
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="lernhafen-komplett-${new Date().toISOString().slice(0, 10)}.tar.gz"`);
  p.stdout.pipe(res); res.on('close', () => p.kill());
}));
app.get('/api/backup/list', (req, res) => res.json({ backups: backup.list() }));
app.post('/api/backup/now', wrap(async (req, res) => res.json({ name: await backup.run(), backups: backup.list() })));
app.post('/api/backup/restore', wrap(async (req, res) => {
  const tmp = path.join(config.dataDir, '.upload-' + process.pid + '.tar.gz');
  try {
    await new Promise((ok, fail) => { const w = fs.createWriteStream(tmp); req.pipe(w); w.on('finish', ok); w.on('error', fail); req.on('error', fail); });
    const n = backup.restore(tmp);
    files.reindex(); res.json({ ok: true, entries: n });
  } finally { try { fs.unlinkSync(tmp); } catch (e) { /* weg */ } }
}));

/* ---- Suche über Mitschriften und Scans ---- */
app.get('/api/search', wrap(async (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  if (q.length < 2) return res.json({ notes: [], scans: [], docs: [] });
  const st = store.read('state', {}) || {}, notes = [];
  for (const [subject, list] of Object.entries(st.notes || {})) {
    for (const n of list || []) if ((n.title + ' ' + n.body).toLowerCase().includes(q)) notes.push({ subject, id: n.id, title: n.title, date: n.date });
  }
  res.json({ notes: notes.slice(0, 30), scans: scans.search(q).slice(0, 30), docs: await editors.searchDocs(q) });
}));

app.get('/manifest.webmanifest', (req, res) => {
  const name = ((store.read('state', {}) || {}).settings || {}).appName || config.appName;
  res.type('application/manifest+json').json({ name, short_name: name.slice(0, 12), start_url: '/', display: 'standalone', background_color: '#EEF3F3', theme_color: '#0E7C7B', lang: 'de',
    icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] });
});
files.hooks.change = () => gdrive.schedule();
scans.hooks.done = () => gdrive.schedule();
app.use('/api', (req, res) => res.status(404).json({ error: 'Nicht gefunden.' }));
for (const [name, mod, dir] of [['quill', 'quill', 'dist']]) {
  app.use('/vendor/' + name, express.static(path.join(__dirname, '..', 'node_modules', mod, dir), { maxAge: '7d' }));
}
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '5m' }));
app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.status === 413 ? 'Datei zu groß.' : 'Serverfehler.' }));

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`${config.appName} ${config.version} läuft auf Port ${config.port}, Daten in ${config.dataDir}`);
    files.migrate();
    files.reindex();
    editors.notesMigrate(store).then(n => { if (n) console.log(n + ' Mitschriften in Dokumente umgewandelt'); }).catch(e => console.log('Mitschriften-Umwandlung: ' + e.message));
    gdrive.start();
    scans.resume();
    scheduler.start();
  });
}

module.exports = app;
