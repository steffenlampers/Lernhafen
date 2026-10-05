'use strict';
/* Lernhafen – eingebaute Editoren: Text (wie Word), Tabelle (wie Excel), Folien (wie PowerPoint), dazu PDF- und Bildansicht.
   Alles läuft in der App, gespeichert wird von selbst als echte .docx / .xlsx / .pptx. */
let ED = null;     // { id, kind, dirty, save(), timer }

function loadOnce(tag, attr, url) {
  return new Promise((ok, fail) => {
    if (document.querySelector(`${tag}[${attr}="${url}"]`)) return ok();
    const el = document.createElement(tag); el.setAttribute(attr, url);
    if (tag === 'link') el.rel = 'stylesheet'; el.onload = () => ok(); el.onerror = () => fail(new Error('Der Editor konnte nicht geladen werden.'));
    document.head.append(el);
  });
}
const loadQuill = async () => { if (window.Quill) return; await loadOnce('link', 'href', '/vendor/quill/quill.snow.css'); await loadOnce('script', 'src', '/vendor/quill/quill.js'); };
const loadCalc = () => window.SheetCalc ? Promise.resolve() : loadOnce('script', 'src', 'js/sheetcalc.js');

function edStatus(t, bad) { const s = $('#estat'); if (s) { s.textContent = t; s.className = 'small ' + (bad ? 'due-bad' : 'muted'); } }
function edDirty() {
  if (!ED) return; ED.dirty = true; edStatus('Nicht gespeichert …');
  clearTimeout(ED.timer); ED.timer = setTimeout(edSave, 1500);
}
async function edSave() {
  if (!ED || !ED.dirty || ED.saving) return;
  ED.saving = true; clearTimeout(ED.timer); edStatus('Speichert …');
  const mine = ED; ED.dirty = false;
  try { await ED.save(); if (ED === mine) edStatus(mine.dirty ? 'Nicht gespeichert …' : 'Gespeichert'); }
  catch (e) { mine.dirty = true; edStatus('Speichern fehlgeschlagen: ' + e.message, true); }
  finally { mine.saving = false; if (mine.dirty && ED === mine) mine.timer = setTimeout(edSave, 3000); }
}
function edOpen(f, note) {
  $('#etitle').textContent = f.name; $('#edl').href = `/api/files/${f.id}/download`;
  $('#enote').textContent = note || ''; $('#enote').hidden = !note; $('#estat').textContent = '';
  $('#editor').hidden = false; document.body.style.overflow = 'hidden';
  const old = $('#ebody'), fresh = old.cloneNode(false); old.replaceWith(fresh);   // frische Fläche, damit keine alten Ereignisse hängen bleiben
  return fresh;
}
async function closeEditor() {
  if (!$('#editor') || $('#editor').hidden) return;
  if (ED && ED.dirty) { for (let i = 0; i < 20 && ED.dirty; i++) { await edSave(); if (ED.saving) await new Promise(r => setTimeout(r, 200)); } }
  if (ED && ED.dirty && !confirm('Die letzten Änderungen konnten nicht gespeichert werden. Trotzdem schließen?')) return;
  if (ED) clearTimeout(ED.timer);
  ED = null; $('#editor').hidden = true; $('#ebody').innerHTML = ''; document.body.style.overflow = '';
  try { FILES = (await api('GET', '/files')).files; } catch (e) { /* offline */ }
  render();
}
const ORIG_NOTE = 'Diese Datei stammt nicht aus Lernhafen. Beim Speichern wird sie vereinfacht (Bilder und besondere Layouts gehen verloren). Das Original bleibt als „(Original)“ erhalten.';

