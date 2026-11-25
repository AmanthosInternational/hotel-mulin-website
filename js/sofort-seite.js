/*
 * Seite Sofortbuchung, Segment 6 des Bauplans mulin-sofortbuchung (K5). DOM, ES5.
 *
 * Liest window.amSofortAngebote durch amSofort.pruefeAngebote und zeigt je gueltigem
 * Angebot eine Karte mit den Anreisetagen aus amSofort.anreisetage. Nach der Wahl eines
 * Tages: GET /api/offers mit amSofort.sucheQuery, amSofort.waehleOffer, Preis aus
 * amSofort.gesamt, danach genau einmal amSofortBuchen.oeffnen(behaelter, auswahl) mit
 * auswahl { angebot, offer, anreise, abreise, erwachsene, kinder } nach dem Kopf von
 * js/sofort-kern.js. Die Seite rechnet keinen Betrag selbst. Herkunft und Tracking
 * stehen laut Kontrakt nicht in auswahl; sie liest das Formular (Segment 10).
 * Ausgebucht: Hinweis, die anderen Tage bleiben waehlbar. Route nicht erreichbar oder
 * keine gueltigen Angebote: Verweis auf die Buchungsmaske der Startseite.
 * Plausible je Ereignis mit genau den Merkmalen angebot und
 * step; Meta nur ueber amMeta.event('select_offer', ...), nie fbq direkt.
 * K6 (Segment 11): die Karte der Anzeige (passendesAngebot zu utm_campaign) steht zuerst;
 * je Karte mit abTag eine ab-Zeile nur aus der Live-Antwort; Vorauswahl nur auf der Karte
 * der Anzeige (sofort_vorauswahl, kein Meta-Ereignis, ein Tipp gewinnt); vor #sofortListe
 * der Block aus vertrauen(). Ohne die neuen Datenfelder wie am 21.11.2026.
 */
(function () {
'use strict';

var API_BASE = window.HOTELMULIN_API_BASE || 'https://amanthos-website-api.onrender.com';
var MASKE = './#bookingBar';
var PERSONEN = ['', 'eine Person', 'zwei Personen', 'drei Personen', 'vier Personen',
  'fünf Personen', 'sechs Personen'];
// Texte T1 bis T8 aus Plan 14.3, freigegeben vom Inhaber am 25.11.2026.
var TEXT = {
  ab: 'ab ', abZusatz: ' (nicht erstattbare Rate)', inklusive: ', inklusive Frühstück, MWST und Kurtaxe',
  vorgewaehlt: 'Ein Anreisetag ist vorgewählt. Sie können jeden anderen Tag antippen.',
  bewertung: ['Gäste bewerten uns mit ', ' von ', ' auf ', ' (', ' Bewertungen, Stand ', ').'],
  fragen: 'Fragen? Wir sind gerne für Sie da: '
};
var VERSUCHE = 3;   // Abrufe der Vorauswahl hoechstens
var letzte = 0;     // Nummer der letzten Datumswahl; aeltere Antworten verfallen
var offen = null;   // Teile der Karte mit der letzten Datumswahl

function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) { e.className = cls; }
  if (text) { e.textContent = text; }
  return e;
}

function leeren(ziel) {
  while (ziel.firstChild) { ziel.removeChild(ziel.firstChild); }
}

// Meldung in ziel; mit Verweis auf die Buchungsmaske, wenn mitVerweis.
function melde(ziel, text, mitVerweis) {
  leeren(ziel);
  var p = el('p', mitVerweis ? 'sf-verweis' : 'sf-meldung', text);
  if (mitVerweis) {
    var a = el('a', '', 'Zur Buchungsmaske');
    a.href = MASKE;
    p.appendChild(document.createTextNode(' '));
    p.appendChild(a);
  }
  ziel.appendChild(p);
}

function zaehle(name, angebot, step) {
  try { window.plausible(name, { props: { angebot: angebot, step: step } }); }
  catch (e) { /* Messung bricht nie die Seite */ }
}

function heute() {
  var d = new Date();
  var m = d.getMonth() + 1;
  var t = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (t < 10 ? '0' : '') + t;
}

