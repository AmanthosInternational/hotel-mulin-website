/**
 * Sentry browser telemetry — Hotel Mulin (hotelmulin.ch)
 *
 * Loaded from the CDN bundle rather than the Loader script: the org lives in
 * Sentry's EU region, and keeping the whole configuration here means sampling
 * rates and privacy settings are reviewable in git instead of hidden behind a
 * dashboard toggle. The bundle is pinned to an exact version and guarded by an
 * SRI hash, so a compromised CDN cannot execute anything on these pages.
 *
 * Both script tags are `defer`, and this file is ordered before the site's own
 * scripts. Deferred scripts run in document order, so Sentry is initialised
 * before app.js/booking.js and catches their errors, without blocking render.
 */
(function () {
  // The bundle is blocked by common ad blockers. Without this guard that turns
  // into a ReferenceError on every such visit — noise in the console of exactly
  // the users we cannot observe anyway.
  if (typeof Sentry === 'undefined') return;

  Sentry.init({
    dsn: 'https://a8014860c8865d545b416c70f15fc3e0@o4511372064915456.ingest.de.sentry.io/4511927219191888',
    environment: 'production',

    // No IP addresses, no cookies, no request bodies. Guest data must not leave
    // the browser; the point of this instrumentation is broken code, not people.
    sendDefaultPii: false,

    integrations: [
      Sentry.browserTracingIntegration(),
    ],

    // Core Web Vitals and page load timings. 10% is enough to see trends on a
    // marketing site and keeps well inside the org's event quota.
    tracesSampleRate: 0.1,

    // DELIBERATELY EMPTY — do not add the API hosts here without changing them
    // first. Trace propagation adds `sentry-trace` and `baggage` headers to
    // outgoing requests. Measured 2026-08-17: the booking API answers the CORS
    // preflight with `Access-Control-Allow-Headers: Content-Type, X-API-Key,
    // Authorization`. Neither header is on that list, so the browser would
    // reject the preflight and the availability call would fail — the booking
    // funnel would break to gain a trace. Connecting browser and backend traces
    // requires allowing both headers server-side first.
    tracePropagationTargets: [],

    // Record a replay only when something actually broke: no blanket recording
    // of every visitor, and the material that matters (what the guest did
    // before the booking failed) is still captured. Raise the session rate only
    // together with the cookie banner and the privacy policy.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,

    // Noise that is not our code and cannot be fixed by us. Left unfiltered,
    // these bury the real errors — the same failure mode that made 559 of 673
    // events in this org a single client disconnect (fixed 2026-08-17).
    ignoreErrors: [
      // Benign browser layout notice, fires on healthy pages.
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      // Browser extensions and injected scripts.
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
      // Network hiccups on the visitor's side, not a defect of the site.
      'Failed to fetch',
      'NetworkError when attempting to fetch resource',
      'Load failed',
      // Safari/iOS quirks with no actionable stack.
      'Non-Error promise rejection captured',
    ],

    denyUrls: [
      // Third-party tags: their errors belong to their owners, not to us.
      /googletagmanager\.com/,
      /google-analytics\.com/,
      /gstatic\.com/,
      /extensions\//,
      /^chrome:\/\//,
    ],
  });

  // Which of the four sites an event came from, without relying on the URL.
  Sentry.setTag('site', 'hotel-mulin-website');

  // Replay kostet den Besucher einen eigenen Chunk (replay.min.js, 153 KB, vom CDN
  // unkomprimiert ausgeliefert) und ist nur fuer die Buchungsstrecke wertvoll
  // (Analyse von Buchungsabbruechen). Er laedt deshalb erst bei der ersten
  // Interaktion mit der Buchungsleiste, nicht bei jedem Seitenaufruf.
  var replayArmed = false;
  function armReplay() {
    if (replayArmed) return;
    replayArmed = true;
    // bundle.tracing.min.js bringt einen Platzhalter Sentry.replayIntegration mit, der
    // nur warnt und nichts aufzeichnet. lazyLoadIntegration() gibt eine vorhandene
    // Funktion unbesehen zurueck und erkennt Platzhalter am Merker _isShim — der fehlt
    // genau beim Replay (gemessen in 10.68.0 und in 10.70.0; feedbackIntegration
    // daneben traegt ihn). Ohne die Markierung laedt der Chunk nie. Kennzeichen des
    // Platzhalters: replayIntegration da, getReplay fehlt; replay.min.js setzt beide.
    if (typeof Sentry.replayIntegration === 'function' && typeof Sentry.getReplay !== 'function') {
      Sentry.replayIntegration._isShim = true;
    }
    Sentry.lazyLoadIntegration('replayIntegration').then(function (replayIntegration) {
      Sentry.addIntegration(replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }));
    }).catch(function () {
      // Adblocker oder Netzproblem: Replay entfaellt, Fehler-Reporting laeuft weiter.
    });
  }
  var bookingBar = document.getElementById('bookingBar');
  if (bookingBar) {
    ['focusin', 'pointerdown'].forEach(function (t) {
      bookingBar.addEventListener(t, armReplay, { once: true, passive: true });
    });
  }
})();
