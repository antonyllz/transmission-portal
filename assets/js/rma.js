/* ═══════════════════════════════
   RMAS — equipment returns
   ═══════════════════════════════ */

var RMA_STATUS = {
  aberto:     { label: 'Aberto',     color: '#ea580c', bg: '#fff7ed' },
  enviado:    { label: 'Enviado',    color: '#2563eb', bg: '#eff6ff' },
  reparo:     { label: 'Em reparo',  color: '#7c3aed', bg: '#f5f3ff' },
  finalizado: { label: 'Finalizado', color: '#16a34a', bg: '#e7f7ed' }
};

var rmaFilter   = 'open';   /* open | done | all */
var rmaQuery    = '';
var rmaEditId   = null;     /* id being edited in the form, null = new */
var rmaExpanded = {};       /* id -> true, survives re-renders */

function rmaIsOpen(r) { return r.status !== 'finalizado'; }

/* ── OPEN PAGE ── */
function openRMA() {
  renderRmaList();
  showPage('pg-rma');
}

/* ── PARSE PASTED TEXT ──
   Understands the supplier confirmation text
   ("A #RMA-554225 foi registrada com sucesso ... Equipamento: X EAN: Y Número de Série: Z Nota Fiscal: W")
   and the short spreadsheet formats ("#RMA-561644<TAB>Equipamento<TAB>Série" / "#RMA-561979 - Equipamento"). */
