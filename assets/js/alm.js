/* ═══════════════════════════════
   ALMOXARIFADO — item catalog search
   Items live in the shared API collection "itens" (imported from the
   "Relatório de itens" spreadsheet); loaded on demand, not polled.
   ═══════════════════════════════ */

var ALM_TIPOS = {   /* standard TOTVS product types; other codes are shown as-is */
  AI: 'Ativo imobilizado', GG: 'Gastos gerais', MC: 'Material de consumo', MP: 'Matéria-prima',
  ME: 'Mercadoria', OI: 'Outros insumos'
};
var ALM_PAGE = 80;

var almItems = [], almMeta = null, almLoaded = false, almLoading = null;
var almQuery = '', almCat = '', almTipo = '', almLimit = ALM_PAGE, almSel = 0, almShown = [];

/* ── normalisation: lowercase, no accents; "compact" form also drops separators (PBRA-RW == pbrarw) ── */
function almNorm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function almCompact(s) { return s.replace(/[^a-z0-9]/g, ''); }

function almIndex(list) {
  list.forEach(function(it) {
    var desc = almNorm(it.descricao);
    it._desc = desc;
    it._words = desc.split(/[^a-z0-9]+/).filter(Boolean);
    it._hay = almNorm(it.codigo + ' ' + it.descricao + ' ' + it.ncm + ' ' + it.categoria + ' ' + it.unidade);
    it._cmp = almCompact(it._hay);
  });
  return list;
}

/* ── data ── */
function almLoad() {
  if (almLoaded) return Promise.resolve();
  if (almLoading) return almLoading;
  almLoading = Promise.all([_apiGet('/itens'), _apiGet('/itensmeta')]).then(function(r) {
    almItems = almIndex(r[0] || []);
    almMeta = (r[1] || [])[0] || null;
    almLoaded = true;
  }).catch(function(e) {
    console.error('Almoxarifado: falha ao carregar itens', e);
  }).then(function() { almLoading = null; });
  return almLoading;
}

/* ── open page ── */
function openAlm() {
  showPage('pg-alm');
  var input = document.getElementById('alm-q');
  if (!almLoaded) {
    document.getElementById('alm-list').innerHTML = almSkeleton();
    almLoad().then(function() { almRenderAll(); });
  } else almRenderAll();
  setTimeout(function() { if (input && window.innerWidth > 760) input.focus(); }, 250);
}

function almSkeleton() {
  var h = '';
  for (var i = 0; i < 8; i++) h += '<div class="alm-row alm-sk"><span class="sk" style="width:84px;height:16px"></span><span class="sk" style="width:' + (40 + (i * 13) % 45) + '%;height:14px"></span></div>';
  return h;
}

/* ── search ──
   every query word must appear (substring, or in the separator-free form);
   rank: exact code > code prefix > words starting a description word > earlier, shorter matches */
function almTokens(q) { return almNorm(q).split(/\s+/).filter(Boolean); }

function almScore(it, toks, raw) {
  var s = 0, code = it.codigo;
  if (raw && code === raw) s += 10000;
  else if (raw && code.indexOf(raw) === 0) s += 4000;
  for (var i = 0; i < toks.length; i++) {
    var t = toks[i], tc = almCompact(t);
    var p = it._hay.indexOf(t);
    if (p < 0) {
      if (!tc || it._cmp.indexOf(tc) < 0) return -1;
      s += 4; continue;
    }
    if (it.codigo.indexOf(tc) === 0) s += 300;
    var dp = it._desc.indexOf(t);
    if (dp === 0) s += 60;
    else if (dp > 0 && /[^a-z0-9]/.test(it._desc[dp - 1])) s += 35;
    else if (dp > 0) s += 12;
    else s += 6;   /* matched code/NCM/category only */
    s += Math.max(0, 20 - dp / 3);
  }
  return s + Math.max(0, 30 - it._desc.length / 4);
}

