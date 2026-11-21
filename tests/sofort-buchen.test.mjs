// Segment 10 des Bauplans mulin-sofortbuchung (K5): Buchungsformular der Sofortseite.
// js/sofort-buchen.js laeuft hier in einer vm mit einem kleinen DOM-Stub, einem Double
// des Kerns (Kontrakt im Kopf von js/sofort-kern.js), einem amMeta-Stub, dem echten
// js/deeplink.js und einem fetch-Rekorder. Die Antworten spiegeln den Mock in
// tests/dev-server.py. Den echten Kern und die echte Seite prueft die Verdrahtung
// (Plan, Abschnitt 9, Schritt 6). Gaestefelder nur synthetisch mit gast@example.com.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const QUELLE = readFileSync(join(here, '..', 'js', 'sofort-buchen.js'), 'utf8');
const BOOKING_JS = readFileSync(join(here, '..', 'js', 'booking.js'), 'utf8');
const INDEX_HTML = readFileSync(join(here, '..', 'index.html'), 'utf8');
const DEV_SERVER = readFileSync(join(here, 'dev-server.py'), 'utf8');
const deeplink = require(join(here, '..', 'js', 'deeplink.js'));
const ANGEBOTE = JSON.parse(readFileSync(join(here, 'fixtures', 'sofort-angebote.json'), 'utf8'));
const OFFERS = JSON.parse(readFileSync(join(here, 'fixtures', 'offers-mubrig-kurtaxe.json'), 'utf8')).offers;

const SUCHE = '?utm_source=meta&utm_medium=paid&utm_campaign=mulin-test';
const GAST = { vorname: 'Test', nachname: 'Gast', email: 'gast@example.com', telefon: '' };
const AUSWAHL = {
  angebot: ANGEBOTE[0],
  offer: OFFERS.find((o) => o.ratePlanCode === 'NONREFBB_IBE'),
  anreise: '2027-02-14', abreise: '2027-02-17', erwachsene: 2, kinder: 0,
};
const ENDPREIS = { zimmer: 472.8, kurtaxe: 19.2, gesamt: 492 };
const TEL = '+41 41 562 76 62';
const POSTFACH = 'mulin@amanthos.com';

// Antworten wie ANTWORTEN in tests/dev-server.py (Quelle dort, Abgleich im Test unten).
const ZAHLUNGSLINK = 'https://eu.adyen.link/PLTESTMOCK';
const OFFEN = { success: true, confirmationId: 'TEST-0001', reservationId: 'TEST-0001-1', propertyId: 'MUBRIG', paymentRequired: true };
const ANTWORT = {
  '201': [201, { ...OFFEN, paymentLink: ZAHLUNGSLINK }],
  '201-http': [201, { ...OFFEN, paymentLink: 'http://eu.adyen.link/PLTESTMOCK' }],
  '201-fremd': [201, { ...OFFEN, paymentLink: 'https://eu.adyen.link.example.com/PLTESTMOCK' }],
  '201-ohne-link': [201, { ...OFFEN }],
  '409': [409, { error: 'This rate is not available for online booking. Please search again or contact the hotel.' }],
  '429': [429, { error: 'Online booking is not possible right now. Please contact the hotel.' }],
  '500': [500, { error: 'Booking failed (harness).' }],
};

// ---- Double des Kerns, Signaturen und Formen nach dem Kopf von js/sofort-kern.js ----
const ADYEN = ['eu.adyen.link', 'checkout.adyen.com', 'checkoutshopper-live.adyen.com'];

function bodyDouble(a, g, h, t) {
  const b = {
    propertyId: 'MUBRIG', ratePlanId: a.offer.ratePlanId, arrival: a.anreise, departure: a.abreise,
    adults: a.erwachsene, children: a.kinder, totalAmount: 472.8, cityTax: 19.2, upsells: [], currency: 'CHF',
    booker: { firstName: g.vorname, lastName: g.nachname, email: g.email, phone: g.telefon },
    comment: 'Booked via hotelmulin.ch/sofortbuchung',
  };
  if (h && h.source) b.bookingSource = h.source;
  if (h && h.campaign) b.campaign = h.campaign;
  if (h && h.kampagne) b.kampagne = h.kampagne;
  if (t) b.tracking = t;
  return b;
}

