'use strict';
// Eingebaute Editoren: Text (.docx), Tabellen (.xlsx) und Folien (.pptx). Alles läuft im Container, ohne externen Dienst.
// Der Browser bearbeitet HTML, Zellen und Folientexte; hier werden daraus echte Word-, Excel- und PowerPoint-Dateien.
const mammoth = require('mammoth');
const HTMLtoDOCX = require('html-to-docx');
const ExcelJS = require('exceljs');
const PptxGenJS = require('pptxgenjs');
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');
const files = require('./files');

const MAX_COLS = 52, MAX_ROWS = 2000, MAX_SHEETS = 8;
const FLAG = 'Lernhafen';                                   // Kennzeichen in selbst erstellten Folien: nur diese dürfen wir verlustfrei neu schreiben

function fileOf(id, kinds) {
  const f = files.find(id), p = f && files.filePath(id);
  if (!f || !p) throw new Error('Datei nicht gefunden.');
  const ext = path.extname(f.name).slice(1).toLowerCase();
  if (!kinds.includes(ext)) throw new Error('Dieser Dateityp passt nicht zum Editor.');
  return { f, p, ext };
}

/* ---------- Text ---------- */
async function docRead(id) {
  const { p, ext, f } = fileOf(id, ['docx']);
  const r = await mammoth.convertToHtml({ buffer: fs.readFileSync(p) }, { styleMap: ['u => u', 'strike => s', "p[style-name='Title'] => h1:fresh", "p[style-name='Heading 1'] => h1:fresh", "p[style-name='Heading 2'] => h2:fresh", "p[style-name='Heading 3'] => h3:fresh"] });
  return { html: r.value, name: f.name, ext, ours: !!f.ours, warnings: r.messages.filter(m => m.type === 'warning').length };
}
async function docWrite(id, html) {
  const { f } = fileOf(id, ['docx']);
  html = String(html || '').slice(0, 5 * 1024 * 1024).replace(/<(\/?)em\b/gi, '<$1i').replace(/<(\/?)strong\b/gi, '<$1b');   // die Umwandlung kennt <i> und <b> sicher
  const buf = await HTMLtoDOCX(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`, null, { table: { row: { cantSplit: true } }, footer: false, pageNumber: false, font: 'Calibri', fontSize: 22 });
  return files.replace(f.id, Buffer.from(buf));
}

/* ---------- Tabellen ---------- */
function cellValue(c) {
  if (c == null || c.value == null) return '';
  if (c.formula) return '=' + c.formula;
  const v = c.value;
  if (typeof v === 'object') { if (v.formula) return '=' + v.formula; if (v.richText) return v.richText.map(t => t.text).join(''); if (v.text) return String(v.text); if (v instanceof Date) return v.toISOString().slice(0, 10); if (v.result != null) return v.result; return ''; }
  return v;
}
async function sheetRead(id) {
  const { p, f } = fileOf(id, ['xlsx']);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(p);
  const sheets = [];
  wb.eachSheet(ws => {
    if (sheets.length >= MAX_SHEETS) return;
    const rows = Math.min(ws.rowCount, MAX_ROWS), cols = Math.min(ws.columnCount, MAX_COLS), data = [];
    for (let r = 1; r <= rows; r++) { const row = []; for (let c = 1; c <= cols; c++) row.push(cellValue(ws.getRow(r).getCell(c))); data.push(row); }
    sheets.push({ name: ws.name, data });
  });
  if (!sheets.length) sheets.push({ name: 'Tabelle1', data: [] });
  return { sheets, name: f.name, ours: !!f.ours, truncated: wb.worksheets.some(w => w.rowCount > MAX_ROWS || w.columnCount > MAX_COLS) };
}
async function sheetWrite(id, sheets) {
  const { f } = fileOf(id, ['xlsx']);
  if (!Array.isArray(sheets) || !sheets.length || sheets.length > MAX_SHEETS) throw new Error('Ungültige Tabelle.');
  const wb = new ExcelJS.Workbook(); wb.creator = FLAG; const used = new Set();
  for (const [i, s] of sheets.entries()) {
    let name = String(s.name || 'Tabelle' + (i + 1)).replace(/[\\/?*\[\]:]/g, '_').slice(0, 31) || 'Tabelle' + (i + 1);
    while (used.has(name.toLowerCase())) name = name.slice(0, 28) + '_' + (i + 1); used.add(name.toLowerCase());
    const ws = wb.addWorksheet(name), data = Array.isArray(s.data) ? s.data.slice(0, MAX_ROWS) : [];
    data.forEach((row, r) => (Array.isArray(row) ? row.slice(0, MAX_COLS) : []).forEach((v, c) => {
      if (v === '' || v == null) return;
      const cell = ws.getCell(r + 1, c + 1);
      if (typeof v === 'string' && /^=.{1,}/.test(v)) cell.value = { formula: v.slice(1) };
      else if (typeof v === 'number') cell.value = v;
      else if (typeof v === 'string' && /^-?\d+([.,]\d+)?$/.test(v.trim())) cell.value = parseFloat(v.replace(',', '.'));
      else cell.value = String(v).slice(0, 32000);
    }));
    ws.columns.forEach(col => { col.width = 16; });
  }
  const buf = await wb.xlsx.writeBuffer();
  return files.replace(f.id, Buffer.from(buf));
}

/* ---------- Folien ---------- */
const xmlText = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
async function slidesRead(id) {
  const { p, f } = fileOf(id, ['pptx']);
  const zip = await JSZip.loadAsync(fs.readFileSync(p));
  const core = zip.file('docProps/core.xml') ? await zip.file('docProps/core.xml').async('string') : '';
  const names = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
  const slides = [];
  for (const n of names.slice(0, 200)) {
    const xml = await zip.file(n).async('string');
    const paras = (xml.match(/<a:p>[\s\S]*?<\/a:p>|<a:p\b[^>]*>[\s\S]*?<\/a:p>/g) || []).map(pa => xmlText((pa.match(/<a:t>([\s\S]*?)<\/a:t>/g) || []).map(t => t.replace(/<\/?a:t>/g, '')).join(''))).filter(t => t.trim());
    slides.push({ title: paras[0] || '', body: paras.slice(1).join('\n') });
  }
  return { slides: slides.length ? slides : [{ title: '', body: '' }], ours: !!f.ours, name: f.name };
}
async function slidesBuild(slides) {
  const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_WIDE'; pptx.author = FLAG; pptx.subject = FLAG; pptx.title = 'Präsentation';
  for (const s of slides.slice(0, 200)) {
    const sl = pptx.addSlide(); sl.background = { color: 'FFFFFF' };
    sl.addText(String(s.title || '').slice(0, 300), { x: 0.6, y: 0.4, w: 12.1, h: 1.1, fontSize: 36, bold: true, color: '12282B', fontFace: 'Calibri', valign: 'middle' });
    const lines = String(s.body || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 40);
    if (lines.length) sl.addText(lines.map(t => ({ text: t.slice(0, 500), options: { bullet: true, breakLine: true } })), { x: 0.8, y: 1.7, w: 11.7, h: 5.2, fontSize: 24, color: '12282B', fontFace: 'Calibri', valign: 'top', paraSpaceAfter: 8 });
  }
  return pptx.write({ outputType: 'nodebuffer' });
}
async function slidesWrite(id, slides) {
  const { f } = fileOf(id, ['pptx']);
  if (!Array.isArray(slides) || !slides.length) throw new Error('Ungültige Präsentation.');
  return files.replace(f.id, Buffer.from(await slidesBuild(slides)));
}
async function slidesTemplate() { return slidesBuild([{ title: 'Titel der Präsentation', body: 'Erster Punkt\nZweiter Punkt' }]); }

/* ---------- Mitschriften: ganz normale Word-Dokumente im Ordner des Fachs ---------- */
const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const textToHtml = text => String(text || '').split(/\n/).map(l => `<p>${escHtml(l) || '<br>'}</p>`).join('');
const dayName = d => ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(d + 'T12:00:00').getDay()];
/** Neue Mitschrift anlegen. Existiert zu dem Slot (Stunde) schon eine, wird sie zurückgegeben. */
async function noteCreate({ subject, title, date, slot, text }) {
  subject = String(subject || ''); date = /^\d{4}-\d\d-\d\d$/.test(date || '') ? date : new Date().toISOString().slice(0, 10);
  if (slot) { const ex = files.list().find(f => f.slot === slot); if (ex) return ex; }
  const name = `${date} ${String(title || '').trim() || 'Mitschrift'}`.slice(0, 80);
  const rec = files.create('dokument', subject, name);
  files.update(rec.id, { note: true, noteDate: date, slot: slot || '' });
  await docWrite(rec.id, textToHtml(text));
  return files.list().find(f => f.id === rec.id);
}
/** Alte Mitschriften aus dem Datenspeicher (state.notes) einmalig in Dokumente umwandeln. */
async function notesMigrate(store) {
  const st = store.read('state', null); if (!st || !st.notes) return 0;
  let n = 0;
  for (const [subject, list] of Object.entries(st.notes)) {
    const keep = [];
    for (const note of list || []) {
      try { await noteCreate({ subject, title: note.title, date: note.date, slot: note.slot, text: note.body }); n++; } catch (e) { keep.push(note); }
    }
    st.notes[subject] = keep;
  }
  if (n) { st._rev = Date.now(); store.write('state', st); }
  return n;
}

/* ---------- Suche im Text der Dokumente ---------- */
const textCache = new Map();
async function docText(f, p) {
  const key = f.id + f.modified, c = textCache.get(f.id);
  if (c && c.key === key) return c.text;
  let text = ''; try { text = (await mammoth.extractRawText({ buffer: fs.readFileSync(p) })).value; } catch (e) { /* kaputte Datei */ }
  textCache.set(f.id, { key, text }); return text;
}
async function searchDocs(q) {
  const out = [];
  for (const f of files.list().filter(x => /\.docx$/i.test(x.name)).slice(0, 400)) {
    const p = files.filePath(f.id); if (!p) continue;
    const text = await docText(f, p), i = text.toLowerCase().indexOf(q);
    if (i >= 0 || f.name.toLowerCase().includes(q)) out.push({ id: f.id, name: f.name, subject: f.subject, note: !!f.note, snippet: i >= 0 ? text.slice(Math.max(0, i - 30), i + 90).replace(/\s+/g, ' ') : '' });
    if (out.length >= 30) break;
  }
  return out;
}

module.exports = { noteCreate, notesMigrate, searchDocs, dayName, docRead, docWrite, sheetRead, sheetWrite, slidesRead, slidesWrite, slidesTemplate };
