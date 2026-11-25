/*
 * Angebote der Seite /sofortbuchung (Bauplan mulin-sofortbuchung, Verdrahtung Schritt 6).
 * Freigegeben vom Inhaber am 21.11.2026: drei Karten, bestehende Ratenplaene zum Website-Preis
 * (Entscheid K-826 a), Preise immer live aus der Buchungsstrecke, nie hier.
 * Form und Pruefung: Kopfkommentar von js/sofort-kern.js (pruefeAngebote). Wochentage nach
 * Date.getDay (0 Sonntag, 6 Samstag); `bis` ist der spaeteste Abreisetag; `gesperrt` immer
 * eine Liste.
 *
 * K6 (Nachtrag 14 des Bauplans, Verdrahtung L5), freigegeben vom Inhaber am 25.11.2026
 * (Entscheide K-1303 a und K-1326 a). Alle Felder sind optional; ohne sie verhaelt sich die
 * Seite wie am 21.11.2026, das ist der Rueckweg ohne Code.
 *   anzeigen    Praefixe von utm_campaign der Anzeigen, die bei diesem Angebot landen.
 *   ab_anreise  Bezugstag fuer die ab-Zeile und die Vorauswahl: der guenstigste Anreisetag
 *               aus der Lesung der oeffentlichen Route am 25.11.2026. Der Preis selbst kommt
 *               immer live, nie von hier.
 *   rate_flex   Plancode der flexiblen Alternative.
 *   bild        Balkonzimmer oder Hotel.
 * window.amSofortVertrauen: Bewertung mit Stand (ist er aelter als 60 Tage, zeigt die Seite
 * sie nicht mehr) und das Telefon aus dem Kontaktblock von index.html.
 * Pruefung der Daten: tests/sofort-daten.test.mjs.
 */
window.amSofortAngebote = [
  {
    id: 'festtage-2026',
    titel: 'Festtage in Brigels',
    text: 'Drei Nächte im Doppelzimmer mit Balkon zwischen Weihnachten und Neujahr, Frühstücksbuffet Muliniala inklusive. Anreise an jedem Tag.',
    bild: 'assets/images/rooms/dbrb/1.jpg',
    room: 'DBRB',
    rate: 'NONREFBB_IBE',
    naechte: 3,
    anreise_wochentage: [0, 1, 2, 3, 4, 5, 6],
    von: '2026-12-20',
    bis: '2027-01-03',
    gesperrt: [],
    personen: 2,
    kampagne: null,
    anzeigen: ['mulin-festtage'],
    ab_anreise: '2026-12-20',
    rate_flex: 'STANDARDBB_IBE'
  },
  {
    id: 'januar-unter-der-woche',
    titel: 'Drei Winternächte unter der Woche',
    text: 'Am Sonntag oder Montag anreisen, drei Nächte im Doppelzimmer mit Balkon bleiben, Frühstücksbuffet Muliniala inklusive.',
    bild: 'assets/images/rooms/dbrb/1.jpg',
    room: 'DBRB',
    rate: 'NONREFBB_IBE',
    naechte: 3,
    anreise_wochentage: [0, 1],
    von: '2027-01-03',
    bis: '2027-01-28',
    gesperrt: [],
    personen: 2,
    kampagne: null,
    anzeigen: ['mulin-januar'],
    ab_anreise: '2027-01-10',
    rate_flex: 'STANDARDBB_IBE'
  },
  {
    id: 'sportferien-winterwoche',
    titel: 'Winterwoche in den Sportferien',
    text: 'Sieben Nächte im Doppelzimmer mit Balkon, Anreise am Samstag, Frühstücksbuffet Muliniala inklusive.',
    bild: 'assets/images/mulin-winter.jpg',
    room: 'DBRB',
    rate: 'NONREFBB_IBE',
    naechte: 7,
    anreise_wochentage: [6],
    von: '2027-02-06',
    bis: '2027-03-13',
    gesperrt: [],
    personen: 2,
    kampagne: null,
    ab_anreise: '2027-02-13',
    rate_flex: 'STANDARDBB_IBE'
  }
];

window.amSofortVertrauen = {
  bewertung: { wert: '8,6', von: '10', anzahl: 384, quelle: 'Booking.com', stand: '2026-11-25' },
  telefon: { anzeige: '+41 41 562 76 62', tel: '+41415627662' }
};
