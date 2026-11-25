// Verdrahtung L5 des Bauplans mulin-sofortbuchung (Nachtrag 14.6, Punkt 3): die echte
// Angebotsdatei js/sofort-angebote.js (Sammelstelle) durch den echten Kern und den echten
// Deep-Link-Parser, dazu der Cache-Bust in sofortbuchung.html. Kein Netz, kein DOM.
//
// Zeit: STAND ist der Pflegestand der Daten, der Tag, an dem die Verdrahtung die
// oeffentliche Route und die Bewertung gelesen hat. Geprueft wird gegen diesen festen Tag
// und nicht gegen die Uhr, sonst wuerde die Suite ohne jede Aenderung rot, sobald ein
// Bezugstag vorbei ist. Was die Seite an einem spaeteren Tag zeigt, entscheidet der Kern
// (abTag, vertrauen), belegt in tests/sofort-konversion.test.mjs. Ist die Bewertung am Tag
// des Laufs aelter als 60 Tage, meldet der Test das als Diagnosezeile. Wer die Daten
// pflegt, setzt STAND auf den Tag seiner Lesung.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(import.meta.url);
const lies = (p) => readFileSync(join(root, p), 'utf8');
const kern = require(join(root, 'js', 'sofort-kern.js'));
const deeplink = require(join(root, 'js', 'deeplink.js'));

const STAND = '2026-11-25';
const JETZT = new Date(STAND + 'T12:00:00+01:00');

// Die echte Datei, so wie der Browser sie laedt: sie setzt nur Werte an window.
const fenster = {};
vm.runInNewContext(lies('js/sofort-angebote.js'), { window: fenster });
const ROH = fenster.amSofortAngebote;
const GEPRUEFT = kern.pruefeAngebote(ROH);
const ANGEBOTE = GEPRUEFT.gueltig;
const VERTRAUEN = fenster.amSofortVertrauen;

// Laufende Anzeigen (Meta, gelesen am 21.11.2026) und das Angebot, bei dem sie landen.
const ANZEIGEN = [
  ['mulin-januar-202701', 'januar-unter-der-woche'],
  ['mulin-festtage-202612', 'festtage-2026']
];
// Vom Inhaber freigegeben (K-1326 a): Balkonzimmer oder Hotel, kein Speisesaal.
const FREIGEGEBEN = ['assets/images/rooms/dbrb/1.jpg', 'assets/images/mulin-winter.jpg'];
// Form der oeffentlichen Route (beide Plaene mit cancellationFee), Fixture aus Segment 11.
const ROUTE = JSON.parse(lies('tests/fixtures/offers-mubrig-k6.json')).offers;
const ohnePraefix = (c) => String(c).replace(/^MUBRIG-/, '');

function landung(utmCampaign) {
  const suche = '?utm_source=meta&utm_medium=paid' + (utmCampaign ? '&utm_campaign=' + utmCampaign : '');
  const c = deeplink.parse(suche, { today: JETZT }).campaign;
  return kern.passendesAngebot(ANGEBOTE, (c && c.utm_campaign) || null);
}

test('die echte Angebotsdatei ist gueltig: jedes Angebot besteht pruefeAngebote', () => {
  assert.ok(Array.isArray(ROH) && ROH.length > 0, 'window.amSofortAngebote ist eine Liste');
  assert.deepEqual(GEPRUEFT.fehler, []);
  assert.equal(ANGEBOTE.length, ROH.length);
});

test('test_laufende_anzeigen_treffen_ihr_angebot: utm_campaign der Lande-Adresse fuehrt zur Karte', () => {
  for (const [wert, id] of ANZEIGEN) {
    assert.equal(landung(wert), id, wert);
    const treffer = ANGEBOTE.filter((a) => (a.anzeigen || []).some((p) => wert.indexOf(p) === 0));
    assert.deepEqual(treffer.map((a) => a.id), [id], wert + ' trifft genau ein Angebot');
  }
  for (const a of ANGEBOTE) {
    for (const p of a.anzeigen || []) assert.match(p, /^[a-z0-9-]{1,48}$/, a.id + ' ' + p);
  }
  assert.equal(landung('mulin-sommer-202707'), null, 'Gegenprobe: fremde Kampagne trifft nichts');
  assert.equal(landung(null), null, 'Gegenprobe: ohne utm_campaign trifft nichts');
});

test('jedes ab_anreise ist ein Anreisetag seines Angebots', () => {
  for (const a of ANGEBOTE) {
    assert.match(String(a.ab_anreise), /^\d{4}-\d{2}-\d{2}$/, a.id + ' traegt ab_anreise');
    assert.equal(kern.abTag(a, STAND), a.ab_anreise, a.id);
    assert.ok(kern.anreisetage(a, STAND).includes(a.ab_anreise), a.id);
  }
  const probe = Object.assign({}, ANGEBOTE[0], { ab_anreise: ANGEBOTE[0].bis });
  assert.equal(kern.abTag(probe, STAND), null, 'Gegenprobe: der letzte Abreisetag ist kein Anreisetag');
});

