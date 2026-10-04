'use strict';
/* Lernhafen – Fokus-Timer, Ereignisse, Start. */
/* ---------- Fokus-Timer ---------- */
const MODES = { k: { n: 'Kurz', f: 10, b: 2 }, s: { n: 'Standard', f: 25, b: 5 }, l: { n: 'Tief', f: 50, b: 10 } };
const tm = { mode: 's', phase: 'f', left: 25 * 60, run: false, end: 0, task: '' };
const CIRC = 2 * Math.PI * 54, fmt = s => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
const tmTotal = () => (tm.phase === 'f' ? MODES[tm.mode].f : MODES[tm.mode].b) * 60;
function focusHTML() {
  const t = today(); if (S.focus.date !== t) S.focus = { date: t, count: 0, min: 0 };
  return `<div class="sheet" role="dialog" aria-modal="true" aria-label="Fokus-Timer"><div class="timer">
    <div class="seg" role="group" aria-label="Dauer">${Object.entries(MODES).map(([k, m]) => `<button data-act="mode" data-m="${k}" aria-pressed="${tm.mode === k}">${m.n} ${m.f}/${m.b}</button>`).join('')}</div>
    <div class="ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" fill="none" stroke="var(--surface2)" stroke-width="8"/><circle id="tmRing" cx="60" cy="60" r="54" fill="none" stroke="${tm.phase === 'f' ? 'var(--accent)' : 'var(--good)'}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC * (1 - tm.left / tmTotal())}"/></svg>
      <div class="t"><b id="tmTime">${fmt(tm.left)}</b><span class="muted">${tm.phase === 'f' ? 'Fokus' : 'Pause'}</span></div></div>
    <input type="text" id="tmTask" value="${esc(tm.task)}" placeholder="Woran arbeitest du?" maxlength="100" style="max-width:360px">
    <div class="row"><button class="btn primary" data-act="tmgo">${tm.run ? 'Pause' : 'Start'}</button><button class="btn" data-act="tmreset">Zurücksetzen</button><button class="btn ghost" data-act="fclose">Schließen</button></div>
    <p class="muted small">Heute: <b class="num">${S.focus.count}</b> Blöcke · <b class="num">${S.focus.min}</b> Min.</p>
    <p class="muted small" style="text-align:center">Zu groß zum Anfangen? Wähle „Kurz“. Nur 10 Minuten, dann darfst du aufhören.</p></div></div>`;
}
function showFocus() { const m = $('#modal'); fz = true; m.innerHTML = focusHTML(); m.hidden = false; m.onclick = e => { if (e.target === m) closeModal(); }; }
const refocus = () => { if (fz) $('#modal').innerHTML = focusHTML(); };
function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 660; g.gain.value = .12; o.start(); o.stop(a.currentTime + .35); } catch (e) { /* stumm */ } }
function tmDone() {
  tm.run = false; beep();
  if (tm.phase === 'f') { const t = today(); if (S.focus.date !== t) S.focus = { date: t, count: 0, min: 0 }; S.focus.count++; S.focus.min += MODES[tm.mode].f; save(); tm.phase = 'b'; toast('Block geschafft. Jetzt Pause.'); }
  else { tm.phase = 'f'; toast('Pause vorbei.'); }
  tm.left = tmTotal(); refocus();
}
setInterval(() => {
  if (!S) return;
  if (tm.run) { tm.left = Math.max(0, Math.ceil((tm.end - Date.now()) / 1000)); if (tm.left <= 0) { tmDone(); return; } }
  $('#miniTimer').textContent = tm.run ? fmt(tm.left) : '';
  document.title = tm.run ? `${fmt(tm.left)} · ${appName()}` : appName();
  const el = $('#tmTime'); if (el) { el.textContent = fmt(tm.left); $('#tmRing').setAttribute('stroke-dashoffset', CIRC * (1 - tm.left / tmTotal())); }
}, 500);


