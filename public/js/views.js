'use strict';
/* Lernhafen – Ansichten: Heute, Woche, Termine, Fächer, Mehr. */
let tab = 'heute', openSub = '', wsel = null, cal = { y: new Date().getFullYear(), m: new Date().getMonth(), sel: today() };
try { tab = localStorage.getItem('lh-tab') || 'heute'; } catch (e) { /* ohne Speicher */ }

/* ---------- Fächer, Mitschriften ---------- */
function subj(k) { return Object.assign({ name: '', links: [], credits: 0, passed: false }, S.subjects[k] || {}); }
const subName = k => { const s = subj(k); return s.name ? `${k} · ${s.name}` : k; };
function subjectKeys() {
  const ks = new Set(Object.keys(S.subjects));
  if (PLAN && PLAN.days) Object.values(PLAN.days).forEach(a => a.forEach(s => ks.add(baseKey(s.split('|')[1]))));
  CAL.items.filter(e => e.kind === 'timetable' && !e.allDay).forEach(e => ks.add(nbsp(e.title.replace(CANCEL_RE, '').replace(/^[\s:–-]+/, '') || e.title)));
  (S.timetable || []).forEach(e => ks.add(nbsp(e.subject)));
  return [...ks].filter(Boolean).sort((a, b) => a.localeCompare(b, 'de'));
}
const notesOf = k => (S.notes[k] = S.notes[k] || []);
function findNote(slot) { for (const [k, l] of Object.entries(S.notes)) for (const n of l) if (n.slot === slot) return { k, n }; return null; }
function noteById(id) { for (const [k, l] of Object.entries(S.notes)) for (const n of l) if (n.id === id) return { k, n }; return null; }
const scanById = id => SCANS.find(s => s.id === id);

/* ---------- Stunden ---------- */
function slotNotes(date, bf) {
  let h = '';
  S.events.forEach(e => {
    if (e.done || !e.slot) return;
    const r = resolve(e);
    if (r.date === date && r.block === bf) h += `<div class="small row"><span class="chip type ${tone(e.type)}">${esc(T(e.type))}</span><b>${esc(e.title)}</b>${r.moved ? `<span class="chip warn">verschoben von ${fmtDate(e.slot.date)}</span>` : ''}</div>`;
    else if (e.slot.date === date && e.slot.block === bf && r.moved) h += `<div class="small due-warn">${esc(T(e.type))} „${esc(e.title)}“ ist auf ${fmtDate(r.date)} verschoben.</div>`;
    else if (e.slot.date === date && e.slot.block === bf && r.orphan) h += `<div class="small due-warn">${esc(T(e.type))} „${esc(e.title)}“: keine passende Stunde im Plan.</div>`;
  });
  return h;
}
function lessonHTML(l) {
  return `<div class="nm"><i class="dot" style="background:${colorOf(baseKey(l.s))}"></i><span>${esc(l.s)}</span>${cancelled(l) ? '<span class="chip warn">Entfällt</span>' : ''}${changed(l) ? '<span class="chip warn">Geändert</span>' : ''}</div><div class="small muted">${esc([l.t, l.r].filter(Boolean).join(' · '))}</div>`;
}
function blockHTML(b, now, act, date, add) {
  const live = now != null && b.start && b.end && now >= mins(b.start) && now < mins(b.end);
  const gone = b.v.every(cancelled);
  const l0 = b.v.find(x => !cancelled(x)) || b.v[0], k = baseKey(l0.s), d = `data-d="${date}" data-b="${esc(b.bf)}" data-k="${esc(k)}"`;
  const has = date && findNote(`${date}|${b.bf}|${k}`);
  const label = b.timed ? '' : (b.bf === b.bt && b.to > b.from ? esc(P.terms.lesson) : 'Block ' + b.bf);
  return `<div class="blk ${live ? 'live' : ''} ${gone ? 'gone' : ''}"><div class="tm"><b>${b.start || 'Block ' + b.bf}</b>${b.end || ''}<br><span class="small">${label}</span></div>
    <div class="stack" style="gap:6px">${b.v.length > 1 ? '<span class="label">Parallel, eine Gruppe</span>' : ''}${b.v.map(lessonHTML).join('')}${date ? slotNotes(date, b.bf) : ''}
    ${act && !gone && date ? `<div class="row"><button class="btn sm ${has ? '' : 'primary'}" data-act="qnote" ${d}>${has ? 'Zur Mitschrift' : 'Mitschrift anlegen'}</button><button class="btn sm" data-act="scan" data-k="${esc(k)}">Scannen</button></div>` : ''}
    ${add ? `<div class="row"><button class="btn sm ghost" data-act="slotev" ${d}>+ Termin zu dieser Stunde</button></div>` : ''}</div></div>`;
}

