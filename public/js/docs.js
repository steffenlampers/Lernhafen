'use strict';
/* Lernhafen – Dokumente: Liste, neue Dokumente, Plus-Knopf. Die Editoren stehen in editors.js. */
const KIND_LABEL = { text: 'Text', tabelle: 'Tabelle', praesentation: 'Folien', pdf: 'PDF', bild: 'Bild', datei: 'Datei' };
function docRow(f, pos) {
  const meta = f.note ? (f.noteDate ? fmtDate(f.noteDate) + ' · ' : '') : `<span class="ft">${KIND_LABEL[f.kind] || 'Datei'}</span> `;
  return `<div class="item"><div class="grow"><button class="linkbtn" data-d="open" data-id="${f.id}"><b>${esc(f.name.replace(/\.docx$/i, ''))}</b></button><div class="small muted">${meta}${sizeText(f.size)}</div></div>
    <button class="icon-btn" data-d="fmenu" data-id="${f.id}" aria-label="Datei bearbeiten">Bearbeiten</button></div>`;
}
const subjectFiles = (k, note) => FILES.filter(f => f.subject === k && !!f.note === note);
function notesCard(k) {
  const l = subjectFiles(k, true).sort((a, b) => (b.noteDate || b.created || '').localeCompare(a.noteDate || a.created || ''));
  return `<div class="card"><div class="card-head"><h2>Mitschriften</h2><button class="btn sm primary" data-act="newnote" data-k="${esc(k)}">Neue Mitschrift</button></div>
    ${l.length ? l.map(docRow).join('') : '<p class="empty">Noch keine Mitschriften. Jede ist ein Dokument, in das du jederzeit zurückkehrst.</p>'}</div>`;
}
function docsCard(k) {
  const files = subjectFiles(k, false);
  const mk = (kind, label) => `<button class="btn ${kind === 'dokument' ? 'primary' : ''}" data-d="new" data-kind="${kind}" data-k="${esc(k)}">${label}</button>`;
  return `<div class="card"><div class="card-head"><h2>Dokumente</h2></div>
    <div class="row">${mk('dokument', 'Neues Dokument') + mk('tabelle', 'Neue Tabelle') + mk('praesentation', 'Neue Präsentation')}
      <label class="btn" style="cursor:pointer">Datei hinzufügen<input type="file" id="fileUp" data-k="${esc(k)}" multiple hidden></label></div>
    <div style="margin-top:10px">${files.map(docRow).join('') || '<p class="empty">Noch keine Dokumente. Lege eines an oder lade Skripte und Folien hoch.</p>'}</div></div>`;
}

/* ---------- Datei bearbeiten: umbenennen, verschieben, umsortieren ---------- */
async function reloadFiles() { FILES = (await api('GET', '/files')).files; }
function fileMenu(id) {
  const f = FILES.find(x => x.id === id); if (!f) return;
  const sibs = FILES.filter(x => x.subject === f.subject && !!x.note === !!f.note), i = sibs.findIndex(x => x.id === id);
  showSheet('Datei bearbeiten', `<form id="ff"><label class="field"><span>Name</span><input name="name" value="${esc(f.name.replace(/\.[^.]+$/, ''))}" maxlength="80" required></label>
    <label class="field"><span>${esc(P.terms.subject)}</span><select name="subject">${subOpts(f.subject)}${f.subject && !subjectKeys().includes(f.subject) ? `<option value="${esc(f.subject)}" selected>${esc(f.subject)}</option>` : ''}</select></label>
    <div class="row" style="margin-bottom:12px"><button type="button" class="btn sm" data-d="fmove" data-id="${id}" data-dir="-1" ${i > 0 ? '' : 'disabled'}>▲ Nach oben</button><button type="button" class="btn sm" data-d="fmove" data-id="${id}" data-dir="1" ${i < sibs.length - 1 ? '' : 'disabled'}>▼ Nach unten</button>
      <a class="btn sm" href="/api/files/${id}/download">Herunterladen</a></div>
    <div class="row end"><button type="button" class="btn danger" data-act="filedel" data-id="${id}" style="margin-right:auto">Löschen</button><button type="button" class="btn ghost" data-act="fclose">Abbrechen</button><button class="btn primary">Speichern</button></div></form>`);
  $('#ff').onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
    try { await api('PATCH', '/files/' + id, { name: d.name, subject: d.subject }); await reloadFiles(); closeModal(); render(); toast('Gespeichert'); } catch (er) { toast(er.message); }
  };
}
async function moveFile(id, dir) {
  const f = FILES.find(x => x.id === id), sibs = FILES.filter(x => x.subject === f.subject && !!x.note === !!f.note), i = sibs.findIndex(x => x.id === id), j = i + dir;
  if (j < 0 || j >= sibs.length) return;
  [sibs[i], sibs[j]] = [sibs[j], sibs[i]];
  const all = FILES.filter(x => x.subject === f.subject), rest = all.filter(x => !!x.note !== !!f.note);
  try { FILES = (await api('POST', '/files/order', { subject: f.subject, ids: sibs.concat(rest).map(x => x.id) })).files; render(); fileMenu(id); } catch (e) { toast(e.message); }
}
async function renameOpen() {
  if (!ED) return; const f = FILES.find(x => x.id === ED.id); if (!f) return;
  const n = prompt('Neuer Name', f.name.replace(/\.[^.]+$/, '')); if (!n || !n.trim()) return;
  try { const r = await api('PATCH', '/files/' + f.id, { name: n }); await reloadFiles(); $('#etitle').textContent = r.name; } catch (e) { toast(e.message); }
}

/* ---------- Neue Mitschrift: ein Dokument im Fach, das sich sofort öffnet ---------- */
async function newNote(k, opt = {}) {
  try {
    const f = await api('POST', '/library/note', { subject: k, title: opt.title || 'Mitschrift', date: opt.date || today(), slot: opt.slot || '', text: opt.text || '' });
    await reloadFiles(); render(); openDoc(f.id);
  } catch (e) { toast(e.message); }
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
  if (w === 'scan') scanSheet(k); else if (w === 'note') { if (k) newNote(k); else toast('Wähle zuerst ein ' + P.terms.subject + '.'); }
  else if (w === 'card') cardModal(null, k); else newDoc(w, k);
}

/* ---------- Klicks ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-d]'); if (!b || !S) return;
  const a = b.dataset.d;
  if (a === 'open') { if (!$('#modal').hidden) closeModal(); openDoc(b.dataset.id); }
  else if (a === 'new') newDoc(b.dataset.kind, b.dataset.k);
  else if (a === 'fab') fabDo(b.dataset.w);
  else if (a === 'fmenu') fileMenu(b.dataset.id);
  else if (a === 'fmove') moveFile(b.dataset.id, +b.dataset.dir);
  else if (a === 'eclose') closeEditor();
});