/* typo tolerance, used only when nothing matches: each word within 1 edit of a description word */
function almNear(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  var i = 0, j = 0, ed = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++ed > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return ed + (a.length - i) + (b.length - j) <= 1;
}
function almFuzzy(it, toks) {
  return toks.every(function(t) {
    if (it._hay.indexOf(t) >= 0) return true;
    if (t.length < 4) return false;
    return it._words.some(function(w) { return almNear(t, w) || (w.length > t.length && almNear(t, w.slice(0, t.length))); });
  });
}

function almSearch() {
  var toks = almTokens(almQuery), raw = almQuery.trim().replace(/\s+/g, ''), fuzzy = false;
  var base = almItems.filter(function(it) { return (!almCat || it.categoria === almCat) && (!almTipo || it.tipo === almTipo); });
  var res;
  if (!toks.length) {
    res = base.slice().sort(function(a, b) { return a._desc.localeCompare(b._desc); });
  } else {
    res = [];
    base.forEach(function(it) { var sc = almScore(it, toks, raw); if (sc >= 0) res.push({ it: it, s: sc }); });
    if (!res.length) {
      fuzzy = true;
      base.forEach(function(it) { if (almFuzzy(it, toks)) res.push({ it: it, s: 0 }); });
    }
    res = res.sort(function(a, b) { return b.s - a.s || a.it._desc.localeCompare(b.it._desc); }).map(function(r) { return r.it; });
  }
  return { list: res, fuzzy: fuzzy, toks: toks };
}

/* category counts follow the query (ignoring the category filter itself) */
function almCatCounts(toks, raw) {
  var m = {};
  almItems.forEach(function(it) {
    if (almTipo && it.tipo !== almTipo) return;
    if (toks.length && almScore(it, toks, raw) < 0) return;
    m[it.categoria] = (m[it.categoria] || 0) + 1;
  });
  return m;
}

/* ── render ── */
function almHighlight(text, toks) {
  var src = String(text || ''), norm = almNorm(src), marks = [];
  toks.forEach(function(t) {
    var p = 0;
    while (t && (p = norm.indexOf(t, p)) >= 0) { marks.push([p, p + t.length]); p += t.length; }
  });
  if (!marks.length) return esc(src);
  marks.sort(function(a, b) { return a[0] - b[0]; });
  var out = '', last = 0;
  marks.forEach(function(m) {
    if (m[0] < last) { if (m[1] > last) { out += '<mark>' + esc(src.slice(last, m[1])) + '</mark>'; last = m[1]; } return; }
    out += esc(src.slice(last, m[0])) + '<mark>' + esc(src.slice(m[0], m[1])) + '</mark>';
    last = m[1];
  });
  return out + esc(src.slice(last));
}

function almRenderAll() {
  almRenderHead();
  almRenderTipos();
  almRender();
}

function almRenderHead() {
  var el = document.getElementById('alm-meta');
  if (!el) return;
  if (!almItems.length) { el.textContent = 'Nenhum item cadastrado'; return; }
  var cats = {};
  almItems.forEach(function(it) { cats[it.categoria] = 1; });
  el.innerHTML = almItems.length.toLocaleString('pt-BR') + ' itens · ' + Object.keys(cats).length + ' categorias'
    + (almMeta && almMeta.updatedAt ? ' · atualizado em ' + new Date(almMeta.updatedAt).toLocaleDateString('pt-BR') : '');
}

function almRenderTipos() {
  var sel = document.getElementById('alm-tipo');
  if (!sel) return;
  var m = {};
  almItems.forEach(function(it) { m[it.tipo] = (m[it.tipo] || 0) + 1; });
  sel.innerHTML = '<option value="">Todos os tipos</option>' + Object.keys(m).sort(function(a, b) { return m[b] - m[a]; }).map(function(t) {
    return '<option value="' + esc(t) + '"' + (t === almTipo ? ' selected' : '') + '>' + esc(t) + (ALM_TIPOS[t] ? ' — ' + ALM_TIPOS[t] : '') + ' (' + m[t] + ')</option>';
  }).join('');
}

