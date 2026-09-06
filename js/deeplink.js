/*
 * Deep-Link-Parser der IBE, Kontrakt K1 des Bauplans fbl-ibe (2026-09-06).
 *
 * Reine Funktion ohne Seiteneffekte und ohne site-spezifische Werte: Haus-Codes,
 * Belegungsgrenzen, Sprachen und das Standardhaus kommen ausschliesslich aus `cfg`.
 * Deshalb ist die Datei zwischen Chalet, Mulin und Living austauschbar.
 *
 *   parse(search, cfg) -> { search, preselect, source, campaign, google }
 *   cfg = { today: Date, properties: { <CODE>: <MAX> }, langs: [...], defaultProperty: <CODE>|null }
 *
 * Ein Deep Link zaehlt nur als Suche, wenn Haus UND beide Daten gueltig sind.
 * Quelle, Kampagne und die Google-Preisprobe werden auch ohne Suche geliefert.
 * Stil: ES5 (var, keine Arrow-Functions), wie booking.js.
 */
(function () {
'use strict';

var VERSION = '1';
var MAX_NIGHTS = 30;
var MAX_LEAD_DAYS = 365;
var DEFAULT_ADULTS = 2;
var DAY_MS = 86400000;

var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'];
var UTM_RE = /^[A-Za-z0-9._-]{1,64}$/;
var CURRENCY_RE = /^[A-Z]{3}$/;
var TOTAL_RE = /^\d+(\.\d{1,2})?$/;
var DATE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
var INT_RE = /^-?\d+$/;

function value(params, name) {
  var raw = params.get(name);
  if (raw === null || raw === undefined) return null;
  raw = String(raw).replace(/^\s+|\s+$/g, '');
  return raw === '' ? null : raw;
}

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

// YYYY-M-D mit ein- oder zweistelligem Monat und Tag. Nur echte Kalenderdaten:
// der 30. Februar faellt hier durch, weil Date ihn auf den Maerz verschiebt.
function parseDay(raw) {
  if (!raw) return null;
  var m = DATE_RE.exec(raw);
  if (!m) return null;
  var y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  var probe = new Date(y, mo - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== mo - 1 || probe.getDate() !== d) return null;
  return { y: y, m: mo, d: d };
}

function isoOf(p) { return p.y + '-' + pad2(p.m) + '-' + pad2(p.d); }

// Tagesnummer ueber UTC, damit Sommerzeitwechsel die Naechte nicht verschieben.
function dayNumber(p) { return Date.UTC(p.y, p.m - 1, p.d) / DAY_MS; }

function todayParts(today) {
  var t = (today instanceof Date && !isNaN(today.getTime())) ? today : new Date();
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
}

function intOr(raw, fallback) {
  if (raw === null || !INT_RE.test(raw)) return fallback;
  return parseInt(raw, 10);
}

function clamp(n, lo, hi) {
  if (hi < lo) hi = lo;
  return n < lo ? lo : (n > hi ? hi : n);
}

function resolveProperty(raw, properties, defaultProperty) {
  var codes = Object.keys(properties);
  if (raw === null) {
    for (var d = 0; d < codes.length; d++) {
      if (codes[d] === defaultProperty) return codes[d];
    }
    return null;
  }
  var wanted = raw.toUpperCase();
  for (var i = 0; i < codes.length; i++) {
    if (codes[i].toUpperCase() === wanted) return codes[i];
  }
  return null;
}

// Erste zwei Zeichen, kleingeschrieben. Ein vorhandener, aber nicht unterstuetzter
// Wert faellt auf Englisch, nicht auf die Standardsprache der Seite.
function resolveLang(raw, langs) {
  if (raw === null) return null;
  var code = raw.slice(0, 2).toLowerCase();
  for (var i = 0; i < langs.length; i++) {
    if (String(langs[i]).toLowerCase() === code) return code;
  }
  return 'en';
}

function normalizeCode(raw) { return raw === null ? null : raw.toUpperCase(); }

// Quellableitung, deterministisch in dieser Reihenfolge. Grundlage sind die bereits
// geprueften Kampagnenwerte: ein verworfenes utm_campaign darf keine Quelle setzen.
function deriveSource(gverify, campaign) {
  if (gverify !== null && gverify.toLowerCase() === 'true') return 'google_verify';
  if (!campaign) return null;
  if (campaign.utm_source !== 'google') return null;
  if (!campaign.utm_campaign || campaign.utm_campaign.indexOf('hotel-') !== 0) return null;
  if (campaign.utm_medium === 'organic') return 'google_fbl';
  if (campaign.utm_medium === 'cpc') return 'google_hotel_ads';
  return null;
}

function parse(search, cfg) {
  var conf = cfg || {};
  var properties = conf.properties || {};
  var langs = conf.langs || [];
  var out = { search: null, preselect: null, source: null, campaign: null, google: null };

  var params;
  try { params = new URLSearchParams(String(search === null || search === undefined ? '' : search)); }
  catch (e) { return out; }

  var campaign = null;
  for (var i = 0; i < UTM_KEYS.length; i++) {
    var utm = value(params, UTM_KEYS[i]);
    if (utm !== null && UTM_RE.test(utm)) {
      if (!campaign) campaign = {};
      campaign[UTM_KEYS[i]] = utm;
    }
  }
  out.campaign = campaign;
  out.source = deriveSource(value(params, 'gverify'), campaign);

  var ucur = value(params, 'ucur');
  if (ucur === null || !CURRENCY_RE.test(ucur)) ucur = null;
  var gtotal = value(params, 'gtotal');
  if (gtotal === null || !TOTAL_RE.test(gtotal)) gtotal = null;
  if (ucur !== null || gtotal !== null) out.google = { ucur: ucur, gtotal: gtotal };

  var room = normalizeCode(value(params, 'room'));
  var rate = normalizeCode(value(params, 'rate'));
  if (room !== null || rate !== null) out.preselect = { room: room, rate: rate };

  var property = resolveProperty(value(params, 'property'), properties, conf.defaultProperty || null);
  if (property === null) return out;

  var arrival = parseDay(value(params, 'arrival'));
  var departure = parseDay(value(params, 'departure'));
  if (!arrival || !departure) return out;

  var today = dayNumber(todayParts(conf.today));
  var a = dayNumber(arrival);
  var d2 = dayNumber(departure);
  if (a < today) return out;
  if (a > today + MAX_LEAD_DAYS) return out;
  if (d2 <= a) return out;
  if (d2 - a > MAX_NIGHTS) return out;

  var max = properties[property];
  if (typeof max !== 'number' || !isFinite(max) || max < 1) max = 1;
  var adults = clamp(intOr(value(params, 'adults'), DEFAULT_ADULTS), 1, max);
  var children = clamp(intOr(value(params, 'children'), 0), 0, max - adults);

  out.search = {
    property: property,
    arrival: isoOf(arrival),
    departure: isoOf(departure),
    adults: adults,
    children: children,
    lang: resolveLang(value(params, 'lang'), langs)
  };
  return out;
}

var api = { parse: parse, VERSION: VERSION };

if (typeof module !== 'undefined' && module.exports) { module.exports = api; }

if (typeof window !== 'undefined') {
  window.amDeepLink = api;
  // booking.js kann frueher laufen als diese Datei; das Ereignis holt es nach.
  if (typeof document !== 'undefined' && document.dispatchEvent) {
    try {
      document.dispatchEvent(new CustomEvent('am:deeplink-ready'));
    } catch (e) {
      try {
        var ev = document.createEvent('CustomEvent');
        ev.initCustomEvent('am:deeplink-ready', true, true, null);
        document.dispatchEvent(ev);
      } catch (e2) { /* Deep Link darf die Seite nie brechen */ }
    }
  }
}

})();
