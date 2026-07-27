/* ═══════════════════
   NAVIGATION
   ═══════════════════ */

function showPage(id) {
  document.querySelectorAll('.page').forEach(function(p) {
    p.classList.remove('active', 'page-entering');
  });
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
  pageEnter(id);
  if (id === 'pg-home') {
    animateHero();
    animateClientCards();
  }
  if (id === 'pg-amazon-leo' || id === 'pg-starlink') {
    animateActCards(id);
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
  });
}

function openRFO() {
  document.getElementById('rfo-frame').src = 'rfo/index.html';
  showPage('pg-rfo');
}

function openLOA() {
  document.getElementById('loa-frame').src = 'loa/index.html';
  showPage('pg-loa');
}

function openTLList() {
  renderList();
  showPage('pg-tl-list');
}