function almRender() {
  var list = document.getElementById('alm-list');
  if (!list) return;
  var t0 = performance.now();
  var r = almSearch(), raw = almQuery.trim().replace(/\s+/g, '');
  almShown = r.list;
  if (almSel >= almShown.length) almSel = Math.max(0, almShown.length - 1);
  var ms = performance.now() - t0;

  /* category chips */
  var counts = almCatCounts(r.toks, raw), cats = Object.keys(counts).sort(function(a, b) { return counts[b] - counts[a]; });
  if (almCat && !counts[almCat]) cats.unshift(almCat);
  var total = Object.keys(counts).reduce(function(s, k) { return s + counts[k]; }, 0);
  document.getElementById('alm-cats').innerHTML =
    '<button class="' + (!almCat ? 'sel' : '') + '" data-c="">Todas<b>' + total + '</b></button>'
    + cats.map(function(c) {
        return '<button class="' + (almCat === c ? 'sel' : '') + '" data-c="' + esc(c) + '">' + esc(c) + '<b>' + (counts[c] || 0) + '</b></button>';
      }).join('');

  /* status line */
  var n = almShown.length;
  document.getElementById('alm-status').innerHTML = !almItems.length ? ''
    : (r.fuzzy && n ? '<span class="alm-fz">Nenhum resultado exato — mostrando resultados aproximados</span> · ' : '')
      + '<b>' + n.toLocaleString('pt-BR') + '</b> ' + (n === 1 ? 'item' : 'itens')
      + (r.toks.length ? ' para “' + esc(almQuery.trim()) + '”' : '')
      + (almCat ? ' em ' + esc(almCat) : '') + ' <span class="alm-ms">' + ms.toFixed(1) + ' ms</span>';

  if (!almItems.length) {
    list.innerHTML = '<div class="alm-empty"><b>Nenhum item cadastrado</b><span>Use “Atualizar planilha” para importar o relatório de itens (.xlsx).</span></div>';
    return;
  }
  if (!n) {
    list.innerHTML = '<div class="alm-empty"><b>Nada encontrado</b><span>Tente menos palavras, parte do código ou outra categoria.</span></div>';
    return;
  }

  var toks = r.toks;
  list.innerHTML = almShown.slice(0, almLimit).map(function(it, i) {
    return '<div class="alm-row' + (i === almSel ? ' sel' : '') + '" data-i="' + i + '" style="animation-delay:' + Math.min(i, 14) * 0.015 + 's">'
      + '<button class="alm-code" data-i="' + i + '" title="Copiar código">' + almHighlight(it.codigo, toks)
      +   '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>'
      + '<div class="alm-main">'
      +   '<div class="alm-desc">' + almHighlight(it.descricao, toks) + '</div>'
      +   '<div class="alm-tags"><span class="alm-cat">' + esc(it.categoria) + '</span>'
      +     '<span title="' + esc(ALM_TIPOS[it.tipo] || 'Tipo') + '">' + esc(it.tipo) + '</span>'
      +     '<span>' + esc(it.unidade) + '</span>'
      +     (it.ncm && it.ncm !== '0000.00.00' ? '<span>NCM ' + almHighlight(it.ncm, toks) + '</span>' : '')
      +   '</div>'
      + '</div>'
      + '</div>';
  }).join('')
  + (n > almLimit ? '<button class="alm-more" id="alm-more">Mostrar mais ' + Math.min(ALM_PAGE, n - almLimit) + ' de ' + (n - almLimit).toLocaleString('pt-BR') + ' restantes</button>' : '');
}

