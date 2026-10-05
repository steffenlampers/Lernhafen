'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createCalc, normalize, colName, colIndex } = require('../public/js/sheetcalc.js');

const grid = rows => createCalc((r, c) => (rows[r] || [])[c]);
const val = (rows, ref) => { const c = createCalc((r, cc) => (rows[r] || [])[cc]); const [, col, row] = /^([A-Z]+)(\d+)$/.exec(ref); return c.show(+row - 1, colIndex(col)).text; };

test('Spaltennamen', () => { assert.strictEqual(colName(0), 'A'); assert.strictEqual(colName(25), 'Z'); assert.strictEqual(colName(26), 'AA'); assert.strictEqual(colIndex('AB'), 27); });

test('Rechnen mit Punkt-vor-Strich, Klammern, Potenz, Minus, Prozent', () => {
  const r = [['=2+3*4', '=(2+3)*4', '=2^3', '=-2^2', '=10/4', '=50%', '=2+3-1']];
  assert.deepStrictEqual(r[0].map((_, i) => val(r, 'ABCDEFG'[i] + '1')), ['14', '20', '8', '4', '2,5', '0,5', '4']);
});

test('Zellbezüge, Bereiche und Funktionen', () => {
  const r = [[1, '2,5', 3], ['=SUM(A1:C1)', '=AVERAGE(A1:C1)', '=MAX(A1:C1)'], ['=MIN(A1:C1)', '=COUNT(A1:C1)', '=A1+B1*C1'], ['=ROUND(2.567;2)', '=IF(A1<B1;"klein";"groß")', '=A1&"-"&C1']];
  assert.deepStrictEqual([val(r, 'A2'), val(r, 'B2'), val(r, 'C2')], ['6,5', '2,1666666667', '3']);
  assert.deepStrictEqual([val(r, 'A3'), val(r, 'B3'), val(r, 'C3')], ['1', '3', '8,5']);
  assert.deepStrictEqual([val(r, 'A4'), val(r, 'B4'), val(r, 'C4')], ['2,57', 'klein', '1-3']);
});

test('Deutsche Funktionsnamen und Semikolon werden zu englischen Formeln', () => {
  assert.strictEqual(normalize('=SUMME(A1;A3)'), '=SUM(A1,A3)');
  assert.strictEqual(normalize('=WENN(A1>2;"ja;nein";MITTELWERT(B1:B3))'), '=IF(A1>2,"ja;nein",AVERAGE(B1:B3))');
  assert.strictEqual(normalize('Text mit ; Semikolon'), 'Text mit ; Semikolon');
  const r = [[4, 6], ['=SUMME(A1:B1)', '=WENN(A1>B1;1;2)']];
  assert.deepStrictEqual([val(r, 'A2'), val(r, 'B2')], ['10', '2']);
});

test('Fehler statt Absturz: Division durch null, falscher Bezug, Zyklus, unbekannte Funktion, Text in Rechnung', () => {
  const r = [['=1/0', '=B1', '=A2', '=FOO(1)', '=A5+1', 'Text', '=1+'], ['=B2', '=A2']];
  assert.strictEqual(val(r, 'A1'), '#DIV/0!'); assert.strictEqual(val(r, 'B1'), '#ZYKLUS!'); assert.strictEqual(val(r, 'D1'), '#NAME?');
  assert.strictEqual(val(r, 'E1'), '1'); assert.strictEqual(val(r, 'G1'), '#FEHLER!'); assert.strictEqual(val(r, 'A2'), '#ZYKLUS!');
  assert.strictEqual(val([['Text', '=A1+1']], 'B1'), '#WERT!');
});

test('Kein eval: Code in Formeln wird nie ausgeführt', () => {
  globalThis.__hit = 0;
  const bad = ['=alert(1)', '=constructor.constructor("globalThis.__hit=1")()', '=(function(){globalThis.__hit=1})()', '=A1;globalThis.__hit=1', '=1;globalThis.__hit=1', '=this', '="x".constructor'];
  bad.forEach((f, i) => { const out = val([[f]], 'A1'); assert.match(out, /^#/, f + ' → ' + out); });
  assert.strictEqual(globalThis.__hit, 0);
});

test('Text, Wahrheitswerte, Vergleiche und leere Zellen', () => {
  const r = [['a', 'A', '', '=A1=B1', '=C1+1', '=AND(1=1;2>1)', '=NOT(FALSE)', '=LEN("Haus")', '=CONCAT("a";"b";1)']];
  assert.deepStrictEqual(r[0].map((_, i) => val(r, 'ABCDEFGHI'[i] + '1')).slice(3), ['WAHR', '1', 'WAHR', 'WAHR', '4', 'ab1']);
});