/* ---------- Text ---------- */
async function textEditor(f) {
  const body = edOpen(f, ''); body.innerHTML = '<p class="empty" style="padding:20px">Lade …</p>';
  try {
    const [d] = await Promise.all([api('GET', '/editor/doc/' + f.id), loadQuill()]);
    $('#enote').textContent = d.ours ? '' : ORIG_NOTE; $('#enote').hidden = d.ours;
    body.innerHTML = '<div id="qtool"></div><div id="qedit"></div>';
    $('#qtool').innerHTML = `<span class="ql-formats"><select class="ql-header"><option value="1">Überschrift 1</option><option value="2">Überschrift 2</option><option value="3">Überschrift 3</option><option selected>Text</option></select></span>
      <span class="ql-formats"><button class="ql-bold" aria-label="Fett"></button><button class="ql-italic" aria-label="Kursiv"></button><button class="ql-underline" aria-label="Unterstrichen"></button><button class="ql-strike" aria-label="Durchgestrichen"></button></span>
      <span class="ql-formats"><button class="ql-list" value="ordered" aria-label="Nummerierung"></button><button class="ql-list" value="bullet" aria-label="Aufzählung"></button></span>
      <span class="ql-formats"><button class="ql-link" aria-label="Link"></button><button class="ql-clean" aria-label="Formatierung entfernen"></button><button type="button" id="qtable" aria-label="Tabelle einfügen" style="width:auto;padding:0 6px">Tabelle</button></span>`;
    const q = new Quill('#qedit', { theme: 'snow', modules: { toolbar: '#qtool', table: true }, placeholder: 'Hier schreiben …' });
    q.clipboard.dangerouslyPasteHTML(d.html || '', 'silent'); q.history.clear();
    $('#qtable').onclick = () => { try { q.getModule('table').insertTable(3, 3); } catch (e) { toast('Tabellen sind hier nicht verfügbar.'); } };
    ED = { id: f.id, kind: 'doc', dirty: false, save: async () => { await api('PUT', '/editor/doc/' + f.id, { html: q.getSemanticHTML() }); } };
    q.on('text-change', (_d, _o, src) => { if (src === 'user') edDirty(); });
    edStatus('Gespeichert'); q.focus();
  } catch (e) { body.innerHTML = `<p class="alert" style="margin:16px">${esc(e.message)}</p>`; }
}

