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
function renderNoteBoard() {
  var grid = document.getElementById('notes-grid');
  if (!grid) return;

  /* remove existing demand notes */
  grid.querySelectorAll('.note-demand').forEach(function(n) { n.remove(); });

  var all  = dmdGetAll();
  var now  = Date.now();

  all.forEach(function(d, i) {
    var p          = PRIO[d.priority] || PRIO.baixa;
    var noDeadline = d.duration == null;
    var rem        = 0, tc, timerText;
    if (noDeadline) {
      tc = p.bar;
      timerText = 'Sem prazo';
    } else {
      var elapsed = Math.floor((now - new Date(d.createdAt).getTime()) / 1000);
      rem = Math.max(0, d.duration - elapsed);
      tc  = rem <= 0 ? '#aeaeb2' : (rem < 1800 ? '#dc2626' : p.bar);
      timerText = fmtCountdown(rem);
    }

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
      +       timerText
      +     '</span>'
      +     '<span class="note-chevron">'
      +       '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
      +     '</span>'
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
    if (!el || d.duration == null) return;
    var elapsed = Math.floor((now - new Date(d.createdAt).getTime()) / 1000);
    var rem     = Math.max(0, d.duration - elapsed);
    var p       = PRIO[d.priority] || PRIO.baixa;
    el.textContent  = fmtCountdown(rem);
    el.style.color  = rem <= 0 ? '#aeaeb2' : (rem < 1800 ? '#dc2626' : p.bar);
  });
}
