'use strict';
/* Lernhafen – Lernen: Karteikarten (Wiederholung in Abständen), Noten und Leistungspunkte, Lernplan vor Prüfungen. */
let lsub = '', lfilter = '', sess = null;
const INTERVALS = [0, 1, 2, 4, 8, 16];            // Tage bis zur nächsten Wiederholung je Kasten 1 bis 5
const SCALES = {
  de: { min: 1, max: 6, step: 0.1, low: true, label: 'Note (1 bis 6)', fmt: v => fnum(v, 1) },
  points15: { min: 0, max: 15, step: 1, low: false, label: 'Punkte (0 bis 15)', fmt: v => String(Math.round(v)) },
  percent: { min: 0, max: 100, step: 0.5, low: false, label: 'Prozent', fmt: v => fnum(v, 1) + ' %' }
};
const scale = () => SCALES[(P.grading || {}).scale] || SCALES.de;

function vLernen() {
  if (lsub === 'cards') return vCards();
  if (lsub === 'grades') return vGrades();
  if (lsub === 'session') return vSession();
  const t = today(), due = S.cards.filter(c => c.due <= t).length, exams = S.events.filter(e => !e.done && isExam(e.type) && diffDays(ed(e), t) >= 0 && diffDays(ed(e), t) <= 90).sort((a, b) => ed(a).localeCompare(ed(b)));
  const g = overallAvg(), cr = creditsInfo();
  return `<div class="grid one">
  <div class="card"><div class="card-head"><h2>Karteikarten</h2><button class="btn sm" data-act="lsub" data-v="cards">Verwalten</button></div>
    <p>${due ? `<b>${due}</b> Karte${due === 1 ? '' : 'n'} heute fällig` : S.cards.length ? 'Heute ist nichts fällig.' : 'Noch keine Karten.'} <span class="muted">(${S.cards.length} insgesamt)</span></p>
    <div class="row" style="margin-top:10px">${due ? '<button class="btn primary" data-act="cardsgo">Jetzt üben</button>' : ''}<button class="btn" data-act="cardnew">Neue Karte</button><button class="btn" data-act="cardbulk">Mehrere einfügen</button></div></div>
  <div class="card"><div class="card-head"><h2>Prüfungen</h2></div>${exams.length ? exams.map(e => {
    const n = S.events.filter(x => x.plan === e.id).length, [r, c] = rel(ed(e));
    return `<div class="item"><div class="grow"><b>${esc(e.title)}</b><div class="small"><span class="${c}">${r}</span> <span class="muted">${fmtDate(ed(e))}</span>${e.sid ? ` · ${esc(e.sid)}` : ''}</div>${n ? `<div class="small muted">Lernplan mit ${n} Blöcken</div>` : ''}</div>
      <button class="btn sm ${n ? '' : 'primary'}" data-act="planbuild" data-id="${e.id}">${n ? 'Neu planen' : 'Lernplan'}</button></div>`;
  }).join('') : '<p class="empty">Keine Prüfung in den nächsten 90 Tagen. Lege unter „Termine“ eine Klausur oder einen Test an.</p>'}</div>
  <div class="card"><div class="card-head"><h2>Noten</h2><button class="btn sm" data-act="lsub" data-v="grades">Ansehen</button></div>
    ${g != null ? `<p><b>Ø ${scale().fmt(g)}</b> <span class="muted">aus ${S.grades.length} Eintrag${S.grades.length === 1 ? '' : 'en'}</span></p>` : '<p class="muted">Noch keine Noten eingetragen.</p>'}
    ${cr ? `<p style="margin-top:8px"><b class="num">${fnum(cr.earned, 1).replace(',0', '')}</b> von <span class="num">${cr.target}</span> ${esc(P.credits.label)}</p><div class="bar" style="margin-top:6px"><i style="width:${cr.pct}%"></i></div>` : ''}
    <div class="row" style="margin-top:10px"><button class="btn" data-act="gradenew">Note eintragen</button></div></div></div>`;
}
const lback = '<button class="btn sm ghost" data-act="lsub" data-v="">‹ Lernen</button>';

