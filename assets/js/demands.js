/* ═══════════════════════════════
   DEMANDS — note board
   ═══════════════════════════════ */

var PRIO = {
  urgente: { label: 'Urgente',   dur: 6 * 3600,      bar: '#dc2626' },
  media:   { label: 'M\u00e9dia', dur: 24 * 3600,     bar: '#ea580c' },
  baixa:   { label: 'Baixa',     dur: 7 * 24 * 3600, bar: '#2563eb' },
  sempre:  { label: 'Sem prazo', dur: null,          bar: '#7c3aed' }
};

var nadd_prio = 'urgente';

/* ── ADD NOTE CARD ── */
function expandAddNote() {
  var card = document.getElementById('note-add-card');
  if (card.classList.contains('expanded')) { cancelAddNote(null); return; }
  card.classList.add('expanded');
  card.onclick = null;
  requestAnimationFrame(function() {
    var ta = document.getElementById('nadd-text');
    if (ta) ta.focus();
  });
}

function cancelAddNote(e) {
  if (e) e.stopPropagation();
  var card = document.getElementById('note-add-card');
  card.classList.remove('expanded');
  card.onclick = expandAddNote;
  document.getElementById('nadd-text').value = '';
  nadd_prio = 'urgente';
  document.querySelectorAll('.nadd-pill').forEach(function(p) { p.classList.remove('sel'); });
  var urgEl = document.querySelector('.nadd-pill.urg');
  if (urgEl) urgEl.classList.add('sel');
}

function nadd_pickPrio(el) {
  nadd_prio = el.dataset.p;
  document.querySelectorAll('.nadd-pill').forEach(function(p) { p.classList.remove('sel'); });
  el.classList.add('sel');
}

function saveNoteAdd(e) {
  e.stopPropagation();
  var ta   = document.getElementById('nadd-text');
  var desc = ta.value.trim();

  if (!desc) {
    ta.classList.add('shake');
    ta.style.borderColor = '#dc2626';
    setTimeout(function() {
      ta.classList.remove('shake');
      ta.style.borderColor = '';
    }, 500);
    ta.focus();
    return;
  }

  /* ripple on save button */
  var btn  = e.currentTarget;
  var r    = document.createElement('span');
  r.className = 'ripple';
  var rect = btn.getBoundingClientRect();
  var sz   = Math.max(rect.width, rect.height) * 2;
  r.style.cssText = 'position:absolute;border-radius:50%;background:rgba(255,255,255,.35);'
    + 'width:' + sz + 'px;height:' + sz + 'px;'
    + 'left:' + (e.clientX - rect.left - sz / 2) + 'px;'
    + 'top:'  + (e.clientY - rect.top  - sz / 2) + 'px;'
    + 'transform:scale(0);animation:ripple-out .5s ease-out forwards;pointer-events:none;';
  btn.appendChild(r);
  setTimeout(function() { r.remove(); }, 500);

  var d = {
    id: String(Date.now()),
    description: desc,
    priority:    nadd_prio,
    createdAt:   new Date().toISOString(),
    duration:    PRIO[nadd_prio].dur,
    comments:    []
  };
  var all = dmdGetAll();
  all.unshift(d);
  dmdSave(all);

  cancelAddNote(null);
  renderNoteBoard();
}

/* ── NOTE BOARD RENDER ── */
var dmdExpanded = {};   /* id -> true: stays open across re-renders (polling) */
var dmdFilter   = 'all';

var DMD_FILTERS = {
  all:    { label: 'Todas',     test: function() { return true; } },
  urgent: { label: 'Urgentes',  test: function(d) { return d.priority === 'urgente'; } },
  due:    { label: 'Vencendo',  test: function(d) { var c = dmdState(d).cls; return c === 'soon' || c === 'late'; } },
  free:   { label: 'Sem prazo', test: function(d) { return d.duration == null; } }
};

function dmdSetFilter(k) { dmdFilter = k; renderNoteBoard(); }

/* panel header: one-line summary + filter chips with counts */
function renderDmdHeader(all) {
  var sum = document.getElementById('dmd-sum'), fl = document.getElementById('dmd-filters');
  if (!sum || !fl) return;
  var late = all.filter(function(d) { return dmdState(d).cls === 'late'; }).length;
  var soon = all.filter(function(d) { return dmdState(d).cls === 'soon'; }).length;
  var parts = [all.length + (all.length === 1 ? ' aberta' : ' abertas')];
  if (soon) parts.push('<span class="s-soon">' + soon + ' vencendo</span>');
  if (late) parts.push('<span class="s-late">' + late + (late === 1 ? ' expirada' : ' expiradas') + '</span>');
  sum.innerHTML = parts.join(' \u00b7 ');
  fl.innerHTML = Object.keys(DMD_FILTERS).map(function(k) {
    var n = all.filter(DMD_FILTERS[k].test).length;
    return '<button class="' + (dmdFilter === k ? 'sel' : '') + '" onclick="event.stopPropagation(); dmdSetFilter(\'' + k + '\')">'
      + DMD_FILTERS[k].label + '<b>' + n + '</b></button>';
  }).join('');
}

