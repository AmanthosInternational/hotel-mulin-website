// Kern der Sofortbuchung, Kontrakt K5 des Bauplans mulin-sofortbuchung (2026-11-18),
// Segment 5. Jede Funktion aus K5 mit mindestens drei Faellen, dazu die zwei Guards
// test_buchungsbody_traegt_genau_die_schluessel_von_booking_js und
// test_zahlungsziel_nur_adyen_https. Alle Daten synthetisch, Gast nur gast@example.com.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const kernPath = join(here, '..', 'js', 'sofort-kern.js');
const kern = require(kernPath);
const deeplink = require(join(here, '..', 'js', 'deeplink.js'));
const ANGEBOTE = JSON.parse(readFileSync(join(here, 'fixtures', 'sofort-angebote.json'), 'utf8'));
const OFFERS = JSON.parse(readFileSync(join(here, 'fixtures', 'offers-mubrig-kurtaxe.json'), 'utf8')).offers;
const BOOKING_JS = readFileSync(join(here, '..', 'js', 'booking.js'), 'utf8');

const [DREI, KAMPAGNE, UNGUELTIG] = ANGEBOTE;
const NONREF = OFFERS.find((o) => o.ratePlanCode === 'NONREFBB_IBE');
const SOFORT = OFFERS.find((o) => o.ratePlanCode === 'SOFORT3N_IBE');
const GAST = { vorname: 'Test', nachname: 'Gast', email: 'gast@example.com', telefon: '' };
const DL_CFG = { today: new Date(2026, 10, 21), properties: { MUBRIG: 6 }, langs: ['de', 'en'], defaultProperty: 'MUBRIG' };
// Lande-Adresse des Harness-Laufs vom 21.11.2026 (Port 8095), ohne und mit kampagne.
const LANDE = '?fixture=kurtaxe&arrival=2027-02-14&departure=2027-02-17&adults=2&rate=NONREFBB_IBE'
  + '&utm_source=meta&utm_medium=paid&utm_campaign=mulin-test';

// Body, den booking.js am 21.11.2026 im Harness an den Mock gesendet hat
// (http://localhost:8095/ mit LANDE + '&kampagne=sofort', Banner abgelehnt, Testgast,
// GET /__mock/log). booker im Protokoll geschwaerzt, hier mit dem Testgast eingesetzt.
// booking.js sendet kampagne heute nicht, ohne Einwilligung fehlt tracking.
const BODY_BOOKING_JS = {
  adults: 2, arrival: '2027-02-14', bookingSource: 'meta_ads',
  campaign: { utm_campaign: 'mulin-test', utm_medium: 'paid', utm_source: 'meta' },
  children: 0, cityTax: 19.2, comment: 'Booked via hotelmulin.ch', currency: 'CHF',
  departure: '2027-02-17', propertyId: 'MUBRIG', ratePlanId: 'MUBRIG-NONREFBB_IBE-DBRB',
  totalAmount: 472.8, upsells: [],
  booker: { firstName: 'Test', lastName: 'Gast', email: 'gast@example.com', phone: '' },
};
const SCHLUESSEL_BOOKING_JS = ['adults', 'arrival', 'booker', 'bookingSource', 'campaign', 'children',
  'cityTax', 'comment', 'currency', 'departure', 'propertyId', 'ratePlanId', 'totalAmount', 'upsells'];
const OPTIONAL_K5 = ['kampagne', 'tracking'];

function auswahl(angebot, offer, extra) {
  return Object.assign({ angebot, offer, anreise: '2027-02-14', abreise: '2027-02-17', erwachsene: 2, kinder: 0 }, extra || {});
}

function mit(angebot, felder) { return Object.assign({}, angebot, felder); }