/* ---------- Karteikarten ---------- */
function vCards() {
  const ks = [...new Set(S.cards.map(c => c.sid))].sort(), list = S.cards.filter(c => !lfilter || c.sid === lfilter).sort((a, b) => a.due.localeCompare(b.due));
  const boxes = [1, 2, 3, 4, 5].map(b => S.cards.filter(c => c.box === b).length);
  return `<div class="grid one"><div class="row between">${lback}<button class="btn primary sm" data-act="cardnew">Neue Karte</button></div>
  <div class="card"><div class="card-head"><h2>Karten (${list.length})</h2><select id="cfilter" style="width:auto"><option value="">Alle ${esc(P.terms.subjects)}</option>${ks.map(k => `<option value="${esc(k)}" ${k === lfilter ? 'selected' : ''}>${esc(k || 'Ohne Zuordnung')}</option>`).join('')}</select></div>
    <p class="small muted" style="margin-bottom:8px">Kasten 1 bis 5: ${boxes.join(' · ')}. Je besser du eine Karte kennst, desto seltener kommt sie.</p>
    ${list.length ? list.slice(0, 100).map(c => `<div class="item"><div class="grow"><b>${esc(c.front.slice(0, 90))}</b><div class="small muted">${esc(c.sid || '')}${c.sid ? ' · ' : ''}Kasten ${c.box} · ${c.due <= today() ? 'fällig' : 'in ' + diffDays(c.due, today()) + ' Tagen'}</div></div><button class="icon-btn" data-act="cardedit" data-id="${c.id}">Ändern</button></div>`).join('') : '<p class="empty">Keine Karten.</p>'}</div></div>`;
}
function cardModal(id, sid) {
  const c = id ? S.cards.find(x => x.id === id) : { sid: sid || '', front: '', back: '' };
  modal(id ? 'Karte ändern' : 'Neue Karte', `<label class="field"><span>${esc(P.terms.subject)}</span><select name="sid">${subOpts(c.sid)}</select></label>
    <label class="field"><span>Vorderseite (Frage)</span><textarea name="front" rows="3" required maxlength="500"></textarea></label>
    <label class="field"><span>Rückseite (Antwort)</span><textarea name="back" rows="4" required maxlength="1500"></textarea></label>`,
    d => { const v = { sid: d.sid, front: d.front.trim(), back: d.back.trim() }; if (!v.front || !v.back) return false; if (id) Object.assign(c, v); else S.cards.push(Object.assign({ id: uid(), box: 1, due: today(), created: today() }, v)); },
    { del: id ? () => { S.cards = S.cards.filter(x => x.id !== id); } : null });
  const f = $('#mf textarea[name=front]'), b = $('#mf textarea[name=back]'); if (f) f.value = c.front; if (b) b.value = c.back;
}
function cardBulkModal() {
  modal('Mehrere Karten einfügen', `<label class="field"><span>${esc(P.terms.subject)}</span><select name="sid">${subOpts(openSub || GUESS())}</select></label>
    <label class="field"><span>Eine Karte pro Zeile: Frage ; Antwort</span><textarea name="text" rows="10" placeholder="Hauptstadt von Frankreich ; Paris&#10;Was ist ein Muskel? ; Gewebe, das sich zusammenziehen kann"></textarea></label>
    <p class="small muted">Das Trennzeichen ist ein Semikolon oder ein Tabulator (zum Beispiel aus einer Tabelle kopiert).</p>`,
    d => {
      const rows = d.text.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const i = l.search(/[;\t]/); return i > 0 ? { front: l.slice(0, i).trim(), back: l.slice(i + 1).trim() } : null; }).filter(r => r && r.front && r.back);
      if (!rows.length) { toast('Keine Karte erkannt. Trenne Frage und Antwort mit einem Semikolon.'); return false; }
      rows.forEach(r => S.cards.push({ id: uid(), sid: d.sid, front: r.front, back: r.back, box: 1, due: today(), created: today() }));
      toast(rows.length + ' Karten angelegt');
    });
}
function sessionStart() {
  const t = today(), due = S.cards.filter(c => c.due <= t).sort(() => Math.random() - .5).slice(0, 10).map(c => c.id);
  if (!due.length) { toast('Heute ist nichts fällig.'); return; }
  sess = { queue: due, i: 0, shown: false, known: 0, again: 0, total: due.length, retried: new Set() };
  lsub = 'session'; tab = 'lernen'; render(); window.scrollTo(0, 0);
}
function vSession() {
  if (!sess) return vLernenStart();
  if (sess.i >= sess.queue.length) {
    const more = S.cards.filter(c => c.due <= today()).length;
    return `<div class="grid one"><div class="card now"><div class="label">Runde geschafft</div><h2>${sess.known} gewusst${sess.again ? `, ${sess.again} zum Wiederholen` : ''}</h2><p>Kurz und regelmäßig wirkt besser als lange und selten.</p>
      <div class="row" style="margin-top:14px">${more ? '<button class="btn sm" data-act="cardsgo" style="color:var(--ink)">Noch eine Runde</button>' : ''}<button class="btn sm" data-act="lsub" data-v="" style="color:var(--ink)">Fertig</button></div></div></div>`;
  }
  const c = S.cards.find(x => x.id === sess.queue[sess.i]); if (!c) { sess.i++; return vSession(); }
  return `<div class="grid one"><div class="row between"><button class="btn sm ghost" data-act="lsub" data-v="">‹ Beenden</button><span class="small muted num">${Math.min(sess.i + 1, sess.queue.length)} von ${sess.queue.length}</span></div>
  <div class="card stack" style="min-height:240px;justify-content:center;text-align:center"><div class="label">${esc(c.sid || 'Karte')}</div><h2 style="font-size:1.5rem;white-space:pre-wrap">${esc(c.front)}</h2>
    ${sess.shown ? `<div style="border-top:1px solid var(--line);padding-top:14px;white-space:pre-wrap;font-size:1.15rem">${esc(c.back)}</div>` : ''}</div>
  ${sess.shown ? `<div class="row" style="justify-content:center"><button class="btn" data-act="cardagain" style="min-width:140px;min-height:52px">Nochmal</button><button class="btn primary" data-act="cardknown" style="min-width:140px;min-height:52px">Gewusst</button></div>`
    : '<div class="row" style="justify-content:center"><button class="btn primary" data-act="cardshow" style="min-width:220px;min-height:52px">Antwort zeigen</button></div>'}</div>`;
}
function cardRate(ok) {
  const c = S.cards.find(x => x.id === sess.queue[sess.i]);
  if (c) {
    if (ok) { c.box = Math.min(5, c.box + 1); c.due = addDays(today(), INTERVALS[c.box]); sess.known++; }
    else { c.box = 1; c.due = addDays(today(), 1); sess.again++; if (!sess.retried.has(c.id)) { sess.retried.add(c.id); sess.queue.push(c.id); } }
    save();
  }
  sess.i++; sess.shown = false; render();
}

