#!/usr/bin/env python3
"""Test-Harness der Site (Kontrakt K7 des Bauplans fbl-ibe). Kein Produktivcode.
Serviert das Repo und schreibt NUR im Speicher um, nie auf der Platte: index.html
mit js/booking.js statt js/booking.min.js und dem Script-Tag von deeplink.js davor,
i18n.js statt i18n.min.js, ohne externe Skripte, mit gtag-Stub (window.__gtagCalls)
und API-Host auf gleiche Origin. js/local-api.js kommt leer, sonst zoege der
localhost-Override auf Port 3002. GET /api/offers aus tests/fixtures/offers-mubrig.json,
mit ?fixture=empty leer; POST /api/bookings antwortet synthetisch und protokolliert den
Body ohne die Gaestefelder.  Aufruf: python3 tests/dev-server.py [port]

Erweiterung aus Segment 0 des Bauplans mulin-sofortbuchung (K5), ebenfalls nur im Speicher:
- GET /sofortbuchung und /sofortbuchung.html liefern sofortbuchung.html mit denselben
  Umschreibungen wie index.html (externe Skripte raus, jedes js/<name>.min.js durch
  js/<name>.js, gtag-Stub), dazu ein Plausible-Stub (jeder Aufruf von window.plausible
  landet in window.__plausibleCalls) und ein Meta-Recorder (jeder Aufruf von
  amMeta.event landet als [name, data, opts] in window.__metaEvents und geht danach an
  das echte amMeta.event; meta.js selbst bleibt unveraendert). Fehlt die Datei: 404.
- js/booking.js und jedes js/sofort-*.js: API_BASE auf gleiche Origin, falls vorhanden.
- Modi, gesetzt beim Seitenaufruf von / oder /sofortbuchung aus der Query, sonst Standard
  (Modus am Seitenaufruf, damit ein Test den naechsten nicht faerbt):
    fixture=empty     GET /api/offers ohne Angebote
    fixture=kurtaxe   GET /api/offers aus tests/fixtures/offers-mubrig-kurtaxe.json
    antwort=<modus>   Antwort von POST /api/bookings, Modi in ANTWORTEN; ohne Angabe
                      gilt auf / 'standard' (die Antwort von bisher), auf /sofortbuchung '201'
    kern=double       js/sofort-kern.js kommt aus tests/fixtures/sofort-kern-double.js
    buchen=double     js/sofort-buchen.js kommt aus tests/fixtures/sofort-buchen-double.js
    angebote=fixture  js/sofort-angebote.js ist 'window.amSofortAngebote = <Inhalt von
                      tests/fixtures/sofort-angebote.json>;'
    angebote=leer     js/sofort-angebote.js ist 'window.amSofortAngebote = [];'
  Fehlt ein Double, antwortet die Skript-Adresse mit 404; ohne angebote kommt die echte
  js/sofort-angebote.js (Sammelstelle der Verdrahtung) oder 404. angebote gilt auch direkt
  an der Skript-Adresse (/js/sofort-angebote.js?angebote=leer).
- Steuerung aus dem Browser oder per curl:
    GET /__mock                  Zustand (Modi, Zahl der protokollierten Buchungen)
    GET /__mock?antwort=409      setzt die Antwort bis zum naechsten Seitenaufruf
                                 (booking=409 gilt gleich)
    GET /__mock?reset=1          leert das Protokoll
    GET /__mock/log              {count, bookings: [{nr, antwort, status, body}]}; im
                                 Body behaelt booker seine Schluessel, jeder nicht leere
                                 Wert ist '<redacted>'
"""
import datetime
import json
import re
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parent.parent
FIXTURE = ROOT / "tests" / "fixtures" / "offers-mubrig.json"
FIXTURE_KURTAXE = ROOT / "tests" / "fixtures" / "offers-mubrig-kurtaxe.json"
FIXTURE_ANGEBOTE = ROOT / "tests" / "fixtures" / "sofort-angebote.json"
SOFORT_HTML = ROOT / "sofortbuchung.html"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
STATE = {"fixture": "full", "antwort": "standard", "kern": "", "buchen": "", "angebote": ""}
LOG = []
LOCK = threading.Lock()

STUB = """<script>
  window.dataLayer = window.dataLayer || [];
  window.__gtagCalls = [];
  window.gtag = function () { window.__gtagCalls.push(Array.prototype.slice.call(arguments)); };
</script>
</head>"""

