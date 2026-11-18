---
thema: mulin-sofortbuchung
datum: 2026-11-18
status: aktiv
plankey: mulin-sofortbuchung
klasse: FL-3 durchgehend (Zahlungsweg, Apaleo-Writes, Gästedaten, Gästekommunikation, Migration, render.yaml): jeder PR ist Handmerge durch den Inhaber nach vollständiger Lektüre, nie --auto; der Plan-PR selbst ist Doku
auszug: Gate-Auszug des Masters docs/bauplan-mulin-sofortbuchung-2026-11-18.md im Repo amanthos-platform (origin/main 594e3dd); massgeblich ist der Master, dieser Auszug trägt nur, was Edit-Gate, Commit-Gate und plan-abgleich in diesem Repo brauchen
---

# Bauplan: Hotel Mulin Brigels, Sofortbuchung über Meta (Direktbuchung ohne Portal)

**Gate-Auszug.** Dieses Repo ist öffentlich. Übernommen sind nur der Kopf-Hinweis, §0, aus §6 die Kontrakte K1 und K5 mit dem Website-Teil, Segment 0 und die Website-Segmente 2, 5, 6, 10 und 8 sowie die Sammelstellen aus §8; Scope- und Kriterienblöcke sind byte-gleich zum Master. Alles andere steht nur im Master.

> **Vor dem Bau stellt der Inhaber `status:` auf `aktiv`**, in diesem Master und im Gate-Auszug des Website-Repos (kommt mit Segment 0 dorthin). Solange `draft` steht, sind Edit-Gate, Commit-Gate und der PR-Check `plan-abgleich` stumm. Segment-Branches heissen `segment/mulin-sofortbuchung/<nr>-<slug>` im jeweiligen Repo und zweigen von `origin/main` ab; die Segmentnummern sind über beide Repos eindeutig. Jeder Commit dort trägt im Body:
>
> ```
> Plan-Abgleich:
>   erledigt: <Abschnitte>
>   offen: <was aussteht>
>   abweichung: <keine | was anders gebaut wurde und warum>
> ```
>
> Builder: Opus 5.5, xhigh, Aufgaben zu höchstens 30 Minuten, gestaffelt gestartet (30 bis 60 Sekunden Abstand). Sie pushen, öffnen keinen PR, mergen nichts, setzen kein Env, wenden keine Migration an und rufen weder Apaleo noch Meta noch Supabase noch Render auf. Über 400 Produktivzeilen: anhalten und melden, nicht selbst teilen.

## 0. Trennlinie, PII, Read-only (gilt für jedes Segment)

| Claude darf                                                                                      | Nur der Inhaber                                                                          |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Code im Segment-Scope schreiben, offline mit Fakes testen, Branches pushen                       | `status: aktiv`, Merge je PR, jeder Wert in Render                                       |
| Lesen: öffentliche Route `/api/offers`, Aggregate aus den Kauf-Tabellen, Anzeigen-URLs (Stufe 0) | Probebuchung (legt eine echte Reservation an), Freigabe von Mailtext, Formular, Anzeigen |
| Migration schreiben; anwenden nur in der Verdrahtung nach Freigabe                               | Ratenpläne und Restriktionen in Apaleo (über die Revenue-Session)                        |

- **Read-only, solange es geht.** Kein Segment schreibt nach Apaleo, Meta, Supabase oder Render. Der einzige Apaleo-Schreibweg bleibt `_handle_booking`; die neuen Module entscheiden nur, ob er läuft. Am Zahlungsfluss, an Reminder und Storno ändert dieser Plan nichts ausser dem Rückfallbetrag (§5, G2).
- **PII.** Keine Namen, Adressen, Telefonnummern, Reisedaten oder Buchungsnummern in Plan, Commits, Logs, Tests, Fixtures. Fixtures nur `@example.com` (erlaubt `gast@example.com`, verboten jede echte Adresse). Neue Logzeilen nennen höchstens Haus, Modus, Grundcode, Quellwert und `booking_id`. Die neue Tabelle trägt Buchungskennung, Haus und Kampagnenbezeichner, sonst nichts.
- **Jeder neue Guard lässt durch, wenn er selbst abstürzt** (Typname ins Log), und lehnt nur ab, wenn er entschieden hat. Eine Buchung scheitert nie an Messung.
- **Website-Repo ist öffentlich** (am 18.11.2026 per `gh repo view` gelesen: PUBLIC, Required Check `plan-abgleich`, `strict: false`) und wird ganz über GitHub Pages ausgeliefert: im Gate-Auszug und in den Fixtures dort stehen keine kaufmännischen Zahlen, keine Schalterwerte, keine internen Adressen, nichts aus §4, §5, §11.
- Stack: Python stdlib, Vanilla JS im ES5-Stil, kein Framework, keine neue Abhängigkeit, höchstens 500 Zeilen je Datei (`server.py` hat 4358: neue Logik nur in neuen Modulen). Kein Gedankenstrich in Text, Commit, PR, Kommentar.

