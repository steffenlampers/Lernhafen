'use strict';
/* Lernhafen – Einrichtung: Stundenplan-Quellen, Schulmanager, Kalender-Links, Handy-Abo, Assistent, Anmeldung. */
/* Notlösung ohne Zugangsdaten: Lesezeichen-Skript, läuft auf der Schulmanager-Seite */
function bmMain() {
  (async () => {
    try {
      if (!document.querySelector('main table')) { alert('Bitte erst den Stundenplan in Schulmanager öffnen, dann das Lesezeichen anklicken.'); return; }
      const ex = () => {
        const t = document.querySelector('main table'), rows = [...t.querySelectorAll('tr')];
        const days = [...rows[0].children].slice(1).map(h => { const m = h.innerText.match(/(\d\d)\.(\d\d)\.\s*(\d{4})/); return { date: m ? m[3] + '-' + m[2] + '-' + m[1] : null, l: [] }; });
        rows.slice(1).forEach(r => { const n = parseInt(r.children[0].innerText); [...r.children].slice(1).forEach((c, i) => { c.querySelectorAll('.lesson-cell').forEach(lc => { const g = q => (lc.querySelector(q) ? lc.querySelector(q).innerText : '').replace(/\s+/g, ' ').trim(); days[i].l.push([n, g('.timetable-left'), g('.timetable-right'), g('.timetable-bottom'), [...lc.classList].filter(k => k !== 'lesson-cell').join(' ')].join('|')); }); }); });
        return days;
      };
      const days = {}; let from = '', to = '';
      for (let i = 0; i < 6; i++) {
        if (i) { document.querySelector('main .fa-chevron-right').click(); await new Promise(r => setTimeout(r, 2200)); }
        ex().forEach(x => { if (!x.date) return; if (!from) from = x.date; to = x.date; if (x.l.length) days[x.date] = x.l; });
      }
      for (let i = 0; i < 5; i++) document.querySelector('main .fa-chevron-left').click();
      const out = JSON.stringify({ updated: new Date().toISOString(), from, to, source: 'lesezeichen', days });
      const o = document.createElement('div'); o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:grid;place-items:center;padding:16px';
      o.innerHTML = '<div style="background:#fff;color:#111;padding:20px;border-radius:12px;max-width:520px;width:100%;font:15px sans-serif"><b>Stundenplan gelesen.</b><p>Kopiere den Text und füge ihn in der App ein.</p><textarea style="width:100%;height:110px"></textarea><p><button id="lhCp" style="padding:8px 14px">Kopieren</button> <button id="lhX" style="padding:8px 14px">Schließen</button></p></div>';
      document.body.appendChild(o); const ta = o.querySelector('textarea'); ta.value = out; ta.select();
      o.querySelector('#lhCp').onclick = () => { ta.select(); (navigator.clipboard ? navigator.clipboard.writeText(out) : Promise.reject()).catch(() => document.execCommand('copy')); };
      o.querySelector('#lhX').onclick = () => o.remove();
    } catch (e) { alert('Das hat nicht geklappt: ' + e.message); }
  })();
}
const BM_CODE = '(' + bmMain.toString() + ')()';

function smText(st) {
  if (!st) return 'Wird geladen …';
  if (!st.configured) return 'Noch nicht verbunden. Der Stundenplan wird nicht automatisch geholt.';
  const t = st.lastTime ? new Date(st.lastTime) : null, when = t ? `${fmtDate(iso(t))}, ${pad(t.getHours())}:${pad(t.getMinutes())} Uhr` : 'noch nie';
  return `${st.ok ? 'Letzter Abgleich' : 'Letzter Versuch'}: ${when}. ${st.msg || ''}${st.daily ? ` Täglich ab ${pad(CFG.syncHour)}:00 Uhr automatisch.` : ' Kein automatischer Abgleich.'}`;
}
function smCard() {
  const ok = SM && SM.configured;
  return `<div class="card full"><div class="card-head"><h2>Stundenplan automatisch holen</h2><div class="row">${ok ? '<button class="btn sm" data-act="smnow">Jetzt abgleichen</button>' : ''}<button class="btn sm primary" data-act="smopen">${ok ? 'Einstellungen' : 'Schulmanager verbinden'}</button></div></div>
    <p class="small ${ok && !SM.ok ? 'due-bad' : 'muted'}">${esc(smText(SM))}</p></div>`;
}
function importCard() {
  return `<div class="stack">
    <ol class="small" style="margin:0 0 12px;padding-left:1.2em;display:flex;flex-direction:column;gap:6px">
      <li>Ziehe diesen Knopf in deine Lesezeichenleiste: <a class="btn sm" href="${esc('javascript:' + encodeURIComponent(BM_CODE))}" onclick="return false" draggable="true">Plan holen</a> <button class="btn sm ghost" data-act="bmcopy">Oder Code kopieren</button></li>
      <li>Öffne Schulmanager, dann den Stundenplan, und klicke das Lesezeichen. Nach etwa 15 Sekunden erscheint ein Fenster mit Text.</li>
      <li>Kopiere den Text, füge ihn hier ein und klicke auf Übernehmen.</li></ol>
    <div class="row" style="flex-wrap:nowrap"><input type="text" id="planIn" placeholder="Text hier einfügen" aria-label="Plan-Daten"><button class="btn primary" data-act="planimp">Übernehmen</button></div></div>`;
}

