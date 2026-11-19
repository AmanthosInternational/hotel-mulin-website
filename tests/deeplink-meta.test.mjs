// Kontrakt K1 des Bauplans mulin-sofortbuchung (2026-11-18): Quelle Meta und der
// Parameter kampagne im Deep Link. Jeder Fall aus tests/fixtures/deeplink-meta-cases.json
// (Segment 0) laeuft durch parse(); dazu die Kriterien von Segment 2 einzeln benannt.
// Die 46 gemeinsamen Faelle bleiben in tests/deeplink.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const deeplinkPath = join(here, '..', 'js', 'deeplink.js');
const deeplink = require(deeplinkPath);
const cases = JSON.parse(readFileSync(join(here, 'fixtures', 'deeplink-meta-cases.json'), 'utf8'));

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

const CFG = { today: localDay('2026-11-18'), properties: { MUBRIG: 6 }, langs: ['de', 'en'], defaultProperty: 'MUBRIG' };
const DATES = '?arrival=2027-02-14&departure=2027-02-17&adults=2';
const FIVE = ['campaign', 'google', 'preselect', 'search', 'source'];

function sourceOf(query) {
  return deeplink.parse(DATES + query, CFG).source;
}

test('Fixture-Datei traegt die 22 Faelle aus Segment 0', () => {
  assert.ok(Array.isArray(cases));
  assert.equal(cases.length, 22);
});

for (const c of cases) {
  test(`meta-fixture: ${c.name}`, () => {
    const got = deeplink.parse(c.query, cfgOf(c));
    assert.deepStrictEqual(got, c.expect);
  });
}

test('Meta-Quellen ergeben meta_ads, auch gross geschrieben', () => {
  for (const s of ['meta', 'facebook', 'fb', 'instagram', 'ig', 'FB', 'Instagram', 'META']) {
    assert.equal(sourceOf(`&utm_source=${s}&utm_medium=paid&utm_campaign=mulin-test`), 'meta_ads', s);
  }
});

test('Meta-Quelle ohne utm_medium ergibt meta_ads', () => {
  assert.equal(sourceOf('&utm_source=ig'), 'meta_ads');
});

test('utm_medium=lead (klein verglichen) ergibt meta_lead', () => {
  for (const s of ['meta', 'facebook', 'fb', 'instagram', 'ig', 'FB']) {
    assert.equal(sourceOf(`&utm_source=${s}&utm_medium=lead&utm_campaign=mulin-test`), 'meta_lead', s);
    assert.equal(sourceOf(`&utm_source=${s}&utm_medium=Lead`), 'meta_lead', s);
  }
});

test('Fremde Quellen ergeben null', () => {
  assert.equal(sourceOf('&utm_source=newsletter&utm_medium=email&utm_campaign=mulin-test'), null);
  assert.equal(sourceOf('&utm_source=newsletter&utm_medium=lead'), null);
  assert.equal(sourceOf('&utm_source=metax&utm_medium=paid'), null);
  assert.equal(sourceOf('&utm_source=face-book&utm_medium=paid'), null);
  assert.equal(sourceOf('&utm_medium=lead&utm_campaign=mulin-test'), null);
});

test('Google-Regeln bleiben unveraendert und gehen vor', () => {
  assert.equal(sourceOf('&utm_source=google&utm_medium=organic&utm_campaign=hotel-fbl'), 'google_fbl');
  assert.equal(sourceOf('&utm_source=google&utm_medium=cpc&utm_campaign=hotel-ads'), 'google_hotel_ads');
  // google ohne hotel- Kampagne bleibt null und faellt nicht in die Meta-Regel
  assert.equal(sourceOf('&utm_source=google&utm_medium=lead&utm_campaign=mulin-test'), null);
  assert.equal(sourceOf('&utm_source=google&utm_medium=paid&utm_campaign=hotel-fbl'), null);
  // Google bleibt wie bisher gross- und kleinschreibungsgenau
  assert.equal(sourceOf('&utm_source=Google&utm_medium=organic&utm_campaign=hotel-fbl'), null);
});

test('gverify=true bleibt google_verify, auch mit Meta-Quelle', () => {
  assert.equal(sourceOf('&gverify=true&utm_source=meta&utm_medium=lead'), 'google_verify');
  assert.equal(sourceOf('&gverify=TRUE&utm_source=fb'), 'google_verify');
  assert.equal(sourceOf('&gverify=false&utm_source=fb'), 'meta_ads');
});

test('Meta-Quelle wird auch ohne Suche geliefert', () => {
  const got = deeplink.parse('?utm_source=meta&utm_medium=paid&utm_campaign=mulin-test', CFG);
  assert.equal(got.search, null);
  assert.equal(got.source, 'meta_ads');
});

test('kampagne=sofort erscheint als Schluessel kampagne', () => {
  const got = deeplink.parse(DATES + '&kampagne=sofort', CFG);
  assert.equal(got.kampagne, 'sofort');
  assert.deepStrictEqual(Object.keys(got).sort(), FIVE.concat('kampagne').sort());
});

test('kampagne wird nach dem Trimmen geprueft', () => {
  assert.equal(deeplink.parse(DATES + '&kampagne=%20sofort%20', CFG).kampagne, 'sofort');
  assert.equal(deeplink.parse(DATES + '&kampagne=mulin-2027-02', CFG).kampagne, 'mulin-2027-02');
});

test('Ungueltige kampagne: der Schluessel fehlt', () => {
  const bad = ['So%20fort%21', 'a'.repeat(33), '', '%20%20', 'SOFORT', 'sofort_1', 'sof%C3%B6rt', 'sofort.1', '%3Cscript%3E'];
  for (const k of bad) {
    const got = deeplink.parse(DATES + '&kampagne=' + k, CFG);
    assert.equal(Object.prototype.hasOwnProperty.call(got, 'kampagne'), false, k);
    assert.deepStrictEqual(Object.keys(got).sort(), FIVE, k);
  }
});

test('kampagne mit genau 32 Zeichen ist gueltig', () => {
  assert.equal(deeplink.parse(DATES + '&kampagne=' + 'a'.repeat(32), CFG).kampagne, 'a'.repeat(32));
});

test('Ohne kampagne traegt die Rueckgabe genau die fuenf bisherigen Schluessel', () => {
  for (const q of ['', DATES, DATES + '&utm_source=meta&utm_medium=paid&utm_campaign=mulin-test', '?gverify=true']) {
    assert.deepStrictEqual(Object.keys(deeplink.parse(q, CFG)).sort(), FIVE, q);
  }
});

test('kampagne wird auch ohne Suche geliefert', () => {
  const got = deeplink.parse('?kampagne=sofort', CFG);
  assert.equal(got.search, null);
  assert.equal(got.kampagne, 'sofort');
});

test('VERSION bleibt 1', () => {
  assert.equal(deeplink.VERSION, '1');
});

// Kriterium ES5-Stil: kein let, const, Arrow oder Template-String im Code der Datei.
test('deeplink.js bleibt im ES5-Stil', () => {
  const code = readFileSync(deeplinkPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /\b(let|const)\s/);
  assert.doesNotMatch(code, /=>/);
  assert.doesNotMatch(code, /`/);
});