/* ---------- Tabelle ---------- */
async function sheetEditor(f) {
  const body = edOpen(f, ''); body.innerHTML = '<p class="empty" style="padding:20px">Lade …</p>';
  try {
    const [d] = await Promise.all([api('GET', '/editor/sheet/' + f.id), loadCalc()]);
    const C = window.SheetCalc, sheets = d.sheets; let cur = 0, calc = null;
    $('#enote').textContent = d.ours ? (d.truncated ? 'Sehr große Tabelle: nur der erste Teil wird gezeigt und gespeichert.' : '') : ORIG_NOTE + (d.truncated ? ' Sehr große Tabelle: nur der erste Teil.' : '');
    $('#enote').hidden = !$('#enote').textContent;
    const raw = (r, c) => { const v = (sheets[cur].data[r] || [])[c]; return v == null ? '' : v; };
    const dims = () => { const s = sheets[cur]; let cols = Math.max(8, s.cols || 0), rows = Math.max(24, s.rows || 0); s.data.forEach((row, r) => { if (row.some(v => v !== '' && v != null)) rows = Math.max(rows, r + 6); cols = Math.max(cols, row.length + 2); }); return [Math.min(rows, 2000), Math.min(cols, 52)]; };
    const paintValues = () => {
      calc = C.createCalc(raw);
      body.querySelectorAll('input[data-r]').forEach(inp => {
        if (document.activeElement === inp) return;
        const r = +inp.dataset.r, c = +inp.dataset.c, v = raw(r, c);
        if (typeof v === 'string' && v[0] === '=') { const s = calc.show(r, c); inp.value = s.text; inp.classList.toggle('err', !!s.error); inp.classList.add('fx'); inp.classList.toggle('num', !!s.num); }
        else { inp.value = String(v); inp.classList.remove('err', 'fx'); inp.classList.toggle('num', typeof v === 'number' || /^-?\d+([.,]\d+)?$/.test(String(v))); }
      });
    };
    const draw = () => {
      const [R, K] = dims(), s = sheets[cur];
      let h = `<div class="stabs">${sheets.map((x, i) => `<button class="btn sm ${i === cur ? 'primary' : ''}" data-s="tab" data-i="${i}">${esc(x.name)}</button>`).join('')}${sheets.length < 8 ? '<button class="btn sm ghost" data-s="addsheet">+ Blatt</button>' : ''}<span class="grow"></span><button class="btn sm ghost" data-s="addrow">+ Zeile</button><button class="btn sm ghost" data-s="addcol">+ Spalte</button>${sheets.length > 1 ? '<button class="btn sm ghost" data-s="delsheet">Blatt löschen</button>' : ''}</div>`;
      h += '<div class="sgrid"><table><thead><tr><th></th>' + Array.from({ length: K }, (_, c) => `<th>${C.colName(c)}</th>`).join('') + '</tr></thead><tbody>';
      for (let r = 0; r < R; r++) { h += `<tr><th>${r + 1}</th>` + Array.from({ length: K }, (_, c) => `<td><input data-r="${r}" data-c="${c}" autocomplete="off" aria-label="${C.colName(c)}${r + 1}"></td>`).join('') + '</tr>'; }
      body.innerHTML = h + '</tbody></table></div>'; paintValues();
    };
    ED = { id: f.id, kind: 'sheet', dirty: false, save: async () => { await api('PUT', '/editor/sheet/' + f.id, { sheets }); } };
    body.addEventListener('focusin', e => { const i = e.target; if (i.dataset && i.dataset.r != null) { i.value = String(raw(+i.dataset.r, +i.dataset.c)); i.classList.remove('err'); i.select(); } });
    body.addEventListener('focusout', e => {
      const i = e.target; if (!i.dataset || i.dataset.r == null) return;
      const r = +i.dataset.r, c = +i.dataset.c, s = sheets[cur], old = String(raw(r, c)), v = C.normalize(i.value);
      if (v !== old) { while (s.data.length <= r) s.data.push([]); const row = s.data[r]; while (row.length <= c) row.push(''); row[c] = v; edDirty(); }
      setTimeout(paintValues, 0);
    });
    body.onkeydown = e => {
      const i = e.target; if (!i.dataset || i.dataset.r == null) return;
      const mv = (dr, dc) => { const n = body.querySelector(`input[data-r="${+i.dataset.r + dr}"][data-c="${+i.dataset.c + dc}"]`); if (n) { e.preventDefault(); n.focus(); } };
      if (e.key === 'Enter') mv(e.shiftKey ? -1 : 1, 0); else if (e.key === 'ArrowDown') mv(1, 0); else if (e.key === 'ArrowUp') mv(-1, 0);
      else if (e.key === 'Escape') { i.value = String(raw(+i.dataset.r, +i.dataset.c)); i.blur(); e.stopPropagation(); }
    };
    body.onclick = e => {
      const b = e.target.closest('[data-s]'); if (!b) return; const a = b.dataset.s, s = sheets[cur];
      if (a === 'tab') { cur = +b.dataset.i; draw(); }
      else if (a === 'addsheet') { sheets.push({ name: 'Tabelle' + (sheets.length + 1), data: [] }); cur = sheets.length - 1; edDirty(); draw(); }
      else if (a === 'delsheet') { if (!confirm('Dieses Blatt löschen?')) return; sheets.splice(cur, 1); cur = 0; edDirty(); draw(); }
      else if (a === 'addrow') { s.rows = dims()[0] + 10; draw(); }
      else if (a === 'addcol') { s.cols = dims()[1] + 4; draw(); }
    };
    draw(); edStatus('Gespeichert');
  } catch (e) { body.innerHTML = `<p class="alert" style="margin:16px">${esc(e.message)}</p>`; }
}