## 6. Segment 0: Kontrakte (sequenziell, je Repo ein PR, gemergt vor Welle 1)

```bauplan-scope segment=0
# repo: amanthos-platform
website-backend/server.py
website-backend/kampagne_zaun.py
website-backend/buchung_pruefung.py
website-backend/buchung_deckel.py
website-backend/buchung_quelle.py
website-backend/tests/test_buchung_haken.py
supabase/migrations/20261118120000_booking_sources.sql
# repo: hotel-mulin-website
docs/bauplan-mulin-sofortbuchung-2026-11-18.md
js/sofort-kern.js
js/sofort-buchen.js
tests/dev-server.py
tests/fixtures/deeplink-meta-cases.json
tests/fixtures/sofort-angebote.json
tests/fixtures/offers-mubrig-kurtaxe.json
```

**K1 Quelle Meta (beide Repos, erweitert fbl-ibe K1 und K3).** Neue Werte `meta_ads` und `meta_lead`. Regel nach den unveränderten Google-Regeln: `utm_source` klein verglichen in (`meta`, `facebook`, `fb`, `instagram`, `ig`); `utm_medium` klein gleich `lead` ergibt `meta_lead`, sonst `meta_ads`. Kommentar-Token `Source: meta-ads` und `Source: meta-lead`, Kampagnenteil wie bisher; `apaleo_source` bleibt None (Kanal `Direct` nimmt kein Quellfeld). Im Server gilt wie bisher: gültiges `bookingSource` gewinnt, sonst Ableitung aus `tracking` nur mit `consent == 'granted'`. Neuer Parameter `kampagne` (`^[a-z0-9-]{1,32}$`): `parse` liefert den Schlüssel `kampagne` nur, wenn er gültig vorliegt (die 46 gemeinsamen Fälle bleiben damit grün, sha256 der Datei beginnt mit `0b79589904c83bb7`). `VERSION` bleibt `1`. URL-Vorlage für Anzeigen: `https://hotelmulin.ch/?arrival=<JJJJ-MM-TT>&departure=<JJJJ-MM-TT>&adults=2&rate=NONREFBB_IBE&utm_source=meta&utm_medium=paid&utm_campaign=mulin-<angebot>-<jjjjmm>`.

K2 bis K4 (Zähltabelle, Module und Haken, Schalter) betreffen nur amanthos-platform und stehen im Master.

**K5 Seite (Website), Variante b2 (Entscheid K-825 vom 18.11.2026): gebucht wird auf der Seite selbst, ohne Weiterleitung in die Startseite.** Weg des Gastes: Anzeige, `/sofortbuchung`, Anreisetag tippen, drei Felder (Vorname, Nachname, E-Mail; Telefon freiwillig wie in `booking.js`), «Jetzt buchen», Apaleo Pay (Adyen). Die Zahlungsseite bleibt die heutige; sie einzubetten ist nicht Teil des Plans (§12). `sofortbuchung.html` in der Wurzel (Adresse `/sofortbuchung`), nur Deutsch, `noindex` (Vorgabe), eigene CSP wie `index.html`, lädt `consent.js`, `meta.js`, Plausible, `js/deeplink.js`, `js/sofort-kern.js`, `js/sofort-seite.js`, `js/sofort-buchen.js`, `js/sofort-angebote.js`, `css/sofort.css`. Der Buchungsaufruf geht an dieselbe Route `POST /api/bookings` wie die Startseite; damit gelten G1 bis G3, Zahlungslink, Erinnerung, Storno und die Kaufmeldung nach Zahlung unverändert auch hier.

