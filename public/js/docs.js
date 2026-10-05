'use strict';
/* Lernhafen – Dokumente: Word, Excel und PowerPoint im Browser, PDF-Ansicht, Schnell-Hinzufügen, Abgleich mit Google Drive. */
let OFFICE = { enabled: false, ok: false, message: '' };
async function loadOffice() { try { OFFICE = await api('GET', '/office/status'); } catch (e) { OFFICE = { enabled: false, ok: false, message: '' }; } }

const KIND_LABEL = { text: 'Text', tabelle: 'Tabelle', praesentation: 'Folien', pdf: 'PDF', bild: 'Bild', datei: 'Datei' };
function docRow(f) {
  return `<div class="item"><div class="grow"><button class="linkbtn" data-d="open" data-id="${f.id}"><b>${esc(f.name)}</b></button><div class="small muted"><span class="ft">${KIND_LABEL[f.kind] || 'Datei'}</span> ${sizeText(f.size)}</div></div>
    ${gOn() ? `<button class="icon-btn" data-g="dsave" data-kind="file" data-id="${f.id}" data-k="${esc(f.subject || '')}">In Drive</button>` : ''}<button class="icon-btn" data-act="filedel" data-id="${f.id}">Löschen</button></div>`;
}
function docsCard(k) {
  const files = FILES.filter(f => f.subject === k);
  const mk = (kind, label) => `<button class="btn ${kind === 'dokument' ? 'primary' : ''}" data-d="new" data-kind="${kind}" data-k="${esc(k)}">${label}</button>`;
  return `<div class="card"><div class="card-head"><h2>Dokumente</h2></div>
    <div class="row">${OFFICE.ok ? mk('dokument', 'Neues Dokument') + mk('tabelle', 'Neue Tabelle') + mk('praesentation', 'Neue Präsentation') : '<button class="btn" data-d="hint">Word, Excel &amp; Co. aktivieren</button>'}
      <label class="btn" style="cursor:pointer">Datei hinzufügen<input type="file" id="fileUp" data-k="${esc(k)}" multiple hidden></label></div>
    <div style="margin-top:10px">${files.map(docRow).join('') || '<p class="empty">Noch keine Dokumente. Lege eines an oder lade Skripte und Folien hoch.</p>'}</div></div>`;
}

/* ---------- Vollbild-Fenster: Editor oder Ansicht ---------- */
let editing = null;
function showEditor(f, url, kind) {
  editing = f.id;
  $('#etitle').textContent = f.name;
  $('#edl').href = `/api/files/${f.id}/download`;
  $('#eframe').hidden = kind === 'bild'; $('#eimg').hidden = kind !== 'bild';
  if (kind === 'bild') $('#eimg').src = url; else $('#eframe').src = url;
  $('#editor').hidden = false; document.body.style.overflow = 'hidden';
}
async function closeEditor() {
  if (!editing) return;
  editing = null; $('#editor').hidden = true; $('#eframe').src = 'about:blank'; $('#eimg').removeAttribute('src'); document.body.style.overflow = '';
  try { FILES = (await api('GET', '/files')).files; } catch (e) { /* offline */ }
  render();
}
async function openDoc(id) {
  const f = FILES.find(x => x.id === id); if (!f) return;
  if (f.editable) {
    if (!OFFICE.ok) { officeHint(); return; }
    try { const r = await api('POST', '/office/open', { id }); showEditor(f, r.url, f.kind); }
    catch (e) { toast(e.message); }
  } else if (f.kind === 'pdf') showEditor(f, `/api/files/${id}/download`, 'pdf');
  else if (f.kind === 'bild') showEditor(f, `/api/files/${id}/download`, 'bild');
  else window.open(`/api/files/${id}/download`, '_blank', 'noopener');
}
async function newDoc(kind, k) {
  const names = { dokument: 'Neues Dokument', tabelle: 'Neue Tabelle', praesentation: 'Neue Präsentation' };
  modal(names[kind], F('Name', 'name', k ? `${k} – ${names[kind].split(' ')[1]}` : names[kind], 'text', 'required maxlength="80"'), async d => {
    try { const f = await api('POST', '/library/new', { kind, subject: k, name: d.name }); FILES = (await api('GET', '/files')).files; render(); setTimeout(() => openDoc(f.id), 50); }
    catch (e) { toast(e.message); }
  });
}
function officeHint() {
  showSheet('Word, Excel & PowerPoint im Browser', `<p>Mit dem eingebauten Office bearbeitest du Dokumente, Tabellen und Präsentationen direkt hier. Du musst dafür nirgends hin wechseln. Alle Dateien bleiben als normale Dateien auf deinem NAS.</p>
    <p class="small muted" style="margin:10px 0">Das Office ist ein zweiter Baustein (Collabora Online). Du aktivierst ihn einmal auf dem NAS, die Anleitung steht in der README unter „Office im Browser“. Kurzfassung per SSH im Ordner mit der Compose-Datei:</p>
    <pre class="ocrtext" style="max-height:none">sh update.sh docker-compose.office.yml</pre>
    ${OFFICE.enabled && OFFICE.message ? `<p class="small due-bad">${esc(OFFICE.message)}</p>` : ''}
    <div class="row end"><button class="btn ghost" data-act="fclose">Schließen</button></div>`);
}

