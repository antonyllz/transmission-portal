/* ═══════════════════════════════
   DEMANDS — note board
   ═══════════════════════════════ */

var PRIO = {
  urgente: { label: 'Urgente', dur: 6 * 3600,      bar: '#dc2626' },
  media:   { label: 'M\u00e9dia',  dur: 24 * 3600,     bar: '#ea580c' },
  baixa:   { label: 'Baixa',   dur: 7 * 24 * 3600, bar: '#2563eb' }
};

var nadd_prio = 'urgente';

/* ── ADD NOTE CARD ── */
function expandAddNote() {
  var card = document.getElementById('note-add-card');
  if (card.classList.contains('expanded')) return;
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
    duration:    PRIO[nadd_prio].dur
  };
  var all = dmdGetAll();
  all.unshift(d);
  dmdSave(all);

  cancelAddNote(null);
  renderNoteBoard();
}

/* ── NOTE BOARD RENDER ── */
function renderNoteBoard() {
  var grid = document.getElementById('notes-grid');
  if (!grid) return;

  /* remove existing demand notes */
  grid.querySelectorAll('.note-demand').forEach(function(n) { n.remove(); });

  var all  = dmdGetAll();
  var now  = Date.now();

  all.forEach(function(d, i) {
    var p       = PRIO[d.priority] || PRIO.baixa;
    var elapsed = Math.floor((now - new Date(d.createdAt).getTime()) / 1000);
    var rem     = Math.max(0, d.duration - elapsed);
    var tc      = rem <= 0 ? '#aeaeb2' : (rem < 1800 ? '#dc2626' : p.bar);

    var card = document.createElement('div');
    card.className = 'note-card note-demand note-pop';
    card.dataset.id = d.id;
    card.style.animationDelay = (i * 0.06) + 's';
    card.onclick = function() { card.classList.toggle('expanded'); };
    card.innerHTML =
        '<div class="note-stripe" style="background:' + p.bar + '"></div>'
      + '<div class="note-body">'
      +   '<div class="note-prio-badge" style="color:' + p.bar + '">' + p.label + '</div>'
      +   '<div class="note-desc">' + esc(d.description) + '</div>'
      +   '<div class="note-footer">'
      +     '<span class="note-timer" id="ntimer-' + d.id + '" style="color:' + tc + '">'
      +       fmtCountdown(rem)
      +     '</span>'
      +     '<span class="note-chevron">'
      +       '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
      +     '</span>'
      +   '</div>'
      +   '<div class="note-actions">'
      +     '<button class="note-act note-act-done" data-id="' + esc(d.id) + '" onclick="event.stopPropagation(); finishDemand(this.dataset.id)">'
      +       '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
      +       'Demanda finalizada'
      +     '</button>'
      +     '<button class="note-act note-act-del" data-id="' + esc(d.id) + '" onclick="event.stopPropagation(); deleteNote(this.dataset.id)">'
      +       '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      +       'Excluir demanda'
      +     '</button>'
      +   '</div>'
      + '</div>';
    grid.appendChild(card);
  });
}

/* ── REMOVE / FINISH NOTE ── */
function dmdRemove(id, done) {
  var card   = document.querySelector('.note-demand[data-id="' + id + '"]');
  var commit = function() {
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
  var now = Date.now();
  all.forEach(function(d) {
    var el = document.getElementById('ntimer-' + d.id);
    if (!el) return;
    var elapsed = Math.floor((now - new Date(d.createdAt).getTime()) / 1000);
    var rem     = Math.max(0, d.duration - elapsed);
    var p       = PRIO[d.priority] || PRIO.baixa;
    el.textContent  = fmtCountdown(rem);
    el.style.color  = rem <= 0 ? '#aeaeb2' : (rem < 1800 ? '#dc2626' : p.bar);
  });
}