`js/sofort-kern.js` (rein, ES5, `window.amSofort` und `module.exports`): `pruefeAngebote(liste) -> {gueltig, fehler}`; `anreisetage(angebot, heute) -> [JJJJ-MM-TT]`; `abreise(anreise, naechte)`; `sucheQuery(angebot, anreise, naechte, personen)`; `waehleOffer(offers, angebot)` (Zimmer- und Plancode mit oder ohne Präfix, wie K1); `gesamt(offer, erwachsene, kinder) -> {zimmer, kurtaxe, gesamt}` (Kurtaxe wie `getOfferCityTax`); `buchungsBody(auswahl, gast, herkunft, tracking) -> object` mit genau den Schlüsseln des Buchungs-Body von `booking.js` (`propertyId`, `ratePlanId`, `arrival`, `departure`, `adults`, `children`, `totalAmount`, `cityTax`, `upsells` leer, `currency`, `booker {firstName, lastName, email, phone}`, `comment` = `Booked via hotelmulin.ch/sofortbuchung`, optional `bookingSource`, `campaign`, `kampagne`, `tracking`), `herkunft` ist die Rückgabe von `amDeepLink.parse` der Lande-Adresse, `tracking` die Rückgabe von `amMeta.tracking()` (null ohne Einwilligung, dann fehlt der Schlüssel); `pruefeGast(gast) -> {gueltig, fehler}` (Pflichtfelder wie `booking.js`, Mail mit `@` und Punkt); `zahlungsZiel(antwort) -> url | null`: nur `https` und nur die Hosts `eu.adyen.link`, `checkout.adyen.com`, `checkoutshopper-live.adyen.com` (wie `booking.js:2050`), sonst null.

`js/sofort-buchen.js` (DOM, ES5, `window.amSofortBuchen`): `oeffnen(behaelter, auswahl)` zeigt unter der gewählten Karte das Formular mit den drei Feldern und den Endpreis; beim Absenden `pruefeGast`, `amMeta.event('begin_checkout', ...)`, POST mit `buchungsBody`, bei 201 `amMeta.event('booking_confirmed', ...)` und Weiterleitung auf `zahlungsZiel` (immer `window.location`, kein Popup), bei 409 oder 429 Hinweis mit Telefon und Postfach des Hauses, bei Fehler Hinweis und Verweis auf die Buchungsmaske. Segment 0 legt die Datei als Rumpf an (`oeffnen` wirft `NotImplemented`). Angebot in `tests/fixtures/sofort-angebote.json`: `id`, `titel`, `text`, `bild`, `room`, `rate`, `naechte`, `anreise_wochentage`, `von`, `bis`, `gesperrt` (Liste von Zeiträumen), `personen`, `kampagne` oder null.

**Website-Teil:** Gate-Auszug dieses Plans (Kopf, §0, K1, K5, Segmente 0, 2, 5, 6, 8, 10, Sammelstellen; nicht §1 bis §5, K2 bis K4, Segmente 1, 3, 4, 7, 9, §9 bis §13), die drei Fixtures (synthetisch, Form wie die Live-Route, `cityTax.included` false, ein Plan `SOFORT3N_IBE`), Harness-Erweiterung (`/sofortbuchung` ausliefern, API auf gleiche Origin, `?fixture=kurtaxe`, Mock für `POST /api/bookings` mit Antworten 201, 409, 429 und einem Zahlungslink auf `https://eu.adyen.link/...`, der den Body protokolliert), `js/sofort-kern.js` und `js/sofort-buchen.js` als Rümpfe, deren Funktionen `NotImplemented` werfen.

