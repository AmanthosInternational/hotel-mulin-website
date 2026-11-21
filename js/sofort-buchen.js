/*
 * Buchungsformular der Sofortbuchung, Kontrakt K5 des Bauplans mulin-sofortbuchung
 * (2026-11-18). Rumpf aus Segment 0, Logik aus Segment 10. DOM, ES5.
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
 *   Meta nur ueber amMeta.event, kein Kaufereignis vor der Zahlung.
 *   antwort fuer zahlungsZiel ist der JSON-Body der 201-Antwort (wie data in booking.js).
 *   Erneutes oeffnen im selben Behaelter ersetzt das Formular. Gaestefelder gehen nur
 *   in den Body, nie in Konsole oder Meta-Ereignis.
 * Stil: ES5 (var, keine Arrow-Functions), wie booking.js.
 */
(function () {
'use strict';

if (typeof window === 'undefined') { return; }

// Wie booking.js; tests/dev-server.py schreibt genau diese Zeile auf gleiche Origin um.
var API_BASE = window.HOTELMULIN_API_BASE || 'https://amanthos-website-api.onrender.com';

// Oeffentliche Angaben des Hauses, wie im Kontaktblock von index.html.
var KONTAKT = { telefon: '+41 41 562 76 62', tel: '+41415627662', postfach: 'mulin@amanthos.com' };

var TEXT = {
  titel: 'Ihre Angaben',
  preis: 'Gesamtpreis ',
  preisZusatz: ', inklusive MWST und Kurtaxe',
  zahlung: 'Nach dem Klick geht es weiter zur sicheren Zahlung.',
  knopf: 'Jetzt buchen',
  laeuft: 'Wird gebucht ...',
  weiter: 'Weiter zur Zahlung ...',
  pflicht: 'Bitte füllen Sie Vorname, Nachname und eine gültige E-Mail-Adresse aus.',
  belegt: 'Online ist diese Buchung gerade nicht möglich. Wir helfen Ihnen gerne direkt weiter:',
  ohneZiel: 'Ihre Reservierung ist eingegangen, die Weiterleitung zur Zahlung hat aber nicht geklappt. Bitte melden Sie sich bei uns:',
  fehler: 'Die Buchung hat leider nicht geklappt. Bitte versuchen Sie es erneut oder buchen Sie über unsere Buchungsmaske.',
  maske: 'Zur Buchungsmaske',
  oder: ' oder '
};

var FELDER = [
  { name: 'vorname', label: 'Vorname *', typ: 'text', auto: 'given-name', pflicht: true },
  { name: 'nachname', label: 'Nachname *', typ: 'text', auto: 'family-name', pflicht: true },
  { name: 'email', label: 'E-Mail *', typ: 'email', auto: 'email', pflicht: true },
  { name: 'telefon', label: 'Telefon (freiwillig)', typ: 'tel', auto: 'tel', pflicht: false }
];

// Lande-Adresse, beim Laden gemerkt: daraus kommen bookingSource, campaign, kampagne.
var LANDE_SUCHE = String((window.location && window.location.search) || '');

function el(tag, klasse, text) {
  var e = document.createElement(tag);
  if (klasse) { e.setAttribute('class', klasse); }
  if (text) { e.appendChild(document.createTextNode(text)); }
  return e;
}

function leeren(e) { while (e.firstChild) { e.removeChild(e.firstChild); } }

function verweis(href, text) { var a = el('a', '', text); a.setAttribute('href', href); return a; }

function betrag(x) { return 'CHF ' + (Math.round(Number(x) * 100) / 100).toFixed(2); }

function paar(k, v) { return k + '=' + encodeURIComponent(v); }

// Deep Link in die Buchungsmaske der Startseite mit derselben Auswahl; die UTM-Werte
// der Lande-Adresse reisen mit, damit die Quelle der Buchung erhalten bleibt.
function maskenLink(a) {
  if (!a || !a.anreise || !a.abreise) { return '/#booking'; }
  var teile = [paar('arrival', a.anreise), paar('departure', a.abreise),
    paar('adults', a.erwachsene || 2), paar('children', a.kinder || 0)];
  if (a.angebot && a.angebot.room) { teile.push(paar('room', a.angebot.room)); }
  if (a.angebot && a.angebot.rate) { teile.push(paar('rate', a.angebot.rate)); }
  LANDE_SUCHE.replace(/^\?/, '').split('&').forEach(function (t) {
    if (/^utm_(source|medium|campaign)=/.test(t)) { teile.push(t); }
  });
  return '/?' + teile.join('&') + '#booking';
}

function herkunft() {
  try { if (window.amDeepLink) { return window.amDeepLink.parse(LANDE_SUCHE, { today: new Date() }); } }
  catch (e) { /* ohne Herkunft buchen */ }
  return { search: null, preselect: null, source: null, campaign: null, google: null };
}

// null ohne Einwilligung; buchungsBody laesst den Schluessel dann weg (K5).
function tracking() {
  try { return (window.amMeta && window.amMeta.tracking && window.amMeta.tracking()) || null; }
  catch (e) { return null; }
}

function metaEreignis(name, daten) {
  try { if (window.amMeta && window.amMeta.event) { window.amMeta.event(name, daten); } }
  catch (e) { /* Messung bricht nie die Buchung */ }
}

function melden(hinweis, text, maske, kontakt) {
  leeren(hinweis);
  hinweis.appendChild(document.createTextNode(text));
  if (kontakt) {
    hinweis.appendChild(document.createTextNode(' '));
    hinweis.appendChild(verweis('tel:' + KONTAKT.tel, KONTAKT.telefon));
    hinweis.appendChild(document.createTextNode(TEXT.oder));
    hinweis.appendChild(verweis('mailto:' + KONTAKT.postfach, KONTAKT.postfach));
  }
  if (maske) {
    hinweis.appendChild(document.createTextNode(' '));
    hinweis.appendChild(verweis(maske, TEXT.maske));
  }
  hinweis.hidden = false;
}

function oeffnen(behaelter, auswahl) {
  if (!behaelter) { return; }
  leeren(behaelter);
  var hinweis = el('p', 'sofort-buchen-hinweis');
  hinweis.setAttribute('role', 'alert');
  hinweis.hidden = true;
  var preis;
  try { preis = window.amSofort.gesamt(auswahl.offer, auswahl.erwachsene, auswahl.kinder); }
  catch (e) {
    behaelter.appendChild(hinweis);
    return melden(hinweis, TEXT.fehler, maskenLink(auswahl));
  }

  var form = el('form', 'sofort-buchen');
  form.setAttribute('novalidate', '');
  form.appendChild(el('h3', 'sofort-buchen-titel', TEXT.titel));
  var felder = {};
  FELDER.forEach(function (f) {
    var label = el('label', 'sofort-buchen-feld', f.label);
    var input = document.createElement('input');
    input.setAttribute('type', f.typ);
    input.setAttribute('name', f.name);
    input.setAttribute('autocomplete', f.auto);
    if (f.pflicht) { input.setAttribute('required', ''); }
    label.appendChild(input);
    form.appendChild(label);
    felder[f.name] = input;
  });
  form.appendChild(el('p', 'sofort-buchen-preis', TEXT.preis + betrag(preis.gesamt) + TEXT.preisZusatz));
  form.appendChild(el('p', 'sofort-buchen-zahlung', TEXT.zahlung));
  var knopf = el('button', 'sofort-buchen-knopf', TEXT.knopf);
  knopf.setAttribute('type', 'submit');
  form.appendChild(knopf);
  form.appendChild(hinweis);
  behaelter.appendChild(form);

  // laeuft bleibt nach 201, 409 und 429 gesetzt: die Antwort ist endgueltig, ein
  // zweiter POST legte eine zweite Reservierung an oder scheitert gleich.
  var laeuft = false;

  function fehlschlag() {
    laeuft = false;
    knopf.disabled = false;
    knopf.textContent = TEXT.knopf;
    melden(hinweis, TEXT.fehler, maskenLink(auswahl));
  }

  function antwort(status, daten) {
    if (status === 201) {
      metaEreignis('booking_confirmed', {});
      var ziel = null;
      try { ziel = window.amSofort.zahlungsZiel(daten); } catch (e) { ziel = null; }
      // Guard: navigiert wird nur auf ein Ziel, das der Kern geprueft hat (https,
      // Adyen-Host), nie auf den rohen Link; sonst Kontakt statt Zahlungsschritt.
      if (!ziel) {
        knopf.textContent = TEXT.knopf;
        return melden(hinweis, TEXT.ohneZiel, null, true);
      }
      knopf.textContent = TEXT.weiter;
      window.location.href = ziel;
      return;
    }
    if (status === 409 || status === 429) {
      knopf.textContent = TEXT.knopf;
      return melden(hinweis, TEXT.belegt, null, true);
    }
    fehlschlag();
  }

  function absenden() {
    var gast = {};
    FELDER.forEach(function (f) {
      gast[f.name] = String(felder[f.name].value || '').replace(/^\s+|\s+$/g, '');
    });
    var pruefung = window.amSofort.pruefeGast(gast);
    var fehler = (pruefung && pruefung.fehler) || [];
    FELDER.forEach(function (f) {
      if (fehler.indexOf(f.name) >= 0) { felder[f.name].setAttribute('aria-invalid', 'true'); }
      else { felder[f.name].removeAttribute('aria-invalid'); }
    });
    if (!pruefung || !pruefung.gueltig) { return melden(hinweis, TEXT.pflicht); }

    var body = window.amSofort.buchungsBody(auswahl, gast, herkunft(), tracking());
    laeuft = true;
    knopf.disabled = true;
    knopf.textContent = TEXT.laeuft;
    hinweis.hidden = true;
    metaEreignis('begin_checkout', { total_price: preis.gesamt, currency: 'CHF' });
    fetch(API_BASE + '/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), mode: 'cors' })
      .then(function (res) {
        return res.json().then(function (d) { return [res.status, d]; }, function () { return [res.status, null]; });
      })
      .then(function (r) { antwort(r[0], r[1]); }, fehlschlag);
  }

  form.addEventListener('submit', function (ev) {
    if (ev && ev.preventDefault) { ev.preventDefault(); }
    if (laeuft) { return; }
    try { absenden(); } catch (e) { fehlschlag(); }
  });
}

window.amSofortBuchen = { oeffnen: oeffnen };

})();
