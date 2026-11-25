// Segment 11 des Bauplans mulin-sofortbuchung (Nachtrag 14, Kontrakt K6): Konversion der
// Sofortseite. Kern: die fuenf Funktionen aus K6 mit den Guards
// test_flexibel_nur_mit_frist_in_der_zukunft und test_alte_bewertung_verschwindet.
// Seite: echter Kern, echte Seite und echtes Formular in einem kleinen Fake-DOM (vm),
// fetch ist ein Stub, nie ein Netzaufruf; der Tag ist fest (25.11.2026, 12:00 Uhr in
// Brigels), damit der Lauf auch unter TZ=America/New_York gleich ausfaellt.
// Alle Daten synthetisch (tests/fixtures/*k6*), Gast nur gast@example.com.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(import.meta.url);
const lies = (p) => readFileSync(join(root, p), 'utf8');
const kern = require(join(root, 'js', 'sofort-kern.js'));
const deeplink = require(join(root, 'js', 'deeplink.js'));
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
const plain = (x) => JSON.parse(JSON.stringify(x));
const ruhe = () => new Promise((r) => setImmediate(r)).then(() => new Promise((r) => setImmediate(r)));

// ---- Fake-DOM: nur was Seite und Formular brauchen ------------------------------

class Knoten {
  constructor(tag, text) {
    this.tagName = tag; this.kinder = []; this.attrs = {}; this.hoerer = {}; this.parentNode = null;
    this.text = text === undefined ? '' : String(text); this.value = ''; this.disabled = false; this.hidden = false;
  }
  get className() { return this.attrs.class || ''; }
  set className(v) { this.attrs.class = String(v); }
  get firstChild() { return this.kinder[0] || null; }
  // Wie im DOM: Text ist ein Kindknoten, removeChild leert also auch den Text.
  get textContent() { return this.tagName === '#text' ? this.text : this.kinder.map((k) => k.textContent).join(''); }
  set textContent(v) { this.kinder = []; if (String(v)) this.appendChild(new Knoten('#text', v)); }
  appendChild(k) { return this.insertBefore(k, null); }
  insertBefore(k, vor) {
    if (k.parentNode) k.parentNode.removeChild(k);
    const i = vor ? this.kinder.indexOf(vor) : -1;
    this.kinder.splice(i < 0 ? this.kinder.length : i, 0, k);
    k.parentNode = this;
    return k;
  }
  removeChild(k) { this.kinder = this.kinder.filter((x) => x !== k); k.parentNode = null; return k; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }
  removeAttribute(n) { delete this.attrs[n]; }
  addEventListener(t, f) { (this.hoerer[t] ||= []).push(f); }
  ausloesen(t) {
    const ev = { type: t, target: this, preventDefault() {} };
    (this.hoerer[t] || []).forEach((f) => f.call(this, ev));
    return ev;
  }
  click() { if (!this.disabled) this.ausloesen('click'); }
  alle(pred, out = []) { for (const k of this.kinder) { if (pred(k)) out.push(k); k.alle(pred, out); } return out; }
  hat(cls) { return this.className.split(' ').includes(cls); }
}

// Fester Tag fuer new Date() in der vm; Date mit Argumenten bleibt unveraendert.
const JETZT_MS = JETZT.getTime();
class FesterTag extends Date {
  constructor(...a) { if (a.length) super(...a); else super(JETZT_MS); }
  static now() { return JETZT_MS; }
}

const LIVE = { property: 'MUBRIG', offers: OFFERS };
const ZAHLUNGSLINK = 'https://eu.adyen.link/PLTESTMOCK';
const FEHLT = Symbol('fehlt');
const tagVon = (url) => new URL(url).searchParams.get('arrival');
const antwortVon = (status, daten) => ({ ok: status >= 200 && status < 300, status,
  json: () => Promise.resolve(structuredClone(daten)) });