```bauplan-kriterien segment=0
- [ ] Rot zuerst, Verdrahtungstest der Haken (test_buchung_haken.py, server.py über den Pfad geladen wie test_blocked_rate_filter.py, apaleo_api_call als Rekorder): mit allen Schaltern ungesetzt ist der Buchungs-Payload an Apaleo byte-gleich zu origin/main (sha256 von json.dumps mit sort_keys vor und nach, Wert im Commit), die Antwort von /api/offers für das Fixture gleich, die Zahl der apaleo_api_call-Aufrufe gleich
- [ ] kampagne_zaun.schluessel und gueltig echt (test_kampagne_zaun_kontrakt in test_buchung_haken.py): SOFORT3N_IBE und sofortski_ibe ergeben sofort; STANDARDBB_IBE, NONREFBB_IBE, SOFORTIGE_RATE, XSOFORT3N_IBE, leer und None ergeben None; gueltig("sofort") ist "sofort", gueltig("SOFORT"), gueltig(" sofort"), gueltig(""), gueltig(None) und 33 Zeichen ergeben None
- [ ] Sabotage je Haken H1 bis H5: wirft das Modul, endet die Buchung trotzdem mit 201 und /api/offers mit 200 (fünf Tests, Namen und Zahl im Commit); lehnt H2 oder H3 ab (Rumpf im Test ersetzt), gibt es 429 bzw. 409 und keinen POST /booking/v1/bookings
- [ ] git diff -U0 website-backend/server.py: Hunks nur in _handle_offers, _handle_booking, create_payment_link, _track_conversion, der neuen Methode und im Importblock; do_GET und do_POST ohne Diff (Hunk-Liste zitiert); server.py wächst um höchstens 60 Zeilen
- [ ] Migration zweimal gegen lokales Postgres, beide Exit 0, zweiter Lauf wendet nichts an (pg_dump --schema-only identisch); kein Modulname doppelt in backend/, website-backend/, debitoren-dashboard/backend/
- [ ] python3 -m pytest website-backend/tests -q -p no:cacheprovider Exit 0 mit Zahl (Basis 4580 gesammelt), kein bestehender Test geändert; ruff check website-backend Exit 0; mypy-Meldungen nicht mehr als auf origin/main (beide Zahlen)
- [ ] Website: node --test tests/ Exit 0 mit Zahl, die 46 Fälle unverändert (sha256 der Datei zitiert); Gate-Auszug: ~/scripts/bauplan-scope.sh files <auszug> <nr> für 0, 2, 5, 6, 8, 10 und sammelstellen <auszug> Zeile für Zeile wie am Master (diff -u leer); grep im Auszug nach Budget, Zielkosten, Schalternamen, Adressen ohne Treffer; index.html und die Bundles ohne Diff
- [ ] status bleibt draft; Produktivzeilen platform höchstens 400 (git diff --numstat origin/main...HEAD -- website-backend supabase ':(exclude)website-backend/tests'), klasse gesamt=prod
```

Hängt ab von: nichts. Diff geschätzt: platform rund 205 Produktivzeilen (Module 125 inklusive der echten `schluessel` und `gueltig`, `server.py` 55, Migration 25) und rund 220 Testzeilen; Website rund 25 Produktivzeilen, dazu Fixtures und Harness. Zwei Aufgaben je Repo.

## 7. Segmente

Die Segmente 1, 3, 4, 7 und 9 betreffen nur amanthos-platform und stehen im Master.

### Segment 2: Quelle Meta und Kampagne im Deep Link (website)

```bauplan-scope segment=2
# repo: hotel-mulin-website
js/deeplink.js
tests/deeplink.test.mjs
tests/deeplink-meta.test.mjs
```

- **Auftrag:** `deriveSource` und der Parameter `kampagne` nach K1. Der Dateikopf sagt, dass die Datei ab jetzt von Chalet Swiss und Living abweicht (§12). `booking.js` bleibt unberührt: es sendet `deepLink.source` und `deepLink.campaign` schon allgemein (`booking.js:1695`).

```bauplan-kriterien segment=2
- [ ] node --test tests/ Exit 0 mit Zahl; die 46 Fälle aus deeplink-cases.json unverändert grün, Datei ohne Diff (sha256 zitiert); jeder Fall aus deeplink-meta-cases.json läuft durch parse()
- [ ] utm_source=meta, facebook, fb, instagram, ig, FB ergeben meta_ads; mit utm_medium=lead meta_lead; utm_source=newsletter ergibt null; ein Google-Klick bleibt google_fbl bzw. google_hotel_ads; gverify=true bleibt google_verify
- [ ] kampagne=sofort erscheint als Schlüssel kampagne; kampagne=So fort!, 33 Zeichen oder leer: der Schlüssel fehlt; ohne den Parameter trägt die Rückgabe genau die fünf bisherigen Schlüssel
- [ ] Harness: http://localhost:8080/?arrival=<heute+30>&departure=<heute+33>&adults=2&rate=NONREFBB_IBE&utm_source=meta&utm_medium=paid&utm_campaign=mulin-test zeigt ohne Klick die Angebote; der vom Mock protokollierte Buchungs-Body trägt bookingSource "meta_ads" und campaign {meta, paid, mulin-test}; ohne Einwilligung fehlt tracking wie bisher
- [ ] ES5-Stil (kein let, const, Arrow); index.html, js/booking.js, js/booking.min.js ohne Diff; Produktivzeilen höchstens 40
```