function kernDouble(aufrufe) {
  return {
    gesamt(offer, erwachsene, kinder) { aufrufe.push(['gesamt', offer, erwachsene, kinder]); return { ...ENDPREIS }; },
    pruefeGast(g) {
      aufrufe.push(['pruefeGast', { ...g }]);
      const fehler = [];
      if (!g.vorname) fehler.push('vorname');
      if (!g.nachname) fehler.push('nachname');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email || '')) fehler.push('email');
      return { gueltig: fehler.length === 0, fehler };
    },
    buchungsBody(a, g, h, t) { aufrufe.push(['buchungsBody', a, { ...g }, h, t]); return bodyDouble(a, g, h, t); },
    zahlungsZiel(antwort) {
      aufrufe.push(['zahlungsZiel', antwort]);
      try {
        const u = new URL(antwort.paymentLink);
        return u.protocol === 'https:' && ADYEN.includes(u.hostname) ? antwort.paymentLink : null;
      } catch (e) { return null; }
    },
  };
}

// ---- kleiner DOM-Stub: nur was die Datei braucht ----
class Knoten {
  constructor(tag, text) {
    this.tagName = tag; this.kinder = []; this.attr = {}; this.hoerer = {};
    this.parentNode = null; this.value = ''; this.disabled = false; this.hidden = false; this.text = text || '';
  }
  get firstChild() { return this.kinder[0] || null; }
  get textContent() { return this.text + this.kinder.map((k) => k.textContent).join(''); }
  set textContent(v) { this.kinder = []; this.text = String(v); }
  appendChild(k) { if (k.parentNode) k.parentNode.removeChild(k); k.parentNode = this; this.kinder.push(k); return k; }
  removeChild(k) { this.kinder = this.kinder.filter((x) => x !== k); k.parentNode = null; return k; }
  setAttribute(n, v) { this.attr[n] = String(v); }
  getAttribute(n) { return n in this.attr ? this.attr[n] : null; }
  removeAttribute(n) { delete this.attr[n]; }
  addEventListener(t, f) { (this.hoerer[t] = this.hoerer[t] || []).push(f); }
  focus() { this.fokus = true; }
  ausloesen(t) {
    const ev = { type: t, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    (this.hoerer[t] || []).forEach((f) => f.call(this, ev));
    return ev;
  }
  alle(pred, out = []) { for (const k of this.kinder) { if (pred(k)) out.push(k); k.alle(pred, out); } return out; }
}

function dokument() {
  return { createElement: (t) => new Knoten(String(t).toUpperCase()), createTextNode: (s) => new Knoten('#text', s) };
}

// ---- fetch-Rekorder: jede Antwort kommt erst, wenn der Test sie freigibt ----
function rekorder() {
  const posts = [];
  const offen = [];
  function fetch(url, init) {
    posts.push({ url, method: init && init.method, headers: init && init.headers, body: JSON.parse(init.body) });
    return new Promise((resolve, reject) => offen.push({ resolve, reject }));
  }
  function antworte(modus) {
    const [status, daten] = ANTWORT[modus];
    offen.shift().resolve({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(structuredClone(daten)) });
    return ruhe();
  }
  function bricht() { offen.shift().reject(new TypeError('Failed to fetch')); return ruhe(); }
  return { fetch, posts, offen, antworte, bricht };
}

function ruhe() { return new Promise((r) => setImmediate(r)).then(() => new Promise((r) => setImmediate(r))); }

function lade({ tracking = null, umschreiben = true } = {}) {
  const meta = []; const fbq = []; const nav = []; const popups = []; const konsole = []; const kern = [];
  const r = rekorder();
  const document = dokument();
  let href = 'http://localhost:8096/sofortbuchung' + SUCHE;
  const location = {
    search: SUCHE,
    get href() { return href; },
    set href(v) { nav.push(String(v)); href = String(v); },
    assign(v) { nav.push(String(v)); },
    replace(v) { nav.push(String(v)); },
  };
  const protokoll = (art) => (...a) => konsole.push([art, a.length]);
  const win = {
    document, location, URL, URLSearchParams, setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: r.fetch,
    console: { log: protokoll('log'), info: protokoll('info'), warn: protokoll('warn'), error: protokoll('error') },
    open: (...a) => { popups.push(a); return null; },
    fbq: (...a) => { fbq.push(a); },
    amSofort: kernDouble(kern),
    amMeta: {
      event: (name, daten) => { meta.push([name, daten === undefined ? undefined : JSON.parse(JSON.stringify(daten))]); },
      tracking: () => tracking,
    },
    amDeepLink: deeplink,
  };
  win.window = win;
  vm.createContext(win);
  // Wie tests/dev-server.py gleiche_origin(): genau diese Zeile wird umgeschrieben.
  const code = umschreiben ? QUELLE.replace(/var API_BASE = [^;]+;/, "var API_BASE = '';") : QUELLE;
  vm.runInContext(code, win, { filename: 'js/sofort-buchen.js' });
  const behaelter = document.createElement('div');
  return { win, document, behaelter, meta, fbq, nav, popups, konsole, kern, r };
}

function formular(ctx) {
  const formulare = ctx.behaelter.alle((k) => k.tagName === 'FORM');
  assert.equal(formulare.length, 1, 'genau ein Formular im Behaelter');
  const form = formulare[0];
  const felder = {};
  form.alle((k) => k.tagName === 'INPUT').forEach((k) => { felder[k.getAttribute('name')] = k; });
  const knopf = form.alle((k) => k.tagName === 'BUTTON')[0];
  const hinweis = form.alle((k) => (k.getAttribute('class') || '').includes('sofort-buchen-hinweis'))[0];
  return { form, felder, knopf, hinweis };
}

function ausfuellen(f, gast = GAST) {
  f.felder.vorname.value = gast.vorname;
  f.felder.nachname.value = gast.nachname;
  f.felder.email.value = gast.email;
  f.felder.telefon.value = gast.telefon;
}

function links(knoten) { return knoten.alle((k) => k.tagName === 'A').map((a) => a.getAttribute('href')); }

function zeigtKontakt(hinweis) {
  assert.equal(hinweis.hidden, false, 'Hinweis sichtbar');
  assert.ok(hinweis.textContent.includes(TEL), 'Telefon im Hinweis');
  assert.ok(hinweis.textContent.includes(POSTFACH), 'Postfach im Hinweis');
  assert.ok(links(hinweis).includes('tel:+41415627662'));
  assert.ok(links(hinweis).includes('mailto:' + POSTFACH));
}

function bereit(opts) {
  const ctx = lade(opts);
  ctx.win.amSofortBuchen.oeffnen(ctx.behaelter, AUSWAHL);
  const f = formular(ctx);
  ausfuellen(f);
  return { ctx, f };
}

// ---- Tests ----

test('oeffnen zeigt drei Pflichtfelder, Telefon freiwillig, Endpreis aus gesamt() und den Knopf', () => {
  const ctx = lade();
  ctx.win.amSofortBuchen.oeffnen(ctx.behaelter, AUSWAHL);
  const f = formular(ctx);
  assert.deepEqual(Object.keys(f.felder), ['vorname', 'nachname', 'email', 'telefon']);
  for (const n of ['vorname', 'nachname', 'email']) assert.notEqual(f.felder[n].getAttribute('required'), null, n + ' Pflicht');
  assert.equal(f.felder.telefon.getAttribute('required'), null, 'Telefon freiwillig');
  assert.equal(f.felder.email.getAttribute('type'), 'email');
  assert.equal(f.felder.telefon.getAttribute('type'), 'tel');
  assert.equal(f.knopf.textContent, 'Jetzt buchen');
  assert.equal(f.knopf.getAttribute('type'), 'submit');
  assert.ok(f.form.textContent.includes('CHF 492.00'), 'Endpreis aus gesamt() sichtbar');
  assert.deepEqual(ctx.kern.filter((k) => k[0] === 'gesamt').map((k) => k.slice(1)), [[AUSWAHL.offer, 2, 0]]);
  assert.equal(f.hinweis.hidden, true);
  assert.equal(ctx.r.posts.length, 0);
});

test('erneutes oeffnen im selben Behaelter ersetzt das Formular', () => {
  const ctx = lade();
  ctx.win.amSofortBuchen.oeffnen(ctx.behaelter, AUSWAHL);
  ctx.win.amSofortBuchen.oeffnen(ctx.behaelter, AUSWAHL);
  formular(ctx);
});

test('Absenden postet genau einmal den Body des Kerns und leitet bei 201 auf die Adyen-URL', async () => {
  const { ctx, f } = bereit();
  ctx.win.location.search = '';  // spaetere Adressaenderung: Herkunft bleibt die Lande-Adresse
  const ev = f.form.ausloesen('submit');
  assert.equal(ev.defaultPrevented, true, 'kein natives Absenden');
  assert.equal(ctx.r.posts.length, 1);
  const post = ctx.r.posts[0];
  assert.equal(post.url, '/api/bookings');
  assert.equal(post.method, 'POST');
  assert.equal(post.headers['Content-Type'], 'application/json');
  const herkunft = deeplink.parse(SUCHE, { today: new Date() });
  assert.deepEqual(post.body, bodyDouble(AUSWAHL, GAST, herkunft, null));
  assert.equal(post.body.booker.email, 'gast@example.com');
  assert.equal(post.body.bookingSource, 'meta_ads');
  assert.deepEqual(post.body.campaign, { utm_source: 'meta', utm_medium: 'paid', utm_campaign: 'mulin-test' });
  const bb = ctx.kern.filter((k) => k[0] === 'buchungsBody');
  assert.equal(bb.length, 1);
  assert.deepEqual(bb[0][2], GAST, 'gast in der Form des Kontrakts');
  assert.equal(f.knopf.disabled, true, 'gesperrt bis zur Antwort');
  await ctx.r.antworte('201');
  assert.deepEqual(ctx.nav, [ZAHLUNGSLINK]);
  assert.equal(ctx.win.location.href, ZAHLUNGSLINK);
  assert.deepEqual(ctx.popups, [], 'kein Popup');
  assert.deepEqual(ctx.kern.filter((k) => k[0] === 'zahlungsZiel').map((k) => k[1]), [ANTWORT['201'][1]]);
  assert.deepEqual(ctx.konsole, [], 'nichts in der Konsole');
});

test('test_keine_weiterleitung_auf_fremdes_ziel', async () => {
  for (const modus of ['201-http', '201-fremd', '201-ohne-link']) {
    const { ctx, f } = bereit();
    f.form.ausloesen('submit');
    await ctx.r.antworte(modus);
    assert.deepEqual(ctx.nav, [], modus + ': keine Navigation');
    assert.deepEqual(ctx.popups, [], modus + ': kein Popup');
    zeigtKontakt(f.hinweis);
    assert.equal(f.knopf.disabled, true, modus + ': Reservierung steht, kein zweiter POST');
    f.form.ausloesen('submit');
    assert.equal(ctx.r.posts.length, 1, modus + ': genau ein POST');
  }
});

test('Doppelklick auf Absenden sendet genau einen POST, Knopf gesperrt bis zur Antwort', async () => {
  const { ctx, f } = bereit();
  f.form.ausloesen('submit');
  f.form.ausloesen('submit');
  assert.equal(f.knopf.disabled, true);
  assert.equal(ctx.r.posts.length, 1);
  await ruhe();
  f.form.ausloesen('submit');
  assert.equal(ctx.r.posts.length, 1, 'auch spaeter, solange die Antwort fehlt');
  assert.equal(ctx.meta.filter((m) => m[0] === 'begin_checkout').length, 1);
  await ctx.r.antworte('201');
  assert.equal(ctx.r.posts.length, 1);
});

test('409 und 429 zeigen den Hinweis mit Telefon und Postfach, kein Zahlungsschritt', async () => {
  for (const modus of ['409', '429']) {
    const { ctx, f } = bereit();
    f.form.ausloesen('submit');
    await ctx.r.antworte(modus);
    assert.deepEqual(ctx.nav, [], modus + ': keine Navigation');
    assert.deepEqual(ctx.popups, []);
    assert.equal(ctx.kern.filter((k) => k[0] === 'zahlungsZiel').length, 0, modus + ': kein Zahlungsziel');
    assert.deepEqual(ctx.meta.map((m) => m[0]), ['begin_checkout'], modus + ': kein booking_confirmed');
    zeigtKontakt(f.hinweis);
    f.form.ausloesen('submit');
    assert.equal(ctx.r.posts.length, 1, modus + ': kein zweiter Versuch');
  }
});

test('anderer Fehler: Hinweis mit Verweis auf die Buchungsmaske, Knopf wieder frei', async () => {
  for (const modus of ['500', 'netz']) {
    const { ctx, f } = bereit();
    f.form.ausloesen('submit');
    if (modus === 'netz') await ctx.r.bricht(); else await ctx.r.antworte(modus);
    assert.deepEqual(ctx.nav, [], modus);
    assert.equal(f.hinweis.hidden, false);
    const maske = links(f.hinweis).filter((h) => h.startsWith('/?'));
    assert.equal(maske.length, 1, modus + ': ein Verweis auf die Buchungsmaske');
    const p = new URLSearchParams(maske[0].slice(1).split('#')[0]);
    assert.equal(p.get('arrival'), '2027-02-14');
    assert.equal(p.get('departure'), '2027-02-17');
    assert.equal(p.get('adults'), '2');
    assert.equal(p.get('rate'), 'NONREFBB_IBE');
    assert.equal(p.get('utm_source'), 'meta', 'Quelle bleibt erhalten');
    assert.ok(maske[0].endsWith('#booking'));
    assert.deepEqual(ctx.meta.map((m) => m[0]), ['begin_checkout'], modus + ': kein booking_confirmed');
    assert.equal(f.knopf.disabled, false, modus + ': neuer Versuch moeglich');
    assert.equal(f.knopf.textContent, 'Jetzt buchen');
    assert.deepEqual(ctx.konsole, [], modus + ': nichts in der Konsole');
  }
});

test('amMeta.event genau begin_checkout (Wert gleich Endpreis) und nach 201 booking_confirmed, kein fbq', async () => {
  const { ctx, f } = bereit();
  f.form.ausloesen('submit');
  assert.deepEqual(ctx.meta, [['begin_checkout', { total_price: ENDPREIS.gesamt, currency: 'CHF' }]]);
  await ctx.r.antworte('201');
  assert.deepEqual(ctx.meta, [
    ['begin_checkout', { total_price: 492, currency: 'CHF' }],
    ['booking_confirmed', {}],
  ]);
  assert.equal(ctx.meta.some((m) => m[1] && 'total_price' in m[1] && m[0] !== 'begin_checkout'), false, 'booking_confirmed ohne Betrag');
  assert.deepEqual(ctx.fbq, [], 'kein fbq direkt');
  const code = QUELLE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const verboten of ['fbq', 'payment_completed', 'Purchase', '.open(']) {
    assert.equal(code.includes(verboten), false, verboten + ' kommt im Code nicht vor');
  }
});

