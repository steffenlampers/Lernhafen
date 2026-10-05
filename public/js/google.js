'use strict';
/* Lernhafen – Google Drive: einmal anmelden, danach gleicht Lernhafen die Bibliothek von selbst ab. */
let GD = null;                                   // Status der Drive-Verbindung
const gdOn = () => !!(GD && GD.connected);
async function loadGdrive() { try { GD = await api('GET', '/gdrive/status'); } catch (e) { GD = null; } }

const gdTime = t => t ? new Date(t).toLocaleString('de-DE', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
function gdLastText() {
  const l = GD && GD.last; if (!l) return 'Noch nicht abgeglichen.';
  if (!l.ok) return 'Letzter Abgleich ' + gdTime(l.time) + ' hatte ein Problem: ' + (l.msg || 'unbekannt');
  const bits = [];
  if (l.up) bits.push(l.up + ' hochgeladen'); if (l.down) bits.push(l.down + ' geladen'); if (l.trashed) bits.push(l.trashed + ' entfernt'); if (l.conflicts) bits.push(l.conflicts + ' Konflikt' + (l.conflicts === 1 ? '' : 'e') + ' (beide Fassungen behalten)');
  return 'Letzter Abgleich ' + gdTime(l.time) + (bits.length ? ': ' + bits.join(', ') : ': alles aktuell');
}
function gdriveRow() {            // Zeile unter „Verbindungen“
  if (!GD || (!GD.available && !GD.connected)) return null;   // ohne hinterlegte Google-App bleibt Drive unsichtbar
  if (gdOn()) return ['Google Drive', esc(GD.email || 'verbunden') + ' · ' + esc(gdLastText()), 'Einstellungen', 'data-g="open"', false];
  return ['Google Drive', 'Alle Dateien automatisch in Drive sichern. Einmal anmelden, fertig.', 'Anmelden', 'data-g="open"', true];
}

let gdTimer = 0;
function gdStop() { clearInterval(gdTimer); gdTimer = 0; }
function googleSheet() {
  gdStop();
  if (!GD) { toast('Der Status von Google Drive konnte nicht geladen werden.'); return; }
  if (gdOn()) return gdManage();
  if (!GD.available) return gdCreds();
  if (GD.pending) return gdCode();
  showSheet('Mit Google Drive verbinden', `<p class="muted">Lernhafen legt in deinem Drive einen Ordner „Lernhafen“ an und gleicht dort alles ab: Dokumente, Tabellen, Präsentationen, Scans und Dateien. Lernhafen sieht <b>nur</b>, was es selbst angelegt hat, nicht den Rest deines Drives.</p>
    <p class="small muted" style="margin-top:8px">Du bekommst gleich einen kurzen Code und gibst ihn bei Google ein. Danach läuft alles von allein.</p>
    <p class="small due-bad" id="gmsg" style="min-height:1.4em">${esc(GD.error || '')}</p>
    <div class="row end"><button class="btn ghost" data-act="fclose">Abbrechen</button><button class="btn primary" data-g="connect">Verbinden</button></div>`);
}
function gdCreds() {
  showSheet('Google-App hinterlegen', `<form id="gf"><p class="muted" style="margin-bottom:10px">In dieser Installation ist noch keine Google-App hinterlegt. Das ist ein einmaliger Schritt für den, der Lernhafen betreibt. Alle anderen melden sich später nur noch mit ihrem Google-Konto an.</p>
    <details style="margin-bottom:12px"><summary style="cursor:pointer;font-weight:600;min-height:40px;display:flex;align-items:center">So bekommst du die Daten (ca. 10 Minuten)</summary>
      <ol class="small" style="padding-left:1.2em;margin:8px 0;display:flex;flex-direction:column;gap:6px">
        <li>Öffne <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">Google Cloud</a> und lege ein Projekt „Lernhafen“ an.</li>
        <li>Schalte die <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener">Google Drive API</a> ein.</li>
        <li>In der <a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noopener">Google Auth Platform</a>: „Extern“ wählen, App-Namen und E-Mail eintragen, dann unter „Zielgruppe“ auf <b>„App veröffentlichen“</b> klicken.</li>
        <li>Unter <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener">Clients</a> einen Client vom Typ <b>„Fernseher und Geräte mit begrenzter Eingabe“</b> erstellen. Client-ID und Schlüssel hier eintragen.</li></ol></details>
    ${F('Client-ID', 'clientId', '', 'text', 'autocomplete="off" placeholder="…apps.googleusercontent.com" required')}
    <label class="field"><span>Client-Schlüssel</span><input type="password" name="clientSecret" autocomplete="off" required></label>
    <p class="small due-bad" id="gmsg" style="min-height:1.4em"></p>
    <div class="row end"><button type="button" class="btn ghost" data-act="fclose">Abbrechen</button><button class="btn primary">Speichern</button></div></form>`);
  $('#gf').onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
    try { GD = await api('PUT', '/gdrive/creds', d); render(); googleSheet(); } catch (er) { $('#gmsg').textContent = er.message; }
  };
}
function gdCode() {
  const p = GD.pending;
  showSheet('Bei Google bestätigen', `<ol style="padding-left:1.2em;display:flex;flex-direction:column;gap:12px">
    <li>Öffne <a href="${esc(p.url)}" target="_blank" rel="noopener"><b>${esc(p.url.replace(/^https?:\/\//, ''))}</b></a> (am Handy oder Computer) und melde dich bei Google an.</li>
    <li>Gib diesen Code ein:<div class="num" style="font-size:1.9rem;font-weight:700;letter-spacing:.12em;margin:8px 0;user-select:all">${esc(p.userCode)}</div></li>
    <li>Erlaube den Zugriff. Dieses Fenster geht dann von allein weiter.</li></ol>
    <p class="small muted" id="gmsg" style="min-height:1.4em">Warte auf Google …</p>
    <div class="row end"><button class="btn ghost" data-g="cancel">Abbrechen</button></div>`);
  gdTimer = setInterval(async () => {
    if (!$('#gmsg')) return gdStop();
    try {
      const r = await api('GET', '/gdrive/poll'); GD = r;
      if (r.state === 'connected') { gdStop(); toast('Mit Google Drive verbunden'); render(); gdManage(); }
      else if (r.state === 'denied' || r.state === 'expired') { gdStop(); $('#gmsg').textContent = r.state === 'denied' ? 'Der Zugriff wurde nicht erlaubt.' : 'Der Code ist abgelaufen. Bitte neu starten.'; $('#gmsg').className = 'small due-bad'; }
    } catch (er) { /* kurz offline, weiter versuchen */ }
  }, 5000);
}
function gdManage() {
  const g = GD;
  showSheet('Google Drive', `<p><b>${esc(g.email || 'Verbunden')}</b> <span class="chip">verbunden</span></p>
    <p class="small muted" style="margin:6px 0 12px" id="gdlast">${esc(gdLastText())}</p>
    <div class="stack">
      <label class="chk"><input type="checkbox" data-g="auto" ${g.auto ? 'checked' : ''}><span><b>Automatisch abgleichen</b><br><span class="small muted">Kurz nach jeder Änderung und regelmäßig im Hintergrund</span></span></label>
      <label class="field"><span>Art des Abgleichs</span><select data-g="mode"><option value="backup" ${g.mode === 'backup' ? 'selected' : ''}>Sichern (empfohlen): Lernhafen → Drive</option><option value="twoway" ${g.mode === 'twoway' ? 'selected' : ''}>In beide Richtungen: Änderungen aus Drive kommen zurück</option></select></label>
    </div>
    <p class="small muted">In Drive findest du alles im Ordner „Lernhafen“, sortiert nach ${esc(P.terms.subject)}. Wer dieselbe Datei hier und in Drive gleichzeitig ändert, behält beide Fassungen.</p>
    <div class="row end" style="margin-top:12px"><button class="btn danger" data-g="disconnect" style="margin-right:auto">Trennen</button><button class="btn ghost" data-act="fclose">Schließen</button><button class="btn primary" data-g="sync">Jetzt abgleichen</button></div>`);
}

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-g]'); if (!b || !S) return;
  const a = b.dataset.g;
  try {
    if (a === 'open') googleSheet();
    else if (a === 'connect') { b.disabled = true; GD = await api('POST', '/gdrive/connect'); gdCode(); }
    else if (a === 'cancel') { gdStop(); await api('DELETE', '/gdrive'); await loadGdrive(); closeModal(); render(); }
    else if (a === 'disconnect') { if (!confirm('Verbindung zu Google Drive trennen? Deine Dateien bleiben hier und in Drive erhalten.')) return; GD = await api('DELETE', '/gdrive'); await loadGdrive(); closeModal(); render(); toast('Getrennt'); }
    else if (a === 'sync') {
      b.disabled = true; b.textContent = 'Gleiche ab …';
      const r = await api('POST', '/gdrive/sync'); GD = r.status; if ($('#gdlast')) { $('#gdlast').textContent = gdLastText(); b.disabled = false; b.textContent = 'Jetzt abgleichen'; }
      FILES = (await api('GET', '/files')).files; render();
    }
  } catch (er) { toast(er.message); b.disabled = false; }
});
document.addEventListener('change', async e => {
  const t = e.target; if (!t.dataset || !(t.dataset.g === 'auto' || t.dataset.g === 'mode')) return;
  try { GD = await api('PUT', '/gdrive/settings', t.dataset.g === 'auto' ? { auto: t.checked } : { mode: t.value }); }
  catch (er) { toast(er.message); if (t.type === 'checkbox') t.checked = !t.checked; }
});

