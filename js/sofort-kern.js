/*
 * Kern der Sofortbuchung, Kontrakt K5 des Bauplans mulin-sofortbuchung (2026-11-18).
 * Rumpf aus Segment 0: Signaturen endgueltig, jede Funktion wirft NotImplemented.
 * Die Logik baut Segment 5. Rein: kein DOM, kein Netz.
 *
 *   pruefeAngebote(liste)              -> { gueltig: [Angebot], fehler: [...] }
 *   anreisetage(angebot, heute)        -> ['JJJJ-MM-TT', ...]
 *   abreise(anreise, naechte)          -> Abreisetag zur Anreise
 *   sucheQuery(angebot, anreise, naechte, personen) -> Suche fuer GET /api/offers
 *   waehleOffer(offers, angebot)       -> das Offer zu Zimmer- und Plancode
 *                                         (mit oder ohne Praefix, wie K1)
 *   gesamt(offer, erwachsene, kinder)  -> { zimmer, kurtaxe, gesamt }
 *                                         (Kurtaxe wie getOfferCityTax in booking.js)
 *   buchungsBody(auswahl, gast, herkunft, tracking) -> Body fuer POST /api/bookings,
 *       genau die Schluessel von booking.js: propertyId, ratePlanId, arrival,
 *       departure, adults, children, totalAmount, cityTax, upsells (leer), currency,
 *       booker { firstName, lastName, email, phone },
 *       comment 'Booked via hotelmulin.ch/sofortbuchung',
 *       optional bookingSource, campaign, kampagne, tracking.
 *       herkunft = amDeepLink.parse der Lande-Adresse; tracking = amMeta.tracking(),
 *       null ohne Einwilligung, dann fehlt der Schluessel.
 *   pruefeGast(gast)                   -> { gueltig, fehler } (Pflichtfelder wie
 *                                         booking.js, Mail mit @ und Punkt)
 *   zahlungsZiel(antwort)              -> url | null: nur https und nur die Hosts
 *       eu.adyen.link, checkout.adyen.com, checkoutshopper-live.adyen.com
 *
 * Angebot (tests/fixtures/sofort-angebote.json): id, titel, text, bild, room, rate,
 * naechte, anreise_wochentage, von, bis, gesperrt (Liste von Zeitraeumen), personen,
 * kampagne oder null.
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
