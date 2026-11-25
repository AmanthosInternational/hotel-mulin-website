// Segment 11 des Bauplans mulin-sofortbuchung (Nachtrag 14, Kontrakt K6): Konversion der
// Sofortseite. Kern: die fuenf Funktionen aus K6 mit den Guards
// test_flexibel_nur_mit_frist_in_der_zukunft und test_alte_bewertung_verschwindet.
// Alle Daten synthetisch (tests/fixtures/*k6*), Gast nur gast@example.com.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(import.meta.url);
const lies = (p) => readFileSync(join(root, p), 'utf8');
const kern = require(join(root, 'js', 'sofort-kern.js'));
const K6 = JSON.parse(lies('tests/fixtures/sofort-k6-angebote.json'));
const OFFERS = JSON.parse(lies('tests/fixtures/offers-mubrig-k6.json')).offers;
const VERTRAUEN = JSON.parse(lies('tests/fixtures/sofort-k6-vertrauen.json'));
const [FESTTAGE, JANUAR, OHNE] = K6;
const NONREF = OFFERS.find((o) => o.ratePlanCode === 'NONREFBB_IBE');
const FLEX = OFFERS.find((o) => o.ratePlanCode === 'STANDARDBB_IBE');
const JETZT = new Date('2026-11-25T12:00:00+01:00');
const HEUTE = '2026-11-25';
const NICHT = { art: 'nicht_erstattbar', frist: null, zeit: null };

const mit = (o, felder) => Object.assign({}, o, felder);
const flexMit = (felder) => mit(FLEX, felder);
const gebuehr = (felder) => Object.assign({}, FLEX.cancellationFee, felder);

// ---- passendesAngebot -----------------------------------------------------------

test('passendesAngebot: Praefix der Anzeige trifft ihr Angebot, klein verglichen', () => {
  assert.equal(kern.passendesAngebot(K6, 'mulin-januar-202701'), 'k6-januar');
  assert.equal(kern.passendesAngebot(K6, 'mulin-festtage-202612'), 'k6-festtage');
  assert.equal(kern.passendesAngebot(K6, 'MULIN-Januar-202701'), 'k6-januar');
  assert.equal(kern.passendesAngebot(K6, 'mulin-januar'), 'k6-januar');
});

test('passendesAngebot: unbekannt, leer, kein Praefix am Anfang oder kein Feld anzeigen ergibt null', () => {
  for (const w of ['mulin-test', '', null, undefined, 42, 'x-mulin-januar-202701', 'mulin-janua']) {
    assert.equal(kern.passendesAngebot(K6, w), null, String(w));
  }
  assert.equal(kern.passendesAngebot([OHNE], 'mulin-januar-202701'), null);
  assert.equal(kern.passendesAngebot(null, 'mulin-januar-202701'), null);
});

test('passendesAngebot: ungueltige Praefixe zaehlen nicht, das erste passende Angebot gewinnt', () => {
  const kaputt = mit(JANUAR, { id: 'kaputt', anzeigen: ['Mulin-Januar', '', 'mulin januar', 'm'.repeat(49), 7] });
  assert.equal(kern.passendesAngebot([kaputt], 'mulin-januar-202701'), null);
  assert.equal(kern.passendesAngebot([kaputt], 'm'.repeat(60)), null);
  const zwei = mit(FESTTAGE, { id: 'zwei', anzeigen: ['mulin'] });
  assert.equal(kern.passendesAngebot([zwei, JANUAR], 'mulin-januar-202701'), 'zwei');
  assert.equal(kern.passendesAngebot([JANUAR, zwei], 'mulin-januar-202701'), 'k6-januar');
});

// ---- abTag ------------------------------------------------------------------------

test('abTag: ab_anreise, wenn er ein Anreisetag ist', () => {
  assert.equal(kern.abTag(JANUAR, HEUTE), '2027-01-10');
  assert.equal(kern.abTag(FESTTAGE, HEUTE), '2026-12-20');
  assert.equal(kern.abTag(JANUAR, new Date(2026, 10, 25)), '2027-01-10');
});