function smText(st) {
  if (!st) return 'Wird geladen …';
  if (!st.configured) return 'Noch nicht verbunden. Der Stundenplan wird nicht automatisch geholt.';
  const t = st.lastTime ? new Date(st.lastTime) : null, when = t ? `${fmtDate(iso(t))}, ${pad(t.getHours())}:${pad(t.getMinutes())} Uhr` : 'noch nie';
  return `${st.ok ? 'Letzter Abgleich' : 'Letzter Versuch'}: ${when}. ${st.msg || ''}${st.daily ? ` Täglich ab ${pad(CFG.syncHour)}:00 Uhr automatisch.` : ' Kein automatischer Abgleich.'}`;
}
async function smSheet() {
  try { SM = await api('GET', '/schulmanager'); } catch (e) { /* alter Stand */ }
  const st = SM || {};
  showSheet('Schulmanager verbinden', `<p class="small muted">Dein NAS meldet sich für dich bei Schulmanager an und liest Stundenplan, Ausfälle und Vertretungen. Die Zugangsdaten bleiben in deinem Datenordner auf dem NAS und gehen nur an Schulmanager.</p>
    <label class="field" style="margin-top:12px"><span>E-Mail oder Benutzername</span><input type="text" id="smU" value="${esc(st.user || '')}" autocomplete="username" autocapitalize="off"></label>
    <label class="field"><span>Passwort</span><input type="password" id="smP" autocomplete="current-password" placeholder="${st.configured ? 'gespeichert, leer lassen = unverändert' : ''}"></label>
    <label class="chk"><input type="checkbox" id="smD" ${st.daily || !st.configured ? 'checked' : ''}><span>Täglich ab ${pad(CFG.syncHour)}:00 Uhr automatisch abgleichen</span></label>
    <p class="small" id="smMsg" style="min-height:1.4em">${esc(smText(st))}</p>
    <details style="margin-top:10px"><summary class="small muted" style="cursor:pointer">Ohne Zugangsdaten: Stundenplan von Hand holen</summary><div style="margin-top:8px">${importCard()}</div></details>
    <div class="row end"><button class="btn danger" data-act="smdel" style="margin-right:auto">Zugangsdaten löschen</button><button class="btn" data-act="smnow">Jetzt abgleichen</button><button class="btn primary" data-act="smsave">Speichern und testen</button><button class="btn ghost" data-act="fclose">Schließen</button></div>`);
}
const smMsg = t => { const e = $('#smMsg'); if (e) e.textContent = t; };
async function smSave() {
  try {
    const user = $('#smU').value.trim(), pw = $('#smP').value;
    smMsg('Verbinde …');
    SM = await api('PUT', '/schulmanager', { user, password: pw, daily: $('#smD').checked });
    $('#smP').value = ''; smMsg('Gespeichert. Ich lese jetzt den Stundenplan …');
    await smNow();
  } catch (e) { smMsg(e.message); }
}
async function smNow() {
  smMsg('Lese Stundenplan …'); toast('Stundenplan wird gelesen …');
  try {
    const r = await api('POST', '/sync'); SM = await api('GET', '/schulmanager');
    smMsg((r.ok ? 'Fertig. ' : 'Das hat nicht geklappt. ') + r.msg);
    if (r.ok) { PLAN = (await api('GET', '/plan')).plan; toast(r.msg); }
  } catch (e) { smMsg(e.message); }
  if ($('#modal').hidden || !$('#smMsg')) render();
}
async function importPlan(txt) {
  let o; try { o = JSON.parse(txt.trim()); if (!o || typeof o.days !== 'object') throw 0; } catch (e) { toast('Das sieht nicht nach den Plan-Daten aus.'); return; }
  try { await api('POST', '/plan/import', { plan: o }); PLAN = (await api('GET', '/plan')).plan; toast('Stundenplan übernommen'); render(); } catch (e) { toast(e.message); }
}



