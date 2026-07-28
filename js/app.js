(function () {
'use strict';

// ========== SCROLL TO TOP ON PAGE LOAD ==========
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}
// Defer the forced scroll until after first paint to avoid a synchronous
// full-page layout during startup (TBT).
requestAnimationFrame(function () { window.scrollTo(0, 0); });

// ========== NAVIGATION ==========
var nav = document.getElementById('nav');
var hamburger = document.getElementById('hamburger');
var navLinks = document.getElementById('navLinks');

function updateNav() {
  if (!nav) return;
  if (window.scrollY > 60) {
    nav.classList.add('scrolled');
  } else {
    nav.classList.remove('scrolled');
  }
}

window.addEventListener('scroll', updateNav, { passive: true });
// Initial nav state = top of page (default classes); check once after paint.
requestAnimationFrame(updateNav);

if (hamburger && navLinks) {
  hamburger.addEventListener('click', function () {
    var isOpen = navLinks.classList.toggle('open');
    hamburger.classList.toggle('active');
    hamburger.setAttribute('aria-expanded', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  navLinks.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      navLinks.classList.remove('open');
      hamburger.classList.remove('active');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  });
}

// ========== SMOOTH SCROLL ==========
document.querySelectorAll('a[href^="#"]').forEach(function (link) {
  link.addEventListener('click', function (e) {
    var href = this.getAttribute('href');
    if (href === '#') return;
    if (href === '#bookingBar') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    var target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

document.querySelectorAll('[data-scroll-to]').forEach(function (el) {
  el.addEventListener('click', function (e) {
    var targetId = this.getAttribute('data-scroll-to');
    if (targetId === 'bookingBar') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    var target = document.getElementById(targetId);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
});

// ========== INTERSECTION OBSERVER ANIMATIONS ==========
var animateEls = document.querySelectorAll('[data-animate]');
if (animateEls.length > 0 && 'IntersectionObserver' in window) {
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  animateEls.forEach(function (el) { observer.observe(el); });
} else {
  animateEls.forEach(function (el) { el.classList.add('animate-in'); });
}

// ========== STAGGER ANIMATION OBSERVER ==========
var staggerEls = document.querySelectorAll('[data-animate-stagger]');
function revealStaggerChildren(el) {
  if (el.dataset.staggerRevealed) return;
  el.dataset.staggerRevealed = '1';
  var children = el.children;
  for (var i = 0; i < children.length; i++) {
    children[i].style.transitionDelay = (i * 0.1) + 's';
    children[i].classList.add('animate-in');
  }
}
if (staggerEls.length > 0 && 'IntersectionObserver' in window) {
  var staggerObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        revealStaggerChildren(entry.target);
        staggerObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.01, rootMargin: '0px 0px 0px 0px' });
  staggerEls.forEach(function (el) { staggerObserver.observe(el); });
  // Fallback: reveal all stagger sections after 3s to prevent invisible content
  setTimeout(function () {
    staggerEls.forEach(function (el) { revealStaggerChildren(el); });
  }, 3000);
} else {
  staggerEls.forEach(function (el) { revealStaggerChildren(el); });
}

// ========== DATE PICKER CONSTRAINTS ==========
var today = new Date().toISOString().split('T')[0];
var checkinInput = document.getElementById('bb-checkin');
var checkoutInput = document.getElementById('bb-checkout');

if (checkinInput) {
  checkinInput.min = today;
  checkinInput.addEventListener('change', function () {
    if (checkoutInput) {
      var checkin = new Date(this.value);
      checkin.setDate(checkin.getDate() + 1);
      checkoutInput.min = checkin.toISOString().split('T')[0];
      if (checkoutInput.value && checkoutInput.value <= this.value) {
        checkoutInput.value = checkoutInput.min;
      }
    }
  });
}

// ========== ROOMS TAB SECTION ==========
var roomDisplay = document.getElementById('roomDisplay');
if (roomDisplay) {
var roomData = [
  {
    id: 'einzelzimmer',
    nameKey: 'rooms.name_sgln',
    name: 'Einzelzimmer',
    count: 2,
    price: 'ab CHF 98',
    priceNote: '/Nacht',
    descKey: 'rooms.desc_sgln',
    desc: 'Gemütliches Einzelzimmer (ca. 12 m²) mit 120 cm breitem Bett, Bodenheizung und eigener Kaffee- & Teemaschine. Ideal für Alleinreisende.',
    amenities: [
      { key: 'rooms.amenity_single_bed', label: 'Bett 120 cm', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 012 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>' },
      { key: 'rooms.amenity_tv', label: 'Flat-TV', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>' },
      { key: 'rooms.amenity_breakfast', label: 'Frühstück Muliniala', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 8h1a4 4 0 110 8h-1"/><path d="M3 8h14v9a4 4 0 01-4 4H7a4 4 0 01-4-4V8z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>' },
      { key: 'rooms.amenity_coffee', label: 'Kaffee & Tee', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 8h1a4 4 0 110 8h-1"/><path d="M3 8h14v9a4 4 0 01-4 4H7a4 4 0 01-4-4V8z"/></svg>' },
      { key: 'rooms.amenity_wifi', label: 'WLAN', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/><path d="M8.53 16.11a6 6 0 016.95 0"/><circle cx="12" cy="20" r="1"/></svg>' }
    ],
    images: [
      './assets/images/rooms/sgln/1.jpg',
      './assets/images/rooms/sgln/2.jpg',
      './assets/images/rooms/sgln/3.jpg'
    ]
  },
  {
    id: 'einzelzimmer-gross',
    nameKey: 'rooms.name_sglb',
    name: 'Einzelzimmer Gross',
    count: 1,
    price: 'ab CHF 98',
    priceNote: '/Nacht',
    descKey: 'rooms.desc_sglb',
    desc: 'Grosszügiges Einzelzimmer mit breitem 140 cm Bett — mehr Platz und Komfort für Alleinreisende, die es gerne geräumig haben.',
    amenities: [
      { key: 'rooms.amenity_big_bed', label: 'Bett 140 cm', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 012 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>' },
      { key: 'rooms.amenity_tv', label: 'Flat-TV', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>' },
      { key: 'rooms.amenity_breakfast', label: 'Frühstück Muliniala', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 8h1a4 4 0 110 8h-1"/><path d="M3 8h14v9a4 4 0 01-4 4H7a4 4 0 01-4-4V8z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>' },
      { key: 'rooms.amenity_coffee', label: 'Kaffee & Tee', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 8h1a4 4 0 110 8h-1"/><path d="M3 8h14v9a4 4 0 01-4 4H7a4 4 0 01-4-4V8z"/></svg>' },
      { key: 'rooms.amenity_wifi', label: 'WLAN', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/><path d="M8.53 16.11a6 6 0 016.95 0"/><circle cx="12" cy="20" r="1"/></svg>' }
    ],
    images: [
      './assets/images/rooms/sglb/1.jpg',
      './assets/images/rooms/sglb/2.jpg',
      './assets/images/rooms/sglb/3.jpg'
    ]
  },
  {
    id: 'doppelzimmer',
    nameKey: 'rooms.name_dbln',
    name: 'Doppelzimmer',
    count: 4,
    price: 'ab CHF 178',
    priceNote: '/Nacht',
    descKey: 'rooms.desc_dbln',
    desc: 'Komfortables Doppelzimmer (ca. 22 m²) mit grossem Doppelbett, Sitzgelegenheit und Blick auf Dorf oder Berge. Perfekt für Paare.',
    amenities: [
      { key: 'rooms.amenity_double_bed', label: 'Doppelbett', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4v16"/><path d="M2 13h20"/><path d="M22 13v7"/><path d="M2 8h6a2 2 0 012 2v3"/><path d="M12 8h6a2 2 0 012 2v3"/></svg>' },
      { key: 'rooms.amenity_tv', label: 'Flat-TV', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>' },
      { key: 'rooms.amenity_breakfast', label: 'Frühstück Muliniala', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 8h1a4 4 0 110 8h-1"/><path d="M3 8h14v9a4 4 0 01-4 4H7a4 4 0 01-4-4V8z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>' },
      { key: 'rooms.amenity_bath', label: 'Bad/Dusche', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12h16a1 1 0 011 1v3a4 4 0 01-4 4H7a4 4 0 01-4-4v-3a1 1 0 011-1z"/><path d="M6 12V5a2 2 0 012-2h3v2.25"/></svg>' },
      { key: 'rooms.amenity_wifi', label: 'WLAN', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/><path d="M8.53 16.11a6 6 0 016.95 0"/><circle cx="12" cy="20" r="1"/></svg>' }
    ],
    images: [
      './assets/images/rooms/dbln/1.jpg',
      './assets/images/rooms/dbln/2.jpg',
      './assets/images/rooms/dbln/3.jpg'
    ]
  },
  {
    id: 'doppelzimmer-balkon',
    nameKey: 'rooms.name_dbrb',
    name: 'Doppelzimmer mit Balkon',
    count: 6,
    price: 'ab CHF 198',
    priceNote: '/Nacht',
    descKey: 'rooms.desc_dbrb',
    desc: 'Doppelzimmer mit privatem Balkon und Bergblick — geniessen Sie den Morgenkaffee mit Blick auf die Bündner Bergwelt. Hunde willkommen.',
    amenities: [
      { key: 'rooms.amenity_double_bed', label: 'Doppelbett', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4v16"/><path d="M2 13h20"/><path d="M22 13v7"/><path d="M2 8h6a2 2 0 012 2v3"/><path d="M12 8h6a2 2 0 012 2v3"/></svg>' },
      { key: 'rooms.amenity_balcony', label: 'Balkon', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="12" x2="12" y2="21"/></svg>' },
      { key: 'rooms.amenity_mountain_view', label: 'Bergblick', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 21l4-10 4 10"/><path d="M14.5 15l3.5-7 4 10H2l6-12 3.5 7"/></svg>' },
      { key: 'rooms.amenity_breakfast', label: 'Frühstück Muliniala', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 8h1a4 4 0 110 8h-1"/><path d="M3 8h14v9a4 4 0 01-4 4H7a4 4 0 01-4-4V8z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>' },
      { key: 'rooms.amenity_wifi', label: 'WLAN', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/><path d="M8.53 16.11a6 6 0 016.95 0"/><circle cx="12" cy="20" r="1"/></svg>' }
    ],
    images: [
      './assets/images/rooms/dbrb/1.jpg',
      './assets/images/rooms/dbrb/2.jpg',
      './assets/images/rooms/dbrb/3.jpg'
    ]
  },
  {
    id: 'galerie-suite',
    nameKey: 'rooms.name_glrs',
    name: 'Galerie Suite',
    count: 2,
    price: 'ab CHF 198',
    priceNote: '/Nacht',
    descKey: 'rooms.desc_glrs',
    desc: 'Grosszügige Suite (ca. 31 m²) mit getrenntem Wohn- und Schlafbereich: Doppelbett auf der Galerie, Sofa und Balkon mit Bergblick.',
    amenities: [
      { key: 'rooms.amenity_gallery_bed', label: 'Doppelbett auf Galerie', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 012 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>' },
      { key: 'rooms.amenity_living_area', label: 'Wohnbereich mit Sofa', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12h16a1 1 0 011 1v5H3v-5a1 1 0 011-1z"/><path d="M5 12V8a3 3 0 013-3h8a3 3 0 013 3v4"/><path d="M5 18v2"/><path d="M19 18v2"/></svg>' },
      { key: 'rooms.amenity_balcony', label: 'Balkon', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="12" x2="12" y2="21"/></svg>' },
      { key: 'rooms.amenity_mountain_view', label: 'Bergblick', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 21l4-10 4 10"/><path d="M14.5 15l3.5-7 4 10H2l6-12 3.5 7"/></svg>' },
      { key: 'rooms.amenity_wifi', label: 'WLAN', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/><path d="M8.53 16.11a6 6 0 016.95 0"/><circle cx="12" cy="20" r="1"/></svg>' }
    ],
    images: [
      './assets/images/rooms/glrs/1.jpg',
      './assets/images/rooms/glrs/2.jpg',
      './assets/images/rooms/glrs/3.jpg'
    ]
  },
  {
    id: 'familienzimmer-6',
    nameKey: 'rooms.name_fam6',
    name: 'Familienzimmer (6)',
    count: 1,
    price: 'ab CHF 718',
    priceNote: '/Nacht',
    descKey: 'rooms.desc_fam6',
    desc: 'Unser grösstes Zimmer für bis zu 6 Personen — ideal für Familien und kleine Gruppen, die gemeinsam die Surselva entdecken wollen.',
    amenities: [
      { key: 'rooms.amenity_6_beds', label: 'Bis 6 Personen', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>' },
      { key: 'rooms.amenity_tv', label: 'Flat-TV', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>' },
      { key: 'rooms.amenity_breakfast', label: 'Frühstück Muliniala', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 8h1a4 4 0 110 8h-1"/><path d="M3 8h14v9a4 4 0 01-4 4H7a4 4 0 01-4-4V8z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>' },
      { key: 'rooms.amenity_bath', label: 'Bad/Dusche', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12h16a1 1 0 011 1v3a4 4 0 01-4 4H7a4 4 0 01-4-4v-3a1 1 0 011-1z"/><path d="M6 12V5a2 2 0 012-2h3v2.25"/></svg>' },
      { key: 'rooms.amenity_wifi', label: 'WLAN', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/><path d="M8.53 16.11a6 6 0 016.95 0"/><circle cx="12" cy="20" r="1"/></svg>' }
    ],
    images: [
      './assets/images/rooms/fam6/1.jpg',
      './assets/images/rooms/fam6/2.jpg',
      './assets/images/rooms/fam6/3.jpg'
    ]
  }
];
var currentRoomIndex = 0;
var currentImageIndex = 0;
function renderRoom(index) {
  var room = roomData[index];
  if (!room) return;
  currentRoomIndex = index;
  currentImageIndex = 0;
  var t = window.t || function(k) { return k; };
  var name = t(room.nameKey) !== room.nameKey ? t(room.nameKey) : room.name;
  var desc = t(room.descKey) !== room.descKey ? t(room.descKey) : room.desc;
  var countLabel = room.count + ' ' + (t('rooms.rooms_label') !== 'rooms.rooms_label' ? t('rooms.rooms_label') : 'ZIMMER');
  var bookNow = t('rooms.book_now') !== 'rooms.book_now' ? t('rooms.book_now') : 'JETZT BUCHEN';
  var viewMore = t('rooms.view_more') !== 'rooms.view_more' ? t('rooms.view_more') : 'MEHR ANSCHAUEN';
  var html = '<div class="room-gallery">';
  html += '<img src="' + room.images[0] + '" alt="' + name + '" loading="lazy">';
  html += '<span class="room-count-badge">' + countLabel + '</span>';
  var priceNote = t('pricing.per_night') !== 'pricing.per_night' ? t('pricing.per_night') : room.priceNote;
  html += '<span class="room-price-badge">' + room.price + ' ' + priceNote + '</span>';
  if (room.images.length > 1) {
    html += '<button class="room-gallery-nav room-gallery-prev" aria-label="Previous image"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>';
    html += '<button class="room-gallery-nav room-gallery-next" aria-label="Next image"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></button>';
  }
  html += '</div>';
  html += '<div class="room-details">';
  html += '<h3>' + name + '</h3>';
  html += '<div class="room-amenities">';
  for (var a = 0; a < room.amenities.length; a++) {
    var am = room.amenities[a];
    var amLabel = t(am.key) !== am.key ? t(am.key) : am.label;
    html += '<div class="room-amenity">' + am.icon + '<span>' + amLabel + '</span></div>';
  }
  html += '</div>';
  html += '<p class="room-desc">' + desc + '</p>';
  html += '<div class="room-actions">';
  html += '<a href="#bookingBar" class="btn btn-accent" data-scroll-to="bookingBar">' + bookNow + '</a>';
  html += '<button class="btn btn-outline room-view-more-btn">' + viewMore + '</button>';
  html += '</div></div>';
  roomDisplay.innerHTML = html;
  // Attach gallery nav events
  var prevBtn = roomDisplay.querySelector('.room-gallery-prev');
  var nextBtn = roomDisplay.querySelector('.room-gallery-next');
  if (prevBtn) prevBtn.addEventListener('click', function() { navigateGallery(-1); });
  if (nextBtn) nextBtn.addEventListener('click', function() { navigateGallery(1); });
  // Attach scroll-to event on book now button
  var bookBtn = roomDisplay.querySelector('[data-scroll-to]');
  if (bookBtn) {
    bookBtn.addEventListener('click', function(e) {
      e.preventDefault();
      var target = document.getElementById(this.getAttribute('data-scroll-to'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
}
function navigateGallery(dir) {
  var room = roomData[currentRoomIndex];
  if (!room) return;
  currentImageIndex = (currentImageIndex + dir + room.images.length) % room.images.length;
  var img = roomDisplay.querySelector('.room-gallery img');
  if (img) {
    img.style.opacity = '0';
    setTimeout(function() {
      img.src = room.images[currentImageIndex];
      img.style.opacity = '1';
    }, 150);
  }
}
// Tab click handlers
document.querySelectorAll('.rooms-tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    document.querySelectorAll('.rooms-tab').forEach(function(t) {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    this.classList.add('active');
    this.setAttribute('aria-selected', 'true');
    renderRoom(parseInt(this.getAttribute('data-room')));
  });
});
// Defer first room render until section is near viewport
if ('IntersectionObserver' in window) {
  var roomsSection = document.getElementById('rooms');
  if (roomsSection) {
    var roomObserver = new IntersectionObserver(function(entries) {
      if (entries[0].isIntersecting) {
        renderRoom(0);
        roomObserver.disconnect();
      }
    }, { rootMargin: '300px' });
    roomObserver.observe(roomsSection);
  }
} else {
  renderRoom(0);
}
document.addEventListener('languageChanged', function () {
  if (roomDisplay && roomDisplay.innerHTML) renderRoom(currentRoomIndex);
});
}

// ========== LIGHTBOX ==========
var lightbox = document.getElementById('lightbox');
var lightboxImg = document.getElementById('lightboxImg');
var lightboxClose = document.getElementById('lightboxClose');
var lightboxPrev = document.getElementById('lightboxPrev');
var lightboxNext = document.getElementById('lightboxNext');
var lightboxImages = [];
var lightboxIndex = 0;

document.querySelectorAll('[data-lightbox]').forEach(function (item, i) {
  var img = item.querySelector('img');
  if (img) lightboxImages.push(img.src);

  item.addEventListener('click', function () {
    lightboxIndex = i;
    openLightbox(lightboxImages[i]);
  });
});

function openLightbox(src) {
  if (!lightbox || !lightboxImg) return;
  lightboxImg.src = src;
  lightbox.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  if (!lightbox) return;
  lightbox.classList.remove('active');
  document.body.style.overflow = '';
}

if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
if (lightbox) {
  lightbox.addEventListener('click', function (e) {
    if (e.target === lightbox) closeLightbox();
  });
}

if (lightboxPrev) {
  lightboxPrev.addEventListener('click', function () {
    lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
    if (lightboxImg) lightboxImg.src = lightboxImages[lightboxIndex];
  });
}

if (lightboxNext) {
  lightboxNext.addEventListener('click', function () {
    lightboxIndex = (lightboxIndex + 1) % lightboxImages.length;
    if (lightboxImg) lightboxImg.src = lightboxImages[lightboxIndex];
  });
}

document.addEventListener('keydown', function (e) {
  if (!lightbox || !lightbox.classList.contains('active')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft' && lightboxPrev) lightboxPrev.click();
  if (e.key === 'ArrowRight' && lightboxNext) lightboxNext.click();
});

// ========== COOKIE BANNER ==========
var cookieBanner = document.getElementById('cookieBanner');
var cookieAccept = document.getElementById('cookieAccept');
if (cookieBanner && !localStorage.getItem('cookies_accepted')) {
  cookieBanner.style.display = 'block';
}
if (cookieAccept) {
  cookieAccept.addEventListener('click', function () {
    localStorage.setItem('cookies_accepted', '1');
    if (cookieBanner) cookieBanner.style.display = 'none';
  });
}

})();
