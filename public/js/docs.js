'use strict';
/* Lernhafen – Dokumente: Liste, neue Dokumente, Plus-Knopf. Die Editoren stehen in editors.js. */
const KIND_LABEL = { text: 'Text', tabelle: 'Tabelle', praesentation: 'Folien', pdf: 'PDF', bild: 'Bild', datei: 'Datei' };
function docRow(f) {
  return `<div class="item"><div class="grow"><button class="linkbtn" data-d="open" data-id="${f.id}"><b>${esc(f.name)}</b></button><div class="small muted"><span class="ft">${KIND_LABEL[f.kind] || 'Datei'}</span> ${sizeText(f.size)}</div></div>
<button class="icon-btn" data-act="filedel" data-id="${f.id}">Löschen</button></div>`;
}
function docsCard(k) {
  const files = FILES.filter(f => f.subject === k);
  const mk = (kind, label) => `<button class="btn ${kind === 'dokument' ? 'primary' : ''}" data-d="new" data-kind="${kind}" data-k="${esc(k)}">${label}</button>`;
  return `<div class="card"><div class="card-head"><h2>Dokumente</h2></div>
    <div class="row">${mk('dokument', 'Neues Dokument') + mk('tabelle', 'Neue Tabelle') + mk('praesentation', 'Neue Präsentation')}
      <label class="btn" style="cursor:pointer">Datei hinzufügen<input type="file" id="fileUp" data-k="${esc(k)}" multiple hidden></label></div>
    <div style="margin-top:10px">${files.map(docRow).join('') || '<p class="empty">Noch keine Dokumente. Lege eines an oder lade Skripte und Folien hoch.</p>'}</div></div>`;
}

/* ---------- Öffnen ---------- */
async function openDoc(id) {
  const f = FILES.find(x => x.id === id); if (!f) return;
  const ext = (f.name.match(/\.([^.]+)$/) || [])[1];
  if (f.editable) { if (ext === 'docx') textEditor(f); else if (ext === 'xlsx') sheetEditor(f); else slidesEditor(f); }
  else if (f.kind === 'pdf' || f.kind === 'bild') viewFile(f);
  else window.open(`/api/files/${id}/download`, '_blank', 'noopener');
}
async function newDoc(kind, k) {
  const names = { dokument: 'Neues Dokument', tabelle: 'Neue Tabelle', praesentation: 'Neue Präsentation' };
  modal(names[kind], F('Name', 'name', k ? `${k} – ${names[kind].split(' ')[1]}` : names[kind], 'text', 'required maxlength="80"'), async d => {
    try { const f = await api('POST', '/library/new', { kind, subject: k, name: d.name }); FILES = (await api('GET', '/files')).files; render(); setTimeout(() => openDoc(f.id), 50); }
    catch (e) { toast(e.message); }
  });
}
/* ---------- Plus-Knopf: alles an einer Stelle ---------- */
function fabSheet() {
  const k = GUESS(), ks = subjectKeys();
  showSheet('Hinzufügen', `<label class="field"><span>${esc(P.terms.subject)}</span><select id="fabSub">${`<option value="">Kein ${esc(P.terms.subject)}</option>` + ks.map(x => `<option value="${esc(x)}" ${x === k ? 'selected' : ''}>${esc(subName(x))}</option>`).join('')}</select></label>
    <div class="stack">
      <button class="btn primary" data-d="fab" data-w="scan" style="min-height:52px;justify-content:center">Seite scannen</button>
      <button class="btn" data-d="fab" data-w="note" style="min-height:52px;justify-content:center">Mitschrift schreiben</button>
      ${'<button class="btn" data-d="fab" data-w="dokument" style="min-height:52px;justify-content:center">Neues Dokument</button><div class="row" style="flex-wrap:nowrap"><button class="btn" data-d="fab" data-w="tabelle" style="flex:1;min-height:52px;justify-content:center">Tabelle</button><button class="btn" data-d="fab" data-w="praesentation" style="flex:1;min-height:52px;justify-content:center">Präsentation</button></div>'}
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

/* ---------- Klicks ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-d]'); if (!b || !S) return;
  const a = b.dataset.d;
  if (a === 'open') openDoc(b.dataset.id);
  else if (a === 'new') newDoc(b.dataset.kind, b.dataset.k);
  else if (a === 'fab') fabDo(b.dataset.w);
  else if (a === 'eclose') closeEditor();
});