/* ---------- Stundenplan-Quellen ---------- */
function plansrcSheet() {
  const src = P.sources || ['ical', 'manual'];
  showSheet('Woher kommt dein Stundenplan?', `<div class="stack">
    ${src.includes('schulmanager') ? `<button class="card stack" data-act="smopen" style="text-align:left;cursor:pointer;font:inherit;color:inherit"><b>Schulmanager Online</b><span class="small muted">Dein Server holt Plan, Ausfälle und Vertretungen jeden Morgen selbst.</span></button>` : ''}
    <button class="card stack" data-g="open" style="text-align:left;cursor:pointer;font:inherit;color:inherit"><b>Google Kalender</b><span class="small muted">Melde dich bei Google an, dann erscheinen deine Kalender in Lernhafen.</span></button>
    <button class="card stack" data-act="calsopen" style="text-align:left;cursor:pointer;font:inherit;color:inherit"><b>Kalender-Link (iCal)</b><span class="small muted">Für Hochschule, Moodle, Google Kalender, Nextcloud und viele Stundenplan-Programme.</span></button>
    <button class="card stack" data-act="ttopen" style="text-align:left;cursor:pointer;font:inherit;color:inherit"><b>Von Hand eintragen</b><span class="small muted">Ein Wochenplan, der sich jede Woche wiederholt.</span></button>
    <div class="row end"><button class="btn ghost" data-act="fclose">Später</button></div></div>`);
}

/* ---------- Kalender-Links ---------- */
function calRow(c, i) {
  const st = CAL.status.find(s => s.id === c.id);
  return `<div class="stack calrow" style="border-top:1px solid var(--line);padding-top:10px;margin-top:10px"><input type="hidden" name="id${i}" value="${esc(c.id)}">
    <label class="field" style="margin:0"><span>Name</span><input type="text" name="name${i}" value="${esc(c.name)}" maxlength="60" placeholder="z. B. Vorlesungen"></label>
    <label class="field" style="margin:0"><span>iCal-Link</span><input type="text" name="url${i}" value="${esc(c.url)}" placeholder="https://… oder webcal://…" autocomplete="off"></label>
    <label class="field" style="margin:0"><span>Verwendung</span><select name="kind${i}"><option value="timetable" ${c.kind !== 'events' ? 'selected' : ''}>Stundenplan (Vorlesungen, Unterricht)</option><option value="events" ${c.kind === 'events' ? 'selected' : ''}>Termine (Fristen, Familie, Moodle)</option></select></label>
    ${st ? `<p class="small ${st.ok === false ? 'due-bad' : 'muted'}">${esc(st.msg)}</p>` : ''}</div>`;
}
function calsSheet() {
  const list = CAL.calendars.length ? CAL.calendars : [{ id: '', name: '', url: '', kind: 'timetable' }];
  showSheet('Kalender-Links', `<p class="small muted">Dein Server ruft die Links täglich ab. Den Link findest du bei Google Kalender unter „Einstellungen → Kalender integrieren → Geheime Adresse im iCal-Format“, bei Moodle unter „Kalender → Kalender exportieren“, bei Hochschul-Systemen meist unter „Kalender abonnieren“. Behandle den Link wie ein Passwort.</p>
    <form id="calf"><div id="calrows">${list.map(calRow).join('')}</div>
    <div class="row end"><button type="button" class="btn sm" id="caladd">Weiteren Kalender hinzufügen</button></div>
    <div class="row end"><button type="button" class="btn ghost" data-act="fclose">Abbrechen</button><button class="btn primary">Speichern und abrufen</button></div><p class="small" id="calmsg" style="min-height:1.4em"></p></form>`);
  let n = list.length;
  $('#caladd').onclick = () => { if (n >= 10) return; $('#calrows').insertAdjacentHTML('beforeend', calRow({ id: '', name: '', url: '', kind: 'timetable' }, n++)); };
  $('#calf').onsubmit = async e => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), out = [];
    for (let i = 0; i < n; i++) if ((f['url' + i] || '').trim()) out.push({ id: f['id' + i], name: f['name' + i], url: f['url' + i], kind: f['kind' + i] });
    try {
      $('#calmsg').textContent = 'Speichere und rufe ab …';
      await api('PUT', '/calendars', { calendars: out });
      CAL = await api('POST', '/calendars/sync');
      const bad = CAL.status.filter(s => s.ok === false);
      if (bad.length) $('#calmsg').textContent = bad.map(s => s.name + ': ' + s.msg).join(' ');
      else { closeModal(); toast('Kalender abgerufen'); }
      render();
    } catch (er) { $('#calmsg').textContent = er.message; }
  };
}