/* ---------- Fristen ---------- */
function rel(d) {
  const n = diffDays(d, today());
  if (n === 0) return ['Heute', 'due-warn'];
  if (n === 1) return ['Morgen', 'due-warn'];
  if (n < 0) return [n === -1 ? 'Gestern fällig' : `Seit ${-n} Tagen fällig`, 'due-bad'];
  return [`In ${n} Tagen`, ''];
}
const stepInfo = e => { const s = e.steps || []; return s.length ? { done: s.filter(x => x.done).length, total: s.length, next: s.find(x => !x.done) } : null; };
function stepsHTML(e) {
  return `<div class="stack" style="gap:2px;margin-top:8px">${(e.steps || []).map((s, i) => `<label class="chk" style="margin:0;align-items:center"><input type="checkbox" data-act="stepdone" data-id="${e.id}" data-i="${i}" ${s.done ? 'checked' : ''}><span class="${s.done ? 'done' : ''}">${esc(s.t)}</span></label>`).join('')}</div>`;
}
function evRow(e) {
  const [r, c] = rel(ed(e)), si = stepInfo(e);
  return `<div class="item"><input type="checkbox" class="check" data-act="evdone" data-id="${e.id}" ${e.done ? 'checked' : ''} aria-label="Erledigt">
    <div class="grow"><div class="${e.done ? 'done' : ''}"><b>${esc(e.title)}</b></div>
    <div class="row small" style="margin-top:4px"><span class="chip type ${tone(e.type)}">${esc(T(e.type))}</span>${e.sid ? `<span class="chip"><i class="dot" style="background:${colorOf(e.sid)}"></i>${esc(e.sid)}</span>` : ''}
    <span class="${c}">${r}</span><span class="muted num">${fmtDate(ed(e))}</span>${si ? `<span class="chip">${si.done}/${si.total} Schritte</span>` : ''}${e.slot && resolve(e).moved ? `<span class="chip warn">verschoben von ${fmtDate(e.slot.date)}</span>` : ''}</div></div>
    <button class="icon-btn" data-act="evedit" data-id="${e.id}">Ändern</button></div>`;
}
function syncInfo() {
  const parts = [];
  if (PLAN && PLAN.updated) {
    const u = new Date(PLAN.updated), hrs = (Date.now() - u) / 36e5;
    parts.push(`<span class="sync ${hrs > 30 ? 'old' : ''}">Stundenplan-Stand: ${iso(u) === today() ? 'heute' : fmtDate(iso(u))}, ${pad(u.getHours())}:${pad(u.getMinutes())} Uhr${hrs > 30 ? ' (veraltet)' : ''}</span>`);
  } else if (!hasTimetableCal() && !(S.timetable || []).length) parts.push('<span class="sync old">Noch kein Stundenplan eingerichtet</span>');
  return parts.join(' · ');
}