/* ---------- Ereignisse ---------- */
async function uploadFiles(files, subject) {
  try {
    for (const f of files) {
      toast(`Lade ${f.name} hoch …`);
      const r = await fetch(`/api/files?name=${encodeURIComponent(f.name)}&subject=${encodeURIComponent(subject)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: f });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Hochladen hat nicht geklappt.');
    }
    FILES = (await api('GET', '/files')).files; render(); toast('Datei gespeichert');
  } catch (e) { toast(e.message); }
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || !S) return;
  const a = b.dataset.act, id = b.dataset.id, k = b.dataset.k;
  switch (a) {
    case 'tab': go(b.dataset.t); break;
    case 'more': go(tab === 'mehr' ? 'heute' : 'mehr'); break;
    case 'settings': settingsModal(); break;
    case 'setup': setupSheet(); break;
    case 'focus': showFocus(); break;
    case 'fclose': closeModal(); break;
    case 'search': searchSheet(); break;
    case 'evdone': { const ev = S.events.find(x => x.id === id); ev.done = b.checked; save(); if (ev.done) toast('Erledigt. Stark!'); render(); break; }
    case 'stepdone': { const ev = S.events.find(x => x.id === id); ev.steps[+b.dataset.i].done = b.checked; save(); if (ev.steps.every(s => s.done)) toast('Alle Schritte erledigt. Hake jetzt die Aufgabe ab.'); render(); break; }
    case 'evnew': evModal(); break;
    case 'evedit': evModal(id); break;
    case 'slotev': evModal(null, { date: b.dataset.d, sid: k, type: (types().find(x => x.id === 'test') || types()[0]).id, slot: { date: b.dataset.d, block: pb(b.dataset.b), key: k } }); break;
    case 'wday': wsel = b.dataset.d; render(); break;
    case 'wprev': wsel = addDays(wsel, -7); render(); break;
    case 'wnext': wsel = addDays(wsel, 7); render(); break;
    case 'wtoday': wsel = null; render(); break;
    case 'selday': cal.sel = b.dataset.d; render(); break;
    case 'calprev': cal.m--; if (cal.m < 0) { cal.m = 11; cal.y--; } render(); break;
    case 'calnext': cal.m++; if (cal.m > 11) { cal.m = 0; cal.y++; } render(); break;
    case 'caltoday': { const n = new Date(); cal = { y: n.getFullYear(), m: n.getMonth(), sel: today() }; render(); break; }
    case 'subnew': subModal(); break;
    case 'subedit': subModal(k); break;
    case 'subopen': openSub = k; render(); window.scrollTo(0, 0); break;
    case 'subclose': openSub = ''; render(); break;
    case 'newnote': noteModal(k, null); break;
    case 'noteopen': { const f = noteById(id); if (f) noteModal(f.k, id); break; }
    case 'qnote': quickNote(b.dataset.d, pb(b.dataset.b), k); break;
    case 'scan': scanSheet(k); break;
    case 'scandone': scanDone(); break;
    case 'scancancel': scanCancel(); break;
    case 'scanopen': scanOpen(id); break;
    case 'scantext': scanText(id); break;
    case 'scandel': api('DELETE', '/scans/' + id).then(() => { SCANS = SCANS.filter(s => s.id !== id); for (const l of Object.values(S.notes)) l.forEach(n => { n.scans = (n.scans || []).filter(x => x !== id); }); save(); closeModal(); render(); }).catch(er => toast(er.message)); break;
    case 'filedel': api('DELETE', '/files/' + id).then(() => { FILES = FILES.filter(f => f.id !== id); render(); }).catch(er => toast(er.message)); break;
    case 'prnew': prModal(); break;
    case 'predit': prModal(id); break;
    case 'plansrc': plansrcSheet(); break;
    case 'smopen': smSheet(); break;
    case 'smsave': smSave(); break;
    case 'smnow': smNow(); break;
    case 'smdel': api('DELETE', '/schulmanager').then(r => { SM = r; smMsg('Zugangsdaten gelöscht. Der automatische Abgleich ist aus.'); render(); }).catch(er => smMsg(er.message)); break;
    case 'calsopen': calsSheet(); break;
    case 'ttopen': ttSheet(); break;
    case 'ttedit': ttModal(id); break;
    case 'feedopen': feedSheet(); break;
    case 'feedcopy': { const i = $('#feedUrl'); i.select(); (navigator.clipboard ? navigator.clipboard.writeText(i.value) : Promise.reject()).then(() => toast('Link kopiert')).catch(() => { document.execCommand('copy'); toast('Link markiert, bitte kopieren'); }); break; }
    case 'feedrotate': api('POST', '/feed/rotate').then(() => { toast('Neuer Link erzeugt. Der alte funktioniert nicht mehr.'); feedSheet(); }).catch(er => toast(er.message)); break;
    case 'linksedit': linksModal(); break;
    case 'planimp': importPlan($('#planIn').value); break;
    case 'bmcopy': navigator.clipboard.writeText(BM_CODE).then(() => toast('Code kopiert')).catch(() => toast('Kopieren nicht möglich')); break;
    case 'lsub': lsub = b.dataset.v; sess = null; render(); window.scrollTo(0, 0); break;
    case 'cardsgo': sessionStart(); break;
    case 'cardshow': sess.shown = true; render(); break;
    case 'cardknown': cardRate(true); break;
    case 'cardagain': cardRate(false); break;
    case 'cardnew': cardModal(null, k); break;
    case 'cardbulk': cardBulkModal(); break;
    case 'cardedit': cardModal(id); break;
    case 'gradenew': gradeModal(); break;
    case 'gradeedit': gradeModal(id); break;
    case 'planbuild': planBuild(id); break;
    case 'mode': tm.mode = b.dataset.m; tm.phase = 'f'; tm.left = tmTotal(); tm.run = false; refocus(); break;
    case 'tmgo': { const ti = $('#tmTask'); if (ti) tm.task = ti.value; if (tm.run) { tm.run = false; tm.left = Math.max(0, Math.ceil((tm.end - Date.now()) / 1000)); } else { tm.run = true; tm.end = Date.now() + tm.left * 1000; } refocus(); break; }
    case 'tmreset': tm.run = false; tm.phase = 'f'; tm.left = tmTotal(); refocus(); break;
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'fileUp') { uploadFiles([...t.files], t.dataset.k); t.value = ''; }
  else if (t.id === 'importFile') { if (t.files[0]) importBackup(t.files[0]); t.value = ''; }
  else if (t.id === 'cfilter') { lfilter = t.value; render(); }
  else if (t.id === 'tmTask') tm.task = t.value;
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

/* ---------- Start ---------- */
async function loadAll() {
  PLAN = (await api('GET', '/plan')).plan;
  try { SM = await api('GET', '/schulmanager'); } catch (e) { /* ok */ }
  try { CAL = await api('GET', '/calendars'); } catch (e) { /* ok */ }
  try { FILES = (await api('GET', '/files')).files; } catch (e) { /* ok */ }
  await loadScans();
}
async function boot() {
  try {
    const ses = await api('GET', '/session');
    if (ses.loginRequired && !ses.authed) { showLogin(); return; }
    CFG = await api('GET', '/config'); P = CFG.profile;
    const st = await api('GET', '/state');
    S = fixState(st.state || {}); rev = st.rev;
    if (S.settings.profile && S.settings.blocksFor !== P.id) { S.settings.blocks = P.blocks; S.settings.blocksFor = P.id; save(); }
    await loadAll();
    syncEffectiveDates(); render(); pollScans();
    if (!S.settings.profile) setupSheet();
    else if (S.settings.after) { const a = S.settings.after; S.settings.after = ''; save(); if (a === 'plansrc') plansrcSheet(); }
    setInterval(async () => {   // Änderungen von anderen Geräten übernehmen, solange hier nichts offen ist
      if (dirty || !$('#modal').hidden || document.hidden) return;
      try {
        const s2 = await api('GET', '/state');
        if (s2.state && s2.rev > rev) { S = fixState(s2.state); rev = s2.rev; }
        await loadAll(); syncEffectiveDates(); render();
      } catch (e) { /* offline */ }
    }, 30000);
  } catch (e) { if (e.message !== 'login') $('#main').innerHTML = `<div class="alert" style="margin-top:20px">Die App erreicht den Server nicht: ${esc(e.message)}</div>`; }
}
boot();
