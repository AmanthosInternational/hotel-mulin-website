// Segment 8 Teil a des Bauplans mulin-sofortbuchung (2026-11-18): Microdata der
// Angebotskarte nach fbl-ibe K2. price ist der sichtbare Bruttobetrag (Zimmer plus
// Kurtaxe), und genau eine priceComponent (City tax, GenericTax) steht nur dann,
// wenn die Route die Kurtaxe getrennt ausweist (cityTax.included false).
// Ohne Browser: die reinen Funktionen werden aus js/booking.js geschnitten und in
// einem vm-Kontext mit searchParams ausgefuehrt; die Datei selbst bleibt unveraendert.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, '..', 'js', 'booking.js'), 'utf8');
const KURTAXE = JSON.parse(readFileSync(join(here, 'fixtures', 'offers-mubrig-kurtaxe.json'), 'utf8'));
const INKLUSIVE = JSON.parse(readFileSync(join(here, 'fixtures', 'offers-mubrig.json'), 'utf8'));
const FUNKTIONEN = ['roundCHF', 'getOfferCityTax', 'getOfferGross', 'offerPriceMicrodata'];

// Schneidet eine Funktionsdeklaration auf oberster Ebene der IIFE aus dem Quelltext.
// Klammern in Zeichenketten zaehlen nicht mit.
function schneide(name) {
  const start = SRC.indexOf('\nfunction ' + name + '(');
  assert.ok(start >= 0, 'function ' + name + ' fehlt in js/booking.js');
  let i = SRC.indexOf('{', start);
  let tiefe = 0;
  let quote = null;
  for (; i < SRC.length; i++) {
    const ch = SRC[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') quote = ch;
    else if (ch === '{') tiefe++;
    else if (ch === '}' && --tiefe === 0) return SRC.slice(start + 1, i + 1);
  }
  throw new Error('Ende von ' + name + ' nicht gefunden');
}

function kontext(adults, children) {
  const ctx = {
    searchParams: { adults: String(adults), children: String(children) },
    escapeHtml: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
  };
  vm.createContext(ctx);
  vm.runInContext(FUNKTIONEN.map(schneide).join('\n'), ctx);
  return ctx;
}

function metas(html) {
  const out = {};
  const re = /<meta itemprop="([^"]+)" content="([^"]*)">/g;
  let m;
  while ((m = re.exec(html))) (out[m[1]] = out[m[1]] || []).push(m[2]);
  return out;
}

// Zerlegt den Preisknoten in den aeusseren Teil und die Komponenten.
function zerlege(html) {
  const teile = html.split('<div itemprop="priceComponent"');
  return {
    aussen: metas(teile[0]),
    komponenten: teile.slice(1).map((t) => ({
      itemtype: (t.match(/itemtype="([^"]+)"/) || [])[1],
      metas: metas(t),
    })),
  };
}

function angebot(daten, plan) {
  const o = daten.offers.find((x) => x.ratePlanId.indexOf(plan) >= 0);
  assert.ok(o, 'Angebot ' + plan + ' fehlt im Fixture');
  return o;
}

test('Fixture kurtaxe: drei Angebote, Kurtaxe 19.20 getrennt ausgewiesen', () => {
  assert.equal(KURTAXE.offers.length, 3);
  for (const o of KURTAXE.offers) {
    assert.equal(o.cityTax.amount, 19.2);
    assert.equal(o.cityTax.included, false);
  }
});

test('priceComponent: genau eine City tax GenericTax 19.20 je Karte, price bleibt brutto (Fixture kurtaxe)', () => {
  const ctx = kontext(2, 0);
  const erwartet = { NONREFBB_IBE: '492.00', STANDARDBB_IBE: '544.20', SOFORT3N_IBE: '469.20' };
  for (const plan of Object.keys(erwartet)) {
    const html = ctx.offerPriceMicrodata(angebot(KURTAXE, plan));
    const p = zerlege(html);
    assert.deepEqual(p.aussen.price, [erwartet[plan]], plan + ': price aussen');
    assert.deepEqual(p.aussen.priceCurrency, ['CHF'], plan + ': priceCurrency aussen');
    assert.equal(p.komponenten.length, 1, plan + ': genau eine priceComponent');
    const k = p.komponenten[0];
    assert.equal(k.itemtype, 'https://schema.org/UnitPriceSpecification', plan);
    assert.deepEqual(k.metas, {
      name: ['City tax'],
      priceComponentType: ['GenericTax'],
      price: ['19.20'],
      priceCurrency: ['CHF'],
    }, plan + ': Komponente');
  }
});

test('priceComponent: mit einem Kind skaliert die Kurtaxe wie die Karte (2 Erwachsene, 1 Kind)', () => {
  const ctx = kontext(2, 1);
  const p = zerlege(ctx.offerPriceMicrodata(angebot(KURTAXE, 'NONREFBB_IBE')));
  assert.deepEqual(p.aussen.price, ['501.60']);
  assert.equal(p.komponenten.length, 1);
  assert.deepEqual(p.komponenten[0].metas.price, ['28.80']);
});

test('keine priceComponent mit included true; price ist der Zimmerpreis (Fixture offers-mubrig.json)', () => {
  const ctx = kontext(2, 0);
  const erwartet = ['289.00', '324.50', '468.00'];
  INKLUSIVE.offers.forEach((o, i) => {
    assert.equal(o.cityTax.included, true);
    const html = ctx.offerPriceMicrodata(o);
    assert.equal(html.indexOf('priceComponent'), -1, o.ratePlanId + ': keine Komponente');
    assert.deepEqual(metas(html).price, [erwartet[i]], o.ratePlanId);
  });
});

test('keine priceComponent ohne Kurtaxe oder mit Betrag 0; ohne Zimmerpreis kein Preisknoten', () => {
  const ctx = kontext(2, 0);
  const basis = angebot(KURTAXE, 'NONREFBB_IBE');
  const ohne = Object.assign({}, basis, { cityTax: undefined });
  const null0 = Object.assign({}, basis, { cityTax: { amount: 0, currency: 'CHF', included: false } });
  for (const o of [ohne, null0]) {
    const html = ctx.offerPriceMicrodata(o);
    assert.equal(html.indexOf('priceComponent'), -1);
    assert.deepEqual(metas(html).price, ['472.80']);
  }
  assert.equal(ctx.offerPriceMicrodata(Object.assign({}, basis, { totalGrossAmount: null })), '');
});
