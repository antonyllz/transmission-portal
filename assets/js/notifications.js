/* ═══════════════════════════════
   NOTIFICATIONS
   ═══════════════════════════════ */

var notifOpen = false;

/* ── BADGE ── */
function updateBadge() {
  var badge = document.getElementById('notif-badge');
  if (!badge) return;
  var n = dbGetAll().length;
  badge.textContent = n > 9 ? '9+' : String(n);
  badge.className   = 'notif-badge' + (n > 0 ? ' visible' : '');
}

/* ── TOGGLE PANEL ── */
function toggleNotif(e) {
  e.stopPropagation();
  if (notifOpen) { closeNotif(); return; }

  /* ring animation */
  var bell = document.getElementById('notif-bell');
  bell.classList.remove('bell-ring');
  void bell.offsetWidth;
  bell.classList.add('bell-ring');
  bell.addEventListener('animationend', function() {
    bell.classList.remove('bell-ring');
  }, { once: true });

  renderNotifDemands();
  renderNotifList();
  document.getElementById('notif-panel').classList.add('open');
  document.getElementById('notif-backdrop').classList.add('open');
  notifOpen = true;
}

function closeNotif() {
  document.getElementById('notif-panel').classList.remove('open');
  document.getElementById('notif-backdrop').classList.remove('open');
  notifOpen = false;
}

/* ── DEMAND ITEMS ── */
function renderNotifDemands() {
  var el  = document.getElementById('notif-demands-list');
  var sec = document.getElementById('notif-demands-section');
  if (!el) return;

  var all = dmdGetAll();
  var now = Date.now();
  var BARS = { urgente: '#dc2626', media: '#ea580c', baixa: '#2563eb' };
  var LBLS = { urgente: 'Urgente', media: 'M\u00e9dia', baixa: 'Baixa' };

  if (!all.length) { if (sec) sec.style.display = 'none'; return; }
  if (sec) sec.style.display = '';

  var h = '';
  all.forEach(function(d, i) {
    var elapsed = Math.floor((now - new Date(d.createdAt).getTime()) / 1000);
    var rem     = Math.max(0, d.duration - elapsed);
    var bar     = BARS[d.priority] || '#0649fc';
    var tc      = rem <= 0 ? '#aeaeb2' : (rem < 1800 ? '#dc2626' : bar);
    var lbl     = LBLS[d.priority] || d.priority;

    h += '<div class="notif-demand-item" style="animation-delay:' + (i * 0.05) + 's">'
       + '<div class="nd-bar" style="background:' + bar + '"></div>'
       + '<div class="nd-info">'
       +   '<div class="nd-desc">' + esc(d.description) + '</div>'
       +   '<div class="nd-meta">' + lbl + '</div>'
       + '</div>'
       + '<span class="nd-timer" id="nd-timer-' + esc(d.id) + '" style="color:' + tc + '">'
       +   fmtCountdown(rem)
       + '</span>'
       + '<button class="nd-del" data-id="' + esc(d.id) + '" onclick="notifDelDemand(this.dataset.id)" title="Remover">'
       +   '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">'
       +     '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'
       +   '</svg>'
       + '</button>'
       + '</div>';
  });
  el.innerHTML = h;
}

function notifDelDemand(id) {
  deleteNote(id);
  setTimeout(function() { renderNotifDemands(); }, 250);
}

/* ── CASE ITEMS ── */
function renderNotifList() {
  var cases  = dbGetAll();
  var list   = document.getElementById('notif-list');
  var clrBtn = document.getElementById('notif-clear');
  if (!list) return;

  if (clrBtn) clrBtn.style.display = cases.length ? 'block' : 'none';

  if (!cases.length) {
    list.innerHTML = '<div class="notif-empty">'
      + '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" style="opacity:.3;display:block;margin:0 auto 10px">'
      + '<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>'
      + '<path d="M13.73 21a2 2 0 01-3.46 0"/>'
      + '</svg><p>No open cases</p></div>';
    return;
  }

  var DOTS = {
    'Indisponibilidade': '#ef5350', 'Flaps': '#ff9800',
    'Falha El\u00e9trica': '#f59e0b', 'Solicita\u00e7\u00e3o de RFO': '#0649fc'
  };
  var h = '';
  cases.forEach(function(c, i) {
    var dot = DOTS[c.cause] || '#aeaeb2';
    var ev  = (c.events || []).length;
    var cl  = c.circuit;
    (CIRCUITS[c.site] || []).forEach(function(x) { if (x.id === c.circuit) cl = x.label; });

    h += '<div class="notif-item" data-id="' + esc(c.ticketId) + '"'
       + ' onclick="notifGoCase(this)" style="animation-delay:' + (i * 0.05) + 's">'
       + '<span class="notif-dot" style="background:' + dot + '"></span>'
       + '<div class="notif-info">'
       +   '<div class="notif-ticket">#' + esc(c.ticketId) + ' &mdash; ' + esc(c.site) + '</div>'
       +   '<div class="notif-sub">' + esc(c.cause) + ' &bull; ' + ev + ' event' + (ev !== 1 ? 's' : '') + '</div>'
       + '</div>'
       + '<button class="notif-del" data-id="' + esc(c.ticketId) + '" onclick="notifDel(event,this)" title="Delete">'
       +   '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">'
       +     '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'
       +   '</svg>'
       + '</button>'
       + '</div>';
  });
  list.innerHTML = h;
}

function notifGoCase(el) {
  closeNotif();
  openTLList();
  openDetail(el.dataset.id);
}

function notifDel(e, btn) {
  e.stopPropagation();
  var item = btn.closest('.notif-item');
  item.style.transition = 'opacity .18s, transform .18s';
  item.style.opacity    = '0';
  item.style.transform  = 'translateX(14px)';
  setTimeout(function() {
    dbDelete(btn.dataset.id);
    renderNotifList();
  }, 180);
}

function notifClear() {
  if (!confirm('Delete all cases? This cannot be undone.')) return;
  dbSave([]);
  renderNotifList();
  updateBadge();
  closeNotif();
}

/* ── TICK DEMAND TIMERS IN PANEL ── */
function tickNotifDemandTimers() {
  var all = dmdGetAll();
  var now = Date.now();
  var BARS = { urgente: '#dc2626', media: '#ea580c', baixa: '#2563eb' };
  all.forEach(function(d) {
    var el = document.getElementById('nd-timer-' + d.id);
    if (!el) return;
    var elapsed = Math.floor((now - new Date(d.createdAt).getTime()) / 1000);
    var rem     = Math.max(0, d.duration - elapsed);
    el.textContent = fmtCountdown(rem);
    var bar        = BARS[d.priority] || '#0649fc';
    el.style.color = rem <= 0 ? '#aeaeb2' : (rem < 1800 ? '#dc2626' : bar);
  });
}