test('ohne Einwilligung fehlt tracking im Body, mit Einwilligung kommt amMeta.tracking() mit', async () => {
  const ohne = bereit({ tracking: null });
  ohne.f.form.ausloesen('submit');
  assert.equal('tracking' in ohne.ctx.r.posts[0].body, false);
  assert.equal(ohne.ctx.kern.find((k) => k[0] === 'buchungsBody')[4], null, 'tracking-Argument null');
  const t = { consent: 'granted', fbclid: 'TESTFBCLID' };
  const mit = bereit({ tracking: t });
  mit.f.form.ausloesen('submit');
  assert.deepEqual(mit.ctx.r.posts[0].body.tracking, t);
});

test('ungueltige Angaben senden nichts und markieren die Felder', () => {
  for (const [gast, feld] of [[{ ...GAST, nachname: '' }, 'nachname'], [{ ...GAST, email: 'gast-at-example' }, 'email']]) {
    const ctx = lade();
    ctx.win.amSofortBuchen.oeffnen(ctx.behaelter, AUSWAHL);
    const f = formular(ctx);
    ausfuellen(f, gast);
    f.form.ausloesen('submit');
    assert.equal(ctx.r.posts.length, 0, feld + ': kein POST');
    assert.deepEqual(ctx.meta, [], feld + ': kein Meta-Ereignis');
    assert.equal(f.felder[feld].getAttribute('aria-invalid'), 'true');
    assert.equal(f.hinweis.hidden, false);
    assert.ok(f.hinweis.textContent.includes('Pflicht') || f.hinweis.textContent.includes('Vorname'));
    assert.equal(f.knopf.disabled, false);
  }
});