- **Out-of-Scope:** `index.html` (Cache-Bust in der Verdrahtung), `js/meta.js`, `js/booking.js`, die gemeinsame Fixture. **Testplan:** `node --test tests/`; `python3 tests/dev-server.py` und die Kriterien-URL. **Hängt ab von:** Segment 0. **Blockiert durch:** keinen Entscheid. Diff geschätzt: rund 22 Produktivzeilen.

### Segment 5: Kern der Sofortseite (website)

```bauplan-scope segment=5
# repo: hotel-mulin-website
js/sofort-kern.js
tests/sofort-kern.test.mjs
```

- **Auftrag:** die Funktionen aus K5, rein, ohne DOM und ohne Netz.

```bauplan-kriterien segment=5
- [ ] node --test tests/ Exit 0 mit Zahl; jede Funktion aus K5 mit mindestens drei Fällen
- [ ] anreisetage: nur Tage im Fenster, nur erlaubte Wochentage, nie vor heute, nie in gesperrt, Abreise nie nach bis; ein Angebot mit abgelaufenem Fenster liefert eine leere Liste
- [ ] gesamt: Zimmer 472.80 und Kurtaxe 19.20 für zwei Erwachsene ergeben 492.00; mit einem Kind wird die Kurtaxe wie in booking.js skaliert; included true ergibt Kurtaxe 0
- [ ] Rot zuerst, Guard: test_buchungsbody_traegt_genau_die_schluessel_von_booking_js (Schlüsselmenge gepinnt gegen den Body, den booking.js im Harness an den Mock sendet; kein Schlüssel aus der Lande-Adresse ausser bookingSource, campaign, kampagne aus parse; ohne Einwilligung kein tracking; upsells leer)
- [ ] Rot zuerst, Guard: test_zahlungsziel_nur_adyen_https (http, fremder Host, Host mit Adyen als Teilstring, leere Antwort ergeben null; die drei erlaubten Hosts ergeben die URL)
- [ ] pruefeGast: fehlender Vorname, Nachname oder Mail und eine Mail ohne @ oder Punkt sind ungültig; Telefon darf fehlen
- [ ] pruefeAngebote verwirft ein Angebot ohne room und rate, mit naechte unter 1 oder über 30, mit von nach bis; die Seite bekommt nur gültige
- [ ] ES5-Stil; Produktivzeilen höchstens 220; kein Diff ausserhalb des Blocks
```

- **Out-of-Scope:** DOM, Texte, Angebotsdaten. **Hängt ab von:** Segment 0. **Blockiert durch:** nichts mehr (K-825 b2). Diff geschätzt: rund 210 Produktivzeilen.

### Segment 6: Seite Sofortbuchung (website)

```bauplan-scope segment=6
# repo: hotel-mulin-website
sofortbuchung.html
js/sofort-seite.js
css/sofort.css
tests/sofort-seite.test.mjs
tests/fixtures/sofort-kern-double.js
tests/fixtures/sofort-buchen-double.js
```

- **Auftrag:** Seite nach K5. Gebaut und bewiesen wird gegen ein Test-Double des Kerns im eigenen Scope (`tests/fixtures/sofort-kern-double.js`, gleiche Signaturen wie K5, feste Rückgaben aus den Fixtures; der Harness lädt es mit `?kern=double` statt `js/sofort-kern.js`), nie gegen Segment 5. Den echten Kern prüft der Kombinationslauf der Verdrahtung (§9, Schritt 6). Je Angebot eine Karte: Anreisetag wählen, Angebot über `/api/offers` lesen, «CHF x gesamt für n Nächte, zwei Personen, inklusive Frühstück, MWST und Kurtaxe», danach `amSofortBuchen.oeffnen(behaelter, auswahl)` (Segment 10; hier gegen `tests/fixtures/sofort-buchen-double.js`). Ausgebucht: andere Daten anbieten. Route nicht erreichbar oder keine gültigen Angebote: Verweis auf die Buchungsmaske. Plausible-Ereignisse `sofort_ansicht`, `sofort_datum` mit den Merkmalen `angebot` und `step`, sonst nichts; Meta über `amMeta.event('select_offer', ...)` (ViewContent) nach der Datumswahl, nie `fbq` direkt. Bilder nur vorhandene Hausfotos, unverändert.

