/*
 * Test-Double von js/sofort-buchen.js (Kontrakt K5) fuer die Seite Sofortbuchung,
 * Segment 6 des Bauplans mulin-sofortbuchung. Kein Produktivcode: der Harness liefert
 * diese Datei mit ?buchen=double. oeffnen baut kein Formular (die Felder gehoeren
 * Segment 10), es zeichnet nur jeden Aufruf in window.__oeffnenCalls auf:
 *   { behaelter: <Klasse des Behaelters>, karte: <data-angebot der Karte>, auswahl }
 * auswahl als JSON-Kopie in der Form aus dem Kopf von js/sofort-kern.js.
 * Stil: ES5 (var, keine Arrow-Functions).
 */
(function () {
'use strict';

var calls = [];

function karteVon(knoten) {
  var k = knoten;
  while (k && !(k.getAttribute && k.getAttribute('data-angebot'))) { k = k.parentNode; }
  return k ? k.getAttribute('data-angebot') : null;
}

function oeffnen(behaelter, auswahl) {
  var kopie;
  try { kopie = JSON.parse(JSON.stringify(auswahl)); } catch (e) { kopie = null; }
  calls.push({
    behaelter: behaelter && behaelter.className ? behaelter.className : null,
    karte: karteVon(behaelter),
    auswahl: kopie
  });
}

if (typeof module !== 'undefined' && module.exports) { module.exports = { oeffnen: oeffnen, calls: calls }; }
if (typeof window !== 'undefined') {
  window.amSofortBuchen = { oeffnen: oeffnen };
  window.__oeffnenCalls = calls;
}

})();