/* ---------- Termine im Handy-Kalender (Abo-Link) ---------- */
async function feedSheet() {
  let f; try { f = await api('GET', '/feed'); } catch (e) { toast(e.message); return; }
  const full = location.origin + f.path;
  showSheet('Termine im Handy-Kalender', `<p class="small muted">Deine Termine erscheinen im Kalender deines Handys, mit Erinnerungen am Vorabend (bei Prüfungen auch einen Tag und eine Woche vorher). Das Abo ist nur lesbar. Änderungen machst du in der App.</p>
    <label class="field" style="margin-top:12px"><span>Abo-Link (geheim, nicht weitergeben)</span><input type="text" id="feedUrl" value="${esc(full)}" readonly></label>
    <div class="row"><button class="btn primary" data-act="feedcopy">Link kopieren</button><button class="btn" data-act="feedrotate">Neuen Link erzeugen</button></div>
    <ul class="small muted" style="margin:12px 0 0;padding-left:1.2em;display:flex;flex-direction:column;gap:4px"><li><b>iPhone:</b> Einstellungen → Kalender → Accounts → Account hinzufügen → Andere → Kalenderabo hinzufügen.</li><li><b>Android und Google Kalender:</b> Im Browser auf calendar.google.com → Weitere Kalender → Per URL hinzufügen.</li><li>Der Link geht nur im selben Netz, solange dein Server nicht von außen erreichbar ist.</li></ul>
    <div class="row end"><button class="btn ghost" data-act="fclose">Schließen</button></div>`);
}

/* ---------- Einrichtungs-Assistent ---------- */
const PROFILE_HINT = { ergotherapie: 'Doppelstunden, Praxisstunden-Zähler, Lernlinks für Medizinberufe', pflege: 'Praxisstunden und Lernlinks für Pflege', 'duale-ausbildung': 'Berufsschule und Betrieb, Berichtsheft', schule: 'Klassenarbeiten, Punkte 0 bis 15', studium: 'Module, ECTS-Punkte, Hochschul-Kalender', allgemein: 'Neutral, für alles andere' };
function setupSheet() {
  showSheet('Willkommen', `<form id="sf"><p class="muted" style="margin-bottom:12px">Zwei Fragen, dann bist du startklar. Alles lässt sich später unter „Mehr“ ändern.</p>
    ${F('Wie soll die App heißen?', 'appName', S.settings.appName || '', 'text', `maxlength="40" placeholder="${esc(CFG.appName)}"`)}
    <label class="field"><span>Was machst du?</span><select name="profile">${CFG.profiles.map(p => `<option value="${p.id}" ${p.id === (S.settings.profile || P.id) ? 'selected' : ''}>${esc(p.name)}${PROFILE_HINT[p.id] ? ' – ' + esc(PROFILE_HINT[p.id]) : ''}</option>`).join('')}</select></label>
    <label class="field"><span>Woher kommt dein Stundenplan?</span><select name="after"><option value="plansrc">Ich wähle gleich</option><option value="">Später</option></select></label>
    <div class="row end"><button class="btn primary">Los geht’s</button></div></form>`);
  $('#sf').onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
    S.settings.appName = d.appName.trim(); S.settings.after = d.after;
    if (d.profile !== P.id || S.settings.profile !== d.profile) S.settings.blocksFor = '';
    S.settings.profile = d.profile;
    try { await api('PUT', '/state', { state: S }); } catch (er) { toast(er.message); return; }
    location.reload();
  };
}

/* ---------- Sicherung ---------- */
async function importBackup(file) {
  try { const txt = await file.text(); await api('POST', '/import', JSON.parse(txt)); toast('Sicherung eingespielt'); setTimeout(() => location.reload(), 600); }
  catch (e) { toast(e.message === 'login' ? '' : (e instanceof SyntaxError ? 'Die Datei ist keine gültige Sicherung.' : e.message)); }
}

/* ---------- Anmeldung ---------- */
function showLogin() {
  $('#main').innerHTML = `<div class="grid one"><form class="card stack" id="lf" style="margin-top:40px"><h2>Anmelden</h2>
    <label class="field"><span>Passwort</span><input type="password" id="lp" autocomplete="current-password" autofocus></label>
    <p class="small due-bad" id="lerr"></p><button class="btn primary">Anmelden</button></form></div>`;
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    try { await api('POST', '/login', { password: $('#lp').value }); location.reload(); }
    catch (er) { $('#lerr').textContent = er.message; }
  };
}