test('abTag: vorbei, kein erlaubter Wochentag, gesperrt, kein Datum oder fehlend ergibt null', () => {
  assert.equal(kern.abTag(JANUAR, '2027-01-11'), null);
  assert.equal(kern.abTag(mit(JANUAR, { ab_anreise: '2027-01-12' }), HEUTE), null);
  assert.equal(kern.abTag(mit(JANUAR, { gesperrt: [{ von: '2027-01-11', bis: '2027-01-11' }] }), HEUTE), null);
  for (const t of ['2027-02-30', '10.01.2027', '', null, undefined]) {
    assert.equal(kern.abTag(mit(JANUAR, { ab_anreise: t }), HEUTE), null, String(t));
  }
  assert.equal(kern.abTag(OHNE, HEUTE), null);
  assert.equal(kern.abTag(null, HEUTE), null);
});

// ---- storno und flexOffer ---------------------------------------------------------

test('test_flexibel_nur_mit_frist_in_der_zukunft', () => {
  assert.deepEqual(kern.storno(FLEX, JETZT), { art: 'flexibel', frist: '2027-01-03', zeit: '15:00' });
  assert.equal(kern.flexOffer(OFFERS, JANUAR, JETZT), FLEX);
  // Genau auf der Frist und danach: nicht erstattbar; eine Millisekunde davor: flexibel.
  const frist = Date.parse('2027-01-03T15:00:00+01:00');
  assert.deepEqual(kern.storno(FLEX, new Date(frist)), NICHT);
  assert.deepEqual(kern.storno(FLEX, new Date(frist + 1)), NICHT);
  assert.equal(kern.storno(FLEX, new Date(frist - 1)).art, 'flexibel');
  const nein = [
    ['Frist vorbei', FLEX, new Date('2027-01-04T00:00:00+01:00')],
    ['Frist fehlt', flexMit({ cancellationFee: gebuehr({ dueDateTime: undefined }) }), JETZT],
    ['ohne cancellationFee', flexMit({ cancellationFee: undefined }), JETZT],
    ['category fehlt', flexMit({ category: undefined }), JETZT],
    ['Non-Refundable', flexMit({ category: 'Non-Refundable' }), JETZT],
    ['refundable klein', flexMit({ category: 'refundable' }), JETZT],
    ['Frist ohne Zone', flexMit({ cancellationFee: gebuehr({ dueDateTime: '2027-01-03T15:00:00' }) }), JETZT],
    ['Frist kein Datum', flexMit({ cancellationFee: gebuehr({ dueDateTime: '2027-02-30T15:00:00+01:00' }) }), JETZT],
    ['jetzt ungueltig', FLEX, new Date('kein Datum')],
    ['jetzt fehlt', FLEX, undefined],
  ];
  for (const [fall, offer, jetzt] of nein) {
    assert.deepEqual(kern.storno(offer, jetzt), NICHT, fall);
    const offers = [NONREF, offer];
    assert.equal(kern.flexOffer(offers, JANUAR, jetzt), null, fall + ': keine teurere Rate ohne Stornorecht');
  }
  assert.deepEqual(kern.storno(NONREF, JETZT), NICHT);
  assert.deepEqual(kern.storno(null, JETZT), NICHT);
});

test('storno: Frist und Uhrzeit aus den Stellen der Zeichenkette, nie umgerechnet', () => {
  const ny = flexMit({ cancellationFee: gebuehr({ dueDateTime: '2027-01-03T23:30:00-05:00' }) });
  assert.deepEqual(kern.storno(ny, JETZT), { art: 'flexibel', frist: '2027-01-03', zeit: '23:30' });
  const utc = flexMit({ cancellationFee: gebuehr({ dueDateTime: '2027-01-03T00:15:00Z' }) });
  assert.deepEqual(kern.storno(utc, JETZT), { art: 'flexibel', frist: '2027-01-03', zeit: '00:15' });
  assert.equal(kern.storno(FLEX, JETZT.getTime()).art, 'flexibel', 'jetzt als Zahl');
});

