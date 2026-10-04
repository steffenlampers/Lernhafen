'use strict';
const test = require('node:test');
const assert = require('node:assert');
const sm = require('../src/schulmanager');
const profiles = require('../src/profiles');

test('Stunde wird in eine Plan-Zeile umgewandelt', () => {
  const r = sm.lessonLine({ date: '2026-10-05T00:00:00.000Z', type: 'regularLesson', classHour: { number: 3 },
    actualLesson: { subject: { abbreviation: 'SKLPäd' }, room: { name: 'C1' }, teachers: [{ abbreviation: 'Krö' }] } });
  assert.deepStrictEqual(r, { date: '2026-10-05', line: '3|SKLPäd|Krö|C1|' });
});

test('Ausfall nimmt das ursprüngliche Fach und wird markiert', () => {
  const r = sm.lessonLine({ date: '2026-10-02', type: 'cancel', classHour: { number: 5 }, originalLessons: [{ subject: { abbreviation: 'EM' }, room: { name: 'C15' }, teachers: [{ abbreviation: 'HRei' }] }] });
  assert.strictEqual(r.line, '5|EM|HRei|C15|cancelled');
});

test('Vertretung wird als substitution markiert', () => {
  const r = sm.lessonLine({ date: '2026-10-06', type: 'substitution', classHour: { number: 1 }, actualLesson: { subject: { abbreviation: 'Psych' } } });
  assert.strictEqual(r.line, '1|Psych|||substitution');
});

test('collect ordnet Stunden den Tagen zu und zählt', () => {
  const { days, count } = sm.collect([{ data: [
    { date: '2026-10-05', classHour: { number: 1 }, actualLesson: { subject: { abbreviation: 'A' } } },
    { date: '2026-10-05', classHour: { number: 2 }, actualLesson: { subject: { abbreviation: 'A' } } },
    { date: 'kaputt', classHour: { number: 1 } }] }]);
  assert.strictEqual(count, 2);
  assert.strictEqual(days['2026-10-05'].length, 2);
});

test('mergePlan behält ältere Tage und ersetzt neue', () => {
  const old = { from: '2026-09-28', days: { '2026-09-30': ['1|X|||'], '2026-10-05': ['1|ALT|||'] } };
  const p = sm.mergePlan(old, { '2026-10-05': ['1|NEU|||'] }, '2026-10-05', '2026-11-15');
  assert.deepStrictEqual(Object.keys(p.days).sort(), ['2026-09-30', '2026-10-05']);
  assert.strictEqual(p.days['2026-10-05'][0], '1|NEU|||');
  assert.strictEqual(p.from, '2026-09-28');
  assert.strictEqual(p.to, '2026-11-15');
});

test('Passwort-Hash hat die Länge, die Schulmanager erwartet (512 Byte als Hex)', async () => {
  const h = await sm.hashPassword('geheim', 'salz');
  assert.match(h, /^[0-9a-f]{1024}$/);
});

test('Alle Profil-Pakete sind vollständig', () => {
  const list = profiles.list();
  assert.ok(list.length >= 6);
  for (const { id } of list) {
    const p = profiles.load(id);
    assert.ok(p.eventTypes.length > 0 && p.eventTypes.every(t => t.id && t.label && t.tone), id);
    assert.ok(Array.isArray(p.blocks) && p.blocks.length > 0, id);
    assert.ok(p.terms && p.terms.subject && p.terms.subjects && p.terms.lesson, id);
    assert.ok(p.eventTypes.some(t => t.study) && p.eventTypes.some(t => t.exam), id);
    assert.ok(p.grading && ['de', 'points15', 'percent'].includes(p.grading.scale) && p.credits && p.sources.length, id);
    assert.ok(p.links.every(g => g.group && g.items.every(i => i.length === 3 && /^https:\/\//.test(i[2]))), id);
  }
});

test('Unbekanntes Profil fällt auf "allgemein" zurück', () => {
  assert.strictEqual(profiles.load('../etc/passwd').id, 'allgemein');
});