```bauplan-kriterien segment=6
- [ ] Harness http://localhost:8080/sofortbuchung?kern=double mit dem Fixture: je gültigem Angebot eine Karte; nach der Datumswahl steht genau der Betrag sichtbar, den gesamt() des Doubles liefert (492.00, evaluate_script zitiert), die Seite rechnet selbst nichts; nach der Datumswahl ruft die Seite genau einmal oeffnen() des Buchungs-Doubles mit der Auswahl (Angebot, Offer, Anreise, Abreise, Personen; Aufruf zitiert)
- [ ] ?fixture=empty: Hinweis ausgebucht, kein Preis, kein Fehler in der Konsole; leere Angebotsdatei: Verweis auf die Buchungsmaske, keine Karte
- [ ] Mit dem Buchungs-Double enthält document.querySelectorAll('input, textarea, select[name]') kein Feld für Personendaten (die Felder gehören Segment 10); meta[name=robots] ist noindex; die CSP nennt keine Quelle, die index.html nicht nennt; bei 360 Pixel Breite ist scrollWidth nicht grösser als clientWidth
- [ ] window.plausible wird je Ereignis mit genau den Merkmalen angebot und step gerufen (Stub im Harness, Aufrufe zitiert); kein Aufruf von fbq ausserhalb von meta.js
- [ ] index.html, sitemap.xml, locales/, js/booking.js, die Bundles ohne Diff; Produktivzeilen höchstens 400 (html, js, css zusammen), sonst anhalten
```

- **Out-of-Scope:** das Buchungsformular (Segment 10), `js/sofort-angebote.js` (Verdrahtung, nach E2), Verlinkung von der Startseite, Englisch, Sitemap. **Testplan:** `node --test tests/`, Harness im Chrome-Pool. **Hängt ab von:** Segment 0 (baut gegen die eigenen Doubles, läuft gleichzeitig mit 5 und 10, wartet auf keines). **Blockiert durch:** nichts mehr (K-825 b2). Diff geschätzt: rund 340 Produktivzeilen (HTML 140, JS 110, CSS 90; die Doubles zählen als Test); das engste Segment.

### Segment 10: Buchungsformular der Sofortseite (website)

```bauplan-scope segment=10
# repo: hotel-mulin-website
js/sofort-buchen.js
tests/sofort-buchen.test.mjs
```

- **Auftrag:** `amSofortBuchen.oeffnen` nach K5: Formular mit drei Pflichtfeldern und freiwilligem Telefon, Endpreis aus `gesamt()`, Absenden mit `buchungsBody`, Weiterleitung über `zahlungsZiel`, Fehlerhinweise. Gebaut gegen den Kern aus Segment 0 (Rumpf); im Test über ein Double des Kerns im Testcode, den echten Kern prüft die Verdrahtung (§9, Schritt 6). Meta-Ereignisse nur über `amMeta.event`: `begin_checkout` (InitiateCheckout, Wert gleich Endpreis) beim Absenden, `booking_confirmed` (BookingCreated, ohne Betrag) nach 201. Kein Purchase im Browser vor der Zahlung (Kontrakt K1 und K7 aus kauf-nach-zahlung).

```bauplan-kriterien segment=10
- [ ] Harness /sofortbuchung mit Mock: drei Felder ausfüllen, Absenden; der Mock protokolliert genau einen POST /api/bookings, dessen Body gleich buchungsBody() des Kern-Doubles ist (Body zitiert, Gästefelder mit gast@example.com); bei 201 wechselt window.location auf die Adyen-URL des Mocks
- [ ] Rot zuerst, Guard: test_keine_weiterleitung_auf_fremdes_ziel (Mock antwortet mit http oder fremdem Host: keine Navigation, Hinweis mit Telefon und Postfach)
- [ ] Doppelklick auf Absenden sendet genau einen POST (Knopf gesperrt bis zur Antwort); 409 und 429 zeigen den Hinweis mit Telefon und Postfach, kein Zahlungsschritt
- [ ] amMeta.event wird genau mit begin_checkout (Wert gleich Endpreis) und nach 201 mit booking_confirmed gerufen (Stub, Aufrufe zitiert); kein payment_completed, kein fbq direkt; ohne Einwilligung fehlt tracking im Body
- [ ] ES5-Stil; Produktivzeilen höchstens 220; index.html, js/booking.js, Bundles ohne Diff; kein Diff ausserhalb des Blocks
```

