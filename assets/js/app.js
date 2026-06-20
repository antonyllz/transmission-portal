/* ═══════════════════════════════
   APP — bootstrap & init
   ═══════════════════════════════ */

document.addEventListener('DOMContentLoaded', function() {

  /* ── Logo → home ── */
  var logo = document.getElementById('tb-logo');
  if (logo) logo.addEventListener('click', function() { showPage('pg-home'); });

  /* ── Initial renders ── */
  updateBadge();
  initClientSkeletons();
  renderNoteBoardWithSkeleton();

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