/* ---------- Heute ---------- */
function vHeute() {
  const t = today(), now = new Date(), nm = now.getHours() * 60 + now.getMinutes(), dow = dowOf(t);
  let d = t; if (dow >= 5 && !blocksOn(t).length) d = addDays(t, 7 - dow);
  const wk = d !== t, bl = blocksOn(d);
  let card;
  if (wk) card = `<div class="label">Wochenende</div><h2>Kein Unterricht</h2><p>Nächster Tag mit Plan: ${fmtDate(d)}.</p>`;
  else {
    const live = bl.filter(b => b.start && b.end && !b.v.every(cancelled));
    const cur = live.find(b => nm >= mins(b.start) && nm < mins(b.end)), nxt = live.find(b => mins(b.start) > nm);
    const nameOf = b => b.v.filter(l => !cancelled(l)).map(l => l.s).join(' oder ');
    const roomOf = b => b.v.filter(l => !cancelled(l)).map(l => l.r).filter(Boolean)[0] || '';
    if (cur) card = `<div class="label">Jetzt</div><h2>${esc(nameOf(cur))}</h2><p>bis ${cur.end} Uhr${roomOf(cur) ? ` · ${esc(roomOf(cur))}` : ''}</p>`;
    else if (nxt) card = `<div class="label">Als Nächstes</div><h2>${esc(nameOf(nxt))}</h2><p>um ${nxt.start} Uhr${roomOf(nxt) ? ` · ${esc(roomOf(nxt))}` : ''} · in ${mins(nxt.start) - nm} Min.</p>`;
    else card = `<div class="label">Heute</div><h2>${bl.length ? 'Unterricht vorbei' : 'Kein Unterricht'}</h2><p>${bl.length ? 'Gut gemacht. Mach eine Pause.' : 'Heute ist nichts im Plan.'}</p>`;
  }
  const stale = !!(PLAN && PLAN.updated && (Date.now() - new Date(PLAN.updated)) / 36e5 > 30);
  const hasCancel = bl.some(b => b.v.some(cancelled)), tCancel = blocksOn(addDays(t, 1)).some(b => b.v.some(cancelled));
  const due = S.events.filter(e => !e.done && diffDays(ed(e), t) <= 2).sort((a, b) => ed(a).localeCompare(ed(b)));
  const big = S.events.filter(e => !e.done && isExam(e.type) && diffDays(ed(e), t) >= 0).sort((a, b) => ed(a).localeCompare(ed(b)))[0];
  const dueCards = S.cards.filter(c => c.due <= t).length, ext = extOn(d);
  const noPlan = !PLAN && !hasTimetableCal() && !(S.timetable || []).length;
  return `<div class="col"><div style="margin-top:20px"><div class="label">${DAYS[dow]}, ${now.getDate()}. ${MON[now.getMonth()]}</div>
    <h1>${now.getHours() < 11 ? 'Guten Morgen' : now.getHours() < 18 ? 'Hallo' : 'Guten Abend'}</h1><div style="margin-top:4px">${syncInfo()}</div></div>
  ${(hasCancel && !wk) || tCancel ? `<div class="alert" style="margin-top:14px">${hasCancel && !wk ? 'Heute fällt Unterricht aus.' : 'Morgen fällt Unterricht aus.'}</div>` : ''}
  ${noPlan ? `<div class="alert" style="margin-top:14px;font-weight:500">Dein Stundenplan fehlt noch. <button class="btn sm" data-act="plansrc" style="margin-left:8px">Einrichten</button></div>` : ''}
  ${stale ? `<div class="alert" style="margin-top:14px">Der Stundenplan ist nicht mehr aktuell. <button class="btn sm" data-act="tab" data-t="woche" style="margin-left:8px">Prüfen</button></div>` : ''}
  <div class="grid one">
    <div class="card now"><div>${card}</div><div class="row" style="margin-top:14px"><button class="btn sm" data-act="focus" style="color:var(--ink)">Fokus-Timer starten</button></div></div>
    <div class="card"><div class="card-head"><h2>${due.length ? 'Als Nächstes erledigen' : 'Nichts Dringendes'}</h2><button class="btn sm" data-act="evnew">Neu</button></div>
      ${due.length ? evRow(due[0]) + (stepInfo(due[0]) ? stepsHTML(due[0]) : '') : '<p class="empty">Gut so. Du darfst eine Pause machen.</p>'}
      ${due.length > 1 ? `<button class="btn sm ghost" data-act="tab" data-t="termine" style="margin-top:8px">${due.length - 1} weitere ansehen</button>` : ''}</div>
    ${dueCards ? `<div class="card row between"><div><b>${dueCards} Karteikarte${dueCards === 1 ? '' : 'n'} fällig</b><div class="small muted">Eine kurze Runde dauert etwa 5 Minuten.</div></div><button class="btn primary" data-act="cardsgo">Üben</button></div>` : ''}
    <details class="more"><summary>Mehr anzeigen: Stundenplan, Prüfungen</summary><div class="stack" style="margin-top:12px">
      <div class="card"><div class="card-head"><h2>Stundenplan ${wk ? fmtDate(d) : 'heute'}</h2><button class="btn sm ghost" data-act="tab" data-t="woche">Woche ansehen</button></div>
        ${bl.length ? bl.map(b => blockHTML(b, wk ? null : nm, !wk, d, false)).join('') : '<p class="empty">Kein Unterricht eingetragen.</p>'}</div>
      ${ext.length ? `<div class="card"><div class="card-head"><h2>Aus Kalendern</h2></div>${ext.map(extRow).join('')}</div>` : ''}
      ${big ? `<div class="card"><div class="label">Nächste Prüfung</div><h3 style="margin-top:4px"><span class="tc ${tone(big.type)}">${esc(big.title)}</span></h3><p class="muted">${rel(ed(big))[0]}, ${fmtDate(ed(big))}</p></div>` : ''}
    </div></details></div></div>`;
}
const extRow = e => `<div class="item"><div class="num small muted" style="width:70px;flex:none">${e.allDay ? 'ganztägig' : e.start}</div><div class="grow"><b>${esc(e.title)}</b>${e.location ? `<div class="small muted">${esc(e.location)}</div>` : ''}</div><span class="chip">${esc(e.calName)}</span></div>`;

