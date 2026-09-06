#!/usr/bin/env python3
"""Test-Harness der Site (Kontrakt K7 des Bauplans fbl-ibe). Kein Produktivcode.
Serviert das Repo und schreibt NUR im Speicher um, nie auf der Platte: index.html
mit js/booking.js statt js/booking.min.js und dem Script-Tag von deeplink.js davor,
i18n.js statt i18n.min.js, ohne externe Skripte, mit gtag-Stub (window.__gtagCalls)
und API-Host auf gleiche Origin. js/local-api.js kommt leer, sonst zoege der
localhost-Override auf Port 3002. GET /api/offers aus tests/fixtures/offers-mubrig.json,
mit ?fixture=empty leer; POST /api/bookings antwortet synthetisch und protokolliert den
Body ohne die Gaestefelder.  Aufruf: python3 tests/dev-server.py [port]
"""
import datetime
import json
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parent.parent
FIXTURE = ROOT / "tests" / "fixtures" / "offers-mubrig.json"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
STATE = {"fixture": "full"}

STUB = """<script>
  window.dataLayer = window.dataLayer || [];
  window.__gtagCalls = [];
  window.gtag = function () { window.__gtagCalls.push(Array.prototype.slice.call(arguments)); };
</script>
</head>"""


def index_html():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    tags = ('<script src="./js/deeplink.js" defer></script>\n'
            '  <script src="./js/booking.js" defer></script>')
    html = re.sub(r'<script src="\./js/booking\.min\.js[^"]*"[^>]*></script>', tags, html)
    html = re.sub(r'<script src="\./js/i18n\.min\.js[^"]*"', '<script src="./js/i18n.js"', html)
    html = re.sub(r'<script[^>]*src="https://[^"]*"[^>]*></script>', "", html)
    return html.replace("</head>", STUB, 1)


def booking_js():
    # API-Host auf gleiche Origin. Ein leerer window-Wert wuerde nicht reichen,
    # der Ausdruck faellt dann auf die Produktion zurueck; also die Zeile selbst.
    js = (ROOT / "js" / "booking.js").read_text(encoding="utf-8")
    return re.sub(r"var API_BASE = [^;]+;", "var API_BASE = '';", js, count=1)


def offers(query):
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    data["arrival"] = query.get("arrival", [data["arrival"]])[0]
    data["departure"] = query.get("departure", [data["departure"]])[0]
    data["adults"] = int(query.get("adults", ["2"])[0] or 2)
    try:
        day = lambda s: datetime.datetime.strptime(s, "%Y-%m-%d")
        data["nights"] = max(1, (day(data["departure"]) - day(data["arrival"])).days)
    except ValueError:
        pass
    if query.get("fixture", [STATE["fixture"]])[0] == "empty":
        data["offers"] = []
    return data


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def log_message(self, fmt, *args):
        pass

    def send_body(self, payload, ctype):
        body = payload.encode("utf-8") if isinstance(payload, str) else payload
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        if parsed.path in ("/", "/index.html"):
            # Modus am Seitenaufruf, nicht am Server: sonst faerbt ein Test den naechsten.
            STATE["fixture"] = query.get("fixture", ["full"])[0]
            return self.send_body(index_html(), "text/html; charset=utf-8")
        if parsed.path == "/health":
            return self.send_body('{"status":"ok"}', "application/json")
        if parsed.path == "/api/offers":  # Angebote aus dem Fixture
            return self.send_body(json.dumps(offers(query)), "application/json")
        if parsed.path == "/js/booking.js":
            return self.send_body(booking_js(), "text/javascript")
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
        if isinstance(body.get("booker"), dict):
            body["booker"] = "<redacted>"
        print("BOOKING_BODY " + json.dumps(body, sort_keys=True), flush=True)
        antwort = {"success": True, "confirmationId": "TEST-0001",
                   "reservationId": "TEST-0001", "paymentRequired": False}
        self.send_body(json.dumps(antwort), "application/json")


if __name__ == "__main__":
    print("Harness auf http://localhost:%d (Wurzel %s)" % (PORT, ROOT), flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