/* ── copy + toast ── */
function almCopy(i) {
  var it = almShown[i];
  if (!it) return;
  var done = function() { almToast('Código <b>' + esc(it.codigo) + '</b> copiado'); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(it.codigo).then(done, function() { almCopyFallback(it.codigo); done(); });
  else { almCopyFallback(it.codigo); done(); }
  var row = document.querySelector('.alm-row[data-i="' + i + '"]');
  if (row) { row.classList.remove('copied'); void row.offsetWidth; row.classList.add('copied'); }
}
/* the portal is plain http on an IP, where navigator.clipboard is unavailable */
function almCopyFallback(text) {
  var ta = document.createElement('textarea');
  ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (e) { /* ignore */ }
  ta.remove();
}
var almToastT = 0;
function almToast(html) {
  var t = document.getElementById('alm-toast');
  t.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' + html;
  t.classList.add('on');
  clearTimeout(almToastT);
  almToastT = setTimeout(function() { t.classList.remove('on'); }, 1800);
}

/* ── keyboard + events ── */
function almMoveSel(d) {
  if (!almShown.length) return;
  almSel = Math.max(0, Math.min(Math.min(almShown.length, almLimit) - 1, almSel + d));
  document.querySelectorAll('.alm-row.sel').forEach(function(r) { r.classList.remove('sel'); });
  var row = document.querySelector('.alm-row[data-i="' + almSel + '"]');
  if (row) { row.classList.add('sel'); row.scrollIntoView({ block: 'nearest' }); }
}

function almInit() {
  var q = document.getElementById('alm-q');
  if (!q) return;
  q.addEventListener('input', function() {
    almQuery = q.value; almLimit = ALM_PAGE; almSel = 0;
    document.getElementById('alm-clear').classList.toggle('on', !!q.value);
    almRender();
    routeReplace(q.value.trim() ? 'almoxarifado/' + encodeURIComponent(q.value.trim()) : 'almoxarifado');   /* shareable search */
  });
  q.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); almMoveSel(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); almMoveSel(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); almCopy(almSel); }
    else if (e.key === 'Escape') { almClear(); }
  });
  document.getElementById('alm-cats').addEventListener('click', function(e) {
    var b = e.target.closest('button');
    if (!b) return;
    almCat = b.dataset.c; almLimit = ALM_PAGE; almSel = 0;
    almRender();
  });
  document.getElementById('alm-tipo').addEventListener('change', function(e) {
    almTipo = e.target.value; almLimit = ALM_PAGE; almSel = 0;
    almRender();
  });
  document.getElementById('alm-list').addEventListener('click', function(e) {
    if (e.target.closest('#alm-more')) { almLimit += ALM_PAGE; almRender(); return; }
    var row = e.target.closest('.alm-row');
    if (row && row.dataset.i != null) { almSel = +row.dataset.i; almMoveSel(0); almCopy(+row.dataset.i); }
  });
  /* "/" jumps to the search from anywhere on the page */
  document.addEventListener('keydown', function(e) {
    var pg = document.getElementById('pg-alm');
    if (!pg || !pg.classList.contains('active')) return;
    var a = document.activeElement;
    if (e.key === '/' && !(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) { e.preventDefault(); q.focus(); q.select(); }
  });
}

function almClear() {
  var q = document.getElementById('alm-q');
  q.value = ''; almQuery = ''; almLimit = ALM_PAGE; almSel = 0;
  document.getElementById('alm-clear').classList.remove('on');
  almRender();
  routeReplace('almoxarifado');
  q.focus();
}

/* ── spreadsheet import (SheetJS loaded only when needed) ── */
function almPickFile() { document.getElementById('alm-file').click(); }

function almLoadSheetJS() {
  if (window.XLSX) return Promise.resolve();
  return new Promise(function(ok, fail) {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = ok; s.onerror = function() { fail(new Error('Não foi possível carregar o leitor de planilhas')); };
    document.head.appendChild(s);
  });
}

/* finds the header row (with "Código" and "Descrição") in the first sheet that has one,
   preferring a sheet that also has "Categoria" */
