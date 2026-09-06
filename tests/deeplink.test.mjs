// Testvektoren aus tests/fixtures/deeplink-cases.json (Segment 0, in allen drei
// Site-Repos byte-identisch) gegen js/deeplink.js. Dazu ein paar Faelle, die nur
// hier gebraucht werden: Vertrag der Rueckgabe, Robustheit gegen kaputte Eingaben.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const deeplink = require(join(here, '..', 'js', 'deeplink.js'));
const cases = JSON.parse(readFileSync(join(here, 'fixtures', 'deeplink-cases.json'), 'utf8'));

// "2026-09-06" als lokale Mitternacht, so wie ein Browser das Tagesdatum sieht.
function localDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function cfgOf(c) {
  return {
    today: localDay(c.today),
    properties: c.site.properties,
    langs: c.site.langs,
    defaultProperty: c.site.defaultProperty,
  };
}

test('Fixture-Datei traegt die 46 Faelle des Kontrakts K1', () => {
  assert.ok(Array.isArray(cases));
  assert.equal(cases.length, 46);
});

for (const c of cases) {
  test(`fixture: ${c.name}`, () => {
    const got = deeplink.parse(c.query, cfgOf(c));
    assert.deepStrictEqual(got, c.expect);
  });
}

test('VERSION ist 1', () => {
  assert.equal(deeplink.VERSION, '1');
});

test('Rueckgabe traegt immer alle fuenf Schluessel', () => {
  const got = deeplink.parse('', { today: localDay('2026-09-06'), properties: { MUBRIG: 6 }, langs: ['de', 'en'], defaultProperty: 'MUBRIG' });
  assert.deepStrictEqual(Object.keys(got).sort(), ['campaign', 'google', 'preselect', 'search', 'source']);
});

test('MUBRIG: adults=7 klemmt auf 6, children fallen auf 0', () => {
  const got = deeplink.parse('?arrival=2026-10-10&departure=2026-10-12&adults=7&children=2', {
    today: localDay('2026-09-06'), properties: { MUBRIG: 6 }, langs: ['de', 'en'], defaultProperty: 'MUBRIG',
  });
  assert.equal(got.search.adults, 6);
  assert.equal(got.search.children, 0);
});

test('MUBRIG: lang=fr faellt auf en, lang=de bleibt de', () => {
  const cfg = { today: localDay('2026-09-06'), properties: { MUBRIG: 6 }, langs: ['de', 'en'], defaultProperty: 'MUBRIG' };
  assert.equal(deeplink.parse('?arrival=2026-10-10&departure=2026-10-12&lang=fr', cfg).search.lang, 'en');
  assert.equal(deeplink.parse('?arrival=2026-10-10&departure=2026-10-12&lang=de', cfg).search.lang, 'de');
});

test('MUBRIG: fremdes Haus liefert keine Suche, Quelle bleibt erhalten', () => {
  const got = deeplink.parse('?property=HCSI&arrival=2026-10-10&departure=2026-10-12&gverify=true', {
    today: localDay('2026-09-06'), properties: { MUBRIG: 6 }, langs: ['de', 'en'], defaultProperty: 'MUBRIG',
  });
  assert.equal(got.search, null);
  assert.equal(got.source, 'google_verify');
});

test('Kaputte Eingaben werfen nicht', () => {
  const cfg = { today: localDay('2026-09-06'), properties: { MUBRIG: 6 }, langs: ['de', 'en'], defaultProperty: 'MUBRIG' };
  for (const q of [null, undefined, '?', '?&&&', '?arrival=', '?adults=%E2%80%A6', '?arrival=2026-10-10&departure=2026-10-12&room=%20%20']) {
    assert.doesNotThrow(() => deeplink.parse(q, cfg));
  }
  assert.equal(deeplink.parse('?arrival=2026-10-10&departure=2026-10-12&room=%20%20', cfg).preselect, null);
});

test('Ohne cfg wirft parse nicht und liefert keine Suche', () => {
  const got = deeplink.parse('?arrival=2026-10-10&departure=2026-10-12');
  assert.equal(got.search, null);
});

// Der Harness baut den Preisvergleich auf gtotal als Zeichenkette auf; fuehrende
// Nullen und Ganzzahlen muessen deshalb unveraendert durchkommen.
test('gtotal bleibt Zeichenkette, ucur nur in Grossbuchstaben', () => {
  const cfg = { today: localDay('2026-09-06'), properties: { MUBRIG: 6 }, langs: ['de', 'en'], defaultProperty: 'MUBRIG' };
  const got = deeplink.parse('?arrival=2026-10-10&departure=2026-10-12&gtotal=04.50&ucur=chf', cfg);
  assert.deepStrictEqual(got.google, { ucur: null, gtotal: '04.50' });
});