// antwort(url, nr) liefert [status, daten], 'netz' oder ein Promise davon; Standard LIVE.
// post liefert die Antwort auf POST /api/bookings, Standard 201 mit Zahlungslink.
function seite({ suche = '', angebote = K6, vertrauen = VERTRAUEN, antwort, post } = {}) {
  const main = new Knoten('MAIN');
  const liste = main.appendChild(new Knoten('DIV'));
  liste.setAttribute('id', 'sofortListe');
  const auf = { fetch: [], posts: [], plausible: [], meta: [], oeffnen: [], nav: [], konsole: [] };
  const ctx = vm.createContext({});
  ctx.window = ctx;
  Object.assign(ctx, { Date: FesterTag, URL, URLSearchParams, setTimeout, clearTimeout, amDeepLink: deeplink });
  ctx.console = { log: (...a) => auf.konsole.push(a.length), warn: (...a) => auf.konsole.push(a.length),
    error: (...a) => auf.konsole.push(a.length), info: (...a) => auf.konsole.push(a.length) };
  let href = 'http://localhost:8080/sofortbuchung' + suche;
  ctx.location = { search: suche, get href() { return href; }, set href(v) { auf.nav.push(String(v)); href = String(v); } };
  ctx.document = { readyState: 'complete', getElementById: (id) => (id === 'sofortListe' ? liste : null),
    createElement: (t) => new Knoten(String(t).toUpperCase()), createTextNode: (s) => new Knoten('#text', s),
    addEventListener() {} };
  ctx.plausible = (name, opts) => auf.plausible.push(plain([name, opts]));
  ctx.amMeta = { event: (n, d) => auf.meta.push(plain([n, d === undefined ? null : d])), tracking: () => null };
  ctx.fetch = (url, init) => {
    if (init && init.method === 'POST') {
      auf.posts.push(JSON.parse(init.body));
      return Promise.resolve(post ? post() : [201, { success: true, paymentLink: ZAHLUNGSLINK }])
        .then(([s, d]) => antwortVon(s, d));
    }
    auf.fetch.push(url);
    return Promise.resolve(antwort ? antwort(url, auf.fetch.length) : [200, LIVE])
      .then((r) => (r === 'netz' ? Promise.reject(new TypeError('offline')) : antwortVon(r[0], r[1])));
  };
  vm.runInContext(lies('js/sofort-kern.js'), ctx, { filename: 'js/sofort-kern.js' });
  vm.runInContext(lies('js/sofort-buchen.js'), ctx, { filename: 'js/sofort-buchen.js' });
  if (angebote !== FEHLT) ctx.amSofortAngebote = structuredClone(angebote);
  if (vertrauen !== FEHLT) ctx.amSofortVertrauen = structuredClone(vertrauen);
  const echt = ctx.amSofortBuchen.oeffnen;
  ctx.amSofortBuchen.oeffnen = (b, a) => { auf.oeffnen.push(plain(a)); return echt(b, a); };
  vm.runInContext(lies('js/sofort-seite.js'), ctx, { filename: 'js/sofort-seite.js' });
  const karten = () => liste.alle((k) => k.tagName === 'ARTICLE');
  const karte = (id) => karten().find((k) => k.getAttribute('data-angebot') === id);
  const s = {
    ctx, main, liste, auf, karten, karte,
    ids: () => karten().map((k) => k.getAttribute('data-angebot')),
    knopf: (id, tag) => karte(id).alle((k) => k.getAttribute('data-tag') === tag)[0],
    gedrueckt: () => liste.alle((k) => k.hat('sf-tag') && k.getAttribute('aria-pressed') === 'true')
      .map((k) => k.getAttribute('data-tag')),
    teil: (id, cls) => karte(id).alle((k) => k.hat(cls))[0],
    text: (id, cls) => { const t = s.teil(id, cls); return t ? t.textContent : ''; },
    form: (id) => karte(id).alle((k) => k.tagName === 'FORM')[0],
    raten: (id) => karte(id).alle((k) => k.hat('sf-rate')),
    plaus: (name) => auf.plausible.filter((p) => p[0] === name).map((p) => p[1].props),
  };
  return s;
}

// Haelt jede Antwort von /api/offers zurueck, bis der Test sie freigibt.
function halter(daten = (url) => [200, LIVE]) {
  const offen = [];
  return { offen, antwort: (url) => new Promise((ok) => offen.push({ url, los: () => ok(daten(url)) })) };
}

const ANZEIGE = (kampagne) => '?utm_source=meta&utm_medium=paid&utm_campaign=' + kampagne;
const ENDPREIS = (o) => 'CHF ' + kern.gesamt(o, 2, 0).gesamt.toFixed(2) + ' gesamt für 3 Nächte, zwei Personen, ' +
  'inklusive Frühstück, MWST und Kurtaxe';
const AB_ZEILE = 'ab CHF 594.00 gesamt für 3 Nächte, zwei Personen (nicht erstattbare Rate)';

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