test('wirft der Kern, gibt es keinen POST und keinen Ereignisaufruf, sondern den Verweis auf die Buchungsmaske', () => {
  const wirft = () => { throw new Error('NotImplemented'); };
  const ctx = lade();
  ctx.win.amSofort.gesamt = wirft;
  ctx.win.amSofortBuchen.oeffnen(ctx.behaelter, AUSWAHL);
  assert.equal(ctx.behaelter.alle((k) => k.tagName === 'FORM').length, 0, 'ohne Endpreis kein Formular');
  assert.equal(links(ctx.behaelter).filter((h) => h.startsWith('/?arrival=2027-02-14')).length, 1);
  const zwei = bereit();
  zwei.ctx.win.amSofort.buchungsBody = wirft;
  zwei.f.form.ausloesen('submit');
  assert.equal(zwei.ctx.r.posts.length, 0);
  assert.deepEqual(zwei.ctx.meta, []);
  assert.equal(links(zwei.f.hinweis).filter((h) => h.startsWith('/?')).length, 1);
  assert.equal(zwei.f.knopf.disabled, false);
});

test('API-Basis wie booking.js, eine Zeile, die der Harness auf gleiche Origin umschreibt', () => {
  const zeile = /var API_BASE = [^;]+;/g;
  assert.equal(QUELLE.match(zeile).length, 1);
  assert.equal(QUELLE.match(zeile)[0], BOOKING_JS.match(zeile)[0]);
  const ctx = lade({ umschreiben: false });
  ctx.win.amSofortBuchen.oeffnen(ctx.behaelter, AUSWAHL);
  const f = formular(ctx);
  ausfuellen(f);
  f.form.ausloesen('submit');
  assert.equal(ctx.r.posts[0].url, 'https://amanthos-website-api.onrender.com/api/bookings');
});

test('Telefon und Postfach sind die oeffentlichen Angaben aus index.html, Mock-Links wie im Harness', () => {
  assert.ok(INDEX_HTML.includes('<a href="tel:+41415627662">' + TEL + '</a>'));
  assert.ok(INDEX_HTML.includes('<a href="mailto:' + POSTFACH + '">' + POSTFACH + '</a>'));
  for (const modus of ['201', '201-http', '201-fremd']) assert.ok(DEV_SERVER.includes('"' + ANTWORT[modus][1].paymentLink + '"'), modus);
});

test('ES5-Stil: kein let, const, Arrow, Template-String, class', () => {
  const code = QUELLE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\blet\s|\bconst\s|=>|`|\bclass\s/);
  assert.equal(QUELLE.includes(String.fromCharCode(0x2014)), false, 'kein Gedankenstrich');
});
