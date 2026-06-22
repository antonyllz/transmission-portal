/* ═══════════════════
   ANIMATIONS
   ═══════════════════ */

/* ── Page fade+rise entrance ── */
function pageEnter(id) {
  var page = document.getElementById(id);
  page.classList.remove('page-entering');
  void page.offsetWidth;
  page.classList.add('page-entering');
  page.addEventListener('animationend', function() {
    page.classList.remove('page-entering');
  }, { once: true });
}

/* ── Ripple helper ── */
function createRipple(el, e, dark) {
  var rect = el.getBoundingClientRect();
  var size = Math.max(rect.width, rect.height) * 2.5;
  var x = (e.clientX - rect.left) - size / 2;
  var y = (e.clientY - rect.top)  - size / 2;
  var r = document.createElement('span');
  r.className = dark ? 'ripple ripple-dark' : 'ripple';
  r.style.cssText = 'width:' + size + 'px;height:' + size + 'px;left:' + x + 'px;top:' + y + 'px;';
  el.appendChild(r);
  r.addEventListener('animationend', function() { r.remove(); }, { once: true });
}

/* ── Bind ripples to interactive elements ── */
function bindRipples() {
  document.querySelectorAll('.client-card:not(.ph)').forEach(function(el) {
    el.style.position = 'relative';
    el.addEventListener('click', function(e) { createRipple(el, e, false); });
  });
  document.querySelectorAll('.act-card:not(.cs)').forEach(function(el) {
    el.style.position = 'relative';
    el.addEventListener('click', function(e) { createRipple(el, e, false); });
  });
  document.querySelectorAll('.btn-blue').forEach(function(el) {
    el.style.overflow = 'hidden';
    el.addEventListener('click', function(e) { createRipple(el, e, false); });
  });
  document.querySelectorAll('.btn-sm, .btn-danger, .back-btn').forEach(function(el) {
    el.style.overflow = 'hidden';
    el.addEventListener('click', function(e) { createRipple(el, e, true); });
  });
}

/* ── Hero text stagger ── */
function animateHero() {
  var hero = document.querySelector('.home-hero');
  if (!hero) return;
  var items = [
    { el: hero.querySelector('.ey'), delay: '0s' },
    { el: hero.querySelector('h1'),  delay: '0.13s' },
    { el: hero.querySelector('p'),   delay: '0.24s' }
  ];
  items.forEach(function(o) { if (o.el) o.el.classList.remove('hero-text-anim'); });
  void hero.offsetWidth;
  items.forEach(function(o) {
    if (!o.el) return;
    o.el.style.animationDelay = o.delay;
    o.el.classList.add('hero-text-anim');
  });
}

/* ── Act cards stagger (client pages) ── */
function animateActCards(pageId) {
  var page = pageId ? document.getElementById(pageId) : document.querySelector('.page.active');
  if (!page) return;
  var cards = page.querySelectorAll('.act-card:not(.cs)');
  cards.forEach(function(c) { c.classList.remove('vanishIn'); });
  var grid = page.querySelector('.act-grid');
  if (grid) void grid.offsetWidth;
  cards.forEach(function(c, i) {
    c.style.animationDuration = '0.45s';
    c.style.animationFillMode = 'both';
    c.style.animationDelay   = (i * 0.1) + 's';
    c.classList.add('vanishIn');
  });
}

/* ── Logo + label entrance on first load ── */
function animateLogo() {
  var logo = document.getElementById('tb-logo');
  var lbl  = document.querySelector('.tb-lbl');
  var div  = document.querySelector('.tb-div');
  if (logo) logo.classList.add('logo-pop-anim');
  if (div)  div.classList.add('label-slide-anim');
  if (lbl)  { lbl.classList.add('label-slide-anim'); lbl.style.animationDelay = '0.28s'; }
}
