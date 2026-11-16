/* ═══════════════════════════════
   NOTIFICATIONS
   ═══════════════════════════════ */

var notifOpen = false;

/* ── BADGE ── */
function updateBadge() {
  var badge = document.getElementById('notif-badge');
  if (!badge) return;
  var n = dbGetAll().length + xcUnread().length;
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
  renderNotifXc();
  xcClearToasts();
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
  var BARS = { urgente: '#dc2626', media: '#ea580c', baixa: '#2563eb', sempre: '#7c3aed' };
  var LBLS = { urgente: 'Urgente', media: 'M\u00e9dia', baixa: 'Baixa', sempre: 'Sem prazo' };

  if (!all.length) { if (sec) sec.style.display = 'none'; return; }
  if (sec) sec.style.display = '';

  var h = '';
  all.forEach(function(d, i) {
    var bar = BARS[d.priority] || '#0649fc';
    var lbl = LBLS[d.priority] || d.priority;
    var tc, timerText;
    if (d.duration == null) {
      tc = bar;
      timerText = 'Sem prazo';
    } else {
      var elapsed = Math.floor((now - new Date(d.createdAt).getTime()) / 1000);
      var rem     = Math.max(0, d.duration - elapsed);
      tc = rem <= 0 ? '#aeaeb2' : (rem < 1800 ? '#dc2626' : bar);
      timerText = fmtCountdown(rem);
    }

    h += '<div class="notif-demand-item" style="animation-delay:' + (i * 0.05) + 's">'
       + '<div class="nd-bar" style="background:' + bar + '"></div>'
       + '<div class="nd-info">'
       +   '<div class="nd-desc">' + esc(d.description) + '</div>'
       +   '<div class="nd-meta">' + lbl + '</div>'
       + '</div>'
       + '<span class="nd-timer" id="nd-timer-' + esc(d.id) + '" style="color:' + tc + '">'
       +   timerText
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
  var BARS = { urgente: '#dc2626', media: '#ea580c', baixa: '#2563eb', sempre: '#7c3aed' };
  all.forEach(function(d) {
    var el = document.getElementById('nd-timer-' + d.id);
    if (!el || d.duration == null) return;
    var elapsed = Math.floor((now - new Date(d.createdAt).getTime()) / 1000);
    var rem     = Math.max(0, d.duration - elapsed);
    el.textContent = fmtCountdown(rem);
    var bar        = BARS[d.priority] || '#0649fc';
    el.style.color = rem <= 0 ? '#aeaeb2' : (rem < 1800 ? '#dc2626' : bar);
  });
}

/* ═══════════════════════════════
   NETWORK ALERTS — every 20 s the portal asks the server for every network
   transition it knows (GET /api/notify/feed: trechos, DWDM Padtec, infra Padtec,
   Amazon Leo, cross-connect) and announces the new ones: toast on screen, item
   under the bell, a short sound and, if enabled in Settings, the operating
   system's notification (Windows / desktop).
   Seen / unread ids live in localStorage (per browser).
   ═══════════════════════════════ */
var XC_POLL_MS = 20000;
var XC_KEEP = 800;
var xcEvents = [];          /* last 24 h, newest first (from the server) */
var NOTIFY_KINDS = {
  trechos: 'Trechos',
  dwdm:    'DWDM Padtec',
  padtec:  'Infra Padtec',
  leo:     'Amazon Leo',
  xc:      'Cross-connect'
};

function _xcLoad(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch(e) { return null; } }
function _xcStore(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) { /* private mode */ } }
function xcUnread() { return _xcLoad('net_ntf_unread') || []; }

/* "16/11 14:05:12 UTC-3" in the zone chosen in Settings */
function xcFmt(iso) {
  var tz = typeof portalTz === 'function' ? portalTz() : 'UTC-3';
  var d = new Date(Date.parse(iso) - (tz === 'UTC' ? 0 : 3 * 3600000));
  var p = function(n) { return String(n).padStart(2, '0'); };
  return p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds()) + ' ' + tz;
}
function xcDur(ms) {
  if (ms == null) return '';
  var s = Math.round(ms / 1000);
  return s < 60 ? s + ' s' : s < 3600 ? Math.floor(s / 60) + ' min ' + (s % 60) + ' s' : Math.floor(s / 3600) + ' h ' + Math.floor(s % 3600 / 60) + ' min';
}
function xcText(e) {
  return {
    title: e.title,
    body: e.body + (e.kind === 'xc' && e.level === 'up' && e.dur != null ? ' (após ' + xcDur(e.dur) + ')' : ''),
    when: xcFmt(e.at),
    kind: NOTIFY_KINDS[e.kind] || e.kind
  };
}
function xcKindOn(st, kind) { return !st.notifyKinds || st.notifyKinds[kind] !== false; }

