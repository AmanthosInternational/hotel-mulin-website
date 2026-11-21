// Segment 6 des Bauplans mulin-sofortbuchung (K5): Seite Sofortbuchung, ohne Browser.
// Statisch: CSP der Seite als Teilmenge der CSP von index.html (mit Gegenprobe), noindex,
// eingebundene Skripte, ES5-Stil, kein fbq, kein Eingabefeld, Text ohne Gedankenstrich.
// Verhalten: js/sofort-seite.js laeuft in einem kleinen Fake-DOM gegen die beiden
// Doubles aus tests/fixtures (Kern und Buchen), fetch ist ein Stub, nie ein Netzaufruf.
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
const plain = (x) => JSON.parse(JSON.stringify(x));
const SEITE = 'sofortbuchung.html';
const SKRIPT = 'js/sofort-seite.js';
const DOUBLE_KERN = 'tests/fixtures/sofort-kern-double.js';
const DOUBLE_BUCHEN = 'tests/fixtures/sofort-buchen-double.js';
const ANGEBOTE = JSON.parse(lies('tests/fixtures/sofort-angebote.json'));
const KURTAXE = JSON.parse(lies('tests/fixtures/offers-mubrig-kurtaxe.json'));
const STANDARD = JSON.parse(lies('tests/fixtures/offers-mubrig.json'));
const PREIS_NONREF = 'CHF 492.00 gesamt für 3 Nächte, zwei Personen, inklusive Frühstück, MWST und Kurtaxe';

// ---- statisch ---------------------------------------------------------------

function csp(html) {
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/);
  assert.ok(m, 'CSP-Meta fehlt');
  const out = {};
  for (const teil of m[1].split(';')) {
    const w = teil.trim().split(/\s+/).filter(Boolean);
    if (w.length) out[w[0]] = w.slice(1);
  }
  return out;
}

function fremdeQuellen(seite, vorbild) {
  const fremd = [];
  for (const [dir, quellen] of Object.entries(seite)) {
    for (const q of quellen) if (!(vorbild[dir] || []).includes(q)) fremd.push(dir + ' ' + q);
  }
  return fremd;
}

function ohneKommentare(js) {
  return js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('Gegenprobe: die CSP-Pruefung meldet eine fremde Quelle und eine fremde Direktive', () => {
  const vorbild = csp(lies('index.html'));
  const probe = { 'script-src': ["'self'", 'https://fremd.example'], 'form-action': ["'self'"] };
  assert.deepEqual(fremdeQuellen(probe, vorbild), ['script-src https://fremd.example', "form-action 'self'"]);
});

test('CSP der Seite nennt keine Quelle, die index.html nicht nennt', () => {
  const seite = csp(lies(SEITE));
  assert.ok(seite['default-src'] && seite['script-src'] && seite['connect-src'], 'Direktiven fehlen');
  assert.deepEqual(fremdeQuellen(seite, csp(lies('index.html'))), []);
});

test('meta robots ist noindex, Sprache Deutsch', () => {
  const html = lies(SEITE);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<html lang="de">/);
});