function wochentag(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

// getOfferCityTax und roundCHF wortwoertlich aus js/booking.js, searchParams von aussen.
function kurtaxeBookingJs() {
  const start = BOOKING_JS.indexOf('function getOfferCityTax(offer) {');
  const ende = BOOKING_JS.indexOf('\n}\n', start);
  const rund = BOOKING_JS.match(/function roundCHF\(n\) \{[^\n]*\}/);
  assert.ok(start > 0 && ende > start && rund, 'getOfferCityTax und roundCHF in booking.js gefunden');
  const quelle = rund[0] + '\n' + BOOKING_JS.slice(start, ende + 2) + '\nreturn getOfferCityTax;';
  return (offer, sp) => new Function('searchParams', quelle)(sp)(offer);
}

// Query wie booking.js:1118-1122 aus searchParams (booking.js:933-939).
function queryBookingJs(searchParams) {
  let query = '';
  const keys = Object.keys(searchParams);
  for (let i = 0; i < keys.length; i++) {
    if (i > 0) query += '&';
    query += encodeURIComponent(keys[i]) + '=' + encodeURIComponent(searchParams[keys[i]]);
  }
  return query;
}

test('Modul exportiert genau die neun Funktionen aus K5', () => {
  assert.deepEqual(Object.keys(kern).sort(), ['abreise', 'anreisetage', 'buchungsBody', 'gesamt',
    'pruefeAngebote', 'pruefeGast', 'sucheQuery', 'waehleOffer', 'zahlungsZiel']);
});

test('ES5-Stil: kein let, const, Arrow, Template-String, class im Kern', () => {
  const code = readFileSync(kernPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.equal(/\b(let|const|class)\s/.test(code), false);
  assert.equal(code.indexOf('=>'), -1);
  assert.equal(code.indexOf('`'), -1);
});

// pruefeAngebote

test('pruefeAngebote: Fixture ergibt zwei gueltige, das Angebot mit null Naechten faellt', () => {
  const r = kern.pruefeAngebote(ANGEBOTE);
  assert.deepEqual(r.gueltig.map((a) => a.id), ['test-drei-naechte', 'test-kampagne-sofort']);
  assert.deepEqual(r.fehler, [{ id: 'test-ungueltig-null-naechte', grund: 'naechte' }]);
});

test('pruefeAngebote: ohne room oder rate verworfen', () => {
  const r = kern.pruefeAngebote([
    mit(DREI, { id: 'a', room: '' }), mit(DREI, { id: 'b', rate: null }),
    mit(DREI, { id: 'c', room: undefined, rate: undefined }),
  ]);
  assert.deepEqual(r.gueltig, []);
  assert.deepEqual(r.fehler, [{ id: 'a', grund: 'room_rate' }, { id: 'b', grund: 'room_rate' }, { id: 'c', grund: 'room_rate' }]);
});

test('pruefeAngebote: naechte unter 1, ueber 30 oder keine ganze Zahl verworfen; 1 und 30 gueltig', () => {
  const r = kern.pruefeAngebote([
    mit(DREI, { id: 'n0', naechte: 0 }), mit(DREI, { id: 'n31', naechte: 31 }),
    mit(DREI, { id: 'nk', naechte: 2.5 }), mit(DREI, { id: 'ns', naechte: '3' }),
    mit(DREI, { id: 'n1', naechte: 1 }), mit(DREI, { id: 'n30', naechte: 30 }),
  ]);
  assert.deepEqual(r.gueltig.map((a) => a.id), ['n1', 'n30']);
  assert.deepEqual(r.fehler.map((f) => f.grund), ['naechte', 'naechte', 'naechte', 'naechte']);
});

test('pruefeAngebote: von nach bis oder kein Kalenderdatum ergibt fenster', () => {
  const r = kern.pruefeAngebote([
    mit(DREI, { id: 'f1', von: '2027-03-05', bis: '2027-03-04' }),
    mit(DREI, { id: 'f2', von: '2027-02-30', bis: '2027-03-04' }),
    mit(DREI, { id: 'f3', bis: '4.3.2027' }),
    mit(DREI, { id: 'f4', von: '2027-03-04', bis: '2027-03-04' }),
  ]);
  assert.deepEqual(r.fehler, [{ id: 'f1', grund: 'fenster' }, { id: 'f2', grund: 'fenster' }, { id: 'f3', grund: 'fenster' }]);
  assert.deepEqual(r.gueltig.map((a) => a.id), ['f4']);
});

test('pruefeAngebote: Wochentage, Sperren, Personen, Kampagne, doppelte id und keine Liste', () => {
  const r = kern.pruefeAngebote([
    mit(DREI, { id: 'w1', anreise_wochentage: [] }), mit(DREI, { id: 'w2', anreise_wochentage: [7] }),
    mit(DREI, { id: 'g1', gesperrt: [{ von: '2027-02-10' }] }), mit(DREI, { id: 'g2', gesperrt: null }),
    mit(DREI, { id: 'p1', personen: 0 }), mit(DREI, { id: 'k1', kampagne: 'So fort' }),
    mit(DREI, { id: 'gut' }), mit(DREI, { id: 'gut' }), null,
  ]);
  assert.deepEqual(r.fehler, [
    { id: 'w1', grund: 'wochentage' }, { id: 'w2', grund: 'wochentage' },
    { id: 'g1', grund: 'gesperrt' }, { id: 'g2', grund: 'gesperrt' },
    { id: 'p1', grund: 'personen' }, { id: 'k1', grund: 'kampagne' },
    { id: 'gut', grund: 'id' }, { id: null, grund: 'form' },
  ]);
  assert.deepEqual(r.gueltig.map((a) => a.id), ['gut']);
  assert.deepEqual(kern.pruefeAngebote(undefined), { gueltig: [], fehler: [{ id: null, grund: 'liste' }] });
});

test('pruefeAngebote: die Seite bekommt nur gueltige (jedes gueltige liefert Anreisetage oder ist im Fenster pruefbar)', () => {
  const r = kern.pruefeAngebote(ANGEBOTE.concat([mit(DREI, { id: 'x', von: '2027-04-01' })]));
  assert.equal(r.gueltig.length + r.fehler.length, 4);
  for (const a of r.gueltig) assert.equal(kern.pruefeAngebote([a]).fehler.length, 0);
  assert.ok(r.gueltig.every((a) => a.naechte >= 1 && a.naechte <= 30 && a.room && a.rate && a.von <= a.bis));
});

// anreisetage

test('anreisetage: nur Tage im Fenster und nur erlaubte Wochentage (So, Mo)', () => {
  const tage = kern.anreisetage(DREI, '2026-11-21');
  assert.deepEqual(tage, ['2027-02-07', '2027-02-08', '2027-02-14', '2027-02-15',
    '2027-02-21', '2027-02-22', '2027-02-28', '2027-03-01']);
  for (const t of tage) assert.ok([0, 1].includes(wochentag(t)), t);
});

test('anreisetage: nie vor heute; heute selbst ist moeglich; Date gleich Zeichenkette', () => {
  assert.deepEqual(kern.anreisetage(DREI, '2027-02-15'), ['2027-02-15', '2027-02-21', '2027-02-22', '2027-02-28', '2027-03-01']);
  assert.deepEqual(kern.anreisetage(DREI, new Date(2027, 1, 15, 23, 30)), kern.anreisetage(DREI, '2027-02-15'));
});

test('anreisetage: nie in gesperrt (Naechte 21. bis 23.2. gesperrt)', () => {
  assert.deepEqual(kern.anreisetage(KAMPAGNE, '2026-11-21'), ['2027-02-14', '2027-02-15', '2027-02-16',
    '2027-02-17', '2027-02-18', '2027-02-24', '2027-02-25', '2027-02-28', '2027-03-01']);
});

test('anreisetage: gesperrt zaehlt die Abende, nicht den Abreisetag', () => {
  const basis = mit(DREI, { von: '2027-02-07', bis: '2027-02-10', anreise_wochentage: [0] });
  assert.deepEqual(kern.anreisetage(basis, '2026-11-21'), ['2027-02-07']);
  assert.deepEqual(kern.anreisetage(mit(basis, { gesperrt: [{ von: '2027-02-09', bis: '2027-02-09' }] }), '2026-11-21'), []);
  assert.deepEqual(kern.anreisetage(mit(basis, { gesperrt: [{ von: '2027-02-10', bis: '2027-02-12' }] }), '2026-11-21'), ['2027-02-07']);
});

test('anreisetage: Abreise nie nach bis; abgelaufenes Fenster und ungueltiges Angebot ergeben eine leere Liste', () => {
  assert.deepEqual(kern.anreisetage(DREI, '2027-03-01'), ['2027-03-01']);
  assert.deepEqual(kern.anreisetage(DREI, '2027-03-02'), []);
  assert.deepEqual(kern.anreisetage(DREI, '2027-03-05'), []);
  assert.deepEqual(kern.anreisetage(UNGUELTIG, '2026-11-21'), []);
  assert.deepEqual(kern.anreisetage(DREI, 'morgen'), []);
});

// abreise

test('abreise: drei Naechte, Monats- und Jahreswechsel, Schalttag, Sommerzeit', () => {
  assert.equal(kern.abreise('2027-02-14', 3), '2027-02-17');
  assert.equal(kern.abreise('2027-12-30', 3), '2028-01-02');
  assert.equal(kern.abreise('2028-02-28', 1), '2028-02-29');
  assert.equal(kern.abreise('2027-03-27', 2), '2027-03-29');
});

test('abreise: ungueltige Eingabe ergibt null', () => {
  assert.equal(kern.abreise('2027-02-30', 3), null);
  assert.equal(kern.abreise('2027-02-14', 0), null);
  assert.equal(kern.abreise('2027-02-14', 31), null);
  assert.equal(kern.abreise(null, 3), null);
});

// sucheQuery

test('sucheQuery: ohne Kampagne genau die Query von booking.js', () => {
  const q = kern.sucheQuery(DREI, '2027-02-14', 3, 2);
  assert.equal(q, '?propertyId=MUBRIG&arrival=2027-02-14&departure=2027-02-17&adults=2&children=0');
  assert.equal(q, '?' + queryBookingJs({ propertyId: 'MUBRIG', arrival: '2027-02-14', departure: '2027-02-17', adults: '2', children: '0' }));
});

test('sucheQuery: mit Kampagne haengt kampagne an, Personen aus dem Aufruf', () => {
  assert.equal(kern.sucheQuery(KAMPAGNE, '2027-02-15', 3, 2),
    '?propertyId=MUBRIG&arrival=2027-02-15&departure=2027-02-18&adults=2&children=0&kampagne=sofort');
  assert.equal(kern.sucheQuery(DREI, '2027-02-14', 2, 3),
    '?propertyId=MUBRIG&arrival=2027-02-14&departure=2027-02-16&adults=3&children=0');
});

test('sucheQuery: Werte mit encodeURIComponent, ungueltige Eingabe ergibt null', () => {
  assert.equal(kern.sucheQuery(mit(KAMPAGNE, { kampagne: 'a&b=c' }), '2027-02-15', 3, 2).endsWith('&kampagne=a%26b%3Dc'), true);
  assert.equal(kern.sucheQuery(DREI, '2027-02-30', 3, 2), null);
  assert.equal(kern.sucheQuery(DREI, '2027-02-14', 3, 0), null);
  assert.equal(kern.sucheQuery(null, '2027-02-14', 3, 2), null);
});

// waehleOffer

test('waehleOffer: Zimmer und Plan ohne Praefix waehlen genau das passende Offer', () => {
  assert.equal(kern.waehleOffer(OFFERS, DREI), NONREF);
  assert.equal(kern.waehleOffer(OFFERS, KAMPAGNE), SOFORT);
});

test('waehleOffer: mit Praefix und klein geschrieben wie booking.js', () => {
  assert.equal(kern.waehleOffer(OFFERS, mit(DREI, { room: 'MUBRIG-DBRB', rate: 'nonrefbb_ibe' })), NONREF);
  assert.equal(kern.waehleOffer(OFFERS, mit(DREI, { rate: 'MUBRIG-SOFORT3N_IBE-DBRB' })), SOFORT);
});

test('waehleOffer: kein passendes Offer, keine Liste oder kein Angebot ergibt null', () => {
  assert.equal(kern.waehleOffer(OFFERS, mit(DREI, { rate: 'NONREF' })), null);
  assert.equal(kern.waehleOffer(OFFERS, mit(DREI, { room: 'DBR' })), null);
  assert.equal(kern.waehleOffer(null, DREI), null);
  assert.equal(kern.waehleOffer([], DREI), null);
  assert.equal(kern.waehleOffer(OFFERS, null), null);
});

// gesamt

test('gesamt: Zimmer 472.80 und Kurtaxe 19.20 fuer zwei Erwachsene ergeben 492.00', () => {
  assert.deepEqual(kern.gesamt(NONREF, 2, 0), { zimmer: 472.8, kurtaxe: 19.2, gesamt: 492 });
  assert.equal(kern.gesamt(NONREF, 2, 0).gesamt.toFixed(2), '492.00');
});

test('gesamt: mit einem Kind wird die Kurtaxe wie in booking.js skaliert', () => {
  const bj = kurtaxeBookingJs();
  assert.deepEqual(kern.gesamt(NONREF, 2, 1), { zimmer: 472.8, kurtaxe: 28.8, gesamt: 501.6 });
  for (const [a, k] of [[1, 0], [2, 0], [2, 1], [2, 2], [3, 1], [1, 3], [0, 1], ['2', '1']]) {
    assert.equal(kern.gesamt(NONREF, a, k).kurtaxe, bj(NONREF, { adults: a, children: k }), 'Erwachsene ' + a + ', Kinder ' + k);
  }
});

test('gesamt: included true ergibt Kurtaxe 0, ohne cityTax ebenso; ohne Betrag null', () => {
  const inkl = mit(NONREF, { cityTax: { amount: 19.2, currency: 'CHF', included: true } });
  assert.deepEqual(kern.gesamt(inkl, 2, 1), { zimmer: 472.8, kurtaxe: 0, gesamt: 472.8 });
  assert.equal(kurtaxeBookingJs()(inkl, { adults: 2, children: 1 }), 0);
  assert.deepEqual(kern.gesamt(mit(NONREF, { cityTax: undefined }), 2, 0), { zimmer: 472.8, kurtaxe: 0, gesamt: 472.8 });
  assert.equal(kern.gesamt(mit(NONREF, { totalGrossAmount: null }), 2, 0), null);
  assert.equal(kern.gesamt(null, 2, 0), null);
});

// buchungsBody

test('test_buchungsbody_traegt_genau_die_schluessel_von_booking_js', () => {
  const ohneKampagne = deeplink.parse(LANDE, DL_CFG);
  const mitKampagne = deeplink.parse(LANDE + '&kampagne=sofort', DL_CFG);
  assert.ok(mitKampagne.search && mitKampagne.preselect, 'Lande-Adresse traegt search und preselect');

  const a = kern.buchungsBody(auswahl(DREI, NONREF), GAST, ohneKampagne, null);
  assert.deepEqual(Object.keys(a).sort(), SCHLUESSEL_BOOKING_JS);
  assert.deepEqual(Object.keys(a.booker).sort(), ['email', 'firstName', 'lastName', 'phone']);

  const b = kern.buchungsBody(auswahl(DREI, NONREF), GAST, mitKampagne, null);
  assert.deepEqual(Object.keys(b).sort(), SCHLUESSEL_BOOKING_JS.concat(['kampagne']).sort());
  for (const k of ['search', 'preselect', 'google', 'source']) assert.equal(k in b, false, k);
  assert.equal('tracking' in b, false, 'ohne Einwilligung kein tracking');
  assert.deepEqual(b.upsells, []);

  const t = { consent: 'granted', fbclid: 'TESTFBCLID' };
  const c = kern.buchungsBody(auswahl(KAMPAGNE, SOFORT), GAST, mitKampagne, t);
  assert.deepEqual(Object.keys(c).sort(), SCHLUESSEL_BOOKING_JS.concat(OPTIONAL_K5).sort());
  assert.equal(c.tracking, t);
  for (const k of Object.keys(c)) assert.ok(SCHLUESSEL_BOOKING_JS.includes(k) || OPTIONAL_K5.includes(k), k);
});

test('buchungsBody: Werte gleich dem Body von booking.js, nur comment der Sofortseite', () => {
  const body = kern.buchungsBody(auswahl(DREI, NONREF), GAST, deeplink.parse(LANDE, DL_CFG), null);
  assert.deepEqual(body, Object.assign({}, BODY_BOOKING_JS, { comment: 'Booked via hotelmulin.ch/sofortbuchung' }));
  assert.equal(JSON.stringify(body).length > 0, true);
});

test('buchungsBody: Gastfelder getrimmt, Telefon leer erlaubt, ohne Deep Link ohne Quelle', () => {
  const gast = { vorname: ' Test ', nachname: 'Gast ', email: ' gast@example.com', telefon: undefined };
  const body = kern.buchungsBody(auswahl(DREI, NONREF, { kinder: 1 }), gast, null, null);
  assert.deepEqual(body.booker, { firstName: 'Test', lastName: 'Gast', email: 'gast@example.com', phone: '' });
  assert.deepEqual(Object.keys(body).sort(), SCHLUESSEL_BOOKING_JS.filter((k) => k !== 'bookingSource' && k !== 'campaign'));
  assert.equal(body.children, 1);
  assert.equal(body.cityTax, 28.8);
  assert.equal(body.totalAmount, 472.8);
});

test('buchungsBody: kampagne aus dem Angebot vor der Lande-Adresse, ungueltige faellt weg', () => {
  const ohne = deeplink.parse(LANDE, DL_CFG);
  assert.equal(kern.buchungsBody(auswahl(KAMPAGNE, SOFORT), GAST, ohne, null).kampagne, 'sofort');
  assert.equal(kern.buchungsBody(auswahl(DREI, NONREF), GAST, deeplink.parse(LANDE + '&kampagne=winter', DL_CFG), null).kampagne, 'winter');
  assert.equal(kern.buchungsBody(auswahl(KAMPAGNE, SOFORT), GAST, deeplink.parse(LANDE + '&kampagne=winter', DL_CFG), null).kampagne, 'sofort');
  assert.equal('kampagne' in kern.buchungsBody(auswahl(DREI, NONREF), GAST, { kampagne: 'So fort' }, null), false);
});

test('buchungsBody: ohne Offer, ohne gueltige Daten oder ohne Erwachsene null', () => {
  assert.equal(kern.buchungsBody(auswahl(DREI, null), GAST, null, null), null);
  assert.equal(kern.buchungsBody(auswahl(DREI, NONREF, { abreise: '2027-02-30' }), GAST, null, null), null);
  assert.equal(kern.buchungsBody(auswahl(DREI, NONREF, { erwachsene: 0 }), GAST, null, null), null);
  assert.equal(kern.buchungsBody(null, GAST, null, null), null);
});

// pruefeGast

test('pruefeGast: drei Pflichtfelder, Telefon darf fehlen', () => {
  assert.deepEqual(kern.pruefeGast(GAST), { gueltig: true, fehler: [] });
  assert.deepEqual(kern.pruefeGast({ vorname: 'Test', nachname: 'Gast', email: 'gast@example.com' }), { gueltig: true, fehler: [] });
  assert.deepEqual(kern.pruefeGast(mit(GAST, { telefon: '+41 00 000 00 00' })).gueltig, true);
});

test('pruefeGast: fehlender Vorname, Nachname oder Mail ist ungueltig', () => {
  assert.deepEqual(kern.pruefeGast(mit(GAST, { vorname: '' })), { gueltig: false, fehler: ['vorname'] });
  assert.deepEqual(kern.pruefeGast(mit(GAST, { nachname: '   ' })), { gueltig: false, fehler: ['nachname'] });
  assert.deepEqual(kern.pruefeGast(mit(GAST, { email: undefined })), { gueltig: false, fehler: ['email'] });
  assert.deepEqual(kern.pruefeGast(null), { gueltig: false, fehler: ['vorname', 'nachname', 'email'] });
});

test('pruefeGast: Mail ohne @ oder ohne Punkt ist ungueltig', () => {
  assert.deepEqual(kern.pruefeGast(mit(GAST, { email: 'gast-example.com' })).fehler, ['email']);
  assert.deepEqual(kern.pruefeGast(mit(GAST, { email: 'gast@example' })).fehler, ['email']);
  assert.deepEqual(kern.pruefeGast(mit(GAST, { email: 'gast @example.com' })).fehler, ['email']);
  assert.deepEqual(kern.pruefeGast(mit(GAST, { email: ' gast@example.com ' })).gueltig, true);
});

// zahlungsZiel

test('test_zahlungsziel_nur_adyen_https', () => {
  const nein = [
    'http://eu.adyen.link/PLTESTMOCK',
    'https://eu.adyen.link.example.com/PLTESTMOCK',
    'https://checkout.adyen.com.example.com/x',
    'https://xeu.adyen.link/PLTESTMOCK',
    'https://adyen.link/PLTESTMOCK',
    'https://example.com/eu.adyen.link',
    'https://example.com/?next=https://eu.adyen.link/x',
    'javascript:alert(1)//eu.adyen.link',
    'ftp://eu.adyen.link/x',
    'eu.adyen.link/PLTESTMOCK',
    'kein Link', '',
  ];
  for (const link of nein) assert.equal(kern.zahlungsZiel({ success: true, paymentLink: link }), null, link);
  for (const leer of [null, undefined, {}, { success: true }, { paymentLink: null }, { paymentLink: 42 }, 'x']) {
    assert.equal(kern.zahlungsZiel(leer), null, JSON.stringify(leer));
  }
  const ja = ['https://eu.adyen.link/PLTESTMOCK', 'https://checkout.adyen.com/x?y=1',
    'https://checkoutshopper-live.adyen.com/checkoutshopper/x'];
  for (const link of ja) assert.equal(kern.zahlungsZiel({ success: true, paymentLink: link }), link, link);
});

test('zahlungsZiel: Antworten des Mocks (201, 201-http, 201-fremd, 409)', () => {
  const offen = { success: true, confirmationId: 'TEST-0001', paymentRequired: true };
  assert.equal(kern.zahlungsZiel(Object.assign({ paymentLink: 'https://eu.adyen.link/PLTESTMOCK' }, offen)), 'https://eu.adyen.link/PLTESTMOCK');
  assert.equal(kern.zahlungsZiel(Object.assign({ paymentLink: 'http://eu.adyen.link/PLTESTMOCK' }, offen)), null);
  assert.equal(kern.zahlungsZiel(Object.assign({ paymentLink: 'https://eu.adyen.link.example.com/PLTESTMOCK' }, offen)), null);
  assert.equal(kern.zahlungsZiel({ error: 'This rate is not available for online booking.' }), null);
});