/* ---------- Noten und Leistungspunkte ---------- */
const wavg = gs => { const w = gs.reduce((a, g) => a + g.weight, 0); return w ? gs.reduce((a, g) => a + g.value * g.weight, 0) / w : null; };
function overallAvg() {
  if (!S.grades.length) return null;
  const by = {}; S.grades.forEach(g => (by[g.sid || ''] = by[g.sid || ''] || []).push(g));
  if (!P.credits.enabled) return wavg(S.grades);
  const parts = Object.entries(by).map(([k, gs]) => ({ avg: wavg(gs), w: (subj(k).credits || 0) || 1 }));
  const w = parts.reduce((a, p) => a + p.w, 0);
  return parts.reduce((a, p) => a + p.avg * p.w, 0) / w;
}
function creditsInfo() {
  if (!P.credits.enabled) return null;
  const target = +S.settings.creditsTarget || P.credits.target || 0, earned = Object.entries(S.subjects).reduce((a, [, s]) => a + (s.passed ? (+s.credits || 0) : 0), 0);
  return { earned, target, pct: target ? Math.min(100, Math.round(earned / target * 100)) : 0 };
}
function vGrades() {
  const by = {}; S.grades.forEach(g => (by[g.sid || ''] = by[g.sid || ''] || []).push(g));
  const g = overallAvg(), cr = creditsInfo(), sc = scale();
  return `<div class="grid one"><div class="row between">${lback}<button class="btn primary sm" data-act="gradenew">Note eintragen</button></div>
  <div class="card now"><div class="label">Durchschnitt</div><h2>${g != null ? 'Ø ' + sc.fmt(g) : 'Noch keine Noten'}</h2>${cr ? `<p>${fnum(cr.earned, 1).replace(',0', '')} von ${cr.target} ${esc(P.credits.label)}</p>` : ''}</div>
  ${Object.entries(by).sort((a, b) => a[0].localeCompare(b[0], 'de')).map(([k, gs]) => `<div class="card"><div class="card-head"><h3>${esc(k || 'Ohne Zuordnung')}</h3><b>Ø ${sc.fmt(wavg(gs))}</b></div>${gs.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(x => `<div class="item"><div class="grow"><b>${esc(x.title || 'Leistung')}</b><div class="small muted">${x.date ? fmtDate(x.date) : ''}${x.weight !== 1 ? ` · Gewicht ${fnum(x.weight, 1).replace(',0', '')}` : ''}</div></div><b class="num">${sc.fmt(x.value)}</b><button class="icon-btn" data-act="gradeedit" data-id="${x.id}">Ändern</button></div>`).join('')}</div>`).join('')}
  ${S.grades.length ? '' : '<p class="empty">Trage Noten und Prüfungsergebnisse ein, dann siehst du hier deinen Durchschnitt.</p>'}</div>`;
}
function gradeModal(id) {
  const sc = scale(), g = id ? S.grades.find(x => x.id === id) : { sid: openSub || '', title: '', value: '', weight: 1, date: today() };
  modal(id ? 'Eintrag ändern' : 'Note eintragen', `<label class="field"><span>${esc(P.terms.subject)}</span><select name="sid">${subOpts(g.sid)}</select></label>` + F('Bezeichnung', 'title', g.title, 'text', 'maxlength="80" placeholder="z. B. Klausur 1"') +
    F(sc.label, 'value', g.value === '' ? '' : String(g.value).replace('.', ','), 'text', 'required inputmode="decimal"') + F('Gewicht', 'weight', String(g.weight).replace('.', ','), 'text', 'inputmode="decimal"') + F('Datum', 'date', g.date, 'date'),
    d => {
      const v = num(d.value), w = num(d.weight || '1');
      if (!(v >= sc.min && v <= sc.max)) { toast(`Der Wert muss zwischen ${sc.min} und ${sc.max} liegen.`); return false; }
      const rec = { sid: d.sid, title: d.title.trim(), value: v, weight: w > 0 ? w : 1, date: d.date };
      if (id) Object.assign(g, rec); else S.grades.push(Object.assign({ id: uid() }, rec));
    },
    { del: id ? () => { S.grades = S.grades.filter(x => x.id !== id); } : null });
}