/* ---------- Woche ---------- */
const weekStart = d => addDays(d, -dowOf(d));
function smCard() {
  if (!(P.sources || []).includes('schulmanager') && !(SM && SM.configured)) return '';
  const ok = SM && SM.configured;
  return `<div class="card full"><div class="card-head"><h2>Schulmanager</h2><div class="row">${ok ? '<button class="btn sm" data-act="smnow">Jetzt abgleichen</button>' : ''}<button class="btn sm primary" data-act="smopen">${ok ? 'Einstellungen' : 'Verbinden'}</button></div></div>
    <p class="small ${ok && !SM.ok ? 'due-bad' : 'muted'}">${esc(smText(SM))}</p></div>`;
}
function vWoche() {
  const t = today(); if (!wsel) wsel = dowOf(t) >= 5 ? addDays(t, 7 - dowOf(t)) : t;
  const ws = weekStart(wsel), bl = blocksOn(wsel), shown = new Set(bl.map(b => b.bf));
  const lost = S.events.filter(e => !e.done && e.slot && e.slot.date === wsel && !shown.has(e.slot.block) && resolve(e).moved);
  const ext = extOn(wsel), hasPlan = PLAN || hasTimetableCal() || (S.timetable || []).length;
  return `<div class="grid">${smCard()}
  ${!hasPlan ? `<div class="card full"><h2>Stundenplan einrichten</h2><p class="muted" style="margin:6px 0 12px">Hole ihn aus Schulmanager, einem Kalender-Link (Uni, Moodle, Google) oder trage ihn von Hand ein.</p><button class="btn primary" data-act="plansrc">Quelle wählen</button></div>` : ''}
  <div class="card full"><div class="card-head"><h2>Woche ab ${fmtDate(ws)}</h2><div class="row"><button class="btn sm" data-act="wprev">Zurück</button><button class="btn sm" data-act="wtoday">Heute</button><button class="btn sm" data-act="wnext">Weiter</button></div></div>
    <div class="days" role="group" aria-label="Wochentag">${[0, 1, 2, 3, 4].map(i => { const d = addDays(ws, i), n = blocksOn(d).length; return `<button data-act="wday" data-d="${d}" aria-pressed="${d === wsel}" class="${d === t ? 'istoday' : ''}">${DAYS[i].slice(0, 2)}<small>${parse(d).getDate()}.${parse(d).getMonth() + 1}.</small><small>${n ? n + ' Einträge' : 'frei'}</small></button>`; }).join('')}</div>
    <div style="margin-top:16px"><h3 style="margin-bottom:10px">${DAYS[dowOf(wsel)]}, ${fmtDate(wsel).slice(4)}</h3>
    ${lost.map(e => `<div class="alert" style="margin-bottom:10px">${esc(T(e.type))} „${esc(e.title)}“ ist auf ${fmtDate(resolve(e).date)} verschoben.</div>`).join('')}
    ${bl.length ? bl.map(b => blockHTML(b, wsel === t ? new Date().getHours() * 60 + new Date().getMinutes() : null, true, wsel, true)).join('') : '<p class="empty">Kein Unterricht an diesem Tag.</p>'}
    ${ext.length ? `<div style="margin-top:12px"><div class="label" style="margin-bottom:6px">Aus Kalendern</div>${ext.map(extRow).join('')}</div>` : ''}</div>
    <div class="row between" style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px">${syncInfo() || '<span></span>'}<button class="btn sm ghost" data-act="plansrc">Stundenplan-Quellen</button></div></div></div>`;
}

