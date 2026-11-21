/*
 * Angebote der Seite /sofortbuchung (Bauplan mulin-sofortbuchung, Verdrahtung Schritt 6).
 * Freigegeben vom Inhaber am 21.11.2026: drei Karten, bestehende Ratenplaene zum Website-Preis
 * (Entscheid K-826 a), Preise immer live aus der Buchungsstrecke, nie hier.
 * Form und Pruefung: Kopfkommentar von js/sofort-kern.js (pruefeAngebote). Wochentage nach
 * Date.getDay (0 Sonntag, 6 Samstag); `bis` ist der spaeteste Abreisetag; `gesperrt` immer
 * eine Liste.
 */
window.amSofortAngebote = [
  {
    id: 'festtage-2026',
    titel: 'Festtage in Brigels',
    text: 'Drei Nächte im Doppelzimmer mit Balkon zwischen Weihnachten und Neujahr, Frühstücksbuffet Muliniala inklusive. Anreise an jedem Tag.',
    bild: 'assets/images/lounge-bar-cheminee.jpg',
    room: 'DBRB',
    rate: 'NONREFBB_IBE',
    naechte: 3,
    anreise_wochentage: [0, 1, 2, 3, 4, 5, 6],
    von: '2026-12-20',
    bis: '2027-01-03',
    gesperrt: [],
    personen: 2,
    kampagne: null
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
    kampagne: null
  },
  {
    id: 'sportferien-winterwoche',
    titel: 'Winterwoche in den Sportferien',
    text: 'Sieben Nächte im Doppelzimmer mit Balkon, Anreise am Samstag, Frühstücksbuffet Muliniala inklusive.',
    bild: 'assets/images/deals/hotel-skipass.jpg',
    room: 'DBRB',
    rate: 'NONREFBB_IBE',
    naechte: 7,
    anreise_wochentage: [6],
    von: '2027-02-06',
    bis: '2027-03-13',
    gesperrt: [],
    personen: 2,
    kampagne: null
  }
];
