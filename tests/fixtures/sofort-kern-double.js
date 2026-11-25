/*
 * Test-Double des Kerns (Kontrakt K5, Kopf von js/sofort-kern.js) fuer die Seite
 * Sofortbuchung, Segment 6 des Bauplans mulin-sofortbuchung. Kein Produktivcode:
 * der Harness liefert diese Datei mit ?kern=double statt js/sofort-kern.js, und
 * tests/sofort-seite.test.mjs laedt sie direkt. Gleiche Funktionen und Parameter wie
 * der Kontrakt, feste Rueckgaben passend zu tests/fixtures/sofort-angebote.json und
 * tests/fixtures/offers-mubrig-kurtaxe.json. Den echten Kern prueft die Verdrahtung.
 * K6 (Segment 11): die fuenf neuen Funktionen mit denselben Namen und Parameterzahlen,
 * feste Rueckgaben aus den Datenfeldern; ohne die neuen Felder null wie am 21.11.2026.
 *
 * Jeder Aufruf landet als [name, argumente] in window.__kernCalls; buchungsBody und
 * pruefeGast nur mit dem Namen, damit nie ein Gaestefeld im Protokoll steht.
 * Stil: ES5 (var, keine Arrow-Functions), wie js/sofort-kern.js.
 */
(function () {
'use strict';

// Anreisetage je Angebot aus der Fixture, von Hand nach dem Kontrakt bestimmt
// (Wochentage, Fenster von bis, gesperrt, Abreise nie nach bis).
var TAGE = {
  'test-drei-naechte': ['2027-02-07', '2027-02-08', '2027-02-14', '2027-02-15', '2027-02-21',
    '2027-02-22', '2027-02-28', '2027-03-01'],
  'test-kampagne-sofort': ['2027-02-14', '2027-02-15', '2027-02-16', '2027-02-17', '2027-02-18',
    '2027-02-24', '2027-02-25', '2027-02-28', '2027-03-01']
};
// Feste Betraege je Plan. NONREF: Zimmer 472.80 plus Kurtaxe 19.20 ergibt 492.00.
// Die Seite muss genau diesen Wert zeigen, auch wenn das Offer etwas anderes traegt.
var SUMMEN = {
  NONREFBB_IBE: { zimmer: 472.8, kurtaxe: 19.2, gesamt: 492 },
  SOFORT3N_IBE: { zimmer: 450, kurtaxe: 19.2, gesamt: 469.2 }
};
var HOSTS = ['eu.adyen.link', 'checkout.adyen.com', 'checkoutshopper-live.adyen.com'];
var calls = [];

function notiere(name, args) {
  if (!args) { calls.push([name]); return; }
  try { calls.push([name, JSON.parse(JSON.stringify(Array.prototype.slice.call(args)))]); }
  catch (e) { calls.push([name]); }
}

// Ohne Protokoll, damit innere Aufrufe nicht als Aufruf der Seite erscheinen.
function bisDatum(anreise, naechte) {
  var t = String(anreise).split('-');
  return new Date(Date.UTC(+t[0], t[1] - 1, +t[2] + Number(naechte))).toISOString().slice(0, 10);
}

function summe(offer) {
  var s = SUMMEN[offer && offer.ratePlanCode];
  return s ? { zimmer: s.zimmer, kurtaxe: s.kurtaxe, gesamt: s.gesamt } : null;
}

function endetMit(wert, code) {
  var s = String(wert || '');
  return s === code || s.slice(-code.length - 1) === '-' + code;
}

var api = {
  pruefeAngebote: function (liste) {
    notiere('pruefeAngebote', arguments);
    var gueltig = [];
    var fehler = [];
    var l = Object.prototype.toString.call(liste) === '[object Array]' ? liste : [];
    for (var i = 0; i < l.length; i++) {
      var a = l[i] || {};
      if (!a.room || !a.rate) { fehler.push({ id: a.id, grund: 'room_rate' }); }
      else if (!(a.naechte >= 1 && a.naechte <= 30)) { fehler.push({ id: a.id, grund: 'naechte' }); }
      else if (!(a.von <= a.bis)) { fehler.push({ id: a.id, grund: 'fenster' }); }
      else { gueltig.push(a); }
    }
    return { gueltig: gueltig, fehler: fehler };
  },
  anreisetage: function (angebot, heute) {
    notiere('anreisetage', arguments);
    return (TAGE[angebot && angebot.id] || []).slice();
  },
  abreise: function (anreise, naechte) {
    notiere('abreise', arguments);
    return bisDatum(anreise, naechte);
  },
  sucheQuery: function (angebot, anreise, naechte, personen) {
    notiere('sucheQuery', arguments);
    var q = '?propertyId=MUBRIG&arrival=' + encodeURIComponent(anreise) +
      '&departure=' + encodeURIComponent(bisDatum(anreise, naechte)) +
      '&adults=' + encodeURIComponent(personen) + '&children=0';
    if (angebot && angebot.kampagne) { q += '&kampagne=' + encodeURIComponent(angebot.kampagne); }
    return q;
  },
  waehleOffer: function (offers, angebot) {
    notiere('waehleOffer', arguments);
    var l = offers || [];
    for (var i = 0; i < l.length; i++) {
      var plan = l[i].ratePlanCode || l[i].ratePlanId;
      var passt = plan === angebot.rate || String(l[i].ratePlanId || '').indexOf('-' + angebot.rate + '-') > 0;
      if (passt && endetMit(l[i].unitGroupId, angebot.room)) { return l[i]; }
    }
    return null;
  },
  gesamt: function (offer, erwachsene, kinder) {
    notiere('gesamt', arguments);
    return summe(offer);
  },
  buchungsBody: function (auswahl, gast, herkunft, tracking) {
    notiere('buchungsBody');
    var s = summe(auswahl.offer) || {};
    var g = gast || {};
    var body = {
      propertyId: 'MUBRIG', ratePlanId: auswahl.offer.ratePlanId, arrival: auswahl.anreise,
      departure: auswahl.abreise, adults: auswahl.erwachsene, children: auswahl.kinder,
      totalAmount: s.zimmer, cityTax: s.kurtaxe, upsells: [], currency: 'CHF',
      booker: { firstName: g.vorname, lastName: g.nachname, email: g.email, phone: g.telefon || '' },
      comment: 'Booked via hotelmulin.ch/sofortbuchung'
    };
    if (herkunft && herkunft.source) { body.bookingSource = herkunft.source; }
    if (herkunft && herkunft.campaign) { body.campaign = herkunft.campaign; }
    if (herkunft && herkunft.kampagne) { body.kampagne = herkunft.kampagne; }
    if (tracking) { body.tracking = tracking; }
    return body;
  },
  pruefeGast: function (gast) {
    notiere('pruefeGast');
    var g = gast || {};
    var fehler = [];
    ['vorname', 'nachname', 'email'].forEach(function (k) {
      if (!String(g[k] || '').trim()) { fehler.push(k); }
    });
    var mail = String(g.email || '');
    if (mail && (mail.indexOf('@') < 1 || mail.indexOf('.') < 0)) { fehler.push('email'); }
    return { gueltig: fehler.length === 0, fehler: fehler };
  },
  zahlungsZiel: function (antwort) {
    notiere('zahlungsZiel', arguments);
    try {
      var u = new URL(antwort.paymentLink);
      return u.protocol === 'https:' && HOSTS.indexOf(u.hostname) >= 0 ? u.href : null;
    } catch (e) { return null; }
  },
  passendesAngebot: function (angebote, utmCampaign) {
    notiere('passendesAngebot', arguments);
    var w = String(utmCampaign || '').toLowerCase();
    var l = angebote || [];
    for (var i = 0; i < l.length; i++) {
      var p = (l[i] && l[i].anzeigen) || [];
      for (var j = 0; j < p.length; j++) { if (w && w.indexOf(p[j]) === 0) { return l[i].id; } }
    }
    return null;
  },
  abTag: function (angebot, heute) {
    notiere('abTag', arguments);
    var t = angebot && angebot.ab_anreise;
    return t && (TAGE[angebot.id] || []).indexOf(t) >= 0 ? t : null;
  },
  storno: function (offer, jetzt) {
    notiere('storno', arguments);
    var f = offer && offer.cancellationFee;
    var d = String((f && f.dueDateTime) || '');
    if (offer && offer.category === 'Refundable' && d.length >= 16) {
      return { art: 'flexibel', frist: d.slice(0, 10), zeit: d.slice(11, 16) };
    }
    return { art: 'nicht_erstattbar', frist: null, zeit: null };
  },
  flexOffer: function (offers, angebot, jetzt) {
    notiere('flexOffer', arguments);
    var l = offers || [];
    for (var i = 0; angebot && angebot.rate_flex && i < l.length; i++) {
      if (l[i].ratePlanCode === angebot.rate_flex) { return l[i]; }
    }
    return null;
  },
  vertrauen: function (daten, heute) {
    notiere('vertrauen', arguments);
    return { bewertung: (daten && daten.bewertung) || null, telefon: (daten && daten.telefon) || null };
  }
};

if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
if (typeof window !== 'undefined') { window.amSofort = api; window.__kernCalls = calls; }

})();