/* ---------- Termine ---------- */
function vTermine() {
  const first = new Date(cal.y, cal.m, 1), off = (first.getDay() + 6) % 7, start = addDays(iso(first), -off), t = today();
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i), dd = parse(d), out = dd.getMonth() !== cal.m;
    if (i >= 35 && out && i % 7 === 0) break;
    const ev = S.events.filter(e => ed(e) === d), n = ev.length + extOn(d).length;
    cells += `<button class="day ${out ? 'out' : ''} ${d === t ? 'today' : ''} ${d === cal.sel ? 'sel' : ''}" data-act="selday" data-d="${d}" aria-label="${fmtDate(d)}, ${n} Termine"><span class="num">${dd.getDate()}</span><span class="dots">${ev.slice(0, 3).map(e => `<i class="${tone(e.type)}"></i>`).join('')}${!ev.length && extOn(d).length ? '<i class="tone-grey"></i>' : ''}</span></button>`;
  }
  const day = S.events.filter(e => ed(e) === cal.sel), ext = extOn(cal.sel);
  const up = S.events.filter(e => !e.done && diffDays(ed(e), t) >= 0 && ed(e) !== cal.sel).sort((a, b) => ed(a).localeCompare(ed(b))).slice(0, 5);
  const over = S.events.filter(e => !e.done && diffDays(ed(e), t) < 0);
  return `<div class="grid">${over.length ? `<div class="card full"><div class="card-head"><h2 class="due-bad">Überfällig</h2></div>${over.map(evRow).join('')}</div>` : ''}
  <div class="card"><div class="card-head"><h2>${MON[cal.m]} ${cal.y}</h2><div class="row"><button class="btn sm" data-act="calprev" aria-label="Vorheriger Monat">Zurück</button><button class="btn sm" data-act="caltoday">Heute</button><button class="btn sm" data-act="calnext" aria-label="Nächster Monat">Weiter</button></div></div>
    <div class="cal">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => `<div class="dow">${d}</div>`).join('')}${cells}</div>
    <div class="legend">${types().map(x => `<span class="tone-${x.tone}"><i></i>${esc(x.label)}</span>`).join('')}</div></div>
  <div class="stack" style="gap:16px"><div class="card"><div class="card-head"><h2>${fmtDate(cal.sel)}</h2><button class="btn primary sm" data-act="evnew">Neuer Termin</button></div>${day.length ? day.map(evRow).join('') : '<p class="empty">Kein eigener Termin an diesem Tag.</p>'}
      ${ext.length ? `<div style="margin-top:10px"><div class="label" style="margin-bottom:6px">Aus Kalendern</div>${ext.map(extRow).join('')}</div>` : ''}</div>
    ${up.length ? `<div class="card"><div class="card-head"><h2>Danach</h2></div>${up.map(evRow).join('')}</div>` : ''}</div></div>`;
}