function tagText(iso) {
  var t = String(iso).split('-');
  try {
    return new Date(Date.UTC(+t[0], t[1] - 1, +t[2])).toLocaleDateString('de-CH',
      { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  } catch (e) { return t[2] + '.' + t[1] + '.'; }
}

function holen(url, fertig) {
  var erledigt = false;
  function einmal(status, daten) {
    if (!erledigt) { erledigt = true; fertig(status, daten); }
  }
  try {
    window.fetch(url, { mode: 'cors' }).then(function (r) {
      if (!r.ok) { einmal(r.status, null); return null; }
      return r.json().then(function (d) { einmal(r.status, d); });
    }).catch(function () { einmal(0, null); });
  } catch (e) { einmal(0, null); }
}

function zuruecksetzen(teile) {
  leeren(teile.preis);
  leeren(teile.daten);
  leeren(teile.hinweis);
  leeren(teile.behaelter);
  for (var i = 0; i < teile.knoepfe.length; i++) { teile.knoepfe[i].setAttribute('aria-pressed', 'false'); }
}

function fehler(teile, angebot) {
  melde(teile.hinweis, 'Der Preis lässt sich gerade nicht abrufen.', true);
  zaehle('sofort_datum', angebot.id, 'fehler');
}

function adresse(angebot, tag) {
  return API_BASE + '/api/offers' + window.amSofort.sucheQuery(angebot, tag, angebot.naechte, angebot.personen);
}

function storno(offer) {
  try { return window.amSofort.storno(offer, new Date()); } catch (e) { return null; }
}

// 'CHF x gesamt fuer n Naechte, zwei Personen' fuer Preiszeile und ab-Zeile (T1).
function summeText(summe, angebot) {
  var n = angebot.naechte;
  return 'CHF ' + Number(summe.gesamt).toFixed(2) + ' gesamt für ' + n +
    (n === 1 ? ' Nacht, ' : ' Nächte, ') + (PERSONEN[angebot.personen] || angebot.personen + ' Personen');
}

// Offer und Summe aus der Live-Antwort; null bei Fehler, offer null bei ausgebucht.
function ergebnis(angebot, daten) {
  try {
    if (!daten || !daten.offers) { return null; }
    var offer = window.amSofort.waehleOffer(daten.offers, angebot);
    var summe = offer ? window.amSofort.gesamt(offer, angebot.personen, 0) : null;
    if (offer && !(summe && typeof summe.gesamt === 'number' && isFinite(summe.gesamt))) { return null; }
    return { offer: offer, summe: summe, offers: daten.offers };
  } catch (e) { return null; }
}

function zeige(teile, angebot, anreise, abreise, knopf, daten) {
  var r = ergebnis(angebot, daten);
  if (!r) { return fehler(teile, angebot); }
  if (!r.offer) {
    knopf.disabled = true;
    knopf.setAttribute('aria-pressed', 'false');
    melde(teile.hinweis, 'An diesem Tag ist das Angebot ausgebucht. Bitte wählen Sie einen anderen Anreisetag.', false);
    zaehle('sofort_datum', angebot.id, 'ausgebucht');
    return;
  }
  preis(teile, angebot, anreise, abreise, r, 'sofort_datum');
}

// Preis und Formular nach einem Tipp (sofort_datum, select_offer) oder der Vorauswahl.
function preis(teile, angebot, anreise, abreise, r, name) {
  leeren(teile.hinweis);
  teile.preis.textContent = summeText(r.summe, angebot) + TEXT.inklusive;
  teile.daten.textContent = 'Anreise ' + tagText(anreise) + ', Abreise ' + tagText(abreise);
  zaehle(name, angebot.id, 'preis');
  if (name === 'sofort_datum') {
    try { window.amMeta.event('select_offer', { total_price: r.summe.gesamt, currency: 'CHF' }); }
    catch (e) { /* Werbung bricht nie die Seite */ }
  } else { melde(teile.hinweis, TEXT.vorgewaehlt, false); }
  oeffne(teile, { angebot: angebot, offer: r.offer, anreise: anreise, abreise: abreise,
    erwachsene: angebot.personen, kinder: 0 });
}

function oeffne(teile, auswahl) {
  try { window.amSofortBuchen.oeffnen(teile.behaelter, auswahl); }
  catch (e) { melde(teile.hinweis, 'Die Buchung ist hier gerade nicht möglich.', true); }
}

function waehler(angebot, teile, anreise, knopf) {
  return function () {
    var nr = ++letzte;
    if (offen && offen !== teile) { zuruecksetzen(offen); }
    offen = teile;
    zuruecksetzen(teile);
    knopf.setAttribute('aria-pressed', 'true');
    melde(teile.hinweis, 'Preis wird geladen.', false);
    var abreise;
    var url;
    try {
      abreise = window.amSofort.abreise(anreise, angebot.naechte);
      url = adresse(angebot, anreise);
    } catch (e) { return fehler(teile, angebot); }
    holen(url, function (status, daten) {
      if (nr !== letzte) { return; }
      zeige(teile, angebot, anreise, abreise, knopf, status >= 200 && status < 300 ? daten : null);
    });
  };
}

// ab-Zeile (T1) nur aus der Live-Antwort zum Bezugstag, sonst keine Zeile.
function abZeile(k, status, daten) {
  var r = ergebnis(k.angebot, status >= 200 && status < 300 ? daten : null);
  if (!r || !r.offer) { return; }
  var s = storno(r.offer);
  k.teile.ab.textContent = TEXT.ab + summeText(r.summe, k.angebot) + (s && s.art === 'flexibel' ? '' : TEXT.abZusatz);
}

// Vorauswahl auf der Karte der Anzeige: ab, sonst der erste Anreisetag, bei ausgebucht der
// naechste, hoechstens VERSUCHE Abrufe; ein Tipp (neues letzte) beendet sie ohne Spur.
function vorauswahl(k, ab) {
  var nr = ++letzte;
  var i = ab ? Math.max(k.tage.indexOf(ab), 0) : 0;
  var versuch = 0;
  function weiter() {
    var tag = k.tage[i], knopf = k.teile.knoepfe[i], abreise, url;
    try { abreise = window.amSofort.abreise(tag, k.angebot.naechte); url = adresse(k.angebot, tag); }
    catch (e) { return zaehle('sofort_vorauswahl', k.angebot.id, 'fehler'); }
    versuch++;
    holen(url, function (status, daten) {
      if (tag === ab) { abZeile(k, status, daten); }
      if (nr !== letzte) { return; }
      var r = ergebnis(k.angebot, status >= 200 && status < 300 ? daten : null);
      if (!r) { return zaehle('sofort_vorauswahl', k.angebot.id, 'fehler'); }
      if (!r.offer) {
        knopf.disabled = true;
        if (++i < k.tage.length && versuch < VERSUCHE) { return weiter(); }
        return zaehle('sofort_vorauswahl', k.angebot.id, 'ausgebucht');
      }
      offen = k.teile;
      zuruecksetzen(k.teile);
      knopf.setAttribute('aria-pressed', 'true');
      preis(k.teile, k.angebot, tag, abreise, r, 'sofort_vorauswahl');
    });
  }
  if (k.tage.length) { weiter(); }
}

// Nach dem Aufbau aller Karten: je Karte mit abTag ein Abruf, auf der Karte der Anzeige
// derselbe Abruf als erster Schritt der Vorauswahl.
function laden(karten, pid) {
  for (var i = 0; i < karten.length; i++) {
    var k = karten[i], ab = null, url = null;
    try { ab = window.amSofort.abTag(k.angebot, heute()); url = ab && adresse(k.angebot, ab); } catch (e) { ab = null; }
    if (k.angebot.id === pid) { vorauswahl(k, ab); }
    else if (url) { holen(url, abZeile.bind(null, k)); }
  }
}

function kampagne() {
  try {
    var c = window.amDeepLink.parse(window.location.search, { today: new Date() }).campaign;
    return (c && c.utm_campaign) || null;
  } catch (e) { return null; }
}

// Bewertung (T7) und Telefon (T8) vor #sofortListe; ohne gueltige Daten kein Block.
function vertrauen(liste) {
  var v = null;
  try { v = window.amSofort.vertrauen(window.amSofortVertrauen, heute()); } catch (e) { v = null; }
  if (!v || !(v.bewertung || v.telefon)) { return; }
  var block = el('div', 'sf-vertrauen');
  var b = v.bewertung, t = TEXT.bewertung;
  if (b) {
    var s = String(b.stand).split('-');
    block.appendChild(el('p', 'sf-bewertung', t[0] + b.wert + t[1] + b.von + t[2] + b.quelle + t[3] + b.anzahl +
      t[4] + s[2] + '.' + s[1] + '.' + s[0] + t[5]));
  }
  if (v.telefon) {
    var p = el('p', 'sf-fragen', TEXT.fragen);
    var a = el('a', '', v.telefon.anzeige);
    a.href = 'tel:' + v.telefon.tel;
    p.appendChild(a);
    block.appendChild(p);
  }
  try { liste.parentNode.insertBefore(block, liste); } catch (e) { /* ohne Block */ }
}

function karte(liste, angebot) {
  var k = el('article', 'sf-karte');
  var bild = el('img', 'sf-bild');
  var inhalt = el('div', 'sf-inhalt');
  var teile = { knoepfe: [], preis: el('p', 'sf-preis'), daten: el('p', 'sf-daten'), ab: el('p', 'sf-ab'),
    hinweis: el('div', 'sf-hinweis'), behaelter: el('div', 'sf-buchen') };
  var tage = [];
  try { tage = window.amSofort.anreisetage(angebot, heute()) || []; } catch (e) { tage = []; }
  k.setAttribute('data-angebot', angebot.id);
  bild.src = angebot.bild;
  bild.alt = angebot.titel || '';
  inhalt.appendChild(el('h2', 'sf-titel', angebot.titel));
  inhalt.appendChild(el('p', 'sf-text', angebot.text));
  inhalt.appendChild(teile.ab);
  if (tage.length) {
    var gruppe = el('div', 'sf-tage');
    gruppe.setAttribute('role', 'group');
    gruppe.setAttribute('aria-label', 'Anreisetag');
    for (var i = 0; i < tage.length; i++) {
      var b = el('button', 'sf-tag', tagText(tage[i]));
      b.type = 'button';
      b.setAttribute('data-tag', tage[i]);
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', waehler(angebot, teile, tage[i], b));
      teile.knoepfe.push(b);
      gruppe.appendChild(b);
    }
    inhalt.appendChild(el('p', 'sf-frage', 'Anreisetag wählen'));
    inhalt.appendChild(gruppe);
  } else {
    melde(teile.hinweis, 'Für dieses Angebot ist zurzeit kein Anreisetag frei.', true);
  }
  teile.hinweis.setAttribute('aria-live', 'polite');
  inhalt.appendChild(teile.preis);
  inhalt.appendChild(teile.daten);
  inhalt.appendChild(teile.hinweis);
  inhalt.appendChild(teile.behaelter);
  k.appendChild(bild);
  k.appendChild(inhalt);
  liste.appendChild(k);
  zaehle('sofort_ansicht', angebot.id, 'ansicht');
  return { angebot: angebot, teile: teile, tage: tage };
}

function start() {
  var liste = document.getElementById('sofortListe');
  var gueltig = [];
  var gezeigt = [];
  var pid = null;
  if (!liste) { return; }
  try {
    var roh = window.amSofortAngebote;
    gueltig = window.amSofort.pruefeAngebote(Array.isArray(roh) ? roh : []).gueltig || [];
  } catch (e) { gueltig = []; }
  try { pid = window.amSofort.passendesAngebot(gueltig, kampagne()); } catch (e) { pid = null; }
  for (var j = 0; j < gueltig.length; j++) {
    if (gueltig[j].id === pid) { gueltig.unshift(gueltig.splice(j, 1)[0]); break; }
  }
  vertrauen(liste);
  for (var i = 0; i < gueltig.length; i++) {
    try { gezeigt.push(karte(liste, gueltig[i])); } catch (e) { /* naechstes Angebot */ }
  }
  if (!gezeigt.length) {
    melde(liste, 'Zurzeit gibt es hier kein Sofortangebot.', true);
    zaehle('sofort_ansicht', 'keine', 'verweis');
  }
  laden(gezeigt, pid);
}

// Alle Skripte laden mit defer; gestartet wird erst, wenn auch Kern, Formular und
// Angebotsdatei gelaufen sind, unabhaengig von ihrer Reihenfolge im HTML.
if (document.readyState === 'complete') { start(); }
else { document.addEventListener('DOMContentLoaded', start); }

})();
