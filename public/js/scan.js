'use strict';
/* Lernhafen – Scannen, Dateien, Suche. */
/* ---------- Scannen ---------- */
let draft = null;
function scanSheet(preK) {
  const k = preK || GUESS();
  if (!draft) draft = { id: '', thumbs: [], busy: false };
  const ks = subjectKeys();
  showSheet('Scannen', `<p class="small muted">Fotografiere Seite für Seite. Die App dreht, hellt auf, erkennt den Text und legt alles beim richtigen ${esc(P.terms.subject)} ab.</p>
    <div class="row" style="margin:12px 0"><label class="btn primary" style="cursor:pointer">Foto aufnehmen<input type="file" id="scanCam" accept="image/*" capture="environment" hidden></label>
      <label class="btn" style="cursor:pointer">Aus Galerie<input type="file" id="scanPick" accept="image/*" multiple hidden></label></div>
    <div class="thumbs" id="scanThumbs" style="min-height:8px"></div><p class="small" id="scanMsg" style="min-height:1.4em;margin-top:6px"></p>
    <label class="field" style="margin-top:8px"><span>${esc(P.terms.subject)}</span><select id="scanSub">${`<option value="">Kein ${esc(P.terms.subject)}</option>` + ks.map(x => `<option value="${esc(x)}" ${x === k ? 'selected' : ''}>${esc(subName(x))}</option>`).join('')}</select></label>
    <label class="field"><span>Titel</span><input type="text" id="scanTitle" maxlength="120" placeholder="z. B. Handout Plexus brachialis"></label>
    <label class="chk"><input type="checkbox" id="scanNote" checked><span>Als Mitschrift-Eintrag ablegen</span></label>
    <div class="row end"><button class="btn ghost" data-act="scancancel">Abbrechen</button><button class="btn primary" id="scanDone" data-act="scandone" disabled>Fertig und ablegen</button></div>`);
  $('#scanCam').onchange = e => scanUpload([...e.target.files]);
  $('#scanPick').onchange = e => scanUpload([...e.target.files]);
  scanDraw();
}
function scanDraw() {
  const th = $('#scanThumbs'); if (!th || !draft) return;
  th.innerHTML = draft.thumbs.map((u, i) => `<img src="${u}" alt="Seite ${i + 1}">`).join('');
  $('#scanDone').disabled = !draft.thumbs.length || draft.busy;
}
async function scanUpload(files) {
  if (!files.length) return;
  const msg = t => { const m = $('#scanMsg'); if (m) m.textContent = t; };
  draft.busy = true; scanDraw();
  try {
    if (!draft.id) draft.id = (await api('POST', '/scans')).id;
    for (let i = 0; i < files.length; i++) {
      msg(`Seite ${draft.thumbs.length + 1} wird hochgeladen …`);
      const r = await fetch(`/api/scans/${draft.id}/pages`, { method: 'POST', headers: { 'Content-Type': files[i].type || 'application/octet-stream' }, body: files[i] });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Hochladen hat nicht geklappt.');
      draft.thumbs.push(URL.createObjectURL(files[i])); scanDraw();
    }
    msg(`${draft.thumbs.length} Seite${draft.thumbs.length === 1 ? '' : 'n'} bereit. Mit dem Knopf „Foto aufnehmen“ geht es weiter.`);
  } catch (e) { msg(e.message); }
  draft.busy = false; scanDraw();
}
async function scanDone() {
  const sub = $('#scanSub').value, title = $('#scanTitle').value.trim(), asNote = $('#scanNote').checked, id = draft.id, date = today();
  try {
    const s = await api('POST', `/scans/${id}/finish`, { subject: sub, title, date });
    SCANS.push(s);
    if (asNote && sub) notesOf(sub).push({ id: uid(), date, title: s.title, body: '', scans: [id] });
    draft = null; save(); closeModal(); render();
    toast(sub ? `Abgelegt bei ${sub}. Der Text wird erkannt.` : 'Gespeichert. Der Text wird erkannt.');
    pollScans();
  } catch (e) { const m = $('#scanMsg'); if (m) m.textContent = e.message; }
}
async function scanCancel() {
  if (draft && draft.id) { try { await api('DELETE', '/scans/' + draft.id); } catch (e) { /* egal */ } }
  draft = null; closeModal();
}
let pollT = 0;
async function loadScans() { try { SCANS = (await api('GET', '/scans')).scans; } catch (e) { /* offline */ } }
function pollScans() {
  clearTimeout(pollT);
  if (!SCANS.some(s => s.status === 'processing')) return;
  pollT = setTimeout(async () => { await loadScans(); if ($('#modal').hidden) render(); pollScans(); }, 4000);
}
function scanOpen(id) {
  const s = scanById(id); if (!s) return;
  showSheet(s.title, `<div class="thumbs">${Array.from({ length: s.pages }, (_, i) => `<a href="/api/scans/${s.id}/file/p${i + 1}.jpg" target="_blank" rel="noopener"><img src="/api/scans/${s.id}/file/p${i + 1}.jpg" alt="Seite ${i + 1}" loading="lazy"></a>`).join('')}</div>
    <p class="small muted" style="margin:8px 0">${s.subject ? esc(s.subject) + ' · ' : ''}${s.date ? fmtDate(s.date) + ' · ' : ''}${scanBadge(s)}</p>
    ${s.ocr === 'ok' ? '<div class="ocrtext" id="ocrText">Lade Text …</div>' : ''}${s.ocr === 'failed' ? `<p class="small due-bad">${esc(s.error || '')}</p>` : ''}
    <div class="row end"><button class="btn danger" data-act="scandel" data-id="${s.id}" style="margin-right:auto">Löschen</button>${s.ocr === 'ok' ? `<a class="btn" href="/api/scans/${s.id}/file/doc.pdf" target="_blank" rel="noopener">PDF öffnen</a>` : ''}<button class="btn ghost" data-act="fclose">Schließen</button></div>`);
  if (s.ocr === 'ok') fetch(`/api/scans/${s.id}/file/doc.txt`).then(r => r.text()).then(t => { const el = $('#ocrText'); if (el) el.textContent = t.trim() || 'Kein Text erkannt.'; });
}
async function scanText(id) {
  try {
    const t = (await (await fetch(`/api/scans/${id}/file/doc.txt`)).text()).trim(), ta = $('#nbody');
    if (ta) { ta.value = (ta.value ? ta.value.replace(/\s*$/, '\n\n') : '') + t; toast('Text eingefügt'); }
  } catch (e) { toast('Text konnte nicht geladen werden.'); }
}