function rmaParse(text) {
  var out = {};
  if (!text) return out;
  var t = String(text).replace(/\r/g, '');

  var m = t.match(/RMA[\s#:-]*(\d{3,})/i);
  if (m) out.rma = m[1];

  m = t.match(/Data de abertura:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  if (m) out.openedAt = m[3] + '-' + m[2] + '-' + m[1];

  m = t.match(/Equipamento:\s*([\s\S]+?)(?=\s+EAN:|\s+N[úu]mero de S[ée]rie:|\s+Nota Fiscal:|\n|$)/i);
  if (m) out.equipment = m[1].trim();

  m = t.match(/EAN:\s*(\d+)/i);
  if (m) out.ean = m[1];

  m = t.match(/N[úu]mero de S[ée]rie:\s*(\S+)/i);
  if (m) out.serial = m[1];

  m = t.match(/Nota Fiscal:\s*(\S+)/i);
  if (m) out.invoice = m[1];

  if (!out.equipment) {
    var line = t.split('\n').filter(function(l) { return /RMA/i.test(l); })[0] || t.split('\n')[0];
    if (line.indexOf('\t') >= 0) {
      var cols = line.split('\t').map(function(c) { return c.trim(); }).filter(Boolean);
      if (cols[1]) out.equipment = cols[1];
      if (cols[2] && !out.serial) out.serial = cols[2];
    } else {
      var rest = line.replace(/^.*?RMA[\s#:-]*\d+\s*[-–:]?\s*/i, '').trim();
      if (rest) out.equipment = rest;
    }
  }
  return out;
}

/* ── FORM ── */
function rmaFormOpen(id) {
  rmaEditId = id || null;
  var r = id ? rmaGetAll().find(function(x) { return x.id === id; }) : null;
  document.getElementById('rma-form-title').textContent = r ? 'Editar RMA' : 'Novo RMA';
  document.getElementById('rma-paste').value     = '';
  document.getElementById('rma-f-num').value     = r ? r.rma : '';
  document.getElementById('rma-f-equip').value   = r ? r.equipment : '';
  document.getElementById('rma-f-serial').value  = r ? (r.serial || '') : '';
  document.getElementById('rma-f-invoice').value = r ? (r.invoice || '') : '';
  document.getElementById('rma-f-ean').value     = r ? (r.ean || '') : '';
  document.getElementById('rma-f-date').value    = r ? (r.openedAt || '') : new Date().toISOString().slice(0, 10);
  document.getElementById('rma-f-notes').value   = r ? (r.notes || '') : '';
  document.getElementById('rma-paste-wrap').style.display = r ? 'none' : '';
  var card = document.getElementById('rma-form');
  card.classList.add('open');
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  requestAnimationFrame(function() {
    document.getElementById(r ? 'rma-f-equip' : 'rma-paste').focus();
  });
}

function rmaFormClose() {
  rmaEditId = null;
  document.getElementById('rma-form').classList.remove('open');
}

function rmaPasteChanged() {
  var p = rmaParse(document.getElementById('rma-paste').value);
  var map = { rma: 'rma-f-num', equipment: 'rma-f-equip', serial: 'rma-f-serial',
              invoice: 'rma-f-invoice', ean: 'rma-f-ean', openedAt: 'rma-f-date' };
  Object.keys(map).forEach(function(k) {
    if (p[k]) {
      var el = document.getElementById(map[k]);
      el.value = p[k];
      el.classList.remove('rma-filled');
      void el.offsetWidth;
      el.classList.add('rma-filled');
    }
  });
}

function rmaShake(el) {
  el.classList.add('shake');
  el.style.borderColor = '#dc2626';
  setTimeout(function() { el.classList.remove('shake'); el.style.borderColor = ''; }, 500);
  el.focus();
}

function rmaFormSave() {
  var numEl   = document.getElementById('rma-f-num');
  var equipEl = document.getElementById('rma-f-equip');
  var num     = numEl.value.replace(/^\s*#?\s*RMA[\s#:-]*/i, '').trim();
  var equip   = equipEl.value.trim();
  if (!num)   { rmaShake(numEl);   return; }
  if (!equip) { rmaShake(equipEl); return; }

  var all = rmaGetAll().slice();
  var dup = all.find(function(x) { return x.rma === num && x.id !== rmaEditId; });
  if (dup && !confirm('Já existe um RMA-' + num + ' cadastrado. Salvar mesmo assim?')) return;

  var now = new Date().toISOString();
  var fields = {
    rma:       num,
    equipment: equip,
    serial:    document.getElementById('rma-f-serial').value.trim(),
    invoice:   document.getElementById('rma-f-invoice').value.trim(),
    ean:       document.getElementById('rma-f-ean').value.trim(),
    openedAt:  document.getElementById('rma-f-date').value || now.slice(0, 10),
    notes:     document.getElementById('rma-f-notes').value.trim(),
    updatedAt: now
  };

  if (rmaEditId) {
    var r = all.find(function(x) { return x.id === rmaEditId; });
    if (r) Object.keys(fields).forEach(function(k) { r[k] = fields[k]; });
  } else {
    fields.id        = String(Date.now());
    fields.status    = 'aberto';
    fields.createdAt = now;
    fields.comments  = [];
    all.unshift(fields);
    if (rmaFilter === 'done') rmaFilter = 'open';
  }
  rmaSave(all);
  rmaFormClose();
  renderRmaList();
  updateRmaToolCount();
}

/* ── FILTERS ── */
function rmaSetFilter(f) {
  rmaFilter = f;
  renderRmaList();
}

function rmaSearch(v) {
  rmaQuery = v.trim().toLowerCase();
  renderRmaList();
}

/* ── LIST RENDER ── */
function rmaAgeText(r) {
  var start = r.openedAt ? new Date(r.openedAt + 'T00:00:00') : new Date(r.createdAt);
  var end   = r.closedAt ? new Date(r.closedAt) : new Date();
  var days  = Math.max(0, Math.floor((end - start) / 86400000));
  if (!rmaIsOpen(r)) return 'Finalizado após ' + days + (days === 1 ? ' dia' : ' dias');
  if (days === 0) return 'Aberto hoje';
  return 'Aberto há ' + days + (days === 1 ? ' dia' : ' dias');
}

function rmaFmtDate(iso) {
  if (!iso) return '—';
  var p = iso.slice(0, 10).split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

function renderRmaList() {
  var list = document.getElementById('rma-list');
  if (!list) return;

  var all     = rmaGetAll();
  var nOpen   = all.filter(rmaIsOpen).length;
  var nDone   = all.length - nOpen;
  document.getElementById('rma-cnt-open').textContent = nOpen;
  document.getElementById('rma-cnt-done').textContent = nDone;
  document.getElementById('rma-cnt-all').textContent  = all.length;
  document.querySelectorAll('.rma-seg button').forEach(function(b) {
    b.classList.toggle('sel', b.dataset.f === rmaFilter);
  });

  var rows = all.filter(function(r) {
    if (rmaFilter === 'open' && !rmaIsOpen(r)) return false;
    if (rmaFilter === 'done' &&  rmaIsOpen(r)) return false;
    if (!rmaQuery) return true;
    return [r.rma, r.equipment, r.serial, r.invoice, r.ean, r.notes].join(' ').toLowerCase().indexOf(rmaQuery) >= 0;
  });

  /* oldest open first — the ones waiting longest need attention */
  rows = rows.slice().sort(function(a, b) {
    if (rmaFilter === 'done') return (b.closedAt || '').localeCompare(a.closedAt || '');
    return (a.openedAt || a.createdAt).localeCompare(b.openedAt || b.createdAt);
  });

  if (!rows.length) {
    var msg = rmaQuery ? 'Nenhum RMA encontrado para essa busca'
            : rmaFilter === 'open' ? 'Nenhum RMA em aberto'
            : rmaFilter === 'done' ? 'Nenhum RMA finalizado ainda'
            : 'Nenhum RMA cadastrado';
    list.innerHTML = '<div class="empty-state rma-empty">'
      + '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>'
      + '<div>' + msg + '</div></div>';
    return;
  }

  list.innerHTML = rows.map(function(r, i) { return buildRmaCard(r, i); }).join('');
}

function buildRmaCard(r, i) {
  var st   = RMA_STATUS[r.status] || RMA_STATUS.aberto;
  var id   = esc(r.id);
  var meta = [];
  if (r.serial)  meta.push('<span><b>S/N</b> ' + esc(r.serial) + '</span>');
  if (r.invoice) meta.push('<span><b>NF</b> ' + esc(r.invoice) + '</span>');
  if (r.ean)     meta.push('<span><b>EAN</b> ' + esc(r.ean) + '</span>');
  meta.push('<span><b>Abertura</b> ' + rmaFmtDate(r.openedAt) + '</span>');

  var statusBtns = Object.keys(RMA_STATUS).map(function(k) {
    var s = RMA_STATUS[k];
    return '<button class="rma-st-pill' + (r.status === k ? ' sel' : '') + '" '
      + 'style="--c:' + s.color + ';--bg:' + s.bg + '" '
      + 'data-id="' + id + '" data-s="' + k + '" onclick="rmaSetStatus(this.dataset.id, this.dataset.s)">'
      + s.label + '</button>';
  }).join('');

  var nComments = (r.comments || []).length;

  return '<div class="rma-card note-pop' + (rmaExpanded[r.id] ? ' expanded' : '') + '" data-id="' + id + '" style="animation-delay:' + Math.min(i * 0.04, 0.4) + 's">'
    + '<div class="rma-bar" style="background:' + st.color + '"></div>'
    + '<div class="rma-main" data-id="' + id + '" onclick="rmaToggle(this.dataset.id)">'
    +   '<div class="rma-top">'
    +     '<span class="rma-num">RMA-' + esc(r.rma) + '</span>'
    +     '<span class="rma-status" style="color:' + st.color + ';background:' + st.bg + '">' + st.label + '</span>'
    +     '<span class="rma-age">' + rmaAgeText(r) + '</span>'
    +   '</div>'
    +   '<div class="rma-equip">' + esc(r.equipment) + '</div>'
    +   '<div class="rma-meta">' + meta.join('') + '</div>'
    +   (r.notes ? '<div class="rma-notes">' + esc(r.notes) + '</div>' : '')
    +   '<div class="rma-foot">'
    +     '<span class="rma-ccount">'
    +       '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>'
    +       nComments + (nComments === 1 ? ' comentário' : ' comentários')
    +     '</span>'
    +     '<span class="note-chevron"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>'
    +   '</div>'
    + '</div>'
    + '<div class="rma-detail">'
    +   '<div class="rma-dlbl">Status</div>'
    +   '<div class="rma-st-pills">' + statusBtns + '</div>'
    +   '<div class="rma-dlbl">Comentários</div>'
    +   '<div class="note-comments-list rma-comments" id="rcomments-' + id + '">' + buildRmaCommentsHtml(r.comments) + '</div>'
    +   '<div class="note-comment-add">'
    +     '<input type="text" class="note-comment-input" id="rcinput-' + id + '" placeholder="Comentar..." '
    +       'data-id="' + id + '" onkeydown="if(event.key===\'Enter\'){rmaAddComment(this.dataset.id)}" />'
    +     '<button class="note-comment-send" data-id="' + id + '" onclick="rmaAddComment(this.dataset.id)" aria-label="Comentar">'
    +       '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>'
    +     '</button>'
    +   '</div>'
    +   '<div class="rma-actions">'
    +     (rmaIsOpen(r)
          ? '<button class="note-act note-act-done" data-id="' + id + '" onclick="rmaSetStatus(this.dataset.id, \'finalizado\')">'
          +   '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Finalizar RMA</button>'
          : '<button class="note-act rma-act-reopen" data-id="' + id + '" onclick="rmaSetStatus(this.dataset.id, \'aberto\')">'
          +   '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>Reabrir</button>')
    +     '<button class="note-act rma-act-edit" data-id="' + id + '" onclick="rmaFormOpen(this.dataset.id)">'
    +       '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg>Editar</button>'
    +     '<button class="note-act note-act-del" data-id="' + id + '" onclick="rmaDelete(this.dataset.id)">'
    +       '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Excluir</button>'
    +   '</div>'
    + '</div>'
    + '</div>';
}

function buildRmaCommentsHtml(comments) {
  if (!comments || !comments.length) {
    return '<div class="note-comments-empty">Sem comentários ainda</div>';
  }
  return comments.map(function(c) {
    var dt = new Date(c.at);
    var when = pad(dt.getDate()) + '/' + pad(dt.getMonth() + 1) + ' ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes());
    return '<div class="note-comment">'
      + '<span class="note-comment-time">' + when + '</span>'
      + '<span class="note-comment-text">' + esc(c.text) + '</span>'
      + '</div>';
  }).join('');
}

/* ── ACTIONS ── */
function rmaToggle(id) {
  var card = document.querySelector('.rma-card[data-id="' + id + '"]');
  if (!card) return;
  card.classList.toggle('expanded');
  if (card.classList.contains('expanded')) rmaExpanded[id] = true;
  else delete rmaExpanded[id];
}

function rmaSetStatus(id, status) {
  var all = rmaGetAll().slice();
  var r = all.find(function(x) { return x.id === id; });
  if (!r || r.status === status) return;
  var wasOpen = rmaIsOpen(r);
  r.status    = status;
  r.updatedAt = new Date().toISOString();
  if (status === 'finalizado') r.closedAt = r.updatedAt;
  else delete r.closedAt;
  rmaSave(all);
  updateRmaToolCount();

  /* card leaves the current filter → animate it out */
  var leaves = (rmaFilter === 'open' && wasOpen && !rmaIsOpen(r)) ||
               (rmaFilter === 'done' && !wasOpen && rmaIsOpen(r));
  var card = document.querySelector('.rma-card[data-id="' + id + '"]');
  if (leaves && card) {
    delete rmaExpanded[id];
    if (status === 'finalizado') {
      var ov = document.createElement('div');
      ov.className = 'note-done-overlay';
      ov.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" '
        + 'stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      card.appendChild(ov);
      setTimeout(function() { card.classList.add('note-removing'); }, 520);
      setTimeout(renderRmaList, 760);
    } else {
      card.classList.add('note-removing');
      setTimeout(renderRmaList, 240);
    }
    return;
  }
  renderRmaList();
}

function rmaAddComment(id) {
  var input = document.getElementById('rcinput-' + id);
  if (!input) return;
  var text = input.value.trim();
  if (!text) return;

  var all = rmaGetAll().slice();
  var r = all.find(function(x) { return x.id === id; });
  if (!r) return;
  if (!r.comments) r.comments = [];
  r.comments.push({ text: text, at: new Date().toISOString() });
  r.updatedAt = new Date().toISOString();
  rmaSave(all);

  input.value = '';
  var list = document.getElementById('rcomments-' + id);
  if (list) {
    list.innerHTML = buildRmaCommentsHtml(r.comments);
    list.scrollTop = list.scrollHeight;
  }
  var cc = document.querySelector('.rma-card[data-id="' + id + '"] .rma-ccount');
  if (cc) {
    var n = r.comments.length;
    cc.lastChild.textContent = n + (n === 1 ? ' comentário' : ' comentários');
  }
}

function rmaDelete(id) {
  var r = rmaGetAll().find(function(x) { return x.id === id; });
  if (!r) return;
  if (!confirm('Excluir o RMA-' + r.rma + '? Essa ação não pode ser desfeita.')) return;
  var card = document.querySelector('.rma-card[data-id="' + id + '"]');
  var commit = function() {
    delete rmaExpanded[id];
    rmaSave(rmaGetAll().filter(function(x) { return x.id !== id; }));
    renderRmaList();
    updateRmaToolCount();
  };
  if (card) { card.classList.add('note-removing'); setTimeout(commit, 240); }
  else commit();
}

/* ── HOME TOOL CARD COUNTER ── */
function updateRmaToolCount() {
  var el = document.getElementById('rma-tool-count');
  if (!el) return;
  var n = rmaGetAll().filter(rmaIsOpen).length;
  el.textContent = n;
  el.classList.toggle('visible', n > 0);
}

/* Re-render from polling, without wiping a comment being typed */
function rmaExternalRefresh() {
  updateRmaToolCount();
  var pg = document.getElementById('pg-rma');
  if (!pg || !pg.classList.contains('active')) return;
  var a = document.activeElement;
  if (a && a.closest && a.closest('#rma-list') && a.value) return;
  renderRmaList();
}
