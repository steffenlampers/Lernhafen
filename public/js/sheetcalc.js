'use strict';
/* Lernhafen – Formelrechner für Tabellen. Rechnet ohne eval: Zahlen, Text, + - * / ^ & Vergleiche, Zellbezüge (A1, $A$1), Bereiche (A1:B5)
   und die gängigen Funktionen. Deutsche Namen (SUMME, WENN, …) werden beim Eingeben in die englischen umgewandelt, damit Excel die Datei versteht. */
(function (root) {
  const ALIAS = { SUMME: 'SUM', MITTELWERT: 'AVERAGE', WENN: 'IF', RUNDEN: 'ROUND', ANZAHL: 'COUNT', ANZAHL2: 'COUNTA', WURZEL: 'SQRT', POTENZ: 'POWER', REST: 'MOD', GANZZAHL: 'INT', BETRAG: 'ABS', UND: 'AND', ODER: 'OR', NICHT: 'NOT', LÄNGE: 'LEN', VERKETTEN: 'CONCAT', WAHR: 'TRUE', FALSCH: 'FALSE' };
  const colName = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const colIndex = s => { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const REF = /^\$?([A-Z]{1,2})\$?(\d{1,4})$/;
  const NUM = /^-?\d+([.,]\d+)?$/;
  class CalcError extends Error { constructor(code) { super(code); this.code = code; } }

  /** Eingabe aufräumen: deutsche Funktionsnamen → englisch, ; → , (außerhalb von Text). */
  function normalize(raw) {
    raw = String(raw);
    if (!/^=/.test(raw)) return raw;
    let out = '', i = 0;
    while (i < raw.length) {
      const ch = raw[i];
      if (ch === '"') { let j = i + 1; while (j < raw.length && !(raw[j] === '"' && raw[j + 1] !== '"')) j += raw[j] === '"' ? 2 : 1; out += raw.slice(i, j + 1); i = j + 1; continue; }
      if (ch === ';') { out += ','; i++; continue; }
      const m = /^[A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß0-9_.]*/.exec(raw.slice(i));
      if (m) { const w = m[0].toUpperCase(); out += ALIAS[w] || (REF.test(w) ? w : w); i += m[0].length; continue; }
      out += ch; i++;
    }
    return out;
  }

  function tokenize(src) {
    const t = []; let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '"') { let j = i + 1, s = ''; while (j < src.length) { if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue; } break; } s += src[j++]; } if (j >= src.length) throw new CalcError('#NAME?'); t.push({ k: 'str', v: s }); i = j + 1; continue; }
      let m = /^\d+(\.\d+)?|^\.\d+/.exec(src.slice(i)); if (m) { t.push({ k: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
      m = /^\$?[A-Z]{1,2}\$?\d{1,4}(?![A-Za-z0-9_(])/.exec(src.slice(i)); if (m) { t.push({ k: 'ref', v: m[0] }); i += m[0].length; continue; }
      m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(i)); if (m) { t.push({ k: 'id', v: m[0].toUpperCase() }); i += m[0].length; continue; }
      m = /^(<=|>=|<>|[-+*\/^&=<>(),:%])/.exec(src.slice(i)); if (m) { t.push({ k: 'op', v: m[0] }); i += m[0].length; continue; }
      throw new CalcError('#NAME?');
    }
    return t;
  }

  /** Rechner für ein Blatt. getRaw(zeile, spalte) liefert den Eintrag der Zelle (nullbasiert). */
  function createCalc(getRaw) {
    const memo = new Map(), busy = new Set();
    const num = v => {
      if (typeof v === 'number') return v; if (typeof v === 'boolean') return v ? 1 : 0; if (v === '' || v == null) return 0;
      if (typeof v === 'string' && NUM.test(v.trim())) return parseFloat(v.trim().replace(',', '.')); throw new CalcError('#WERT!');
    };
    const txt = v => (typeof v === 'number' ? String(Math.round(v * 1e10) / 1e10) : v === true ? 'WAHR' : v === false ? 'FALSCH' : v == null ? '' : String(v));
    const cell = (r, c) => {
      const key = r + ',' + c; if (memo.has(key)) { const m = memo.get(key); if (m instanceof CalcError) throw m; return m; }
      if (busy.has(key)) throw new CalcError('#ZYKLUS!');
      const raw = getRaw(r, c); let val;
      if (raw == null || raw === '') val = '';
      else if (typeof raw === 'number') val = raw;
      else if (/^=/.test(raw)) { busy.add(key); try { val = run(normalize(raw).slice(1)); } catch (e) { busy.delete(key); const err = e instanceof CalcError ? e : new CalcError('#FEHLER!'); memo.set(key, err); throw err; } busy.delete(key); }
      else if (NUM.test(String(raw).trim())) val = parseFloat(String(raw).trim().replace(',', '.'));
      else val = String(raw);
      memo.set(key, val); return val;
    };
    const refPos = s => { const m = REF.exec(s); if (!m) throw new CalcError('#BEZUG!'); return [parseInt(m[2], 10) - 1, colIndex(m[1])]; };
    const range = (a, b) => { const [r1, c1] = refPos(a), [r2, c2] = refPos(b), out = []; for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) out.push(cell(r, c)); if (out.length > 20000) throw new CalcError('#WERT!'); return out; };
    const flat = args => args.flatMap(a => (Array.isArray(a) ? a : [a]));
    const nums = args => args.flatMap(a => Array.isArray(a) ? a.filter(v => typeof v === 'number') : [num(a)]);
    const FN = {
      SUM: a => nums(a).reduce((x, y) => x + y, 0), AVERAGE: a => { const n = nums(a); if (!n.length) throw new CalcError('#DIV/0!'); return n.reduce((x, y) => x + y, 0) / n.length; },
      MIN: a => { const n = nums(a); return n.length ? Math.min(...n) : 0; }, MAX: a => { const n = nums(a); return n.length ? Math.max(...n) : 0; },
      COUNT: a => nums(a).length, COUNTA: a => flat(a).filter(v => v !== '' && v != null).length,
      IF: a => (a.length < 2 ? (() => { throw new CalcError('#WERT!'); })() : (truthy(a[0]) ? a[1] : (a.length > 2 ? a[2] : false))),
      AND: a => flat(a).every(truthy), OR: a => flat(a).some(truthy), NOT: a => !truthy(a[0]), TRUE: () => true, FALSE: () => false,
      ROUND: a => { const d = a.length > 1 ? num(a[1]) : 0, f = 10 ** d; return Math.round(num(a[0]) * f) / f; }, ABS: a => Math.abs(num(a[0])),
      SQRT: a => { const v = num(a[0]); if (v < 0) throw new CalcError('#ZAHL!'); return Math.sqrt(v); }, POWER: a => num(a[0]) ** num(a[1]),
      MOD: a => { const d = num(a[1]); if (d === 0) throw new CalcError('#DIV/0!'); return num(a[0]) - d * Math.floor(num(a[0]) / d); }, INT: a => Math.floor(num(a[0])),
      LEN: a => txt(a[0]).length, CONCAT: a => flat(a).map(txt).join('')
    };
    const truthy = v => (typeof v === 'string' ? v !== '' && v.toUpperCase() !== 'FALSE' : !!v);
    function run(src) {
      const tk = tokenize(src); let p = 0;
      const peek = () => tk[p], eat = v => { const t = tk[p]; if (t && t.k === 'op' && t.v === v) { p++; return true; } return false; };
      function cmp() { let l = concat(); for (;;) { const t = peek(); if (t && t.k === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(t.v)) { p++; const r = concat(); l = compare(l, r, t.v); } else return l; } }
      function compare(a, b, op) { if (typeof a === 'string' && typeof b === 'string') { a = a.toLowerCase(); b = b.toLowerCase(); } else if (typeof a === 'string' || typeof b === 'string') { if (a === '' ) a = typeof b === 'string' ? '' : 0; if (b === '') b = typeof a === 'string' ? '' : 0; } switch (op) { case '=': return a === b; case '<>': return a !== b; case '<': return a < b; case '>': return a > b; case '<=': return a <= b; default: return a >= b; } }
      function concat() { let l = add(); while (eat('&')) l = txt(l) + txt(add()); return l; }
      function add() { let l = mul(); for (;;) { if (eat('+')) l = num(l) + num(mul()); else if (eat('-')) l = num(l) - num(mul()); else return l; } }
      function mul() { let l = pow(); for (;;) { if (eat('*')) l = num(l) * num(pow()); else if (eat('/')) { const d = num(pow()); if (d === 0) throw new CalcError('#DIV/0!'); l = num(l) / d; } else return l; } }
      function pow() { let l = unary(); while (eat('^')) l = num(l) ** num(unary()); return l; }
      function unary() { if (eat('-')) return -num(unary()); if (eat('+')) return num(unary()); return post(); }
      function post() { let v = primary(); while (eat('%')) v = num(v) / 100; return v; }
      function primary() {
        const t = tk[p++]; if (!t) throw new CalcError('#FEHLER!');
        if (t.k === 'num') return t.v; if (t.k === 'str') return t.v;
        if (t.k === 'ref') { if (eat(':')) { const t2 = tk[p++]; if (!t2 || t2.k !== 'ref') throw new CalcError('#BEZUG!'); return range(t.v, t2.v); } const [r, c] = refPos(t.v); return cell(r, c); }
        if (t.k === 'id') {
          if (!eat('(')) { if (t.v === 'TRUE') return true; if (t.v === 'FALSE') return false; throw new CalcError('#NAME?'); }
          const args = []; if (!eat(')')) { do { args.push(cmp()); } while (eat(',')); if (!eat(')')) throw new CalcError('#FEHLER!'); }
          const f = FN[t.v]; if (!f) throw new CalcError('#NAME?'); return f(args);
        }
        if (t.k === 'op' && t.v === '(') { const v = cmp(); if (!eat(')')) throw new CalcError('#FEHLER!'); return v; }
        throw new CalcError('#FEHLER!');
      }
      const v = cmp(); if (p < tk.length) throw new CalcError('#FEHLER!');
      return Array.isArray(v) ? v[0] : v;
    }
    /** Anzeigewert einer Zelle als Text und ob es ein Fehler ist. */
    function show(r, c) {
      try { const v = cell(r, c); if (typeof v === 'number') return { text: Number.isFinite(v) ? new Intl.NumberFormat('de-DE', { maximumFractionDigits: 10 }).format(v) : '#ZAHL!', num: true, error: !Number.isFinite(v) }; if (typeof v === 'boolean') return { text: v ? 'WAHR' : 'FALSCH', num: false }; return { text: String(v), num: false }; }
      catch (e) { return { text: e instanceof CalcError ? e.code : '#FEHLER!', error: true }; }
    }
    return { show, cell };
  }

  const api = { createCalc, normalize, colName, colIndex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SheetCalc = api;
})(typeof window !== 'undefined' ? window : globalThis);
