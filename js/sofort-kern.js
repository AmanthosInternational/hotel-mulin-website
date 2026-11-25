/*
 * Kern der Sofortbuchung, Kontrakt K5 des Bauplans mulin-sofortbuchung (2026-11-18).
 * Signaturen aus Segment 0, Logik aus Segment 5. Rein: kein DOM, kein Netz.
 * Dieser Kopf ist verbindlich (K5 mit dem Nachtrag des Orchestrators vom 18.11.2026)
 * fuer Segment 5, Segment 6 (Doubles, Seite) und Segment 10 (Formular).
 *
 * Datenformen
 *   Datum      'JJJJ-MM-TT' ueberall.
 *   Angebot    Eintrag der Angebotsliste: { id, titel, text, bild, room, rate, naechte,
 *              anreise_wochentage, von, bis, gesperrt, personen, kampagne }
 *              anreise_wochentage: Zahlen nach Date.getDay (0 Sonntag bis 6 Samstag).
 *              gesperrt: [{ von, bis }], beide inklusive. Ein Aufenthalt ist gesperrt,
 *              wenn eine seiner Naechte (Datum des Abends) im Bereich liegt.
 *              kampagne: Schluessel wie 'sofort' oder null.
 *   Angebotsdatei  js/sofort-angebote.js (Sammelstelle, fuellt die Verdrahtung) setzt
 *              window.amSofortAngebote = [ Angebot, ... ].
 *   offer      Eintrag aus offers[] von GET /api/offers.
 *   auswahl    { angebot, offer, anreise, abreise, erwachsene, kinder } (an
 *              amSofortBuchen.oeffnen und buchungsBody).
 *   gast       { vorname, nachname, email, telefon }; telefon darf '' sein.
 *
 * Funktionen
 *   pruefeAngebote(liste)              -> { gueltig: [Angebot], fehler: [{ id, grund }] }
 *       grund ist ein kurzer Code wie 'naechte', 'fenster', 'room_rate'.
 *   anreisetage(angebot, heute)        -> ['JJJJ-MM-TT', ...]
 *   abreise(anreise, naechte)          -> 'JJJJ-MM-TT'
 *   sucheQuery(angebot, anreise, naechte, personen)
 *       -> Zeichenkette mit fuehrendem '?' fuer GET /api/offers, Parameter wie booking.js
 *          sie sendet (searchParams in booking.js:933-939, Query in booking.js:1117-1122):
 *          '?propertyId=MUBRIG&arrival=<anreise>&departure=<abreise>&adults=<personen>
 *          &children=0', jeder Wert mit encodeURIComponent; '&kampagne=<angebot.kampagne>'
 *          nur, wenn angebot.kampagne gesetzt ist.
 *   waehleOffer(offers, angebot)       -> das Offer zu Zimmer- und Plancode
 *                                         (mit oder ohne Praefix, wie K1)
 *   gesamt(offer, erwachsene, kinder)  -> { zimmer, kurtaxe, gesamt }
 *                                         (Kurtaxe wie getOfferCityTax in booking.js)
 *   buchungsBody(auswahl, gast, herkunft, tracking) -> Body fuer POST /api/bookings,
 *       genau die Schluessel von booking.js: propertyId, ratePlanId, arrival,
 *       departure, adults, children, totalAmount, cityTax, upsells (leer), currency,
 *       booker { firstName, lastName, email, phone } (aus gast vorname, nachname,
 *       email, telefon), comment 'Booked via hotelmulin.ch/sofortbuchung',
 *       optional bookingSource, campaign, kampagne, tracking.
 *       herkunft = amDeepLink.parse der Lande-Adresse; tracking = amMeta.tracking(),
 *       null ohne Einwilligung, dann fehlt der Schluessel.
 *   pruefeGast(gast)                   -> { gueltig: bool, fehler: [Feldname aus gast] },
 *       etwa ['email']; Pflichtfelder wie booking.js, Mail mit @ und Punkt.
 *   zahlungsZiel(antwort)              -> url | null: nur https und nur die Hosts
 *       eu.adyen.link, checkout.adyen.com, checkoutshopper-live.adyen.com
 *
 * K6 (Nachtrag 2026-11-25, Segment 11) erweitert K5 und aendert keine Signatur daraus.
 *   Angebot, optional: anzeigen ['praefix', ...] (je ^[a-z0-9-]{1,48}$, Praefix von
 *              utm_campaign), ab_anreise 'JJJJ-MM-TT' (Bezugstag fuer ab-Preis und
 *              Vorauswahl), rate_flex (Plancode der flexiblen Alternative).
 *   Vertrauen  window.amSofortVertrauen = { bewertung: { wert, von, anzahl, quelle, stand },
 *              telefon: { anzeige, tel } }, gesetzt in js/sofort-angebote.js.
 *   passendesAngebot(angebote, utmCampaign) -> id | null: das erste Angebot, dessen
 *       anzeigen einen Praefix des klein geschriebenen utmCampaign traegt.
 *   abTag(angebot, heute)              -> ab_anreise, wenn er in anreisetage liegt, sonst null
 *   storno(offer, jetzt)               -> { art, frist, zeit }: art 'flexibel' nur bei
 *       category 'Refundable' und cancellationFee.dueDateTime nach jetzt, dann frist
 *       'JJJJ-MM-TT' und zeit 'HH:MM' aus den Stellen von dueDateTime (Ortszeit des Hauses,
 *       nie umgerechnet); sonst { art: 'nicht_erstattbar', frist: null, zeit: null }.
 *   flexOffer(offers, angebot, jetzt)  -> das Offer zu room und rate_flex (Abgleich wie
 *       waehleOffer), nur wenn storno dafuer 'flexibel' ergibt, sonst null.
 *   vertrauen(daten, heute)            -> { bewertung, telefon }, je null bei fehlendem oder
 *       ungueltigem Feld; bewertung auch bei stand in der Zukunft oder aelter als 60 Tage;
 *       telefon nur mit tel nach ^\+[0-9]{8,15}$.
 *   Fehlt ein neues Feld, verhaelt sich die Seite wie am 21.11.2026 (Rueckweg ohne Code).
 *
 * Stil: ES5 (var, keine Arrow-Functions), wie deeplink.js und booking.js.
 */