/* ---------- Folien ---------- */
async function slidesEditor(f) {
  const body = edOpen(f, ''); body.innerHTML = '<p class="empty" style="padding:20px">Lade …</p>';
  try {
    const d = await api('GET', '/editor/slides/' + f.id), slides = d.slides; let cur = 0;
    $('#enote').textContent = d.ours ? '' : 'Diese Präsentation stammt nicht aus Lernhafen. Beim Speichern bleiben nur Titel und Text je Folie, im einfachen Layout. Das Original bleibt als „(Original)“ erhalten.'; $('#enote').hidden = d.ours;
    const draw = () => {
      const s = slides[cur];
      body.innerHTML = `<div class="slides"><div class="sl-list">${slides.map((x, i) => `<button class="sl-thumb ${i === cur ? 'on' : ''}" data-s="pick" data-i="${i}"><span class="num">${i + 1}</span><b>${esc((x.title || 'Ohne Titel').slice(0, 40))}</b></button>`).join('')}<button class="btn sm" data-s="add">+ Folie</button></div>
        <div class="sl-edit"><div class="sl-page"><input id="slt" class="sl-title" placeholder="Titel" maxlength="300" value="${esc(s.title)}"><textarea id="slb" class="sl-body" placeholder="Ein Punkt pro Zeile">${esc(s.body)}</textarea></div>
        <div class="row"><button class="btn sm" data-s="up" ${cur ? '' : 'disabled'}>Nach vorn</button><button class="btn sm" data-s="down" ${cur < slides.length - 1 ? '' : 'disabled'}>Nach hinten</button><button class="btn sm danger" data-s="del" ${slides.length > 1 ? '' : 'disabled'}>Folie löschen</button></div></div></div>`;
      $('#slt').oninput = e => { s.title = e.target.value; const t = body.querySelector('.sl-thumb.on b'); if (t) t.textContent = (s.title || 'Ohne Titel').slice(0, 40); edDirty(); };
      $('#slb').oninput = e => { s.body = e.target.value; edDirty(); };
    };
    body.onclick = e => {
      const b = e.target.closest('[data-s]'); if (!b) return; const a = b.dataset.s;
      if (a === 'pick') cur = +b.dataset.i;
      else if (a === 'add') { slides.splice(cur + 1, 0, { title: '', body: '' }); cur++; edDirty(); }
      else if (a === 'del') { slides.splice(cur, 1); cur = Math.max(0, cur - 1); edDirty(); }
      else if (a === 'up' && cur) { [slides[cur - 1], slides[cur]] = [slides[cur], slides[cur - 1]]; cur--; edDirty(); }
      else if (a === 'down' && cur < slides.length - 1) { [slides[cur + 1], slides[cur]] = [slides[cur], slides[cur + 1]]; cur++; edDirty(); }
      draw();
    };
    ED = { id: f.id, kind: 'slides', dirty: false, save: async () => { await api('PUT', '/editor/slides/' + f.id, { slides }); } };
    draw(); edStatus('Gespeichert');
  } catch (e) { body.innerHTML = `<p class="alert" style="margin:16px">${esc(e.message)}</p>`; }
}

/* ---------- Ansicht (nur lesen) ---------- */
function viewFile(f) {
  const body = edOpen(f, ''); const u = `/api/files/${f.id}/download`;
  body.innerHTML = f.kind === 'bild' ? `<img class="eimg" src="${u}" alt="${esc(f.name)}">` : `<iframe class="eframe" src="${u}" title="${esc(f.name)}"></iframe>`;
  ED = null;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#editor') && !$('#editor').hidden && !(document.activeElement && document.activeElement.dataset && document.activeElement.dataset.r != null)) closeEditor(); });
window.addEventListener('beforeunload', e => { if (ED && ED.dirty) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.hidden && ED && ED.dirty) edSave(); });