/* ---------- Karte unter „Mehr“: alle Dienste an einer Stelle, nur anmelden ---------- */
function connectionsCard() {
  const src = (P.sources || []), sm = SM && SM.configured, rows = [];
  if (src.includes('schulmanager') || sm) rows.push(['Schulmanager', sm ? (SM.ok ? 'verbunden' : 'Fehler beim letzten Abgleich') : 'nicht verbunden', sm ? 'Einstellungen' : 'Anmelden', 'data-act="smopen"', !sm]);
  const gr = gdriveRow(); if (gr) rows.push(gr);
  rows.push(['Kalender-Link', CAL.calendars.length ? CAL.calendars.length + ' verbunden' : 'z. B. Hochschule, Moodle, Google Kalender', CAL.calendars.length ? 'Ändern' : 'Hinzufügen', 'data-act="calsopen"', false]);
  rows.push(['Wochenplan von Hand', (S.timetable || []).length ? S.timetable.length + ' Einträge' : 'wenn es keine Quelle gibt', 'Bearbeiten', 'data-act="ttopen"', false]);
  return `<div class="card"><div class="card-head"><h2>Verbindungen</h2></div>${rows.map(r => `<div class="item"><div class="grow"><b>${r[0]}</b><div class="small muted">${r[1]}</div></div>${r[2] ? `<button class="btn sm ${r[4] ? 'primary' : ''}" ${r[3]}>${r[2]}</button>` : '<span class="chip">bereit</span>'}</div>`).join('')}</div>`;
}
