'use strict';
/* Lernhafen – Google: Anmelden, Drive, Docs, Kalender, Gmail. Alles Weitere läuft automatisch im Hintergrund. */
let GS = null;                                   // Status der Google-Verbindung
const gOn = () => !!(GS && GS.connected);
async function loadGoogle() { try { GS = await api('GET', '/google/status'); } catch (e) { GS = null; } }

const gStep = (n, html) => `<li style="margin-bottom:8px"><b>${n}.</b> ${html}</li>`;
const gLink = (u, t) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`;

/* ---------- Anmelden ---------- */
function googleSheet() {
  if (!GS) { toast('Google-Status konnte nicht geladen werden.'); return; }
  if (gOn()) return googleManage();
  const pre = GS.mode === 'central';
  showSheet('Mit Google verbinden', `<form id="gf">
    <p class="muted" style="margin-bottom:10px">${pre ? 'Du meldest dich bei Google mit deinem normalen Konto an und erlaubst den Zugriff. Danach landest du wieder hier. ' : ''}Lernhafen legt dann Mitschriften als Google Docs in deinem Drive ab, sichert Scans und zeigt deine Google-Kalender. Du kannst das jederzeit wieder trennen.</p>
    ${pre ? '<p class="small muted" style="margin-bottom:10px">Google zeigt dabei den Hinweis „Nicht bestätigte App“. Das ist normal, klicke auf „Erweitert“ und dann auf „Weiter“.</p>' : `<details ${GS.configured ? '' : 'open'} style="margin-bottom:12px"><summary style="cursor:pointer;font-weight:600;min-height:40px;display:flex;align-items:center">Eigene Google-App einrichten (einmalig, ca. 10 Minuten)</summary>
      <ol class="small" style="padding-left:1.2em;margin:8px 0">
        ${gStep(1, `Öffne ${gLink('https://console.cloud.google.com/projectcreate', 'Google Cloud')} und lege ein Projekt an, zum Beispiel „Lernhafen“.`)}
        ${gStep(2, `Schalte diese Dienste ein (jeweils auf „Aktivieren“ klicken): ${gLink('https://console.cloud.google.com/apis/library/drive.googleapis.com', 'Drive')}, ${gLink('https://console.cloud.google.com/apis/library/docs.googleapis.com', 'Docs')}, ${gLink('https://console.cloud.google.com/apis/library/calendar-json.googleapis.com', 'Kalender')} und, wenn du es willst, ${gLink('https://console.cloud.google.com/apis/library/gmail.googleapis.com', 'Gmail')}.`)}
        ${gStep(3, `Öffne ${gLink('https://console.cloud.google.com/auth/overview', 'Google Auth Platform')}, wähle „Extern“, gib einen App-Namen und deine E-Mail ein. Unter „Zielgruppe“ klickst du auf <b>„App veröffentlichen“</b>. Ohne diesen Schritt läuft die Verbindung nach 7 Tagen ab. Die Warnung „Nicht bestätigte App“ bei der Anmeldung ist normal und gilt nur für dich.`)}
        ${gStep(4, `Öffne ${gLink('https://console.cloud.google.com/auth/clients', 'Clients')}, klicke auf „Client erstellen“, wähle als Typ <b>„Desktop-App“</b> und kopiere die <b>Client-ID</b> und den <b>Client-Schlüssel</b> hierher.`)}
      </ol><p class="small muted">Die Menünamen bei Google ändern sich manchmal. Gesucht sind: Projekt, vier Dienste aktivieren, App veröffentlichen, Client vom Typ Desktop-App.</p></details>
      ${F('Client-ID', 'clientId', GS.clientId || '', 'text', 'autocomplete="off" placeholder="…apps.googleusercontent.com"')}
      <label class="field"><span>Client-Schlüssel (Secret)</span><input type="password" name="clientSecret" autocomplete="off" placeholder="${GS.configured ? 'gespeichert, leer lassen' : 'GOCSPX-…'}"></label>`}
    <label class="chk"><input type="checkbox" name="calendar" checked><span>Google Kalender nutzen</span></label>
    <label class="chk"><input type="checkbox" name="gmail"><span>Postfach lesen (nur ungelesene Nachrichten anzeigen)</span></label>
    <p class="small" id="gmsg" style="min-height:1.4em"></p>
    <div class="row end"><button type="button" class="btn ghost" data-act="fclose">Abbrechen</button><button class="btn primary">${pre ? 'Mit Google anmelden' : 'Weiter zu Google'}</button></div></form>`);
  $('#gf').onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
    try {
      $('#gmsg').textContent = 'Einen Moment …';
      const r = await api('POST', '/google/begin', { clientId: d.clientId, clientSecret: d.clientSecret, origin: location.origin, access: { drive: 'full', calendar: d.calendar === 'on', gmail: d.gmail === 'on' } });
      if (pre) { location.href = r.url; return; }       // einfacher Weg: Google, dann automatisch zurück in die App
      googleStep2(r.url);
    } catch (er) { $('#gmsg').textContent = er.message; }
  };
}
function googleStep2(url) {
  showSheet('Bei Google anmelden', `<ol style="padding-left:1.2em;display:flex;flex-direction:column;gap:10px">
    <li>Klicke auf den Knopf. Google öffnet sich in einem neuen Tab. Melde dich an und erlaube den Zugriff.<div style="margin-top:6px"><a class="btn primary" href="${esc(url)}" target="_blank" rel="noopener">Google öffnen</a></div></li>
    <li>Danach zeigt der Browser „Diese Seite ist nicht erreichbar“ oder Ähnliches. <b>Das ist richtig.</b> Kopiere die komplette Adresse oben aus der Adresszeile, sie beginnt mit <code>http://127.0.0.1:53682/</code>.</li>
    <li>Füge die Adresse hier ein. Es geht von allein weiter.<input type="text" id="gurl" style="margin-top:6px" placeholder="http://127.0.0.1:53682/?code=…" autocomplete="off"></li></ol>
    <p class="small" id="gmsg" style="min-height:1.4em"></p><div class="row end"><button class="btn ghost" data-act="fclose">Abbrechen</button></div>`);
  const inp = $('#gurl'); let busy = false;
  const go = async () => {
    const v = inp.value.trim(); if (busy || !/code=/.test(v)) return; busy = true; $('#gmsg').textContent = 'Verbinde …';
    try { GS = await api('POST', '/google/finish', { input: v }); toast('Mit Google verbunden'); closeModal(); render(); googleManage(); }
    catch (er) { $('#gmsg').textContent = er.message; busy = false; }
  };
  inp.addEventListener('input', go); inp.addEventListener('paste', () => setTimeout(go, 50));
}

/* ---------- Verwalten (alles Wichtige als Schalter) ---------- */
function googleManage() {
  const g = GS, pull = g.pull || [];
  showSheet('Google', `<p><b>${esc(g.email || 'Verbunden')}</b> <span class="chip">verbunden</span></p>
    <div class="stack" style="margin-top:12px">
      <label class="chk"><input type="checkbox" data-g="auto" ${g.autoUpload ? 'checked' : ''}><span><b>Scans automatisch in Drive sichern</b><br><span class="small muted">Ordner „Lernhafen / Fach / Scans“, wird von selbst angelegt</span></span></label>
      ${g.access.calendar ? `<label class="chk"><input type="checkbox" data-g="push" ${g.push.enabled ? 'checked' : ''}><span><b>Meine Termine in Google Kalender schreiben</b><br><span class="small muted">In einen eigenen Kalender mit Erinnerungen${g.push.last ? ' · ' + esc(g.push.last.msg) : ''}</span></span></label>
      <div class="row between"><span><b>Google-Kalender anzeigen</b><br><span class="small muted">${pull.length ? pull.length + ' ausgewählt' : 'noch keiner ausgewählt'}</span></span><button class="btn sm" data-g="cals">Auswählen</button></div>` : ''}
      ${g.access.gmail ? '<div class="row between"><span><b>Postfach</b><br><span class="small muted">Ungelesene Nachrichten unter „Mehr“</span></span><button class="btn sm" data-g="mailq">Filter ändern</button></div>' : ''}
    </div>
    ${g.error ? `<p class="small due-bad" style="margin-top:10px">${esc(g.error)}</p>` : ''}
    <div class="row end" style="margin-top:14px"><button class="btn danger" data-g="disconnect" style="margin-right:auto">Trennen</button><button class="btn" data-g="reconnect">Neu verbinden</button><button class="btn ghost" data-act="fclose">Fertig</button></div>`);
}
async function googleCals() {
  showSheet('Google-Kalender anzeigen', '<p class="empty">Lade …</p>');
  try {
    const list = (await api('GET', '/google/calendars')).calendars, sel = Object.fromEntries((GS.pull || []).map(p => [p.id, p.kind]));
    $('#sbody').innerHTML = `<form id="gcf"><p class="small muted" style="margin-bottom:8px">Wähle, welche Kalender in Lernhafen erscheinen. „Stundenplan“ ersetzt die Stundenliste, „Termine“ zeigt sie zusätzlich an.</p>
      ${list.map((c, i) => `<div class="row" style="flex-wrap:nowrap;margin-bottom:6px"><label class="chk" style="margin:0;flex:1"><input type="checkbox" name="on${i}" ${sel[c.id] ? 'checked' : ''}><span>${esc(c.name)}</span></label>
        <select name="kind${i}" style="width:auto"><option value="events" ${sel[c.id] !== 'timetable' ? 'selected' : ''}>Termine</option><option value="timetable" ${sel[c.id] === 'timetable' ? 'selected' : ''}>Stundenplan</option></select><input type="hidden" name="id${i}" value="${esc(c.id)}"><input type="hidden" name="nm${i}" value="${esc(c.name)}"></div>`).join('')}
      <p class="small" id="gmsg"></p><div class="row end"><button type="button" class="btn ghost" data-act="fclose">Abbrechen</button><button class="btn primary">Speichern</button></div></form>`;
    $('#gcf').onsubmit = async e => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), out = [];
      list.forEach((c, i) => { if (f['on' + i]) out.push({ id: f['id' + i], name: f['nm' + i], kind: f['kind' + i] }); });
      try { GS = await api('PUT', '/google/pull', { list: out }); CAL = await api('POST', '/calendars/resync'); closeModal(); render(); toast('Kalender aktualisiert'); }
      catch (er) { $('#gmsg').textContent = er.message; }
    };
  } catch (e) { $('#sbody').innerHTML = `<p class="due-bad">${esc(e.message)}</p>`; }
}
function googleMailq() {
  modal('Postfach-Filter', F('Welche Nachrichten sollen erscheinen?', 'q', GS.gmailQuery, 'text', 'maxlength="200"') + '<p class="small muted">Wie die Suche in Gmail, zum Beispiel <code>is:unread category:primary</code> oder <code>is:unread from:meineschule.de</code>.</p>',
    d => { api('GET', '/google/gmail?q=' + encodeURIComponent(d.q)).then(() => loadGoogle()).then(() => render()).catch(er => toast(er.message)); });
}

/* ---------- Karten und Fenster in der App ---------- */
function connectionsCard() {       // alle Dienste an einer Stelle: nur anmelden
  const src = (P.sources || []), sm = SM && SM.configured, rows = [];
  if (src.includes('schulmanager') || sm) rows.push(['Schulmanager', sm ? (SM.ok ? 'verbunden' : 'Fehler beim letzten Abgleich') : 'nicht verbunden', sm ? 'Einstellungen' : 'Anmelden', 'data-act="smopen"', !sm]);
  if (!gOn() && !(GS && GS.mode === 'central')) rows.push(['Google Drive abgleichen', 'Dateien automatisch in Drive spiegeln, ohne Einrichtung bei Google', 'So geht’s', 'data-d="sync"', false]);
  else rows.push(['Google', gOn() ? esc(GS.email) + ' · Drive, Docs' + (GS.access.calendar ? ', Kalender' : '') + (GS.access.gmail ? ', Postfach' : '') : 'Docs, Drive, Kalender', gOn() ? 'Einstellungen' : 'Anmelden', 'data-g="open"', !gOn()]);
  rows.push(['Office im Browser', OFFICE.ok ? 'Word, Excel und PowerPoint sind bereit' : (OFFICE.enabled ? 'Nicht erreichbar' : 'Nicht aktiviert'), OFFICE.ok ? '' : 'Aktivieren', 'data-d="hint"', false]);
  rows.push(['Kalender-Link', CAL.calendars.length ? CAL.calendars.length + ' verbunden' : 'z. B. Famanice, Hochschule, Moodle', CAL.calendars.length ? 'Ändern' : 'Hinzufügen', 'data-act="calsopen"', false]);
  rows.push(['Wochenplan von Hand', (S.timetable || []).length ? S.timetable.length + ' Einträge' : 'wenn es keine Quelle gibt', 'Bearbeiten', 'data-act="ttopen"', false]);
  return `<div class="card"><div class="card-head"><h2>Verbindungen</h2></div>${rows.map(r => `<div class="item"><div class="grow"><b>${r[0]}</b><div class="small muted">${r[1]}</div></div>${r[2] ? `<button class="btn sm ${r[4] ? 'primary' : ''}" ${r[3]}>${r[2]}</button>` : '<span class="chip">bereit</span>'}</div>`).join('')}</div>`;
}
function gmailCard() { return gOn() && GS.access.gmail ? '<div class="card" id="gmailBox"><div class="card-head"><h2>Postfach</h2></div><p class="empty">Lade …</p></div>' : ''; }
function googleCard() {          // Karte unter „Mehr“ (alt)
  if (!GS) return '';
  return `<div class="card"><div class="card-head"><h2>Google</h2><button class="btn sm ${gOn() ? '' : 'primary'}" data-g="open">${gOn() ? 'Einstellungen' : 'Verbinden'}</button></div>
    <p class="small muted">${gOn() ? esc(GS.email) + ' · Drive, Docs' + (GS.access.calendar ? ', Kalender' : '') + (GS.access.gmail ? ', Postfach' : '') : 'Mitschriften als Google Docs, Scans in Drive, Google-Kalender.'}</p></div>
    ${gOn() && GS.access.gmail ? '<div class="card" id="gmailBox"><div class="card-head"><h2>Postfach</h2></div><p class="empty">Lade …</p></div>' : ''}`;
}
async function loadGmail() {
  const box = $('#gmailBox'); if (!box) return;
  try {
    const r = await api('GET', '/google/gmail');
    box.innerHTML = `<div class="card-head"><h2>Postfach</h2><span class="chip">${r.total} ungelesen</span></div>` + (r.messages.length ? r.messages.map(m => `<div class="item"><div class="grow"><a href="${esc(m.url)}" target="_blank" rel="noopener"><b>${esc(m.subject)}</b></a><div class="small muted">${esc(m.from)}</div></div></div>`).join('') : '<p class="empty">Nichts Neues.</p>');
  } catch (e) { box.innerHTML = `<div class="card-head"><h2>Postfach</h2></div><p class="small due-bad">${esc(e.message)}</p>`; }
}
function googleSubjectCard(k) {  // Karte im Fach
  if (!gOn()) return '';
  const s = subj(k);
  if (!s.gdoc) return `<div class="card"><div class="card-head"><h2>Google Docs</h2></div><p class="small muted" style="margin-bottom:8px">Lege eine Mitschrift als Google Doc an. Die App erstellt den Ordner „Lernhafen / ${esc(k)}“ in deinem Drive von selbst.</p>
    <div class="row"><button class="btn primary" data-g="subnew" data-k="${esc(k)}">Mitschrift in Google anlegen</button><button class="btn" data-g="pick" data-k="${esc(k)}">Vorhandenes wählen</button></div></div>`;
  return `<div class="card"><div class="card-head"><h2>Google Docs</h2></div><div class="row"><a class="btn primary" href="${esc(s.gdoc.url)}" target="_blank" rel="noopener">Dokument öffnen</a><button class="btn" data-g="tail" data-k="${esc(k)}">Letzte Einträge</button>${s.gfolder ? `<a class="btn" href="${esc(s.gfolder.url)}" target="_blank" rel="noopener">Drive-Ordner</a>` : ''}<button class="btn ghost" data-g="unlink" data-k="${esc(k)}">Lösen</button></div></div>`;
}
async function googleSubjectCreate(k) {
  toast('Lege in Google an …');
  try {
    const r = await api('POST', '/google/subject', { subject: k });
    const s = S.subjects[k] = Object.assign(subj(k), S.subjects[k] || {});
    s.gdoc = { id: r.doc.id, url: r.doc.url, name: r.doc.name }; s.gfolder = { id: r.folderId, url: r.folderUrl };
    save(); render(); toast('Google Doc angelegt');
  } catch (e) { toast(e.message); }
}
async function googleTail(k) {
  const s = subj(k); showSheet('Letzte Einträge', '<p class="empty">Lade …</p>');
  try {
    const t = await api('GET', '/google/doc/' + s.gdoc.id + '/tail');
    $('#sbody').innerHTML = (t.paragraphs.length ? t.paragraphs.map(p => p.heading ? `<h3 style="margin-top:12px">${esc(p.text)}</h3>` : `<p>${esc(p.text) || '&nbsp;'}</p>`).join('') : '<p class="empty">Das Dokument ist noch leer.</p>') + `<div class="row end"><a class="btn primary" href="${esc(t.url)}" target="_blank" rel="noopener">In Google öffnen</a><button class="btn ghost" data-act="fclose">Schließen</button></div>`;
  } catch (e) { $('#sbody').innerHTML = `<p class="due-bad">${esc(e.message)}</p>`; }
}

/* ---------- Dokument oder Ordner aus Drive wählen ---------- */
async function drivePick(k, parent, trail) {
  trail = trail || [{ id: 'root', name: 'Mein Drive' }]; parent = parent || 'root';
  showSheet('Aus Drive wählen', '<p class="empty">Lade …</p>');
  try {
    const r = await api('GET', '/google/drive?parent=' + encodeURIComponent(parent));
    window.__pick = { k, trail };
    $('#sbody').innerHTML = `<p class="small muted">${trail.map(t => esc(t.name)).join(' › ')}</p>
      <div style="margin:8px 0">${r.files.filter(f => f.folder || f.mimeType === 'application/vnd.google-apps.document').map(f => `<div class="doc"><span class="ft">${f.folder ? 'Ordner' : 'Doc'}</span><span class="grow">${esc(f.name)}</span>${f.folder ? `<button class="btn sm" data-g="into" data-id="${esc(f.id)}" data-n="${esc(f.name)}">Öffnen</button>` : `<button class="btn sm primary" data-g="choose" data-id="${esc(f.id)}" data-n="${esc(f.name)}" data-u="${esc(f.url)}">Wählen</button>`}</div>`).join('') || '<p class="empty">Hier liegt nichts, was passt.</p>'}</div>
      <div class="row end">${trail.length > 1 ? '<button class="btn" data-g="up">Zurück</button>' : ''}${trail.length > 1 ? `<button class="btn" data-g="folder" data-id="${esc(parent)}" data-n="${esc(trail[trail.length - 1].name)}">Diesen Ordner für Scans nutzen</button>` : ''}<button class="btn ghost" data-act="fclose">Abbrechen</button></div>`;
  } catch (e) { $('#sbody').innerHTML = `<p class="due-bad">${esc(e.message)}</p>`; }
}

/* ---------- In Drive ablegen (einzelne Scans und Dateien) ---------- */
async function driveSave(kind, id, subject) {
  toast('Lade zu Drive hoch …');
  try { await api('POST', '/google/drive/upload', { kind, id, subject }); toast('In Drive abgelegt'); } catch (e) { toast(e.message); }
}

/* ---------- Klicks ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-g]'); if (!b || !S) return;
  const a = b.dataset.g, k = b.dataset.k;
  if (a === 'open') googleSheet();
  else if (a === 'cals') googleCals();
  else if (a === 'mailq') googleMailq();
  else if (a === 'reconnect') { GS = Object.assign({}, GS, { connected: false }); googleSheet(); }
  else if (a === 'disconnect') { try { GS = await api('DELETE', '/google'); CAL = await api('GET', '/calendars'); closeModal(); render(); toast('Google getrennt'); } catch (er) { toast(er.message); } }
  else if (a === 'subnew') googleSubjectCreate(k);
  else if (a === 'tail') googleTail(k);
  else if (a === 'pick') drivePick(k);
  else if (a === 'unlink') { const s = S.subjects[k]; if (s) { delete s.gdoc; delete s.gfolder; save(); render(); } }
  else if (a === 'into') { const p = window.__pick; drivePick(p.k, b.dataset.id, p.trail.concat({ id: b.dataset.id, name: b.dataset.n })); }
  else if (a === 'up') { const p = window.__pick, t = p.trail.slice(0, -1); drivePick(p.k, t[t.length - 1].id, t); }
  else if (a === 'choose') { const s = S.subjects[window.__pick.k] = Object.assign(subj(window.__pick.k), S.subjects[window.__pick.k] || {}); s.gdoc = { id: b.dataset.id, url: b.dataset.u, name: b.dataset.n }; save(); closeModal(); render(); toast('Dokument verknüpft'); }
  else if (a === 'folder') { const s = S.subjects[window.__pick.k] = Object.assign(subj(window.__pick.k), S.subjects[window.__pick.k] || {}); s.gfolder = { id: b.dataset.id, url: 'https://drive.google.com/drive/folders/' + b.dataset.id }; save(); closeModal(); render(); toast('Ordner verknüpft'); }
  else if (a === 'dsave') driveSave(b.dataset.kind, b.dataset.id, k);
});
document.addEventListener('change', async e => {
  const t = e.target; if (!t.dataset || !t.dataset.g) return;
  try {
    if (t.dataset.g === 'auto') GS = await api('PUT', '/google/autoupload', { enabled: t.checked });
    else if (t.dataset.g === 'push') { GS = await api('PUT', '/google/push', { enabled: t.checked }); toast(t.checked ? 'Termine werden übertragen' : 'Übertragung aus'); }
  } catch (er) { toast(er.message); t.checked = !t.checked; }
});