/* ---------- Fächer ---------- */
function scanBadge(s) {
  if (s.status === 'processing') return '<span class="chip warn">Wird erkannt …</span>';
  if (s.ocr === 'unavailable') return '<span class="chip">Ohne Texterkennung</span>';
  if (s.ocr === 'failed') return '<span class="chip warn">Erkennung fehlgeschlagen</span>';
  return '<span class="chip">Text erkannt</span>';
}
function scanRow(s) {
  return `<div class="item"><div class="grow"><b>${esc(s.title)}</b><div class="small muted">${s.date ? fmtDate(s.date) + ' · ' : ''}${s.pages} Seite${s.pages === 1 ? '' : 'n'} ${scanBadge(s)}</div>${s.snippet ? `<div class="small muted" style="margin-top:2px">${esc(s.snippet.slice(0, 110))} …</div>` : ''}</div>
    <div class="row"><button class="btn sm" data-act="scanopen" data-id="${s.id}">Öffnen</button>${gOn() && s.status === 'done' ? `<button class="btn sm ghost" data-g="dsave" data-kind="scan" data-id="${s.id}" data-k="${esc(s.subject || '')}">${s.drive ? 'In Drive ✓' : 'In Drive'}</button>` : ''}</div></div>`;
}
const sizeText = n => n > 1048576 ? fnum(n / 1048576) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
function vFach() {
  if (openSub) return vSubject(openSub);
  const t = today(), ks = subjectKeys();
  return `<div class="grid"><div class="full row between"><div><h2>Meine ${esc(P.terms.subjects)}</h2><p class="muted small">Tippe auf ein ${esc(P.terms.subject)} für Mitschriften, Scans, Dateien und Links.</p></div><button class="btn" data-act="subnew">${esc(P.terms.subject)} hinzufügen</button></div>
  <div class="full subjects">${ks.length ? ks.map(k => {
    const s = subj(k), nx = S.events.filter(e => e.sid === k && !e.done && diffDays(ed(e), t) >= 0).sort((a, b) => ed(a).localeCompare(ed(b)))[0];
    const nn = (S.notes[k] || []).length, ns = SCANS.filter(x => x.subject === k).length;
    return `<button class="card stack" data-act="subopen" data-k="${esc(k)}" style="text-align:left;cursor:pointer;font:inherit;color:inherit">
      <h3 class="row" style="flex-wrap:nowrap"><i class="dot" style="background:${colorOf(k)}"></i><span>${esc(k)}${s.name ? ` <span class="muted" style="font-weight:500">${esc(s.name)}</span>` : ''}</span></h3>
      ${nx ? `<div class="small"><span class="chip type ${tone(nx.type)}">${esc(T(nx.type))}</span> ${esc(nx.title)} · <span class="${rel(ed(nx))[1]}">${rel(ed(nx))[0]}</span></div>` : ''}
      <div class="small muted">${nn} Mitschrift${nn === 1 ? '' : 'en'} · ${ns} Scan${ns === 1 ? '' : 's'}${P.credits.enabled && s.credits ? ` · ${s.credits} ${esc(P.credits.label)}${s.passed ? ' (bestanden)' : ''}` : ''}</div></button>`;
  }).join('') : `<p class="empty">Sobald ein Stundenplan eingerichtet ist, erscheinen deine ${esc(P.terms.subjects)} hier. Du kannst sie auch von Hand hinzufügen.</p>`}</div></div>`;
}
function vSubject(k) {
  const s = subj(k), notes = notesOf(k).slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id.localeCompare(a.id));
  const scans = SCANS.filter(x => x.subject === k), files = FILES.filter(f => f.subject === k), evs = S.events.filter(e => e.sid === k && !e.done).sort((a, b) => ed(a).localeCompare(ed(b))).slice(0, 4);
  const cards = S.cards.filter(c => c.sid === k).length;
  return `<div class="grid one"><div class="row between" style="margin-top:4px"><button class="btn sm ghost" data-act="subclose">‹ Alle ${esc(P.terms.subjects)}</button><button class="btn sm" data-act="subedit" data-k="${esc(k)}">Name und Links</button></div>
  <div class="card"><h2 class="row"><i class="dot" style="background:${colorOf(k)}"></i>${esc(k)}${s.name ? ` <span class="muted" style="font-weight:500">${esc(s.name)}</span>` : ''}</h2>
    <div class="row" style="margin-top:12px"><button class="btn primary" data-act="newnote" data-k="${esc(k)}">Neue Mitschrift</button><button class="btn" data-act="scan" data-k="${esc(k)}">Scannen</button><button class="btn" data-act="cardnew" data-k="${esc(k)}">Karteikarte</button></div>
    <p class="small muted" style="margin-top:8px">${cards} Karteikarte${cards === 1 ? '' : 'n'}${P.credits.enabled && s.credits ? ` · ${s.credits} ${esc(P.credits.label)}` : ''}</p>
    ${s.links.length ? `<div style="margin-top:12px">${s.links.map(l => `<a class="doc" href="${esc(url(l.u))}" target="_blank" rel="noopener">${esc(l.t || l.u)}</a>`).join('')}</div>` : ''}</div>
  ${googleSubjectCard(k)}
  ${evs.length ? `<div class="card"><div class="card-head"><h2>Anstehend</h2></div>${evs.map(evRow).join('')}</div>` : ''}
  <div class="card"><div class="card-head"><h2>Mitschriften</h2></div>${notes.length ? notes.map(n => `<div class="item"><div class="grow"><b>${esc(n.title || 'Ohne Titel')}</b><div class="small muted">${n.date ? fmtDate(n.date) : ''}${n.scans && n.scans.length ? ` · ${n.scans.length} Scan${n.scans.length === 1 ? '' : 's'}` : ''}</div>${n.body ? `<div class="small muted">${esc(n.body.replace(/\s+/g, ' ').slice(0, 100))}</div>` : ''}</div><button class="btn sm" data-act="noteopen" data-id="${n.id}">Öffnen</button></div>`).join('') : '<p class="empty">Noch keine Mitschrift. Lege eine an oder scanne eine Seite.</p>'}</div>
  ${docsCard(k)}
  <details class="more" ${scans.length ? 'open' : ''}><summary>Scans (${scans.length})</summary><div class="card" style="margin-top:8px">${scans.length ? scans.map(scanRow).join('') : '<p class="empty">Noch keine Scans.</p>'}</div></details></div>`;
}

