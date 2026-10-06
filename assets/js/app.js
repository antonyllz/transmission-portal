/* ═══════════════════════════════
   APP — bootstrap & init
   ═══════════════════════════════ */

document.addEventListener('DOMContentLoaded', function() {

  /* ── Logo → home ── */
  var logo = document.getElementById('tb-logo');
  if (logo) logo.addEventListener('click', function() { showPage('pg-home'); });

  /* ── Initial renders ── */
  dbSync().then(function() {
    updateBadge();
    updateRmaToolCount();
    updateLmbToolCount();
    almInitCount();
    renderNoteBoardWithSkeleton();
    if (routeCurrentPath()) routeFromHash();
    dbStartPolling(8000);
  });

  /* ── Profile & settings ── */
  initProfile();

  /* ── Initial animations ── */
  animateLogo();
  homeInit();
  almInit();
  leoInitSetup();
  animateHero();
  animateClientCards();
  bindRipples();

  /* ── Tick every second ── */
  setInterval(function() {
    tickNoteTimers();
    if (notifOpen) tickNotifDemandTimers();
  }, 1000);

  /* ── Override notif panel renders to use skeleton versions ── */
  var _origToggle = toggleNotif;
  toggleNotif = function(e) {
    e.stopPropagation();
    if (notifOpen) { closeNotif(); return; }
    var bell = document.getElementById('notif-bell');
    bell.classList.remove('bell-ring');
    void bell.offsetWidth;
    bell.classList.add('bell-ring');
    bell.addEventListener('animationend', function() { bell.classList.remove('bell-ring'); }, { once: true });
    renderNotifDemands();
    renderNotifListWithSkeleton();
    document.getElementById('notif-panel').classList.add('open');
    document.getElementById('notif-backdrop').classList.add('open');
    notifOpen = true;
  };

});

/* ── Refresh visible UI when polling picks up changes from other users ── */
function onDbExternalUpdate() {
  updateBadge();
  var home = document.getElementById('pg-home');
  if (home && home.classList.contains('active')) renderNoteBoard();
  var tlList = document.getElementById('pg-tl-list');
  if (tlList && tlList.classList.contains('active')) renderList();
  rmaExternalRefresh();
  lmbExternalRefresh();
  if (typeof notifOpen !== 'undefined' && notifOpen) { renderNotifDemands(); renderNotifList(); }
}