function almParseWorkbook(wb) {
  var best = null;
  wb.SheetNames.forEach(function(name) {
    var rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' });
    for (var r = 0; r < Math.min(rows.length, 15); r++) {
      var h = rows[r].map(function(c) { return almNorm(c).trim(); });
      var ic = h.indexOf('codigo'), id = h.indexOf('descricao');
      if (ic < 0 || id < 0) continue;
      var cand = { rows: rows, r: r, h: h, cat: h.indexOf('categoria') >= 0, name: name };
      if (!best || (cand.cat && !best.cat) || (cand.cat === best.cat && rows.length > best.rows.length)) best = cand;
      break;
    }
  });
  if (!best) throw new Error('Não encontrei as colunas “Código” e “Descrição” na planilha.');
  var col = function(n) { return best.h.findIndex(function(x) { return x.indexOf(n) === 0; }); };
  var C = { cod: col('codigo'), desc: col('descricao'), cat: col('categoria'), tipo: col('tipo'), un: col('unidade'), ncm: col('pos') >= 0 ? col('pos') : col('ncm') };
  var out = [], seen = {};
  best.rows.slice(best.r + 1).forEach(function(row) {
    var cod = String(row[C.cod] || '').trim(), desc = String(row[C.desc] || '').trim();
    if (!cod || !desc || seen[cod]) return;
    seen[cod] = 1;
    out.push({
      codigo: cod, descricao: desc,
      categoria: C.cat >= 0 ? String(row[C.cat] || '').trim() || 'Sem categoria' : 'Sem categoria',
      tipo: C.tipo >= 0 ? String(row[C.tipo] || '').trim() : '',
      unidade: C.un >= 0 ? String(row[C.un] || '').trim() : '',
      ncm: C.ncm >= 0 ? String(row[C.ncm] || '').trim() : ''
    });
  });
  if (!out.length) throw new Error('A planilha não tem itens com código e descrição.');
  return { items: out, sheet: best.name };
}

function almFileChosen(input) {
  var f = input.files && input.files[0];
  input.value = '';
  if (!f) return;
  var btn = document.getElementById('alm-import');
  btn.disabled = true; btn.classList.add('busy');
  almLoadSheetJS().then(function() { return f.arrayBuffer(); }).then(function(buf) {
    var parsed = almParseWorkbook(XLSX.read(buf, { type: 'array' }));
    var diff = almItems.length ? ' (antes: ' + almItems.length.toLocaleString('pt-BR') + ')' : '';
    if (!confirm('Importar ' + parsed.items.length.toLocaleString('pt-BR') + ' itens da aba “' + parsed.sheet + '” de ' + f.name + diff
      + '?\n\nA lista atual será substituída para todos os usuários.')) return;
    var meta = [{ updatedAt: new Date().toISOString(), fileName: f.name, sheet: parsed.sheet, count: parsed.items.length }];
    return Promise.all([_apiPut('/itens', parsed.items), _apiPut('/itensmeta', meta)]).then(function() {
      almItems = almIndex(parsed.items); almMeta = meta[0]; almLoaded = true;
      almCat = ''; almTipo = ''; almLimit = ALM_PAGE; almSel = 0;
      almRenderAll();
      almToast('<b>' + parsed.items.length.toLocaleString('pt-BR') + '</b> itens importados');
      updateAlmToolCount();
    });
  }).catch(function(e) { alert(e.message || e); }).then(function() { btn.disabled = false; btn.classList.remove('busy'); });
}

/* ── home card ── */
function updateAlmToolCount() {
  var el = document.getElementById('alm-tool-count');
  if (!el) return;
  var n = almItems.length || (almMeta && almMeta.count) || 0;
  el.textContent = n ? n.toLocaleString('pt-BR') + ' itens' : '';
  el.classList.toggle('visible', n > 0);
}
function almInitCount() {
  _apiGet('/itensmeta').then(function(m) { almMeta = (m || [])[0] || almMeta; updateAlmToolCount(); }).catch(function() {});
}

function almOpenWith(q) {
  q = String(q || '').trim();
  almQuery = q; almLimit = ALM_PAGE; almSel = 0; almCat = '';
  var input = document.getElementById('alm-q');
  if (input) { input.value = q; document.getElementById('alm-clear').classList.toggle('on', !!q); }
  var onAlm = routeCurrentPath().indexOf('almoxarifado') === 0, path = q ? 'almoxarifado/' + encodeURIComponent(q) : 'almoxarifado';
  routeSilent = true;
  try { openAlm(); } finally { routeSilent = false; }
  if (onAlm) routeReplace(path); else history.pushState(null, '', '#/' + path);   /* from home: keep Back working */
}
