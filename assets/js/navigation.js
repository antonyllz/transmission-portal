/* ═══════════════════
   NAVIGATION
   ═══════════════════ */

function showPage(id) {
  document.querySelectorAll('.page').forEach(function(p) {
    p.classList.remove('active', 'page-entering');
  });
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
  routeSyncUrl(id);
  pageEnter(id);
  if (id === 'pg-home') {
    animateHero();
    animateClientCards();
  }
  if (id === 'pg-amazon-leo' || id === 'pg-starlink') {
    clientEnter(id);
  }
}

function animateClientCards() {
  var cards = document.querySelectorAll('.clients-grid .client-card');
  cards.forEach(function(card) {
    card.classList.remove('vanishIn');
  });
  void document.querySelector('.clients-grid').offsetWidth;
  cards.forEach(function(card, i) {
    card.style.animationDelay = (i * 0.13) + 's';
    card.classList.add('vanishIn');
    card.addEventListener('animationend', function() { card.classList.remove('vanishIn'); }, { once: true });
  });
}

function openRFO() {
  document.getElementById('rfo-frame').src = 'rfo/index.html?v=' + Date.now();
  showPage('pg-rfo');
}

function openLOA() {
  document.getElementById('loa-frame').src = 'loa/index.html?v=' + Date.now();
  showPage('pg-loa');
}

function openRFOGeneric() {
  document.getElementById('rfo-generic-frame').src = 'rfo-generic/index.html?v=' + Date.now();
  showPage('pg-rfo-generic');
}

function openTLList() {
  renderList();
  showPage('pg-tl-list');
}

/* ═══════════════════
   ROUTER — every page has its own #/address so the browser's
   back/forward buttons, bookmarks and "open in new tab" work
   ═══════════════════ */

var PAGE_ROUTES = {
  'pg-home':        { path: '',                        title: 'Home' },
  'pg-amazon-leo':  { path: 'amazon-leo',              title: 'Amazon Leo' },
  'pg-starlink':    { path: 'starlink',                title: 'Starlink' },
  'pg-rfo':         { path: 'amazon-leo/rfo',          title: 'RFO Amazon Leo' },
  'pg-loa':         { path: 'loa',                     title: 'LOA' },
  'pg-rfo-generic': { path: 'rfo',                     title: 'RFO' },
  'pg-tl-list':     { path: 'amazon-leo/timeline',     title: 'Case Timeline' },
  'pg-tl-new':      { path: 'amazon-leo/timeline/new', title: 'New Case' },
  'pg-tl-detail':   { path: function() { return 'amazon-leo/timeline/' + encodeURIComponent(activeId); },
                      title: function() { return 'Case #' + activeId; } },
  'pg-rma':         { path: 'rmas',                    title: 'RMAs' },
  'pg-lambdas':     { path: 'lambdas',                 title: 'Lambdas' }
};

var ROUTE_OPENERS = {
  '':                        function() { showPage('pg-home'); },
  'amazon-leo':              function() { showPage('pg-amazon-leo'); },
  'starlink':                function() { showPage('pg-starlink'); },
  'amazon-leo/rfo':          function() { openRFO(); },
  'loa':                     function() { openLOA(); },
  'rfo':                     function() { openRFOGeneric(); },
  'amazon-leo/timeline':     function() { openTLList(); },
  'amazon-leo/timeline/new': function() { showPage('pg-tl-new'); },
  'rmas':                    function() { openRMA(); },
  'lambdas':                 function() { openLambdas(); }
};

var routeSilent = false;   /* true while the router itself is opening a page */

function routeCurrentPath() {
  return decodeURIComponent(location.hash.replace(/^#\/?/, '')).replace(/\/+$/, '');
}

function routeVal(v) { return typeof v === 'function' ? v() : v; }

/* called by showPage: reflect the page in the address bar + tab title */
function routeSyncUrl(id) {
  var r = PAGE_ROUTES[id];
  if (!r) return;
  document.title = routeVal(r.title) + ' \u2014 Transmission Portal';
  if (routeSilent) return;
  var path = routeVal(r.path);
  var cur  = routeCurrentPath();
  if (cur === path || (id === 'pg-lambdas' && cur.indexOf('lambdas/') === 0)) return;
  history.pushState(null, '', path ? '#/' + path : location.pathname + location.search);
}

/* replace the current address without adding a history entry (sub-selections, e.g. a map section) */
function routeReplace(path) {
  history.replaceState(null, '', path ? '#/' + path : location.pathname + location.search);
}

function routeFromHash() {
  var p = routeCurrentPath();
  var m;
  routeSilent = true;
  try {
    if (ROUTE_OPENERS.hasOwnProperty(p)) ROUTE_OPENERS[p]();
    else if ((m = p.match(/^amazon-leo\/timeline\/(.+)$/)) && dbGetCase(m[1])) openDetail(m[1]);
    else if ((m = p.match(/^lambdas\/(link|site|channel)\/(.+)$/))) { openLambdas(); lmbSelect(m[1], m[2]); }
    else showPage('pg-home');
  } finally {
    routeSilent = false;
  }
}

window.addEventListener('popstate', routeFromHash);