/* short two-tone beep (down: low, up: high) — Web Audio, no file */
var _xcAudio = null;
function xcBeep(level) {
  try {
    _xcAudio = _xcAudio || new (window.AudioContext || window.webkitAudioContext)();
    var ctx = _xcAudio, t0 = ctx.currentTime;
    var notes = level === 'up' ? [660, 880] : level === 'down' ? [880, 520] : [740, 740];
    notes.forEach(function(f, i) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + i * 0.16);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + i * 0.16 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.16 + 0.15);
      o.connect(g); g.connect(ctx.destination);
      o.start(t0 + i * 0.16); o.stop(t0 + i * 0.16 + 0.16);
    });
  } catch(e) { /* no audio */ }
}

function xcDesktop(title, body, tag, sticky, onclick) {
  try {
    var n = new Notification(title, { body: body, tag: tag, icon: 'assets/images/favicon.svg', requireInteraction: !!sticky });
    n.onclick = function() { window.focus(); if (onclick) onclick(); n.close(); };
  } catch(err) { /* some browsers only allow it from a service worker */ }
}

function xcPoll() {
  if (typeof _apiGet !== 'function') return;
  _apiGet('/notify/feed?hours=24').then(function(d) {
    xcEvents = (d && d.events) || [];
    var seen = _xcLoad('net_ntf_seen');
    var first = !seen;                                     /* first visit: don't announce the past */
    seen = seen || [];
    var fresh = xcEvents.filter(function(e) { return seen.indexOf(e.id) < 0; });
    if (!fresh.length && !first) { if (notifOpen) renderNotifXc(); return; }
    _xcStore('net_ntf_seen', fresh.map(function(e) { return e.id; }).concat(seen).slice(0, XC_KEEP));
    if (first) { if (notifOpen) renderNotifXc(); return; }
    var st = typeof settingsGet === 'function' ? settingsGet() : { notify: true };
    fresh = fresh.filter(function(e) { return xcKindOn(st, e.kind); });
    if (!fresh.length) return;
    _xcStore('net_ntf_unread', fresh.map(function(e) { return e.id; }).concat(xcUnread()).slice(0, XC_KEEP));
    updateBadge();
    if (notifOpen) renderNotifXc();
    if (!st.notify) return;
    /* oldest first, so the newest ends on top of the stack */
    var show = fresh.slice(0, 4).reverse();
    show.forEach(function(e, i) { setTimeout(function() { xcToast(e); }, i * 350); });
    if (fresh.length > 4) setTimeout(function() { xcToast(null, fresh.length - 4); }, show.length * 350);
    var bell = document.getElementById('notif-bell');
    if (bell) { bell.classList.remove('bell-ring'); void bell.offsetWidth; bell.classList.add('bell-ring'); }
    var worst = fresh.some(function(e) { return e.level === 'down'; }) ? 'down' : fresh.some(function(e) { return e.level !== 'up'; }) ? 'warn' : 'up';
    if (st.notifySound !== false) xcBeep(worst);
    if (st.notifyDesktop && 'Notification' in window && Notification.permission === 'granted') {
      fresh.slice(0, 3).forEach(function(e) {
        var t = xcText(e);
        xcDesktop(t.title, t.body + '\n' + t.kind + ' · ' + t.when, e.id, e.level === 'down', function() { xcGo(e); });
      });
      if (fresh.length > 3) xcDesktop('+' + (fresh.length - 3) + ' eventos na rede', 'Abra o portal para ver todos', 'ntf-more', false, function() { xcGo(); });
    }
  }).catch(function() {});
}

