/* ═══════════════════════════════
   SKELETON LOADING SYSTEM
   ═══════════════════════════════ */


function buildSkNotes(n) {
  var h = '';
  for (var i = 0; i < n; i++) {
    h += '<div class="sk-note" style="animation-delay:' + (i * 0.08) + 's">'
       +   '<div class="sk sk-stripe"></div>'
       +   '<div class="sk-note-body">'
       +     '<div class="sk sk-line-a"></div>'
       +     '<div class="sk sk-line-b"></div>'
       +     '<div class="sk sk-line-c"></div>'
       +     '<div class="sk sk-line-d"></div>'
       +   '</div>'
       + '</div>';
  }
  return h;
}

function buildSkNotifItems(n) {
  var h = '';
  for (var i = 0; i < n; i++) {
    h += '<div class="sk-notif-item">'
       +   '<div class="sk sk-dot"></div>'
       +   '<div class="sk-info">'
       +     '<div class="sk sk-line-a"></div>'
       +     '<div class="sk sk-line-b"></div>'
       +   '</div>'
       + '</div>';
  }
  return h;
}

/* ── CLIENT CARDS: skeleton → real ── */

/* ── NOTE BOARD: skeleton → real ── */
function renderNoteBoardWithSkeleton() {
  var grid = document.getElementById('notes-grid');
  if (!grid) { renderNoteBoard(); return; }

  grid.querySelectorAll('.note-demand').forEach(function(n) { n.remove(); });

  var skCount = Math.min(dmdGetAll().length, 3) || 2;
  var skWrap  = document.createElement('div');
  skWrap.id   = 'sk-notes-wrap';
  skWrap.style.cssText = 'display:contents';
  skWrap.innerHTML = buildSkNotes(skCount);
  grid.appendChild(skWrap);

  setTimeout(function() {
    var wrap = document.getElementById('sk-notes-wrap');
    if (wrap) wrap.remove();
    renderNoteBoard();
    grid.querySelectorAll('.note-demand').forEach(function(c, i) {
      c.classList.add('sk-reveal');
      c.style.animationDelay = (i * 0.07) + 's';
    });
  }, 500);
}

/* ── NOTIF LIST: skeleton → real ── */
function renderNotifListWithSkeleton() {
  var list = document.getElementById('notif-list');
  if (!list) { renderNotifList(); return; }
  list.innerHTML = buildSkNotifItems(3);
  setTimeout(function() {
    renderNotifList();
    list.querySelectorAll('.notif-item').forEach(function(item, i) {
      item.classList.add('sk-reveal');
      item.style.animationDelay = (i * 0.07) + 's';
    });
  }, 400);
}