/* ---------- Lernplan vor einer Prüfung ---------- */
function planBuild(id) {
  const ex = S.events.find(e => e.id === id), st = studyType(); if (!ex) return;
  if (!st) { toast('In diesem Profil gibt es keinen Lernblock-Typ.'); return; }
  const left = diffDays(ed(ex), today()), def = Math.max(1, Math.min(6, left - 1));
  modal('Lernplan: ' + ex.title, `<p class="small muted" style="margin-bottom:10px">Die Prüfung ist ${left === 0 ? 'heute' : left === 1 ? 'morgen' : 'in ' + left + ' Tagen'}. Die App verteilt Lernblöcke gleichmäßig davor, der letzte dient zum Wiederholen. Jeder Block ist ein Termin, den du abhaken kannst.</p>` +
    F('Anzahl Lernblöcke', 'n', def, 'number', `min="1" max="20" required`) +
    `<label class="field"><span>Themen (eine Zeile pro Thema, optional)</span><textarea name="topics" rows="4" placeholder="Kapitel 1&#10;Kapitel 2"></textarea></label><label class="chk"><input type="checkbox" name="wkend"><span>Auch am Wochenende planen</span></label>`,
    d => {
      const n = Math.max(1, Math.min(20, parseInt(d.n, 10) || def)), topics = d.topics.split('\n').map(x => x.trim()).filter(Boolean), end = addDays(ed(ex), -1);
      if (diffDays(end, today()) < 1) { toast('Bis zur Prüfung bleibt zu wenig Zeit für einen Plan.'); return false; }
      let days = []; for (let x = addDays(today(), 1); x <= end; x = addDays(x, 1)) days.push(x);
      const work = days.filter(x => d.wkend === 'on' || dowOf(x) < 5); if (work.length >= Math.min(n, days.length)) days = work;
      const k = Math.min(n, days.length), picks = Array.from({ length: k }, (_, i) => days[k === 1 ? days.length - 1 : Math.round(i * (days.length - 1) / (k - 1))]);
      S.events = S.events.filter(e => e.plan !== ex.id);
      picks.forEach((date, i) => S.events.push({ id: uid(), done: false, plan: ex.id, type: st.id, sid: ex.sid, date, title: `${i === k - 1 && k > 1 ? 'Wiederholen' : (topics.length ? topics[i % topics.length] : 'Lernen')} (${ex.title})`, steps: [{ t: 'Fokus-Timer starten (25 Minuten)', done: false }] }));
      toast(`${k} Lernblöcke eingetragen`);
    });
}