(function () {
'use strict';

var HAUS = 'MUBRIG';
var KOMMENTAR = 'Booked via hotelmulin.ch/sofortbuchung';
var ZAHLUNGS_HOSTS = ['eu.adyen.link', 'checkout.adyen.com', 'checkoutshopper-live.adyen.com'];
var DATUM_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
var KAMPAGNE_RE = /^[a-z0-9-]{1,32}$/;
var MAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // wie isValidEmail in booking.js
var MAX_NAECHTE = 30;
var TAG_MS = 86400000;

// Randfaelle, die der Kopf offen laesst: ungueltige Eingabe ergibt bei abreise,
// sucheQuery, waehleOffer, gesamt und buchungsBody null, bei anreisetage [].

function trim(v) { return typeof v === 'string' ? v.replace(/^\s+|\s+$/g, '') : ''; }
function ganz(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
function rund(n) { return Math.round(n * 100) / 100; } // roundCHF in booking.js
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function enc(v) { return encodeURIComponent(String(v)); }
function kampagneOk(k) { return typeof k === 'string' && KAMPAGNE_RE.test(k); }

// 'JJJJ-MM-TT' als Tagesnummer ueber UTC (Sommerzeit verschiebt nichts), nur echte Kalenderdaten.
function tagNr(iso) {
  var m = typeof iso === 'string' ? DATUM_RE.exec(iso) : null;
  if (!m) return null;
  var y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
  var t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return t.getTime() / TAG_MS;
}

function isoVon(nr) {
  var t = new Date(nr * TAG_MS);
  return t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate());
}

// heute als 'JJJJ-MM-TT' oder als Date (lokaler Kalendertag des Gastes).
function heuteNr(heute) {
  var ok = heute instanceof Date && !isNaN(heute.getTime());
  return ok ? Date.UTC(heute.getFullYear(), heute.getMonth(), heute.getDate()) / TAG_MS : tagNr(heute);
}

function wochentageOk(w) {
  if (!Array.isArray(w) || w.length === 0) return false;
  for (var i = 0; i < w.length; i++) { if (!ganz(w[i]) || w[i] < 0 || w[i] > 6) return false; }
  return true;
}

// gesperrt als Liste von [von, bis] in Tagesnummern, null wenn die Form nicht stimmt.
function sperren(g) {
  if (!Array.isArray(g)) return null;
  var out = [];
  for (var i = 0; i < g.length; i++) {
    var v = g[i] ? tagNr(g[i].von) : null, b = g[i] ? tagNr(g[i].bis) : null;
    if (v === null || b === null || v > b) return null;
    out.push([v, b]);
  }
  return out;
}

// Erster Grund, an dem ein Angebot scheitert, sonst null.
function grundVon(a) {
  if (!a || typeof a !== 'object') return 'form';
  if (!trim(a.id)) return 'id';
  if (!trim(a.room) || !trim(a.rate)) return 'room_rate';
  if (!ganz(a.naechte) || a.naechte < 1 || a.naechte > MAX_NAECHTE) return 'naechte';
  var von = tagNr(a.von), bis = tagNr(a.bis);
  if (von === null || bis === null || von > bis) return 'fenster';
  if (!wochentageOk(a.anreise_wochentage)) return 'wochentage';
  if (sperren(a.gesperrt) === null) return 'gesperrt';
  if (!ganz(a.personen) || a.personen < 1) return 'personen';
  if (a.kampagne !== null && a.kampagne !== undefined && !kampagneOk(a.kampagne)) return 'kampagne';
  return null;
}

function pruefeAngebote(liste) {
  var out = { gueltig: [], fehler: [] };
  if (!Array.isArray(liste)) { out.fehler.push({ id: null, grund: 'liste' }); return out; }
  var gesehen = {};
  for (var i = 0; i < liste.length; i++) {
    var a = liste[i];
    var grund = grundVon(a);
    if (!grund && Object.prototype.hasOwnProperty.call(gesehen, a.id)) grund = 'id';
    if (grund) { out.fehler.push({ id: a && typeof a.id === 'string' ? a.id : null, grund: grund }); continue; }
    gesehen[a.id] = true;
    out.gueltig.push(a);
  }
  return out;
}

// Ein Aufenthalt ab d ist gesperrt, wenn einer seiner Abende d bis d+n-1 in einer Sperre liegt.
function gesperrtAb(sp, d, n) {
  for (var i = 0; i < sp.length; i++) { if (d <= sp[i][1] && d + n - 1 >= sp[i][0]) return true; }
  return false;
}

function anreisetage(angebot, heute) {
  var out = [];
  var h = heuteNr(heute);
  if (h === null || grundVon(angebot) !== null) return out;
  var n = angebot.naechte, bis = tagNr(angebot.bis), sp = sperren(angebot.gesperrt);
  for (var d = Math.max(tagNr(angebot.von), h); d + n <= bis; d++) {
    if (angebot.anreise_wochentage.indexOf(new Date(d * TAG_MS).getUTCDay()) < 0) continue;
    if (!gesperrtAb(sp, d, n)) out.push(isoVon(d));
  }
  return out;
}

function abreise(anreise, naechte) {
  var a = tagNr(anreise);
  if (a === null || !ganz(naechte) || naechte < 1 || naechte > MAX_NAECHTE) return null;
  return isoVon(a + naechte);
}

function sucheQuery(angebot, anreise, naechte, personen) {
  var ab = abreise(anreise, naechte);
  if (!angebot || ab === null || !ganz(personen) || personen < 1) return null;
  var q = '?propertyId=' + enc(HAUS) + '&arrival=' + enc(anreise) + '&departure=' + enc(ab)
    + '&adults=' + enc(personen) + '&children=' + enc(0);
  if (angebot.kampagne) q += '&kampagne=' + enc(angebot.kampagne);
  return q;
}

// Wie stripProperty und codeMatches in booking.js: mit oder ohne Praefix, Gross und klein egal.
function ohnePraefix(code) {
  var c = String(code === null || code === undefined ? '' : code).toUpperCase();
  return c.indexOf(HAUS + '-') === 0 ? c.slice(HAUS.length + 1) : c;
}

function passt(gesucht, kandidaten) {
  var w = ohnePraefix(gesucht);
  if (!w) return false;
  for (var i = 0; i < kandidaten.length; i++) { if (ohnePraefix(kandidaten[i]) === w) return true; }
  return false;
}

function waehleOffer(offers, angebot) {
  if (!Array.isArray(offers) || !angebot) return null;
  for (var i = 0; i < offers.length; i++) {
    var o = offers[i];
    if (o && passt(angebot.room, [o.unitGroupId, o.unitGroupCode])
        && passt(angebot.rate, [o.ratePlanCode, o.ratePlanId])) return o;
  }
  return null;
}

// Wie getOfferCityTax in booking.js: Apaleo liefert die Kurtaxe fuer die gesuchten
// Erwachsenen, skaliert auf alle Personen; enthalten (included) heisst nie obendrauf.
function kurtaxe(offer, erwachsene, kinder) {
  if (!offer.cityTax || !offer.cityTax.amount || offer.cityTax.included) return 0;
  var base = offer.cityTax.amount;
  var adults = parseInt(erwachsene, 10) || 1, children = parseInt(kinder, 10) || 0;
  if (adults <= 0) return rund(base);
  return rund(base * (adults + children) / adults);
}

function gesamt(offer, erwachsene, kinder) {
  var t = offer && offer.totalGrossAmount;
  if (!t || typeof t.amount !== 'number' || !isFinite(t.amount)) return null;
  var k = kurtaxe(offer, erwachsene, kinder);
  if (typeof k !== 'number' || !isFinite(k)) return null;
  return { zimmer: rund(t.amount), kurtaxe: k, gesamt: rund(t.amount + k) };
}

// Wie der payload in booking.js: totalAmount ist der Zimmerbetrag, cityTax getrennt.
// kampagne: die des Angebots (mit ihr lief sucheQuery), sonst die aus parse.
function buchungsBody(auswahl, gast, herkunft, tracking) {
  var s = auswahl || {}, offer = s.offer;
  var preis = gesamt(offer, s.erwachsene, s.kinder);
  var adults = parseInt(s.erwachsene, 10);
  if (!preis || !offer.ratePlanId || !(adults >= 1) || tagNr(s.anreise) === null || tagNr(s.abreise) === null) return null;
  var g = gast || {};
  var body = {
    propertyId: HAUS, ratePlanId: offer.ratePlanId, arrival: s.anreise, departure: s.abreise,
    adults: adults, children: parseInt(s.kinder, 10) || 0,
    totalAmount: preis.zimmer, cityTax: preis.kurtaxe, upsells: [],
    currency: offer.totalGrossAmount.currency || 'CHF',
    booker: { firstName: trim(g.vorname), lastName: trim(g.nachname), email: trim(g.email), phone: trim(g.telefon) },
    comment: KOMMENTAR
  };
  var h = herkunft || {};
  if (h.source) body.bookingSource = h.source;
  if (h.campaign) body.campaign = h.campaign;
  var k = s.angebot && kampagneOk(s.angebot.kampagne) ? s.angebot.kampagne : h.kampagne;
  if (kampagneOk(k)) body.kampagne = k;
  if (tracking && typeof tracking === 'object') body.tracking = tracking;
  return body;
}

function pruefeGast(gast) {
  var g = gast || {}, fehler = [];
  if (!trim(g.vorname)) fehler.push('vorname');
  if (!trim(g.nachname)) fehler.push('nachname');
  if (!MAIL_RE.test(trim(g.email))) fehler.push('email');
  return { gueltig: fehler.length === 0, fehler: fehler };
}

// Wie booking.js:2050: nur https und nur genau diese Hosts, kein Teilstring.
function zahlungsZiel(antwort) {
  var link = antwort && antwort.paymentLink;
  if (typeof link !== 'string' || link === '') return null;
  try { var u = new URL(link); } catch (e) { return null; }
  return u.protocol === 'https:' && ZAHLUNGS_HOSTS.indexOf(u.hostname) >= 0 ? link : null;
}

// K6: Ruempfe aus dem Kontrakt-Commit, die Logik folgt in Segment 11, Aufgabe 2.
function nichtGebaut() { throw new Error('NotImplemented'); }
function passendesAngebot(angebote, utmCampaign) { nichtGebaut(); }
function abTag(angebot, heute) { nichtGebaut(); }
function storno(offer, jetzt) { nichtGebaut(); }
function flexOffer(offers, angebot, jetzt) { nichtGebaut(); }
function vertrauen(daten, heute) { nichtGebaut(); }

var api = {
  pruefeAngebote: pruefeAngebote, anreisetage: anreisetage, abreise: abreise, sucheQuery: sucheQuery,
  waehleOffer: waehleOffer, gesamt: gesamt, buchungsBody: buchungsBody, pruefeGast: pruefeGast, zahlungsZiel: zahlungsZiel,
  passendesAngebot: passendesAngebot, abTag: abTag, storno: storno, flexOffer: flexOffer, vertrauen: vertrauen
};

if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.amSofort = api; }

})();
