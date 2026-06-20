/* ═══════════════════
   NAVIGATION
   ═══════════════════ */

function showPage(id) {
  document.querySelectorAll('.page').forEach(function(p) {
    p.classList.remove('active');
  });
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

function openRFO() {
  document.getElementById('rfo-frame').src = 'rfo/index.html';
  showPage('pg-rfo');
}

function openTLList() {
  renderList();
  showPage('pg-tl-list');
}