var DMD_ICON = {
  clock:  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
  inf:    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.2 8.5a4.9 4.9 0 110 7c-2.4-2.4-3.7-4.6-6.2-7a4.9 4.9 0 100 7c2.5-2.4 3.8-4.6 6.2-7z"/></svg>',
  chat:   '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
  chev:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
};

function dmdAge(iso) {
  var m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1)  return 'agora';
  if (m < 60) return 'h\u00e1 ' + m + ' min';
  var h = Math.floor(m / 60);
  if (h < 24) return 'h\u00e1 ' + h + 'h';
  var d = Math.floor(h / 24);
  return 'h\u00e1 ' + d + (d === 1 ? ' dia' : ' dias');
}

/* time state of a demand: remaining seconds, share of the deadline used, color, label */
function dmdState(d) {
  var p = PRIO[d.priority] || PRIO.baixa;
  if (d.duration == null) return { p: p, open: true, pct: 0, color: p.bar, text: 'Sem prazo', cls: 'free' };
  var elapsed = Math.floor((Date.now() - new Date(d.createdAt).getTime()) / 1000);
  var rem = Math.max(0, d.duration - elapsed), pct = Math.min(100, elapsed / d.duration * 100);
  if (rem <= 0) return { p: p, pct: 100, color: '#dc2626', text: 'Expirado', cls: 'late' };
  return { p: p, pct: pct, color: rem < 1800 ? '#dc2626' : p.bar, text: fmtCountdown(rem), cls: rem < 1800 ? 'soon' : '' };
}

function renderNoteBoard() {
  var grid = document.getElementById('notes-grid');
  if (!grid) return;

  /* don't wipe a comment being typed */
  var act = document.activeElement;
  if (act && act.classList && act.classList.contains('note-comment-input') && act.value) return;

  grid.querySelectorAll('.note-demand').forEach(function(n) { n.remove(); });

  var all = dmdGetAll(), shown = all.filter(DMD_FILTERS[dmdFilter].test);
  renderDmdHeader(all);
  var empty = document.getElementById('dmd-empty');
  if (empty) {
    empty.style.display = shown.length ? 'none' : '';
    empty.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>'
      + '<b>' + (all.length ? 'Nada neste filtro' : 'Tudo em dia') + '</b>'
      + '<span>' + (all.length ? 'Nenhuma demanda ' + DMD_FILTERS[dmdFilter].label.toLowerCase() + ' agora.' : 'Nenhuma demanda aberta. Use \u201c+ Nova\u201d para registrar.') + '</span>';
  }

  shown.forEach(function(d, i) {
    var st = dmdState(d), nc = (d.comments || []).length;
    var card = document.createElement('div');
    card.className = 'note-card note-demand note-pop ' + st.cls + (dmdExpanded[d.id] ? ' expanded' : '');
    card.dataset.id = d.id;
    card.style.setProperty('--pc', st.p.bar);
    card.style.animationDelay = (i * 0.06) + 's';
    card.onclick = function() {
      card.classList.toggle('expanded');
      if (card.classList.contains('expanded')) dmdExpanded[d.id] = true; else delete dmdExpanded[d.id];
    };
    card.innerHTML =
        '<div class="note-body">'
      +   '<div class="note-top">'
      +     '<span class="note-prio"><i></i>' + st.p.label + '</span>'
      +     '<span class="note-timer" id="ntimer-' + d.id + '">'
      +       (st.cls === 'free' ? DMD_ICON.inf : DMD_ICON.clock) + '<b>' + st.text + '</b>'
      +     '</span>'
      +   '</div>'
      +   '<div class="note-desc">' + esc(d.description) + '</div>'
      +   '<div class="note-track' + (st.cls === 'free' ? ' free' : '') + '"><span id="nbar-' + d.id + '" style="width:' + st.pct.toFixed(1) + '%"></span></div>'
      +   '<div class="note-footer">'
      +     '<span class="note-meta">Criada ' + dmdAge(d.createdAt)
      +       (nc ? '<span class="note-cc">' + DMD_ICON.chat + nc + '</span>' : '') + '</span>'
      +     '<span class="note-chevron">' + DMD_ICON.chev + '</span>'
      +   '</div>'
      +   '<div class="note-actions">'
      +     '<div class="note-comments" onclick="event.stopPropagation()">'
      +       '<div class="note-comments-list" id="ncomments-' + d.id + '">' + buildCommentsHtml(d.comments) + '</div>'
      +       '<div class="note-comment-add">'
      +         '<input type="text" class="note-comment-input" id="ncinput-' + d.id + '" placeholder="Comentar..." '
      +           'onkeydown="if(event.key===\'Enter\'){addComment(\'' + d.id + '\')}" />'
      +         '<button class="note-comment-send" onclick="addComment(\'' + d.id + '\')" aria-label="Comentar">'
      +           '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>'
      +         '</button>'
      +       '</div>'
      +     '</div>'
      +     '<div class="note-act-row">'
      +       '<button class="note-act note-act-done" data-id="' + esc(d.id) + '" onclick="event.stopPropagation(); finishDemand(this.dataset.id)">'
      +         '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
      +         'Finalizar'
      +       '</button>'
      +       '<button class="note-act note-act-del" data-id="' + esc(d.id) + '" onclick="event.stopPropagation(); deleteNote(this.dataset.id)" aria-label="Excluir demanda" title="Excluir demanda">'
      +         '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>'
      +       '</button>'
      +     '</div>'
      +   '</div>'
      + '</div>';
    grid.appendChild(card);
  });
}