/* on-screen toast (top right, under the top bar) */
function xcToast(e, more) {
  var host = document.getElementById('xc-toasts');
  if (!host) { host = document.createElement('div'); host.id = 'xc-toasts'; host.className = 'xc-toasts'; document.body.appendChild(host); }
  var el = document.createElement('div');
  if (!e) {
    el.className = 'xc-toast more';
    el.innerHTML = '<div class="xc-t-body"><b>+' + more + ' eventos</b><span>Veja no sino de notificações</span></div>';
  } else {
    var t = xcText(e);
    el.className = 'xc-toast ' + e.level;
    el.innerHTML = '<i class="xc-t-dot"></i><div class="xc-t-body"><em>' + esc(t.kind) + '</em><b>' + esc(t.title) + '</b><span>' + esc(t.body) + '</span><small>' + esc(t.when) + '</small></div>'
      + '<button class="xc-t-x" aria-label="Fechar">&times;</button>';
  }
  var close = function() { el.classList.add('out'); setTimeout(function() { el.remove(); }, 260); };
  el.addEventListener('click', function(ev) { if (ev.target.closest('.xc-t-x')) { close(); return; } close(); xcGo(e); });
  host.appendChild(el);
  setTimeout(close, e && e.level === 'down' ? 30000 : 12000);
}

function xcClearToasts() {
  document.querySelectorAll('.xc-toast').forEach(function(t) { t.classList.add('out'); setTimeout(function() { t.remove(); }, 260); });
}

/* open where the event is shown: the Amazon Leo dashboard, or the network events on the home page */
function xcGo(e) {
  closeNotif();
  if (e && e.route === 'amazon-leo/dashboard') {
    var pg = document.getElementById('pg-leo-dash');
    if (!pg || !pg.classList.contains('active')) { if (typeof openLeoDash === 'function') openLeoDash(); }
    if (e.kind === 'xc') setTimeout(function() { var el = document.querySelector('.ldb-path-slot'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 400);
    return;
  }
  if (typeof showPage === 'function') showPage('pg-home');
  setTimeout(function() { var el = document.getElementById('events-root'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 300);
}

/* panel section */
function renderNotifXc() {
  var sec = document.getElementById('notif-xc-section'), list = document.getElementById('notif-xc-list');
  if (!sec || !list) return;
  var unread = xcUnread();
  var st = typeof settingsGet === 'function' ? settingsGet() : {};
  var items = xcEvents.filter(function(e) { return xcKindOn(st, e.kind); }).slice(0, 30);
  sec.style.display = items.length ? '' : 'none';
  list.innerHTML = items.map(function(e, i) {
    var t = xcText(e);
    return '<div class="notif-item xc-item' + (unread.indexOf(e.id) >= 0 ? ' unread' : '') + '" data-i="' + xcEvents.indexOf(e) + '" onclick="xcGo(xcEvents[this.dataset.i])" style="animation-delay:' + Math.min(i, 10) * 0.04 + 's">'
      + '<span class="notif-dot xc-' + e.level + '"></span>'
      + '<div class="notif-info"><div class="notif-ticket">' + esc(t.title) + '</div>'
      + '<div class="notif-sub">' + esc(t.body) + '</div><div class="notif-sub">' + esc(t.kind) + ' · ' + esc(t.when) + '</div></div></div>';
  }).join('');
}
function xcMarkRead() {
  _xcStore('net_ntf_unread', []);
  updateBadge();
  renderNotifXc();
}

setTimeout(function() { xcPoll(); setInterval(xcPoll, XC_POLL_MS); }, 1500);
