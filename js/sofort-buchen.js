/*
 * Buchungsformular der Sofortbuchung, Kontrakt K5 des Bauplans mulin-sofortbuchung
 * (2026-11-18). Rumpf aus Segment 0: oeffnen wirft NotImplemented, die Logik baut
 * Segment 10. DOM, ES5.
 *
 *   window.amSofortBuchen.oeffnen(behaelter, auswahl)
 *     auswahl und gast in der Form aus dem verbindlichen Kopf von js/sofort-kern.js:
 *     auswahl { angebot, offer, anreise, abreise, erwachsene, kinder },
 *     gast { vorname, nachname, email, telefon }.
 *     zeigt unter der gewaehlten Karte das Formular (Vorname, Nachname, E-Mail;
 *     Telefon freiwillig wie in booking.js) und den Endpreis aus amSofort.gesamt().
 *     Beim Absenden: amSofort.pruefeGast, amMeta.event('begin_checkout', ...),
 *     POST /api/bookings mit amSofort.buchungsBody.
 *     201: amMeta.event('booking_confirmed', ...), dann window.location auf
 *          amSofort.zahlungsZiel(antwort); immer window.location, kein Popup.
 *     409 oder 429: Hinweis mit Telefon und Postfach des Hauses.
 *     Fehler: Hinweis und Verweis auf die Buchungsmaske.
 *   Meta nur ueber amMeta.event, nie fbq direkt; kein Purchase vor der Zahlung.
 * Stil: ES5 (var, keine Arrow-Functions), wie booking.js.
 */
(function () {
'use strict';

if (typeof window !== 'undefined') {
  window.amSofortBuchen = {
    oeffnen: function (behaelter, auswahl) { throw new Error('NotImplemented'); }
  };
}

})();
