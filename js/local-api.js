// Dev-only override: point the IBE at a local backend ONLY when developing
// on localhost. In production (hotelmulin.ch) this must be a no-op, otherwise
// the booking engine would call http://localhost:3002 and fail for every guest.
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  window.HOTELMULIN_API_BASE = 'http://localhost:3002';
}