/* ---------- Plus-Knopf: alles an einer Stelle ---------- */
function fabSheet() {
  const k = GUESS(), ks = subjectKeys();
  showSheet('Hinzufügen', `<label class="field"><span>${esc(P.terms.subject)}</span><select id="fabSub">${`<option value="">Kein ${esc(P.terms.subject)}</option>` + ks.map(x => `<option value="${esc(x)}" ${x === k ? 'selected' : ''}>${esc(subName(x))}</option>`).join('')}</select></label>
    <div class="stack">
      <button class="btn primary" data-d="fab" data-w="scan" style="min-height:52px;justify-content:center">Seite scannen</button>
      <button class="btn" data-d="fab" data-w="note" style="min-height:52px;justify-content:center">Mitschrift schreiben</button>
      ${OFFICE.ok ? '<button class="btn" data-d="fab" data-w="dokument" style="min-height:52px;justify-content:center">Neues Dokument</button><div class="row" style="flex-wrap:nowrap"><button class="btn" data-d="fab" data-w="tabelle" style="flex:1;min-height:52px;justify-content:center">Tabelle</button><button class="btn" data-d="fab" data-w="praesentation" style="flex:1;min-height:52px;justify-content:center">Präsentation</button></div>' : ''}
      <label class="btn" style="cursor:pointer;min-height:52px;justify-content:center">Datei hochladen<input type="file" id="fabFile" multiple hidden></label>
      <button class="btn" data-d="fab" data-w="card" style="min-height:52px;justify-content:center">Karteikarte</button>
    </div>
    <div class="row end"><button class="btn ghost" data-act="fclose">Abbrechen</button></div>`);
  $('#fabFile').onchange = e => { const sub = $('#fabSub').value; closeModal(); uploadFiles([...e.target.files], sub); };
}
function fabDo(w) {
  const k = ($('#fabSub') || {}).value || ''; closeModal();
  if (w === 'scan') scanSheet(k); else if (w === 'note') { if (k) noteModal(k, null); else toast('Wähle zuerst ein ' + P.terms.subject + '.'); }
  else if (w === 'card') cardModal(null, k); else newDoc(w, k);
}

/* ---------- Abgleich mit Google Drive über das NAS ---------- */
function syncSheet() {
  showSheet('Mit Google Drive abgleichen', `<p>Alle Dokumente, Tabellen, Präsentationen und Scans liegen als <b>ganz normale Dateien</b> im Ordner <code>library</code> deines Datenordners, mit einem Unterordner pro ${esc(P.terms.subject)}. Dein NAS kann diesen Ordner selbst mit Google Drive abgleichen. Dafür richtest du bei Google nichts ein, du meldest dich nur einmal an.</p>
    <p style="margin-top:10px"><b>QNAP:</b></p>
    <ol class="small" style="padding-left:1.2em;margin:4px 0;display:flex;flex-direction:column;gap:4px">
      <li>Öffne die App <b>Hybrid Backup Sync</b> → <b>Sync</b> → <b>Erstellen</b>.</li>
      <li>Wähle <b>Einseitige Synchronisierung</b> (NAS → Drive, am sichersten) oder <b>Zwei-Wege-Sync</b>.</li>
      <li>Als Ziel <b>Google Drive</b> wählen und mit deinem Google-Konto anmelden.</li>
      <li>Als Quelle den Ordner <code>/Container/lernhafen/data/library</code> wählen, als Ziel einen Ordner in Drive, zum Beispiel „Lernhafen“.</li>
      <li>Zeitplan festlegen (zum Beispiel stündlich), fertig.</li></ol>
    <p class="small muted" style="margin-top:8px"><b>Synology:</b> App „Cloud Sync“ mit Google Drive. <b>Sonst:</b> rclone oder Syncthing zeigen auf denselben Ordner. Die Dateien bleiben Word-, Excel- und PowerPoint-Dateien, Google Drive öffnet sie mit „Öffnen mit Google Docs, Tabellen oder Präsentationen“.</p>
    <p class="small muted" style="margin-top:8px">Bearbeite ein Dokument nicht gleichzeitig hier und in Google. Bei Zwei-Wege-Sync entscheidet sonst die jüngere Änderung.</p>
    <div class="row end"><button class="btn ghost" data-act="fclose">Schließen</button></div>`);
}

/* ---------- Klicks ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-d]'); if (!b || !S) return;
  const a = b.dataset.d;
  if (a === 'open') openDoc(b.dataset.id);
  else if (a === 'new') newDoc(b.dataset.kind, b.dataset.k);
  else if (a === 'hint') officeHint();
  else if (a === 'fab') fabDo(b.dataset.w);
  else if (a === 'sync') syncSheet();
  else if (a === 'eclose') closeEditor();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && editing) closeEditor(); });