- **Out-of-Scope:** Zahlungsseite, Rückkehr nach der Zahlung (M14), Upsells, Promo. **Testplan:** `node --test tests/`, Harness im Chrome-Pool. **Hängt ab von:** Segment 0. **Blockiert durch:** nichts. Diff geschätzt: rund 160 Produktivzeilen. PII-Klausel §0: im Test nur `@example.com`, keine Gästefelder in Logs oder Konsole.

### Segment 8: `booking.js`: Kampagne durchreichen, Kurtaxe richtig beschreiben (website)

```bauplan-scope segment=8
# repo: hotel-mulin-website
js/booking.js
tests/booking-kurtaxe.test.mjs
```

- **Auftrag:** (a) nach M5: die vier veralteten Stellen berichtigen, in der Microdata genau eine `priceComponent` (City tax, `GenericTax`), wenn die Kurtaxe getrennt ausgewiesen ist; zeigt M5 einen Anzeigefehler, kommt dessen Korrektur hierher und der Builder hält vorher an. (b) nur mit E2 Weg 2: `deepLink.kampagne` an `/api/offers` und in den Buchungs-Body reichen. Das Bundle baut die Verdrahtung.

```bauplan-kriterien segment=8
- [ ] Harness mit ?fixture=kurtaxe: jede Karte zeigt Zimmer, «+ CHF 19.20 Kurtaxe» und Gesamt 492.00; meta[itemprop=price] ist 492.00 und es gibt genau eine priceComponent mit priceComponentType GenericTax und 19.20; mit included true keine priceComponent
- [ ] Zusammenfassung vor den Gästeangaben und der an den Mock gesendete Body: totalAmount 472.80, cityTax 19.20 wie vor dem Segment (Body zitiert, ohne Gästefelder)
- [ ] Nur Weg 2: mit &kampagne=sofort trägt der Aufruf von /api/offers und der Buchungs-Body kampagne "sofort"; ohne den Parameter sind beide Aufrufe byte-gleich zu vorher
- [ ] plausibleEvent, ga4Event, adsEvent ohne Diff (Hunk-Liste zitiert); js/booking.min.js und index.html ohne Diff; Produktivzeilen höchstens 60
```

- **Out-of-Scope:** Bundle, Cache-Bust, Zahlungsweg, Promo. **Hängt ab von:** Segment 0 und 2. **Blockiert durch:** M5 (Teil a), E2 (Teil b). Diff geschätzt: rund 40 Produktivzeilen.

## 8. Sammelstellen (nur Segment 0 und die Verdrahtung fassen sie an)

```bauplan-scope sammelstellen
# repo: amanthos-platform
website-backend/server.py
render.yaml
.env.example
DOKUMENTATION.md
requirements.txt
requirements-dev.txt
website-backend/requirements.txt
pyproject.toml
supabase/migrations/*
.github/workflows/*
website-backend/payment_conversion_store.py
website-backend/lead_kontrakt.py
website-backend/lead_objekt.py
website-backend/lead_meta_anfrage.py
website-backend/lead_antwort.py
website-backend/lead_antwort_texte.py
website-backend/lead_fakten.py
website-backend/mail_absender.py
website-backend/grenchen_autoantwort.py
website-backend/grenchen_leads.py
website-backend/meta_leads_routen.py
website-backend/run_meta_leads.py
website-backend/run_lead_nachfass.py
website-backend/klick_weiterleitung.py
# repo: hotel-mulin-website
index.html
sitemap.xml
locales/*
js/booking.min.js
js/app.min.js
js/i18n.min.js
js/sofort-angebote.js
js/meta.js
js/consent.js
css/style.css
css/style.min.css
datenschutz.html
llms.txt
```