# Nur fuer /sofortbuchung. Der Meta-Recorder haengt sich ueber einen Setter an
# window.amMeta, damit die Reihenfolge der Skripte (meta.js laedt mit defer) egal ist.
STUB_SOFORT = """<script>
  window.dataLayer = window.dataLayer || [];
  window.__gtagCalls = [];
  window.gtag = function () { window.__gtagCalls.push(Array.prototype.slice.call(arguments)); };
  (function () {
    function kopie(a) {
      var l = Array.prototype.slice.call(a);
      try { return JSON.parse(JSON.stringify(l)); } catch (e) { return l; }
    }
    window.__plausibleCalls = [];
    window.plausible = function () { window.__plausibleCalls.push(kopie(arguments)); };
    window.plausible.init = function () {};
    window.__metaEvents = [];
    function huelle(m) {
      if (!m || typeof m.event !== 'function' || m.event.__harness) { return m; }
      var echt = m.event;
      m.event = function () { window.__metaEvents.push(kopie(arguments)); return echt.apply(this, arguments); };
      m.event.__harness = true;
      return m;
    }
    if (window.amMeta) { huelle(window.amMeta); return; }
    var wert;
    try {
      Object.defineProperty(window, 'amMeta', { configurable: true, enumerable: true,
        get: function () { return wert; }, set: function (v) { wert = huelle(v); } });
    } catch (e) { /* der Recorder darf die Seite nie brechen */ }
  })();
</script>
</head>"""

ZAHLUNGSLINK = "https://eu.adyen.link/PLTESTMOCK"
OFFEN = {"success": True, "confirmationId": "TEST-0001", "reservationId": "TEST-0001-1",
         "propertyId": "MUBRIG", "paymentRequired": True, "paymentLinkExpiresAt": "",
         "message": "Your reservation has been created but is NOT yet confirmed. "
                    "Please complete the payment to confirm your booking."}
# Form wie die echte Route: 201 mit Zahlungslink, 409 (Plan abgelehnt, H3), 429 (Deckel
# oder Limit, H2), Fehler als {"error": ...}. 201-http und 201-fremd tragen einen Link,
# dem die Seite nicht folgen darf; 'standard' ist die Antwort des Harness vor Segment 0.
ANTWORTEN = {
    "standard": (200, {"success": True, "confirmationId": "TEST-0001",
                       "reservationId": "TEST-0001", "paymentRequired": False}),
    "201": (201, dict(OFFEN, paymentLink=ZAHLUNGSLINK)),
    "201-http": (201, dict(OFFEN, paymentLink="http://eu.adyen.link/PLTESTMOCK")),
    "201-fremd": (201, dict(OFFEN, paymentLink="https://eu.adyen.link.example.com/PLTESTMOCK")),
    "409": (409, {"error": "This rate is not available for online booking. "
                           "Please search again or contact the hotel."}),
    "429": (429, {"error": "Online booking is not possible right now. Please contact the hotel."}),
    "500": (500, {"error": "Booking failed (harness)."}),
}
DOUBLES = {"sofort-kern": ("kern", "sofort-kern-double.js"),
           "sofort-buchen": ("buchen", "sofort-buchen-double.js")}
SOFORT_JS = re.compile(r"^/js/(sofort-[a-z0-9-]+)\.js$")


def index_html():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    tags = ('<script src="./js/deeplink.js" defer></script>\n'
            '  <script src="./js/booking.js" defer></script>')
    html = re.sub(r'<script src="\./js/booking\.min\.js[^"]*"[^>]*></script>', tags, html)
    html = re.sub(r'<script src="\./js/i18n\.min\.js[^"]*"', '<script src="./js/i18n.js"', html)
    html = re.sub(r'<script[^>]*src="https://[^"]*"[^>]*></script>', "", html)
    return html.replace("</head>", STUB, 1)


def sofort_html():
    html = SOFORT_HTML.read_text(encoding="utf-8")
    html = re.sub(r'(src=")((?:\./|/)?js/[A-Za-z0-9_-]+)\.min\.js(?:\?[^"]*)?"', r'\1\2.js"', html)
    html = re.sub(r'<script[^>]*src="https://[^"]*"[^>]*></script>', "", html)
    return html.replace("</head>", STUB_SOFORT, 1)


def gleiche_origin(js):
    # API-Host auf gleiche Origin. Ein leerer window-Wert wuerde nicht reichen,
    # der Ausdruck faellt dann auf die Produktion zurueck; also die Zeile selbst.
    return re.sub(r"var API_BASE = [^;]+;", "var API_BASE = '';", js, count=1)


def booking_js():
    return gleiche_origin((ROOT / "js" / "booking.js").read_text(encoding="utf-8"))


def sofort_js(name, query):
    angebote = query.get("angebote", [STATE["angebote"]])[0]
    if name == "sofort-angebote" and angebote == "leer":
        return "window.amSofortAngebote = [];\n", None
    if name == "sofort-angebote" and angebote == "fixture":
        liste = FIXTURE_ANGEBOTE.read_text(encoding="utf-8").strip()
        return "window.amSofortAngebote = " + liste + ";\n", FIXTURE_ANGEBOTE
    datei = ROOT / "js" / (name + ".js")
    if name in DOUBLES and STATE[DOUBLES[name][0]] == "double":
        datei = ROOT / "tests" / "fixtures" / DOUBLES[name][1]
    if not datei.is_file():
        return None, datei
    return gleiche_origin(datei.read_text(encoding="utf-8")), datei