const T7 = 'Gäste bewerten uns mit 8,6 von 10 auf Booking.com (384 Bewertungen, Stand 25.11.2026).';
const T8 = 'Fragen? Wir sind gerne für Sie da: +41 41 562 76 62';
const block = (s) => s.main.kinder.find((k) => k.hat('sf-vertrauen')) || null;

test('test_alte_bewertung_verschwindet', () => {
  // Seite: der Satz steht nur mit gueltiger Bewertung vor #sofortListe, das Telefon bleibt.
  const frisch = seite();
  assert.equal(frisch.main.kinder.indexOf(block(frisch)), frisch.main.kinder.indexOf(frisch.liste) - 1);
  assert.equal(block(frisch).alle((k) => k.hat('sf-bewertung'))[0].textContent, T7);
  for (const stand of ['2026-09-25', '2026-11-26']) {
    const alt = seite({ vertrauen: bewertungMit({ stand }) });
    assert.equal(alt.main.textContent.includes('Gäste bewerten uns'), false, stand + ': Satz fehlt');
    assert.equal(block(alt).textContent, T8, stand + ': nur das Telefon');
  }

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

test('vertrauen auf der Seite: Telefon als tel:-Link, ohne window.amSofortVertrauen kein Block und kein Fehler', () => {
  const s = seite();
  const a = block(s).alle((k) => k.tagName === 'A')[0];
  assert.equal(a.href, 'tel:+41415627662');
  assert.equal(block(s).alle((k) => k.hat('sf-fragen'))[0].textContent, T8);
  for (const vertrauen of [FEHLT, {}, { telefon: { anzeige: '041 562 76 62', tel: '0415627662' } }]) {
    const ohne = seite({ vertrauen });
    assert.equal(block(ohne), null);
    assert.deepEqual(ohne.ids(), ['k6-festtage', 'k6-januar', 'k6-ohne-felder']);
    assert.deepEqual(ohne.auf.konsole, []);
  }
});

// ---- a) Anzeige fuehrt zum passenden Angebot ---------------------------------------

test('test_anzeige_fuehrt_zum_passenden_angebot', async () => {
  const januar = seite({ suche: ANZEIGE('mulin-januar-202701') });
  assert.deepEqual(januar.ids(), ['k6-januar', 'k6-festtage', 'k6-ohne-felder']);
  await ruhe();
  assert.deepEqual(januar.gedrueckt(), ['2027-01-10'], 'ab_anreise vorgewaehlt, ohne Klick');
  assert.equal(januar.knopf('k6-januar', '2027-01-10').getAttribute('aria-pressed'), 'true');
  assert.equal(januar.text('k6-januar', 'sf-preis'), ENDPREIS(NONREF));
  const form = januar.form('k6-januar');
  assert.ok(form, 'Formular ohne Klick');
  assert.deepEqual(form.alle((k) => k.tagName === 'INPUT').map((k) => k.getAttribute('name')),
    ['vorname', 'nachname', 'email', 'telefon']);
  assert.ok(form.textContent.includes('CHF 594.00'), 'Endpreis im Formular');
  assert.deepEqual(januar.auf.oeffnen.map((a) => [a.angebot.id, a.offer.ratePlanCode, a.anreise, a.abreise]),
    [['k6-januar', 'NONREFBB_IBE', '2027-01-10', '2027-01-13']]);
  assert.equal(januar.text('k6-januar', 'sf-hinweis'),
    'Ein Anreisetag ist vorgewählt. Sie können jeden anderen Tag antippen.');

  const festtage = seite({ suche: ANZEIGE('mulin-festtage-202612') });
  assert.deepEqual(festtage.ids(), ['k6-festtage', 'k6-januar', 'k6-ohne-felder']);
  await ruhe();
  assert.deepEqual(festtage.gedrueckt(), ['2026-12-20']);
  assert.ok(festtage.form('k6-festtage'));
  assert.equal(festtage.form('k6-januar'), undefined);

  const ohneFeld = K6.map((a) => { const b = mit(a, {}); delete b.anzeigen; return b; });
  for (const [fall, opts] of [['ohne utm_campaign', {}], ['unbekannt', { suche: ANZEIGE('mulin-test') }],
    ['ohne anzeigen', { suche: ANZEIGE('mulin-januar-202701'), angebote: ohneFeld }]]) {
    const s = seite(opts);
    assert.deepEqual(s.ids(), ['k6-festtage', 'k6-januar', 'k6-ohne-felder'], fall + ': Dateireihenfolge');
    await ruhe();
    assert.deepEqual(s.gedrueckt(), [], fall + ': nichts vorgewaehlt');
    assert.equal(s.liste.alle((k) => k.tagName === 'FORM').length, 0, fall + ': kein Formular');
    assert.deepEqual(s.auf.oeffnen, [], fall);
  }
});

test('Vorauswahl bei ausgebucht: der naechste Tag, hoechstens drei Abrufe, nie amMeta.event', async () => {
  const voll = (tage) => (url) => (tage.includes(tagVon(url)) ? [200, { offers: [] }] : [200, LIVE]);
  const zwei = seite({ suche: ANZEIGE('mulin-januar-202701'), antwort: voll(['2027-01-10', '2027-01-11']) });
  await ruhe(); await ruhe();
  const januarAbrufe = (s) => s.auf.fetch.filter((u) => ['2027-01-10', '2027-01-11', '2027-01-17', '2027-01-18']
    .includes(tagVon(u)));
  assert.deepEqual(januarAbrufe(zwei).map(tagVon), ['2027-01-10', '2027-01-11', '2027-01-17']);
  assert.deepEqual(zwei.gedrueckt(), ['2027-01-17']);
  assert.equal(zwei.knopf('k6-januar', '2027-01-10').disabled, true);
  assert.equal(zwei.text('k6-januar', 'sf-ab'), '', 'Bezugstag ausgebucht: keine ab-Zeile');
  assert.deepEqual(zwei.auf.meta, [], 'Vorauswahl ruft amMeta.event nie');
  assert.deepEqual(zwei.plaus('sofort_vorauswahl'), [{ angebot: 'k6-januar', step: 'preis' }]);
  assert.deepEqual(zwei.plaus('sofort_datum'), []);

  const drei = seite({ suche: ANZEIGE('mulin-januar-202701'), antwort: voll(['2027-01-10', '2027-01-11', '2027-01-17']) });
  await ruhe(); await ruhe();
  assert.equal(januarAbrufe(drei).length, 3, 'danach kein vierter Abruf');
  assert.deepEqual(drei.gedrueckt(), [], 'keine Vorauswahl');
  assert.equal(drei.text('k6-januar', 'sf-hinweis'), '', 'kein Fehlertext');
  assert.equal(drei.form('k6-januar'), undefined);
  assert.deepEqual(drei.plaus('sofort_vorauswahl'), [{ angebot: 'k6-januar', step: 'ausgebucht' }]);
  assert.deepEqual(drei.auf.meta, []);
});

test('Vorauswahl: ein Tipp, waehrend sie laedt, gewinnt (genau ein oeffnen fuer den getippten Tag)', async () => {
  const h = halter();
  const s = seite({ suche: ANZEIGE('mulin-januar-202701'), antwort: h.antwort });
  s.knopf('k6-januar', '2027-01-11').click();
  assert.equal(h.offen.length, 3, 'Vorauswahl januar, ab-Zeile festtage, Tipp');
  const [vor, tipp] = ['2027-01-10', '2027-01-11'].map((t) => h.offen.find((o) => tagVon(o.url) === t));
  vor.los();
  await ruhe();
  assert.deepEqual(s.auf.oeffnen, [], 'die Vorauswahl zeigt nach dem Tipp nichts mehr');
  assert.equal(s.text('k6-januar', 'sf-ab'), AB_ZEILE, 'die ab-Zeile kommt trotzdem');
  tipp.los();
  await ruhe();
  assert.deepEqual(s.auf.oeffnen.map((a) => a.anreise), ['2027-01-11']);
  assert.deepEqual(s.gedrueckt(), ['2027-01-11']);
  assert.deepEqual(s.plaus('sofort_vorauswahl'), []);
  assert.deepEqual(s.plaus('sofort_datum'), [{ angebot: 'k6-januar', step: 'preis' }]);
  assert.equal(s.auf.meta.length, 1, 'select_offer nur fuer den Tipp');
});

// ---- b) ab-Preis nur aus der Live-Antwort -----------------------------------------

test('test_ab_preis_nur_aus_der_live_antwort', async () => {
  const s = seite();
  await ruhe();
  assert.equal(AB_ZEILE, 'ab ' + ENDPREIS(NONREF).replace(', inklusive Frühstück, MWST und Kurtaxe', '') +
    ' (nicht erstattbare Rate)');
  assert.equal(s.text('k6-festtage', 'sf-ab'), AB_ZEILE);
  assert.equal(s.text('k6-januar', 'sf-ab'), AB_ZEILE);
  assert.equal(s.text('k6-ohne-felder', 'sf-ab'), '', 'ohne ab_anreise keine Zeile');
  assert.deepEqual(s.auf.fetch.map(tagVon), ['2026-12-20', '2027-01-10'], 'je Karte mit abTag ein Abruf');
  const ohneBetrag = { offers: [mit(NONREF, { totalGrossAmount: undefined }), FLEX] };
  const faelle = [['nicht erreichbar', () => 'netz'], ['Status 503', () => [503, { error: 'x' }]],
    ['kein Offer', () => [200, { offers: [] }]], ['kein Betrag', () => [200, ohneBetrag]],
    ['keine Antwort', () => [200, null]]];
  for (const [fall, erste] of faelle) {
    const f = seite({ antwort: (url, nr) => (nr <= 2 ? erste() : [200, LIVE]) });
    await ruhe();
    for (const id of ['k6-festtage', 'k6-januar']) assert.equal(f.text(id, 'sf-ab'), '', fall + ': keine ab-Zeile');
    f.knopf('k6-januar', '2027-01-10').click();
    await ruhe();
    assert.equal(f.text('k6-januar', 'sf-preis'), ENDPREIS(NONREF), fall + ': die Karte bleibt bedienbar');
  }
  for (const ab of ['2027-01-12', '2026-11-01', 'bald']) {
    const f = seite({ angebote: [mit(JANUAR, { ab_anreise: ab })] });
    await ruhe();
    assert.equal(f.text('k6-januar', 'sf-ab'), '', ab + ': kein gueltiges ab_anreise');
    assert.deepEqual(f.auf.fetch, [], ab + ': kein Abruf');
  }
  // Betrag wie 594.00 (kein Datum wie 21.11.2026) oder CHF mit Zahl; in Daten auch kein Preisfeld.
  const BETRAG = /(?<![\d.])\d+\.\d\d(?![\d.])|CHF\s*\d/;
  const FELD = /["']?(preis|betrag|amount|ab_preis)["']?\s*:/i;
  const ohneKommentar = (p) => lies(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.match('x 594.00 y', BETRAG, 'Gegenprobe');
  assert.doesNotMatch('Stand 21.11.2026', BETRAG, 'Gegenprobe Datum');
  assert.doesNotMatch(ohneKommentar('js/sofort-seite.js'), BETRAG, 'kein Betrag in js/sofort-seite.js');
  for (const p of ['tests/fixtures/sofort-k6-angebote.json', 'js/sofort-angebote.js']) {
    assert.doesNotMatch(ohneKommentar(p), BETRAG, 'kein Betrag in ' + p);
    assert.doesNotMatch(ohneKommentar(p), FELD, 'kein Preisfeld in ' + p);
  }
});

test('nicht blockierend: Karten vor jeder Antwort, je Karte hoechstens ein Abruf, ein Tipp laedt frisch', async () => {
  const h = halter();
  const s = seite({ antwort: h.antwort });
  assert.deepEqual(s.ids(), ['k6-festtage', 'k6-januar', 'k6-ohne-felder'], 'Karten stehen vor jeder Antwort');
  assert.ok(s.knopf('k6-januar', '2027-01-10'), 'Anreisetage stehen');
  assert.deepEqual(h.offen.map((o) => tagVon(o.url)), ['2026-12-20', '2027-01-10']);
  h.offen.forEach((o) => o.los());
  await ruhe();
  s.knopf('k6-januar', '2027-01-10').click();
  assert.deepEqual(h.offen.map((o) => tagVon(o.url)), ['2026-12-20', '2027-01-10', '2027-01-10'], 'Tipp laedt frisch');
  const mitAnzeige = halter();
  const p = seite({ suche: ANZEIGE('mulin-januar-202701'), antwort: mitAnzeige.antwort });
  assert.equal(p.karten().length, 3);
  assert.deepEqual(mitAnzeige.offen.map((o) => tagVon(o.url)).sort(), ['2026-12-20', '2027-01-10'],
    'die Vorauswahl nutzt den Abruf der ab-Zeile');
});