/* ── COMMENTS ── */
function buildCommentsHtml(comments) {
  if (!comments || !comments.length) {
    return '<div class="note-comments-empty">Sem coment\u00e1rios ainda</div>';
  }
  return comments.map(function(c) {
    var dt = new Date(c.at);
    var time = pad(dt.getHours()) + ':' + pad(dt.getMinutes());
    return '<div class="note-comment">'
      + '<span class="note-comment-time">' + time + '</span>'
      + '<span class="note-comment-text">' + esc(c.text) + '</span>'
      + '</div>';
  }).join('');
}

function addComment(id) {
  var input = document.getElementById('ncinput-' + id);
  if (!input) return;
  var text = input.value.trim();
  if (!text) return;

  var all = dmdGetAll();
  var d = all.find(function(x) { return x.id === id; });
  if (!d) return;
  if (!d.comments) d.comments = [];
  d.comments.push({ text: text, at: new Date().toISOString() });
  dmdSave(all);

  input.value = '';
  var cardEl = document.querySelector('.note-demand[data-id="' + id + '"] .note-meta');
  if (cardEl) {
    var cc = cardEl.querySelector('.note-cc');
    if (!cc) { cc = document.createElement('span'); cc.className = 'note-cc'; cardEl.appendChild(cc); }
    cc.innerHTML = DMD_ICON.chat + d.comments.length;
  }
  var list = document.getElementById('ncomments-' + id);
  if (list) {
    list.innerHTML = buildCommentsHtml(d.comments);
    list.scrollTop = list.scrollHeight;
  }
}

/* ── REMOVE / FINISH NOTE ── */
function dmdRemove(id, done) {
  var card   = document.querySelector('.note-demand[data-id="' + id + '"]');
  var commit = function() {
    delete dmdExpanded[id];
    dmdSave(dmdGetAll().filter(function(d) { return d.id !== id; }));
    if (card) card.remove();
    if (typeof notifOpen !== 'undefined' && notifOpen) renderNotifDemands();
  };
  if (!card) { commit(); return; }

  if (done) {
    var ov = document.createElement('div');
    ov.className = 'note-done-overlay';
    ov.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" '
      + 'stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    card.appendChild(ov);
    setTimeout(function() { card.classList.add('note-removing'); }, 520);
    setTimeout(commit, 760);
  } else {
    card.classList.add('note-removing');
    setTimeout(commit, 240);
  }
}
function deleteNote(id)   { dmdRemove(id, false); }
function finishDemand(id) { dmdRemove(id, true); }

/* ── TICK DEMAND TIMERS ── */
function tickNoteTimers() {
  var all = dmdGetAll();
  if (all.some(function(d) { var c = dmdState(d).cls; return c === 'soon' || c === 'late'; })) renderDmdHeader(all);
  all.forEach(function(d) {
    if (d.duration == null) return;
    var el = document.getElementById('ntimer-' + d.id);
    if (!el) return;
    var st = dmdState(d), b = el.querySelector('b'), bar = document.getElementById('nbar-' + d.id);
    if (b) b.textContent = st.text;
    if (bar) bar.style.width = st.pct.toFixed(1) + '%';
    var card = el.closest('.note-demand');
    if (card) { card.classList.toggle('soon', st.cls === 'soon'); card.classList.toggle('late', st.cls === 'late'); }
  });
}