test('flexOffer: Abgleich wie waehleOffer, ohne rate_flex oder ohne passendes Offer null', () => {
  assert.equal(kern.flexOffer(OFFERS, mit(JANUAR, { rate_flex: 'MUBRIG-STANDARDBB_IBE' }), JETZT), FLEX);
  assert.equal(kern.flexOffer(OFFERS, mit(JANUAR, { rate_flex: 'standardbb_ibe' }), JETZT), FLEX);
  assert.equal(kern.flexOffer(OFFERS, OHNE, JETZT), null);
  assert.equal(kern.flexOffer(OFFERS, mit(JANUAR, { rate_flex: 'FLEXBB_IBE' }), JETZT), null);
  assert.equal(kern.flexOffer(OFFERS, mit(JANUAR, { room: 'EZ' }), JETZT), null);
  assert.equal(kern.flexOffer([NONREF], JANUAR, JETZT), null);
  assert.equal(kern.flexOffer(null, JANUAR, JETZT), null);
  assert.equal(kern.flexOffer(OFFERS, null, JETZT), null);
});

// ---- vertrauen --------------------------------------------------------------------

const bewertungMit = (felder) => ({ bewertung: Object.assign({}, VERTRAUEN.bewertung, felder), telefon: VERTRAUEN.telefon });

test('test_alte_bewertung_verschwindet', () => {
  const v = kern.vertrauen(VERTRAUEN, HEUTE);
  assert.deepEqual(v.bewertung, { wert: '8,6', von: '10', anzahl: 384, quelle: 'Booking.com', stand: '2026-11-25' });
  assert.deepEqual(v.telefon, { anzeige: '+41 41 562 76 62', tel: '+41415627662' });
  // 2026-09-26 liegt genau 60 Tage vor HEUTE, 2026-09-25 einen Tag zu weit.
  assert.notEqual(kern.vertrauen(bewertungMit({ stand: '2026-09-26' }), HEUTE).bewertung, null);
  for (const [fall, stand] of [['61 Tage alt', '2026-09-25'], ['Zukunft', '2026-11-26'], ['kein Datum', '2026-02-30'],
    ['fehlt', undefined]]) {
    const r = kern.vertrauen(bewertungMit({ stand }), HEUTE);
    assert.equal(r.bewertung, null, fall);
    assert.deepEqual(r.telefon, VERTRAUEN.telefon, fall + ': Telefon bleibt');
  }
  assert.equal(kern.vertrauen(VERTRAUEN, '2027-01-25').bewertung, null, 'derselbe Wert veraltet');
  assert.equal(kern.vertrauen(VERTRAUEN, 'kein Tag').bewertung, null, 'ohne heute kein Altersbeweis');
});

test('vertrauen: Bewertung nur mit wert, von, anzahl, quelle und stand', () => {
  for (const feld of ['wert', 'von', 'anzahl', 'quelle', 'stand']) {
    assert.equal(kern.vertrauen(bewertungMit({ [feld]: undefined }), HEUTE).bewertung, null, feld + ' fehlt');
  }
  for (const [fall, felder] of [['wert Text', { wert: 'sehr gut' }], ['anzahl 0', { anzahl: 0 }],
    ['anzahl Text', { anzahl: '384' }], ['anzahl Bruch', { anzahl: 3.5 }], ['quelle leer', { quelle: '  ' }]]) {
    assert.equal(kern.vertrauen(bewertungMit(felder), HEUTE).bewertung, null, fall);
  }
  assert.deepEqual(kern.vertrauen(undefined, HEUTE), { bewertung: null, telefon: null });
  assert.deepEqual(kern.vertrauen({}, HEUTE), { bewertung: null, telefon: null });
});

test('vertrauen: Telefon nur mit tel nach ^\\+[0-9]{8,15}$ und einer Anzeige', () => {
  const tel = (felder) => kern.vertrauen({ telefon: Object.assign({}, VERTRAUEN.telefon, felder) }, HEUTE).telefon;
  assert.deepEqual(tel({}), VERTRAUEN.telefon);
  assert.notEqual(tel({ tel: '+12345678' }), null, '8 Ziffern');
  assert.notEqual(tel({ tel: '+123456789012345' }), null, '15 Ziffern');
  for (const t of ['+1234567', '+1234567890123456', '0415627662', '+41 41 562 76 62', '+41415627662x',
    'tel:+41415627662', '', undefined, 41415627662]) {
    assert.equal(tel({ tel: t }), null, String(t));
  }
  assert.equal(tel({ anzeige: '' }), null, 'ohne Anzeige');
  assert.equal(tel({ anzeige: undefined }), null, 'Anzeige fehlt');
});