/* ---------- Suche ---------- */
async function searchSheet() {
  showSheet('Suchen', `<input type="text" id="qq" placeholder="Begriff in Mitschriften, Scans, Karten, Dateien und Terminen" maxlength="80" autocomplete="off"><div id="qres" style="margin-top:12px"><p class="empty">Gib mindestens zwei Buchstaben ein.</p></div>`);
  const qq = $('#qq'); qq.focus(); let tm = 0;
  qq.oninput = () => { clearTimeout(tm); tm = setTimeout(async () => {
    const q = qq.value.trim().toLowerCase(), box = $('#qres'); if (!box) return;
    if (q.length < 2) { box.innerHTML = '<p class="empty">Gib mindestens zwei Buchstaben ein.</p>'; return; }
    try {
      const r = await api('GET', '/search?q=' + encodeURIComponent(q)), evs = S.events.filter(e => e.title.toLowerCase().includes(q)).slice(0, 10), cds = S.cards.filter(c => (c.front + ' ' + c.back).toLowerCase().includes(q)).slice(0, 10), fls = FILES.filter(f => f.name.toLowerCase().includes(q)).slice(0, 10);
      box.innerHTML = (r.notes.map(n => `<div class="doc"><span class="ft">Mitschrift</span><span class="grow">${esc(n.title)} <span class="muted">${esc(n.subject)}</span></span><button class="btn sm" data-act="noteopen" data-id="${n.id}">Öffnen</button></div>`).join('') +
        r.scans.map(s => `<div class="doc"><span class="ft">Scan</span><span class="grow">${esc(s.title)} <span class="muted">${esc(s.subject)}</span></span><button class="btn sm" data-act="scanopen" data-id="${s.id}">Öffnen</button></div>`).join('') +
        cds.map(c => `<div class="doc"><span class="ft">Karte</span><span class="grow">${esc(c.front.slice(0, 80))} <span class="muted">${esc(c.sid)}</span></span><button class="btn sm" data-act="cardedit" data-id="${c.id}">Öffnen</button></div>`).join('') +
        fls.map(f => `<div class="doc"><span class="ft">Datei</span><a class="grow" href="/api/files/${f.id}/download" target="_blank" rel="noopener">${esc(f.name)}</a></div>`).join('') +
        evs.map(e => `<div class="doc"><span class="ft">Termin</span><span class="grow">${esc(e.title)} <span class="muted">${fmtDate(ed(e))}</span></span></div>`).join('')) || '<p class="empty">Nichts gefunden.</p>';
    } catch (e) { box.innerHTML = `<p class="empty">${esc(e.message)}</p>`; }
  }, 250); };
}