test('Seite laedt Skripte und Stylesheet nach K5, consent.js synchron vor meta.js', () => {
  const html = lies(SEITE);
  const src = [...html.matchAll(/<script\b([^>]*)\bsrc="([^"]+)"([^>]*)>/g)].map((m) => ({
    pfad: m[2].replace(/^\.\//, '').replace(/\?.*$/, ''), attr: m[1] + m[3] }));
  const pfade = src.map((s) => s.pfad);
  for (const p of ['js/consent.js', 'js/meta.js', 'js/deeplink.js', 'js/sofort-kern.js', 'js/sofort-seite.js',
    'js/sofort-buchen.js', 'js/sofort-angebote.js']) {
    assert.equal(pfade.filter((x) => x === p).length, 1, p);
  }
  assert.ok(pfade.some((p) => p.startsWith('https://plausible.io/js/')), 'Plausible-Skript');
  assert.match(html, /plausible\.init\(\)/);
  assert.match(html, /<link rel="stylesheet" href="\.\/css\/sofort\.css[^"]*">/);
  const consent = src.find((s) => s.pfad === 'js/consent.js');
  assert.doesNotMatch(consent.attr, /\b(defer|async)\b/);
  assert.ok(pfade.indexOf('js/consent.js') < pfade.indexOf('js/meta.js'));
  for (const s of src.filter((x) => x.pfad.startsWith('js/') && x.pfad !== 'js/consent.js')) {
    assert.match(s.attr, /\bdefer\b/, s.pfad);
  }
});

test('ES5-Stil in js/sofort-seite.js und den beiden Doubles', () => {
  for (const p of [SKRIPT, DOUBLE_KERN, DOUBLE_BUCHEN]) {
    const code = ohneKommentare(lies(p));
    assert.doesNotMatch(code, /\blet\s|\bconst\s|=>|`|\bclass\s/, p);
  }
});

test('kein fbq ausserhalb von meta.js, kein Eingabefeld in Seite und Skript', () => {
  // Im Kommentar von js/sofort-seite.js steht "nie fbq direkt"; gezaehlt wird nur Code.
  assert.doesNotMatch(lies(SEITE), /fbq/);
  assert.doesNotMatch(ohneKommentare(lies(SKRIPT)), /fbq/);
  assert.doesNotMatch(lies(SEITE), /<(input|textarea|select)\b/i);
  assert.doesNotMatch(lies(SKRIPT), /createElement\(\s*'(input|textarea|select)'/);
});

test('Texte ohne Gedankenstrich und ohne scharfes s', () => {
  for (const p of [SEITE, SKRIPT, 'css/sofort.css', DOUBLE_KERN, DOUBLE_BUCHEN]) {
    assert.doesNotMatch(lies(p), /[—ß]/, p);
  }
});

test('Kern-Double: dieselben Funktionen und Parameterzahlen wie der Kontrakt', () => {
  const kern = require(join(root, 'js', 'sofort-kern.js'));
  const double = require(join(root, DOUBLE_KERN));
  assert.deepEqual(Object.keys(double).sort(), Object.keys(kern).sort());
  for (const k of Object.keys(kern)) assert.equal(double[k].length, kern[k].length, k);
});

test('Kern-Double: Fixture ergibt zwei gueltige Angebote und fuer NONREF 492.00', () => {
  const double = require(join(root, DOUBLE_KERN));
  const p = double.pruefeAngebote(ANGEBOTE);
  assert.deepEqual(p.gueltig.map((a) => a.id), ['test-drei-naechte', 'test-kampagne-sofort']);
  assert.deepEqual(p.fehler, [{ id: 'test-ungueltig-null-naechte', grund: 'naechte' }]);
  const offer = double.waehleOffer(KURTAXE.offers, ANGEBOTE[0]);
  assert.equal(offer.ratePlanCode, 'NONREFBB_IBE');
  assert.deepEqual(double.gesamt(offer, 2, 0), { zimmer: 472.8, kurtaxe: 19.2, gesamt: 492 });
});

// ---- Verhalten im Fake-DOM ----------------------------------------------------

class Knoten {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.className = '';
    this.text = ''; this.listeners = {}; this.parentNode = null; this.disabled = false;
  }
  get firstChild() { return this.children[0] || null; }
  appendChild(k) { k.parentNode = this; this.children.push(k); return k; }
  removeChild(k) { this.children = this.children.filter((c) => c !== k); k.parentNode = null; return k; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  click() { if (!this.disabled) (this.listeners.click || []).forEach((f) => f.call(this, { type: 'click' })); }
  // Wie im DOM: Text ist ein Kindknoten, removeChild leert also auch den Text.
  set textContent(v) { this.children = []; if (String(v)) this.appendChild(textKnoten(v)); }
  get textContent() { return this.tagName === '#TEXT' ? this.text : this.children.map((c) => c.textContent).join(''); }
  alle(pred) { const out = []; const geh = (k) => { if (pred(k)) out.push(k); k.children.forEach(geh); }; geh(this); return out; }
}

function textKnoten(s) { const k = new Knoten('#text'); k.text = String(s); return k; }
const ruhe = () => new Promise((r) => setImmediate(r));

// fetch: Funktion (url, antwort) -> Promise einer Antwort; Standard ist die Kurtaxe-Fixture.
// angebote: FEHLT laesst window.amSofortAngebote ungesetzt (Angebotsdatei fehlt).
const FEHLT = Symbol('fehlt');
function starte({ angebote = ANGEBOTE, fetch } = {}) {
  const liste = new Knoten('div');
  const ctx = vm.createContext({});
  ctx.window = ctx;
  const aufrufe = { plausible: [], meta: [], fetch: [] };
  ctx.document = {
    readyState: 'complete',
    getElementById: (id) => (id === 'sofortListe' ? liste : null),
    createElement: (t) => new Knoten(t),
    createTextNode: textKnoten,
    addEventListener: () => {},
  };
  vm.runInContext(lies(DOUBLE_KERN), ctx);
  vm.runInContext(lies(DOUBLE_BUCHEN), ctx);
  if (angebote !== FEHLT) ctx.amSofortAngebote = angebote;
  ctx.plausible = (name, opts) => aufrufe.plausible.push(plain([name, opts]));
  ctx.amMeta = { event: (name, data) => aufrufe.meta.push(plain([name, data])), tracking: () => null };
  const antwort = (daten, status = 200) => Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(daten) });
  ctx.fetch = (url) => { aufrufe.fetch.push(url); return fetch ? fetch(url, antwort) : antwort(KURTAXE); };
  vm.runInContext(lies(SKRIPT), ctx);
  const karten = liste.alle((k) => k.tagName === 'ARTICLE');
  const karte = (id) => karten.find((k) => k.getAttribute('data-angebot') === id);
  const knopf = (id, tag) => karte(id).alle((k) => k.getAttribute('data-tag') === tag)[0];
  const teil = (id, cls) => karte(id).alle((k) => k.className.split(' ').includes(cls))[0];
  return { ctx, liste, karten, karte, knopf, teil, aufrufe, oeffnen: () => plain(ctx.__oeffnenCalls) };
}

test('je gueltigem Angebot eine Karte, sofort_ansicht je Karte mit genau angebot und step', () => {
  const s = starte();
  assert.deepEqual(s.karten.map((k) => k.getAttribute('data-angebot')), ['test-drei-naechte', 'test-kampagne-sofort']);
  assert.deepEqual(s.aufrufe.plausible, [
    ['sofort_ansicht', { props: { angebot: 'test-drei-naechte', step: 'ansicht' } }],
    ['sofort_ansicht', { props: { angebot: 'test-kampagne-sofort', step: 'ansicht' } }],
  ]);
  const tage = s.karte('test-drei-naechte').alle((k) => k.getAttribute('data-tag'));
  assert.deepEqual(tage.map((k) => k.getAttribute('data-tag')), plain(s.ctx.amSofort.anreisetage(ANGEBOTE[0], '')));
  assert.ok(tage.every((k) => k.tagName === 'BUTTON' && k.type === 'button'));
  assert.equal(s.liste.alle((k) => /^(INPUT|TEXTAREA|SELECT)$/.test(k.tagName)).length, 0);
});

test('Datumswahl: Preis aus gesamt, genau ein oeffnen mit der Auswahl nach Kontrakt, select_offer', async () => {
  const s = starte();
  s.knopf('test-drei-naechte', '2027-02-07').click();
  await ruhe();
  assert.equal(s.aufrufe.fetch.length, 1);
  assert.ok(s.aufrufe.fetch[0].endsWith('/api/offers?propertyId=MUBRIG&arrival=2027-02-07&departure=2027-02-10&adults=2&children=0'));
  assert.equal(s.teil('test-drei-naechte', 'sf-preis').textContent, PREIS_NONREF);
  const o = s.oeffnen();
  assert.equal(o.length, 1);
  assert.equal(o[0].behaelter, 'sf-buchen');
  assert.equal(o[0].karte, 'test-drei-naechte');
  assert.deepEqual(Object.keys(o[0].auswahl).sort(), ['abreise', 'angebot', 'anreise', 'erwachsene', 'kinder', 'offer']);
  assert.deepEqual(o[0].auswahl, { angebot: ANGEBOTE[0], offer: KURTAXE.offers[0], anreise: '2027-02-07',
    abreise: '2027-02-10', erwachsene: 2, kinder: 0 });
  assert.deepEqual(s.aufrufe.plausible.at(-1), ['sofort_datum', { props: { angebot: 'test-drei-naechte', step: 'preis' } }]);
  assert.deepEqual(s.aufrufe.meta, [['select_offer', { total_price: 492, currency: 'CHF' }]]);
  assert.equal(s.knopf('test-drei-naechte', '2027-02-07').getAttribute('aria-pressed'), 'true');
  // Wechsel auf die zweite Karte: die erste verliert Preis und Auswahl, ein weiteres oeffnen.
  s.knopf('test-kampagne-sofort', '2027-02-14').click();
  await ruhe();
  assert.ok(s.aufrufe.fetch[1].endsWith('&children=0&kampagne=sofort'));
  assert.equal(s.teil('test-drei-naechte', 'sf-preis').textContent, '');
  assert.equal(s.knopf('test-drei-naechte', '2027-02-07').getAttribute('aria-pressed'), 'false');
  assert.match(s.teil('test-kampagne-sofort', 'sf-preis').textContent, /^CHF 469\.20 gesamt/);
  assert.equal(s.oeffnen().length, 2);
});

test('Preis kommt aus gesamt, nicht aus dem Offer (Offer traegt 289.00)', async () => {
  const s = starte({ fetch: (url, antwort) => antwort(STANDARD) });
  s.knopf('test-drei-naechte', '2027-02-08').click();
  await ruhe();
  assert.equal(STANDARD.offers[0].totalGrossAmount.amount, 289);
  assert.equal(s.teil('test-drei-naechte', 'sf-preis').textContent, PREIS_NONREF);
});

test('ausgebucht: Hinweis, kein Preis, kein oeffnen, Tag gesperrt, andere Tage bleiben', async () => {
  const s = starte({ fetch: (url, antwort) => antwort({ offers: [] }) });
  s.knopf('test-drei-naechte', '2027-02-07').click();
  await ruhe();
  assert.match(s.teil('test-drei-naechte', 'sf-hinweis').textContent, /ausgebucht.*anderen Anreisetag/);
  assert.equal(s.teil('test-drei-naechte', 'sf-preis').textContent, '');
  assert.equal(s.oeffnen().length, 0);
  assert.equal(s.aufrufe.meta.length, 0);
  assert.equal(s.knopf('test-drei-naechte', '2027-02-07').disabled, true);
  assert.equal(s.knopf('test-drei-naechte', '2027-02-08').disabled, false);
  assert.deepEqual(s.aufrufe.plausible.at(-1), ['sofort_datum', { props: { angebot: 'test-drei-naechte', step: 'ausgebucht' } }]);
});

test('Route nicht erreichbar oder Fehlerstatus: Verweis auf die Buchungsmaske', async () => {
  for (const fetch of [() => Promise.reject(new TypeError('offline')), (url, antwort) => antwort({ error: 'x' }, 503)]) {
    const s = starte({ fetch });
    s.knopf('test-drei-naechte', '2027-02-07').click();
    await ruhe();
    const link = s.teil('test-drei-naechte', 'sf-hinweis').alle((k) => k.tagName === 'A')[0];
    assert.equal(link.href, './#bookingBar');
    assert.equal(s.teil('test-drei-naechte', 'sf-preis').textContent, '');
    assert.equal(s.oeffnen().length, 0);
    assert.deepEqual(s.aufrufe.plausible.at(-1), ['sofort_datum', { props: { angebot: 'test-drei-naechte', step: 'fehler' } }]);
  }
});

test('leere oder fehlende Angebotsdatei: Verweis auf die Buchungsmaske, keine Karte', () => {
  for (const angebote of [[], FEHLT]) {
    const s = starte({ angebote });
    assert.equal(s.karten.length, 0);
    assert.equal(s.liste.alle((k) => k.tagName === 'A')[0].href, './#bookingBar');
    assert.deepEqual(s.aufrufe.plausible, [['sofort_ansicht', { props: { angebot: 'keine', step: 'verweis' } }]]);
  }
});

test('aeltere Antwort verfaellt: zwei schnelle Wahlen, genau ein oeffnen fuer die letzte', async () => {
  const offen = [];
  const s = starte({ fetch: (url, antwort) => new Promise((r) => offen.push(() => r(antwort(KURTAXE)))) });
  s.knopf('test-drei-naechte', '2027-02-07').click();
  s.knopf('test-drei-naechte', '2027-02-14').click();
  offen[1]();
  await ruhe();
  offen[0]();
  await ruhe();
  const o = s.oeffnen();
  assert.equal(o.length, 1);
  assert.equal(o[0].auswahl.anreise, '2027-02-14');
  assert.equal(s.aufrufe.plausible.filter((p) => p[0] === 'sofort_datum').length, 1);
});
