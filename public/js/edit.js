'use strict';
/* Lernhafen – Bearbeiten: Termine, Fächer, Mitschriften, Praxisstunden, Wochenplan, Einstellungen. */

function evModal(id, prefill = {}) {
  const e = id ? S.events.find(x => x.id === id) : { date: tab === 'termine' ? cal.sel : today(), type: types()[0].id, sid: '', title: '', ...prefill };
  const sl = e.slot;
  modal(id ? 'Termin bearbeiten' : 'Neuer Termin',
    F('Titel', 'title', e.title, 'text', 'required maxlength="120" placeholder="z. B. Klausur Neurologie"') +
    `<label class="field"><span>Art</span><select name="type">${types().map(x => `<option value="${x.id}" ${e.type === x.id ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>` +
    `<label class="field"><span>${esc(P.terms.subject)}</span><select name="sid">${subOpts(e.sid)}</select></label>` + F('Datum', 'date', e.date, 'date', 'required') +
    `<label class="field"><span>Schritte (eine Zeile pro Schritt, optional)</span><textarea name="steps" rows="3" placeholder="Zu große Aufgaben in kleine Schritte teilen">${esc((e.steps || []).map(s => s.t).join('\n'))}</textarea></label>` +
    (sl ? `<label class="chk"><input type="checkbox" name="bind" checked><span>An ${esc(sl.key)}, ${fmtDate(sl.date)}, ${typeof sl.block === 'number' ? 'Block ' + sl.block : sl.block + ' Uhr'} binden. Fällt die Stunde aus, wandert der Termin zur nächsten Stunde dieses Fachs.</span></label>` : ''),
    d => {
      const { bind, steps, ...rest } = d; let ev = e;
      const old = e.steps || [];
      rest.steps = steps.split('\n').map(t => t.trim()).filter(Boolean).map(t => ({ t, done: !!(old.find(s => s.t === t) || {}).done }));
      if (id) Object.assign(e, rest); else { ev = { id: uid(), done: false, ...rest }; if (sl) ev.slot = sl; S.events.push(ev); }
      if (!ev.steps.length) delete ev.steps;
      if ((sl && bind !== 'on') || (ev.slot && rest.date !== ev.slot.date)) delete ev.slot;
      if (!ev.slot) delete ev.eff;
      if (d.date) { cal.sel = d.date; const x = parse(d.date); cal.y = x.getFullYear(); cal.m = x.getMonth(); }
      syncEffectiveDates();
    },
    { del: id ? () => { S.events = S.events.filter(x => x.id !== id); } : null });
}

function subModal(k) {
  const s = k ? subj(k) : { name: '', links: [], credits: 0, passed: false };
  modal(k ? `${P.terms.subject} ${k}` : `Neues ${P.terms.subject}`,
    (k ? '' : F('Kürzel oder Name', 'key', '', 'text', 'required maxlength="40" placeholder="z. B. Anat/Phys oder Analysis I"')) +
    F('Voller Name', 'name', s.name, 'text', 'maxlength="60" placeholder="z. B. Anatomie und Physiologie"') +
    (P.credits.enabled ? F(esc(P.credits.label), 'credits', s.credits || '', 'number', 'min="0" max="60" step="0.5" inputmode="decimal"') + `<label class="chk"><input type="checkbox" name="passed" ${s.passed ? 'checked' : ''}><span>Bestanden</span></label>` : '') +
    `<label class="field"><span>Links (eine Zeile pro Link: Titel | Link)</span><textarea name="links" rows="4" placeholder="Skript Kapitel 3 | https://…">${esc(s.links.map(l => `${l.t} | ${l.u}`).join('\n'))}</textarea></label>`,
    d => {
      const key = nbsp((k || d.key || '').trim()); if (!key) return false;
      const links = d.links.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [i, ...r] = l.split('|'); return r.length ? { t: i.trim(), u: r.join('|').trim() } : { t: '', u: l }; });
      S.subjects[key] = { name: d.name.trim(), links, credits: num(d.credits) || 0, passed: d.passed === 'on' };
    },
    { del: k && S.subjects[k] ? () => { delete S.subjects[k]; openSub = ''; } : null });
}

/* ---------- Mitschriften ---------- */
function noteModal(k, id, prefill = {}) {
  const found = id ? noteById(id) : null, n = found ? found.n : Object.assign({ id: uid(), date: today(), title: '', body: '', scans: [] }, prefill);
  const scans = (n.scans || []).map(scanById).filter(Boolean);
  showSheet(found ? 'Mitschrift' : 'Neue Mitschrift', `<form id="mf">
    ${F('Titel', 'title', n.title, 'text', 'maxlength="140" required')}${F('Datum', 'date', n.date, 'date')}
    <label class="field"><span>Mitschrift</span><textarea name="body" id="nbody" rows="10">${esc(n.body)}</textarea></label>
    ${!found && gOn() && subj(k).gdoc ? '<label class="chk"><input type="checkbox" name="gdoc" checked><span>Auch ins Google Doc dieses Fachs eintragen</span></label>' : ''}
    ${scans.length ? `<div class="field"><span>Gescannte Seiten</span>${scans.map(s => `<div class="stack" style="margin-bottom:10px"><div class="thumbs">${Array.from({ length: s.pages }, (_, i) => `<a href="/api/scans/${s.id}/file/p${i + 1}.jpg" target="_blank" rel="noopener"><img src="/api/scans/${s.id}/file/p${i + 1}.jpg" alt="Seite ${i + 1}" loading="lazy"></a>`).join('')}</div>
      <div class="row small">${scanBadge(s)}${s.ocr === 'ok' ? `<button type="button" class="btn sm" data-act="scantext" data-id="${s.id}">Erkannten Text einfügen</button><a class="btn sm" href="/api/scans/${s.id}/file/doc.pdf" target="_blank" rel="noopener">PDF öffnen</a>` : ''}</div></div>`).join('')}</div>` : ''}
    <div class="row end">${found ? '<button type="button" class="btn danger" id="mdel" style="margin-right:auto">Löschen</button>' : ''}<button type="button" class="btn ghost" id="mx">Abbrechen</button><button class="btn primary">Speichern</button></div></form>`);
  $('#mx').onclick = closeModal;
  if (found) $('#mdel').onclick = () => { S.notes[found.k] = S.notes[found.k].filter(x => x.id !== id); closeModal(); save(); render(); };
  $('#mf').onsubmit = e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
    Object.assign(n, { title: d.title.trim(), date: d.date, body: d.body });
    if (!found) notesOf(k).push(n);
    closeModal(); save(); render(); toast('Gespeichert');
    if (!found && d.gdoc === 'on' && subj(k).gdoc) api('POST', '/google/doc/' + subj(k).gdoc.id + '/append', { heading: n.title, body: n.body }).then(() => toast('Auch im Google Doc eingetragen')).catch(er => toast('Google Doc: ' + er.message));
  };
  $('#nbody').focus();
}
function quickNote(date, bf, k) {
  const slot = `${date}|${bf}|${k}`, ex = findNote(slot);
  if (ex) return noteModal(ex.k, ex.n.id);
  const b = blocksOn(date).find(x => x.bf === bf && x.v.some(l => baseKey(l.s) === k)); if (!b) return;
  const l = b.v.find(x => baseKey(x.s) === k && !cancelled(x)) || b.v[0], sj = subj(k);
  const head = `${DAYS[dowOf(date)]}, ${date.slice(8)}.${date.slice(5, 7)}.${date.slice(0, 4)} · ${b.timed ? b.start + ' Uhr' : 'Block ' + bf} · ${l.s}`;
  const body = `Zeit: ${b.start ? b.start + (b.end ? '–' + b.end : '') + ' Uhr' : '-'} · Lehrkraft: ${l.t || '-'} · Raum: ${l.r || '-'}${sj.name ? ' · ' + sj.name : ''}\n${P.noteTemplate}`;
  noteModal(k, null, { title: head, body, date, slot, scans: [] });
}
const GUESS = () => {
  const t = today(), now = new Date(), nm = now.getHours() * 60 + now.getMinutes(), bl = blocksOn(t).filter(b => b.start && !b.v.every(cancelled));
  const cur = bl.find(b => b.end && nm >= mins(b.start) && nm < mins(b.end)) || bl.filter(b => mins(b.start) <= nm).pop();
  return cur ? baseKey((cur.v.find(l => !cancelled(l)) || cur.v[0]).s) : '';
};

/* ---------- Praxisstunden ---------- */
function prModal(id) {
  const e = id ? S.practicum.entries.find(x => x.id === id) : { date: today(), hours: '', place: '', note: '' };
  modal(id ? 'Eintrag ändern' : 'Stunden eintragen', F('Datum', 'date', e.date, 'date', 'required') + F('Stunden', 'hours', e.hours, 'number', 'required min="0.25" max="24" step="0.25" inputmode="decimal"') + F('Einrichtung', 'place', e.place, 'text', 'maxlength="80"') + F('Notiz', 'note', e.note, 'text', 'maxlength="160"'),
    d => { const v = { date: d.date, hours: num(d.hours), place: d.place.trim(), note: d.note.trim() }; if (!(v.hours > 0)) return false; if (id) Object.assign(e, v); else S.practicum.entries.push(Object.assign({ id: uid() }, v)); },
    { del: id ? () => { S.practicum.entries = S.practicum.entries.filter(x => x.id !== id); } : null });
}

/* ---------- Wochenplan von Hand ---------- */
function ttSheet() {
  const rows = (S.timetable || []).slice().sort((a, b) => a.dow - b.dow || a.start.localeCompare(b.start));
  showSheet('Wochenplan von Hand', `<p class="small muted">Für Stundenpläne ohne Schnittstelle. Jeder Eintrag wiederholt sich jede Woche. Mit „gültig von/bis“ lässt sich ein Semester eingrenzen.</p>
    <div style="margin:12px 0">${rows.length ? rows.map(e => `<div class="item"><div class="grow"><b>${DAYS[e.dow].slice(0, 2)} ${e.start}–${e.end}</b> ${esc(e.subject)}<div class="small muted">${esc([e.teacher, e.room].filter(Boolean).join(' · '))}${e.from || e.to ? ` · ${e.from ? fmtDate(e.from) : ''} bis ${e.to ? fmtDate(e.to) : ''}` : ''}</div></div><button class="btn sm" data-act="ttedit" data-id="${e.id}">Ändern</button></div>`).join('') : '<p class="empty">Noch keine Einträge.</p>'}</div>
    <div class="row end"><button class="btn primary" data-act="ttedit">Eintrag hinzufügen</button><button class="btn ghost" data-act="fclose">Fertig</button></div>`);
}
function ttModal(id) {
  const e = id ? S.timetable.find(x => x.id === id) : { dow: 0, start: '08:15', end: '09:45', subject: '', teacher: '', room: '', from: '', to: '' };
  modal(id ? 'Eintrag ändern' : 'Neuer Eintrag',
    `<label class="field"><span>Wochentag</span><select name="dow">${DAYS.map((d, i) => `<option value="${i}" ${e.dow === i ? 'selected' : ''}>${d}</option>`).join('')}</select></label>` +
    `<div class="row" style="flex-wrap:nowrap"><div style="flex:1">${F('Beginn', 'start', e.start, 'time', 'required')}</div><div style="flex:1">${F('Ende', 'end', e.end, 'time', 'required')}</div></div>` +
    F(esc(P.terms.subject), 'subject', e.subject, 'text', 'required maxlength="60" placeholder="z. B. Analysis I"') + F('Lehrkraft oder Dozent', 'teacher', e.teacher, 'text', 'maxlength="60"') + F('Raum', 'room', e.room, 'text', 'maxlength="40"') +
    `<div class="row" style="flex-wrap:nowrap"><div style="flex:1">${F('Gültig von', 'from', e.from, 'date')}</div><div style="flex:1">${F('Gültig bis', 'to', e.to, 'date')}</div></div>`,
    d => {
      if (d.end <= d.start) { toast('Das Ende muss nach dem Beginn liegen.'); return false; }
      const v = { dow: +d.dow, start: d.start, end: d.end, subject: d.subject.trim(), teacher: d.teacher.trim(), room: d.room.trim(), from: d.from, to: d.to };
      if (id) Object.assign(e, v); else S.timetable.push(Object.assign({ id: uid() }, v));
      setTimeout(ttSheet, 0);
    },
    { del: id ? () => { S.timetable = S.timetable.filter(x => x.id !== id); setTimeout(ttSheet, 0); } : null });
}

/* ---------- Eigene Links ---------- */
function linksModal() {
  const own = ((S.settings.links || [])[0] || { items: [] }).items;
  modal('Eigene Links', `<label class="field"><span>Eine Zeile pro Link: Titel | Link | Beschreibung (optional)</span><textarea name="links" rows="8" placeholder="Hermes Agent | https://… | Mein KI-Agent">${esc(own.map(i => `${i[0]} | ${i[2]} | ${i[1] || ''}`).join('\n'))}</textarea></label>
    <p class="small muted">Sie erscheinen unter „Mehr“ in der Gruppe „Eigene Links“, zum Beispiel Lernplattformen deiner Schule oder Hochschule.</p>`,
    d => {
      const items = d.links.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [t, u, ...r] = l.split('|').map(x => x.trim()); return u ? [t, r.join(' | '), u] : null; }).filter(Boolean);
      S.settings.links = items.length ? [{ group: 'Eigene Links', items }] : [];
    });
}

/* ---------- Einstellungen ---------- */
function settingsModal() {
  const B = S.settings.blocks;
  modal('Einstellungen',
    F('Name der App', 'appName', S.settings.appName || '', 'text', `maxlength="40" placeholder="${esc(CFG.appName)}"`) +
    `<label class="field"><span>Profil</span><select name="profile">${CFG.profiles.map(p => `<option value="${p.id}" ${p.id === P.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` +
    ((P.sources || []).includes('schulmanager') ? F('Schulmanager-Link', 'sm', S.settings.sm) : '') +
    (P.practicum.enabled ? F(`${esc(P.practicum.label)}: Ziel in Stunden`, 'target', S.settings.practicumTarget || P.practicum.targetHours, 'number', 'min="0" max="9999"') : '') +
    (P.credits.enabled ? F(`${esc(P.credits.label)}: Ziel`, 'ctarget', S.settings.creditsTarget || P.credits.target, 'number', 'min="0" max="999"') : '') +
    `<label class="field"><span>Darstellung</span><select name="theme">${[['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([k, v]) => `<option value="${k}" ${S.settings.theme === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>` +
    `<div class="field"><span>Zeiten der Doppelstunden (nur für Stundenpläne mit Stundennummern, z. B. Schulmanager)</span>${B.map((p, i) => `<div class="row" style="margin-bottom:6px"><b style="width:64px">Block ${i + 1}</b><input type="time" name="s${i}" value="${p[0]}" style="width:130px"><input type="time" name="e${i}" value="${p[1]}" style="width:130px"></div>`).join('')}</div>` +
    `<p class="small muted">Alle Daten liegen auf deinem Server im Ordner „data“. Gib hier keine Passwörter ein.</p>`,
    async d => {
      S.settings.appName = d.appName.trim(); S.settings.theme = d.theme;
      if (d.sm !== undefined) S.settings.sm = d.sm.trim() || 'https://www.schulmanager-online.de/';
      if (d.target !== undefined) S.settings.practicumTarget = parseInt(d.target, 10) || null;
      if (d.ctarget !== undefined) S.settings.creditsTarget = parseInt(d.ctarget, 10) || null;
      S.settings.blocks = B.map((p, i) => [d['s' + i] || p[0], d['e' + i] || p[1]]);
      if (d.profile !== P.id) { S.settings.profile = d.profile; await api('PUT', '/state', { state: S }); location.reload(); }
    });
}