def seite(query, antwort):
    # Modus am Seitenaufruf, nicht am Server: sonst faerbt ein Test den naechsten.
    STATE["fixture"] = query.get("fixture", ["full"])[0]
    wunsch = query.get("antwort", [antwort])[0]
    STATE["antwort"] = wunsch if wunsch in ANTWORTEN else antwort
    STATE["kern"] = query.get("kern", [""])[0]
    STATE["buchen"] = query.get("buchen", [""])[0]
    STATE["angebote"] = query.get("angebote", [""])[0]


def offers(query):
    modus = query.get("fixture", [STATE["fixture"]])[0]
    quelle = FIXTURE_KURTAXE if modus == "kurtaxe" else FIXTURE
    data = json.loads(quelle.read_text(encoding="utf-8"))
    data["arrival"] = query.get("arrival", [data["arrival"]])[0]
    data["departure"] = query.get("departure", [data["departure"]])[0]
    data["adults"] = int(query.get("adults", ["2"])[0] or 2)
    try:
        day = lambda s: datetime.datetime.strptime(s, "%Y-%m-%d")
        data["nights"] = max(1, (day(data["departure"]) - day(data["arrival"])).days)
    except ValueError:
        pass
    if modus == "empty":
        data["offers"] = []
    return data


def zustand():
    with LOCK:
        n = len(LOG)
    return dict(STATE, protokoll=n, antworten=sorted(ANTWORTEN))


def ohne_gast(body):
    # Gaestefelder ohne Inhalt: die Schluessel bleiben pruefbar, die Werte nie im Log.
    if isinstance(body, dict) and isinstance(body.get("booker"), dict):
        body["booker"] = {k: ("<redacted>" if v not in (None, "") else v)
                          for k, v in body["booker"].items()}
    return body


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def log_message(self, fmt, *args):
        pass

    def send_body(self, payload, ctype, status=200):
        body = payload.encode("utf-8") if isinstance(payload, str) else payload
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, data, status=200):
        self.send_body(json.dumps(data), "application/json", status)

    def fehlt(self, datei):
        pfad = datei.relative_to(ROOT).as_posix()
        self.send_body(f"{pfad} fehlt im Repo (Harness, Bauplan mulin-sofortbuchung)\n",
                       "text/plain; charset=utf-8", 404)

    def do_GET(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        if parsed.path in ("/", "/index.html"):
            seite(query, "standard")
            return self.send_body(index_html(), "text/html; charset=utf-8")
        if parsed.path in ("/sofortbuchung", "/sofortbuchung.html"):
            if not SOFORT_HTML.is_file():
                return self.fehlt(SOFORT_HTML)
            seite(query, "201")
            return self.send_body(sofort_html(), "text/html; charset=utf-8")
        if parsed.path == "/health":
            return self.send_body('{"status":"ok"}', "application/json")
        if parsed.path == "/api/offers":  # Angebote aus dem Fixture
            return self.send_body(json.dumps(offers(query)), "application/json")
        if parsed.path == "/__mock":
            wunsch = query.get("antwort", query.get("booking", [None]))[0]
            if wunsch is not None and wunsch not in ANTWORTEN:
                return self.send_json({"error": "unbekannte Antwort", "antworten": sorted(ANTWORTEN)}, 400)
            if wunsch is not None:
                STATE["antwort"] = wunsch
            if query.get("reset", [""])[0] == "1":
                with LOCK:
                    del LOG[:]
            return self.send_json(zustand())
        if parsed.path == "/__mock/log":
            with LOCK:
                eintraege = list(LOG)
            return self.send_json({"count": len(eintraege), "bookings": eintraege})
        if parsed.path == "/js/booking.js":
            return self.send_body(booking_js(), "text/javascript")
        treffer = SOFORT_JS.match(parsed.path)
        if treffer:
            js, datei = sofort_js(treffer.group(1), query)
            if js is None:
                return self.fehlt(datei)
            return self.send_body(js, "text/javascript")
        if parsed.path == "/js/local-api.js":
            return self.send_body("// vom Harness neutralisiert\n", "text/javascript")
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        if parsed.path != "/api/bookings":
            self.send_response(404)
            self.end_headers()
            return
        try:
            body = json.loads(raw)
        except ValueError:
            body = {"_unparsed": True}
        body = ohne_gast(body)
        modus = STATE["antwort"]
        status, antwort = ANTWORTEN[modus]
        with LOCK:
            LOG.append({"nr": len(LOG) + 1, "antwort": modus, "status": status, "body": body})
        print("BOOKING_BODY " + json.dumps(body, sort_keys=True), flush=True)
        self.send_json(antwort, status)


if __name__ == "__main__":
    print("Harness auf http://localhost:%d (Wurzel %s)" % (PORT, ROOT), flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