/* ---------- Mehr ---------- */
function allLinkGroups() {
  const own = (S.settings.links || []).filter(g => g.items && g.items.length).map(g => ({ group: g.group, items: g.items, own: true }));
  return own.concat(P.links);
}
function vMehr() {
  const pr = P.practicum, entries = S.practicum.entries.slice().sort((a, b) => b.date.localeCompare(a.date));
  const target = +S.settings.practicumTarget || pr.targetHours || 0, total = entries.reduce((a, e) => a + (+e.hours || 0), 0), pct = target ? Math.min(100, Math.round(total / target * 100)) : 0;
  const sources = P.sources || ['ical', 'manual'];
  return `<div class="grid one">
  ${pr.enabled ? `<div class="card"><div class="card-head"><h2>${esc(pr.label)}</h2><button class="btn sm primary" data-act="prnew">Stunden eintragen</button></div>
    <p><b class="num">${fnum(total, 2).replace(/,00$/, '').replace(/(,\d)0$/, '$1')}</b> von <span class="num">${target}</span> Stunden${target ? ` (${pct} %)` : ''}</p>
    <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" style="margin:10px 0 12px"><i style="width:${pct}%"></i></div>
    ${entries.slice(0, 5).map(e => `<div class="item"><div class="grow"><b class="num">${String(e.hours).replace('.', ',')} Std.</b> <span class="muted">${fmtDate(e.date)}${e.place ? ' · ' + esc(e.place) : ''}</span>${e.note ? `<div class="small muted">${esc(e.note)}</div>` : ''}</div><button class="icon-btn" data-act="predit" data-id="${e.id}">Ändern</button></div>`).join('') || '<p class="empty">Noch keine Stunden eingetragen.</p>'}</div>` : ''}
  ${connectionsCard()}
  ${gmailCard()}
  <div class="card"><div class="card-head"><h2>Alle Scans</h2></div>${SCANS.length ? SCANS.slice().reverse().slice(0, 10).map(scanRow).join('') : '<p class="empty">Noch keine Scans.</p>'}</div>
  ${allLinkGroups().map(g => `<details class="card grp"><summary>${esc(g.group)}<span class="small muted">${g.items.length}</span></summary><div class="links" style="margin-top:12px">${g.items.map(x => `<a class="lk" href="${esc(url(x[2]))}" target="_blank" rel="noopener"><b>${esc(x[0])}</b><span>${esc(x[1])}</span></a>`).join('')}</div></details>`).join('')}
  <div class="row"><button class="btn" data-act="linksedit">Eigene Links</button>${S.settings.sm && sources.includes('schulmanager') ? `<a class="btn" href="${esc(url(S.settings.sm))}" target="_blank" rel="noopener">Schulmanager öffnen</a>` : ''}</div>
  <details class="card grp"><summary>Daten und Verbindungen</summary><div class="stack" style="margin-top:12px">
    <div class="row"><button class="btn" data-act="feedopen">Termine im Handy-Kalender</button><a class="btn" href="/api/export">Sicherung herunterladen</a><label class="btn" style="cursor:pointer">Sicherung einspielen<input type="file" id="importFile" accept=".json,application/json" hidden></label></div>
    <p class="small muted">Die Sicherung enthält Einstellungen, Termine, Mitschriften, Karten und Noten. Scans und Dateien liegen im Ordner „data“ auf dem Server.</p>
    <div class="row"><button class="btn" data-act="settings">Einstellungen</button><button class="btn" data-act="setup">Einrichtungs-Assistent</button><span class="small muted">Version ${esc(CFG.version)}</span></div></div></details></div>`;
}

