/* ═══════════════════════════════
   DEMANDS — note board
   ═══════════════════════════════ */

var PRIO = {
  urgente: { label: 'Urgente', dur: 6 * 3600,      bar: '#dc2626', cls: 'chip-urgent' },
  media:   { label: 'M\u00e9dia',  dur: 24 * 3600,     bar: '#ea580c', cls: 'chip-media'  },
  baixa:   { label: 'Baixa',   dur: 7 * 24 * 3600, bar: '#2563eb', cls: 'chip-baixa'  }
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
  renderDemandChips();
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
    card.style.animationDelay = (i * 0.06) + 's';
    card.innerHTML =
        '<div class="note-stripe" style="background:' + p.bar + '"></div>'
      + '<div class="note-body">'
      +   '<div class="note-prio-badge" style="color:' + p.bar + '">' + p.label + '</div>'
      +   '<div class="note-desc">' + esc(d.description) + '</div>'
      +   '<div class="note-footer">'
      +     '<span class="note-timer" id="ntimer-' + d.id + '" style="color:' + tc + '">'
      +       fmtCountdown(rem)
      +     '</span>'
      +     '<button class="note-del" data-id="' + esc(d.id) + '" onclick="deleteNote(this.dataset.id)" title="Remover">'
      +       '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">'
      +         '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'
      +       '</svg>'
      +     '</button>'
      +   '</div>'
      + '</div>';
    grid.appendChild(card);
  });
}

/* ── DELETE NOTE ── */
function deleteNote(id) {
  var cards = document.querySelectorAll('.note-demand');
  cards.forEach(function(c) {
    if (c.querySelector('[data-id="' + id + '"]')) {
      c.style.transition = 'opacity .22s ease, transform .22s ease';
      c.style.opacity    = '0';
      c.style.transform  = 'scale(.82)';
      setTimeout(function() {
        dmdSave(dmdGetAll().filter(function(d) { return d.id !== id; }));
        c.remove();
        renderDemandChips();
        if (typeof notifOpen !== 'undefined' && notifOpen) renderNotifDemands();
      }, 220);
    }
  });
}

/* ── TOPBAR CHIPS ── */
function buildChipSVG(pct, color) {
  var r = 8, circ = 2 * Math.PI * r;
  var dash = pct * circ, gap = circ - dash;
  return '<svg width="22" height="22" viewBox="0 0 22 22">'
    + '<circle cx="11" cy="11" r="' + r + '" stroke="rgba(255,255,255,.15)" stroke-width="2.5"/>'
    + '<circle cx="11" cy="11" r="' + r + '" stroke="' + color + '" stroke-width="2.5"'
    + ' stroke-dasharray="' + dash + ' ' + gap + '"'
    + ' stroke-linecap="round" transform="rotate(-90 11 11)"/>'
    + '</svg>';
}

function renderDemandChips() {
  var el = document.getElementById('tb-demands');
  if (!el) return;
  var all  = dmdGetAll();
  var now  = Date.now();
  var order = { urgente: 0, media: 1, baixa: 2 };

  var active = all.map(function(d) {
    var elapsed = Math.floor((now - new Date(d.createdAt).getTime()) / 1000);
    return { d: d, rem: Math.max(0, d.duration - elapsed) };
  }).sort(function(a, b) {
    return (order[a.d.priority] || 2) - (order[b.d.priority] || 2);
  });

  if (!active.length) { el.innerHTML = ''; return; }

  var h = '';
  active.slice(0, 2).forEach(function(item, i) {
    var p        = PRIO[item.d.priority] || PRIO.baixa;
    var pct      = item.rem <= 0 ? 0 : Math.min(1, item.rem / item.d.duration);
    var critical = item.rem > 0 && item.rem < 1800;
    var dotColor = item.rem <= 0 ? 'rgba(255,255,255,.3)' : critical ? '#fca5a5' : p.bar;
    var ringColor= item.rem <= 0 ? 'rgba(255,255,255,.2)' : critical ? '#fca5a5' : 'rgba(255,255,255,.7)';
    var anim     = 'animation:chip-in .35s cubic-bezier(.34,1.2,.64,1) ' + (i * 0.08) + 's both;';

    h += '<span class="demand-chip ' + p.cls + '" style="' + anim + '"'
       + ' data-pg="pg-home" onclick="showPage(this.dataset.pg)" title="' + esc(item.d.description) + '">'
       + '<span class="chip-dot" style="background:' + dotColor + '"></span>'
       + buildChipSVG(pct, ringColor)
       + '<span class="chip-time">' + fmtCountdown(item.rem) + '</span>'
       + '</span>';
  });
  if (active.length > 2) {
    h += '<span style="font-size:11px;color:rgba(255,255,255,.5);font-weight:700;padding:0 4px;">+' + (active.length - 2) + '</span>';
  }
  el.innerHTML = h;
}

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
  renderDemandChips();
}
