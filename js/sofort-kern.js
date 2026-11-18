/*
 * Kern der Sofortbuchung, Kontrakt K5 des Bauplans mulin-sofortbuchung (2026-11-18).
 * Rumpf aus Segment 0: Signaturen endgueltig, jede Funktion wirft NotImplemented.
 * Die Logik baut Segment 5. Rein: kein DOM, kein Netz.
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
 * Stil: ES5 (var, keine Arrow-Functions), wie deeplink.js und booking.js.
 */
(function () {
'use strict';

function offen() { throw new Error('NotImplemented'); }

var api = {
  pruefeAngebote: function (liste) { return offen(); },
  anreisetage: function (angebot, heute) { return offen(); },
  abreise: function (anreise, naechte) { return offen(); },
  sucheQuery: function (angebot, anreise, naechte, personen) { return offen(); },
  waehleOffer: function (offers, angebot) { return offen(); },
  gesamt: function (offer, erwachsene, kinder) { return offen(); },
  buchungsBody: function (auswahl, gast, herkunft, tracking) { return offen(); },
  pruefeGast: function (gast) { return offen(); },
  zahlungsZiel: function (antwort) { return offen(); }
};

if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.amSofort = api; }

})();
