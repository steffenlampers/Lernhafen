'use strict';
/* Lernhafen – Sicherung und „Von überall nutzen“. */
const bkSize = n => n > 1048576 ? fnum(n / 1048576) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
async function backupSheet(known) {
  let list = known || []; if (!known) try { list = (await api('GET', '/backup/list')).backups; } catch (e) { /* leer */ }
  showSheet('Sicherung', `<p class="muted">Alles, was du in Lernhafen hast (Mitschriften, Termine, Dateien, Scans, Dokumente), in einer Datei. Jede Nacht legt Lernhafen außerdem selbst eine Sicherung auf dem Server an und behält die letzten 7.</p>
    <div class="stack" style="margin:12px 0">
      <a class="btn primary" href="/api/backup" style="justify-content:center;min-height:48px">Alles herunterladen</a>
      <label class="btn" style="cursor:pointer;justify-content:center;min-height:48px">Sicherung einspielen<input type="file" id="bkFile" accept=".gz,.tgz,application/gzip" hidden></label>
      <button class="btn" data-d="bknow" style="justify-content:center;min-height:48px">Jetzt auf dem Server sichern</button></div>
    <p class="small muted" id="bkmsg" style="min-height:1.4em">${list.length ? 'Automatische Sicherungen auf dem Server: ' + list.map(b => esc(b.name.replace(/^lernhafen-|\.tar\.gz$/g, '')) + ' (' + bkSize(b.size) + ')').join(', ') : 'Noch keine automatische Sicherung vorhanden.'}</p>
    <p class="small muted">Einspielen ersetzt gleichnamige Dateien und ergänzt den Rest. Passwörter und Anmeldedaten (Schulmanager, Google) sind aus Sicherheitsgründen nicht enthalten, du trägst sie nach einem Umzug neu ein. Damit die Sicherung auch einen Plattenausfall überlebt, verweise <code>BACKUP_DIR</code> auf eine andere Platte.</p>
    <details style="margin:8px 0"><summary class="small" style="cursor:pointer;min-height:36px;display:flex;align-items:center">Nur Einstellungen und Termine (kleine Datei)</summary>
      <div class="row"><a class="btn sm" href="/api/export">Herunterladen</a><label class="btn sm" style="cursor:pointer">Einspielen<input type="file" id="importFile" accept=".json,application/json" hidden></label></div></details>
    <div class="row end"><button class="btn ghost" data-act="fclose">Schließen</button></div>`);
}
async function backupRestore(file) {
  const m = $('#bkmsg'); if (!confirm('Sicherung „' + file.name + '“ einspielen? Gleichnamige Dateien werden ersetzt.')) return;
  if (m) m.textContent = 'Spiele ein … das kann bei vielen Scans etwas dauern.';
  try {
    const r = await fetch('/api/backup/restore', { method: 'POST', headers: { 'Content-Type': 'application/gzip' }, body: file });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Einspielen fehlgeschlagen.');
    toast('Eingespielt'); setTimeout(() => location.reload(), 600);
  } catch (e) { if (m) { m.textContent = e.message; m.className = 'small due-bad'; } }
}
function remoteSheet() {
  const here = location.origin;
  showSheet('Von überall nutzen', `<p class="muted">Lernhafen läuft auf deinem NAS oder Rechner. Mit <b>Tailscale</b> erreichst du es von jedem Gerät und jedem Ort, ohne Router-Einstellungen und ohne dass es im Internet offen steht.</p>
    <ol style="padding-left:1.2em;display:flex;flex-direction:column;gap:8px;margin:12px 0">
      <li>Installiere auf dem NAS bzw. Rechner, auf dem Lernhafen läuft, <b>Tailscale</b> und melde dich an (einmalig).</li>
      <li>Installiere Tailscale auf dem Gerät, mit dem du arbeiten willst (Handy, Laptop, Schul-PC), und melde dich mit demselben Konto an.</li>
      <li>Öffne im Browser die Tailscale-Adresse des NAS mit dem Port von Lernhafen, zum Beispiel <code>http://100.x.y.z:8091</code>. Die Adresse zeigt dir die Tailscale-App.</li>
      <li>Am Handy: im Browser-Menü „Zum Startbildschirm hinzufügen“. Dann öffnet sich Lernhafen wie eine App.</li></ol>
    <p class="small muted">Du bist gerade hier: <code>${esc(here)}</code>. Setze unbedingt ein Passwort (<code>APP_PASSWORD</code>), wenn mehrere Personen im Netz sind. Ist das NAS aus oder Tailscale am Gerät nicht aktiv, kommst du nicht an deine Dateien. Darum gibt es die nächtliche Sicherung.</p>
    <div class="row end"><button class="btn ghost" data-act="fclose">Schließen</button></div>`);
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-d]'); if (!b || !S) return;
  if (b.dataset.d === 'backup') backupSheet();
  else if (b.dataset.d === 'remote') remoteSheet();
  else if (b.dataset.d === 'bknow') {
    b.disabled = true; b.textContent = 'Sichere …';
    try { const r = await api('POST', '/backup/now'); backupSheet(r.backups); toast('Gesichert'); } catch (er) { toast(er.message); b.disabled = false; b.textContent = 'Jetzt auf dem Server sichern'; }
  }
});
document.addEventListener('change', e => { if (e.target.id === 'bkFile' && e.target.files[0]) { backupRestore(e.target.files[0]); e.target.value = ''; } });