/* ---------- Render ---------- */
const TABS = [['heute', 'Heute'], ['woche', 'Woche'], ['termine', 'Termine'], ['faecher', 'Fächer'], ['lernen', 'Lernen']];
const VIEWS = { heute: vHeute, woche: vWoche, termine: vTermine, faecher: vFach, lernen: () => vLernen(), mehr: vMehr };
function applyTheme() {
  const th = S.settings.theme;
  if (th === 'light' || th === 'dark') document.documentElement.setAttribute('data-theme', th); else document.documentElement.removeAttribute('data-theme');
}
function applyBrand() {
  const n = appName(), i = Math.ceil(n.length / 2);
  $('#brand').innerHTML = esc(n.slice(0, i)) + '<span>' + esc(n.slice(i)) + '</span>';
  if (!tm || !tm.run) document.title = n;
}
function render() {
  if (!S) return;
  $('#tabs').innerHTML = TABS.map(([k, v]) => `<button class="tab" role="tab" aria-selected="${tab === k}" data-act="tab" data-t="${k}">${k === 'faecher' ? esc(P.terms.subjects) : v}</button>`).join('');
  $('#main').innerHTML = VIEWS[tab]();
  $('#moreBtn').setAttribute('aria-pressed', String(tab === 'mehr'));
  if (tab === 'mehr') loadGmail();
  applyTheme(); applyBrand();
}
function go(t) { tab = t; if (t !== 'faecher') openSub = ''; if (t !== 'lernen') lsub = ''; try { localStorage.setItem('lh-tab', t); } catch (e) { /* egal */ } render(); window.scrollTo(0, 0); }
function toast(m) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 2600); }

/* ---------- Dialoge ---------- */
let fz = false;
function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; fz = false; }
function showSheet(title, body) {
  const m = $('#modal'); fz = false;
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h2>${esc(title)}</h2><div id="sbody">${body}</div></div>`;
  m.hidden = false; m.onclick = e => { if (e.target === m) closeModal(); };
}
function modal(title, body, onSave, opts = {}) {
  showSheet(title, `<form id="mf">${body}<div class="row end">${opts.del ? '<button type="button" class="btn danger" id="mdel" style="margin-right:auto">Löschen</button>' : ''}<button type="button" class="btn ghost" id="mx">Abbrechen</button><button class="btn primary">Speichern</button></div></form>`);
  $('#mx').onclick = closeModal;
  if (opts.del) $('#mdel').onclick = () => { opts.del(); closeModal(); save(); render(); };
  $('#mf').onsubmit = e => { e.preventDefault(); if (onSave(Object.fromEntries(new FormData(e.target))) === false) return; closeModal(); save(); render(); };
  const f = $('#mf input,#mf select,#mf textarea'); if (f) f.focus();
}
const F = (l, n, v = '', t = 'text', x = '') => `<label class="field"><span>${l}</span><input type="${t}" name="${n}" value="${esc(v)}" ${x}></label>`;
const subOpts = sel => `<option value="">Kein ${esc(P.terms.subject)}</option>` + subjectKeys().map(k => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(subName(k))}</option>`).join('');
