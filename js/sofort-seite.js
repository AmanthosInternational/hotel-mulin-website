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
 * Plausible nur sofort_ansicht und sofort_datum mit genau den Merkmalen angebot und
 * step; Meta nur ueber amMeta.event('select_offer', ...), nie fbq direkt.
 */
(function () {
'use strict';

var API_BASE = window.HOTELMULIN_API_BASE || 'https://amanthos-website-api.onrender.com';
var MASKE = './#bookingBar';
var PERSONEN = ['', 'eine Person', 'zwei Personen', 'drei Personen', 'vier Personen',
  'fünf Personen', 'sechs Personen'];
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

function zeige(teile, angebot, anreise, abreise, knopf, daten) {
  var offer = null;
  var summe = null;
  try {
    if (!daten || !daten.offers) { throw new Error('keine Antwort'); }
    offer = window.amSofort.waehleOffer(daten.offers, angebot);
    if (offer) { summe = window.amSofort.gesamt(offer, angebot.personen, 0); }
    if (offer && !(summe && typeof summe.gesamt === 'number' && isFinite(summe.gesamt))) {
      throw new Error('kein Betrag');
    }
  } catch (e) { return fehler(teile, angebot); }
  if (!offer) {
    knopf.disabled = true;
    knopf.setAttribute('aria-pressed', 'false');
    melde(teile.hinweis, 'An diesem Tag ist das Angebot ausgebucht. Bitte wählen Sie einen anderen Anreisetag.', false);
    zaehle('sofort_datum', angebot.id, 'ausgebucht');
    return;
  }
  var n = angebot.naechte;
  leeren(teile.hinweis);
  teile.preis.textContent = 'CHF ' + Number(summe.gesamt).toFixed(2) + ' gesamt für ' + n +
    (n === 1 ? ' Nacht, ' : ' Nächte, ') + (PERSONEN[angebot.personen] || angebot.personen + ' Personen') +
    ', inklusive Frühstück, MWST und Kurtaxe';
  teile.daten.textContent = 'Anreise ' + tagText(anreise) + ', Abreise ' + tagText(abreise);
  zaehle('sofort_datum', angebot.id, 'preis');
  try { window.amMeta.event('select_offer', { total_price: summe.gesamt, currency: 'CHF' }); }
  catch (e) { /* Werbung bricht nie die Seite */ }
  try {
    window.amSofortBuchen.oeffnen(teile.behaelter, { angebot: angebot, offer: offer, anreise: anreise,
      abreise: abreise, erwachsene: angebot.personen, kinder: 0 });
  } catch (e) {
    melde(teile.hinweis, 'Die Buchung ist hier gerade nicht möglich.', true);
  }
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
      url = API_BASE + '/api/offers' + window.amSofort.sucheQuery(angebot, anreise, angebot.naechte, angebot.personen);
    } catch (e) { return fehler(teile, angebot); }
    holen(url, function (status, daten) {
      if (nr !== letzte) { return; }
      zeige(teile, angebot, anreise, abreise, knopf, status >= 200 && status < 300 ? daten : null);
    });
  };
}

function karte(liste, angebot) {
  var k = el('article', 'sf-karte');
  var bild = el('img', 'sf-bild');
  var inhalt = el('div', 'sf-inhalt');
  var teile = { knoepfe: [], preis: el('p', 'sf-preis'), daten: el('p', 'sf-daten'),
    hinweis: el('div', 'sf-hinweis'), behaelter: el('div', 'sf-buchen') };
  var tage = [];
  try { tage = window.amSofort.anreisetage(angebot, heute()) || []; } catch (e) { tage = []; }
  k.setAttribute('data-angebot', angebot.id);
  bild.src = angebot.bild;
  bild.alt = angebot.titel || '';
  inhalt.appendChild(el('h2', 'sf-titel', angebot.titel));
  inhalt.appendChild(el('p', 'sf-text', angebot.text));
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
}

function start() {
  var liste = document.getElementById('sofortListe');
  var gueltig = [];
  var gezeigt = 0;
  if (!liste) { return; }
  try {
    var roh = window.amSofortAngebote;
    gueltig = window.amSofort.pruefeAngebote(Array.isArray(roh) ? roh : []).gueltig || [];
  } catch (e) { gueltig = []; }
  for (var i = 0; i < gueltig.length; i++) {
    try { karte(liste, gueltig[i]); gezeigt++; } catch (e) { /* naechstes Angebot */ }
  }
  if (!gezeigt) {
    melde(liste, 'Zurzeit gibt es hier kein Sofortangebot.', true);
    zaehle('sofort_ansicht', 'keine', 'verweis');
  }
}

// Alle Skripte laden mit defer; gestartet wird erst, wenn auch Kern, Formular und
// Angebotsdatei gelaufen sind, unabhaengig von ihrer Reihenfolge im HTML.
if (document.readyState === 'complete') { start(); }
else { document.addEventListener('DOMContentLoaded', start); }

})();