test('rate und rate_flex jedes Angebots finden ihr Offer in der Form der Route', () => {
  for (const a of ANGEBOTE) {
    assert.ok(a.rate_flex && a.rate_flex !== a.rate, a.id + ' traegt eine zweite, flexible Rate');
    const fest = kern.waehleOffer(ROUTE, a);
    const flex = kern.flexOffer(ROUTE, a, JETZT);
    assert.ok(fest, a.id + ': Offer zu room und rate');
    assert.ok(flex, a.id + ': Offer zu room und rate_flex mit Frist in der Zukunft');
    assert.equal(ohnePraefix(fest.ratePlanCode), a.rate, a.id);
    assert.equal(ohnePraefix(flex.ratePlanCode), a.rate_flex, a.id);
    assert.equal(kern.storno(fest, JETZT).art, 'nicht_erstattbar', a.id);
    assert.equal(kern.storno(flex, JETZT).art, 'flexibel', a.id);
  }
});

test('jedes bild existiert und steht auf der Liste der freigegebenen Bilder', () => {
  for (const a of ANGEBOTE) {
    assert.ok(FREIGEGEBEN.includes(a.bild), a.id + ': ' + a.bild + ' ist nicht freigegeben');
    assert.ok(existsSync(join(root, a.bild)), a.bild + ' fehlt im Repo');
    assert.ok(statSync(join(root, a.bild)).size > 0, a.bild + ' ist leer');
  }
  for (const p of FREIGEGEBEN) assert.ok(existsSync(join(root, p)), p);
});

test('Vertrauen: Telefon wie der Kontaktblock von index.html, Bewertung zum Pflegestand gueltig', (t) => {
  const kontakt = /<a href="tel:([^"]+)">([^<]+)<\/a>/.exec(lies('index.html'));
  assert.ok(kontakt, 'Kontaktblock von index.html traegt einen tel-Link');
  assert.ok(VERTRAUEN && typeof VERTRAUEN === 'object', 'window.amSofortVertrauen ist gesetzt');
  const v = kern.vertrauen(VERTRAUEN, STAND);
  assert.ok(v.telefon, 'Telefon besteht den Kern');
  assert.equal(v.telefon.tel, kontakt[1]);
  assert.equal(v.telefon.anzeige, kontakt[2]);
  assert.ok(v.bewertung, 'Bewertung besteht den Kern am Pflegestand (hoechstens 60 Tage alt, nicht in der Zukunft)');
  assert.ok(v.bewertung.stand <= STAND, 'stand liegt nicht nach dem Pflegestand');
  assert.equal(kern.vertrauen(Object.assign({}, VERTRAUEN, {
    bewertung: Object.assign({}, VERTRAUEN.bewertung, { stand: '2026-09-25' })
  }), STAND).bewertung, null, 'Gegenprobe: 61 Tage vor dem Pflegestand faellt die Bewertung weg');
  if (!kern.vertrauen(VERTRAUEN, new Date()).bewertung) {
    t.diagnostic('Bewertung vom ' + VERTRAUEN.bewertung.stand + ' ist heute aelter als 60 Tage: '
      + 'die Seite zeigt sie nicht mehr, Wert neu lesen und stand setzen');
  }
});

test('Cache-Bust: die fuenf Skripte am Seitenende und das Stylesheet tragen ?v=', () => {
  const html = lies('sofortbuchung.html');
  const v = (pfad) => {
    const m = new RegExp('(?:src|href)="\\./' + pfad.replace(/[.\/]/g, '\\$&') + '\\?v=([^"]+)"').exec(html);
    return m ? m[1] : null;
  };
  const sofort = ['js/sofort-kern.js', 'js/sofort-seite.js', 'js/sofort-buchen.js', 'js/sofort-angebote.js',
    'css/sofort.css'].map(v);
  for (const wert of sofort) assert.match(String(wert), /^[0-9]{8}[a-z0-9]+$/);
  assert.equal(new Set(sofort).size, 1, 'Kern, Seite, Formular, Angebote und Stylesheet tragen denselben Wert');
  // deeplink.js ist dieselbe Datei wie auf der Startseite: dieselbe Adresse, ein Cache-Eintrag.
  const start = /src="\.\/js\/deeplink\.js\?v=([^"]+)"/.exec(lies('index.html'));
  assert.ok(start, 'index.html laedt deeplink.js mit ?v=');
  assert.equal(v('js/deeplink.js'), start[1]);
});
