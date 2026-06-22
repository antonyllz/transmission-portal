/* ═══════════════════════════════
   PROFILE & SETTINGS
   ═══════════════════════════════ */

var AVATAR_COLORS = ['#0649fc','#9333ea','#059669','#ea580c','#dc2626','#0891b2'];

/* ── Persistence ── */
function profileGet() {
  try { return JSON.parse(localStorage.getItem('net_profile') || 'null'); }
  catch(e) { return null; }
}
function profileSave(p) { localStorage.setItem('net_profile', JSON.stringify(p)); }

function settingsGet() {
  try { return JSON.parse(localStorage.getItem('net_settings') || '{"theme":"light"}'); }
  catch(e) { return { theme: 'light' }; }
}
function settingsSave(s) { localStorage.setItem('net_settings', JSON.stringify(s)); }

/* ── Theme ── */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelectorAll('.theme-opt').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

function setTheme(theme) {
  var s = settingsGet();
  s.theme = theme;
  settingsSave(s);
  applyTheme(theme);
}

/* ── Avatar helpers ── */
function getInitials(name) {
  if (!name) return '?';
  var parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function renderTopbarAvatar() {
  var p  = profileGet();
  var el = document.getElementById('tb-avatar');
  if (!el) return;
  if (p && p.name) {
    el.textContent = getInitials(p.name);
    el.style.background = p.color || AVATAR_COLORS[0];
  } else {
    el.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    el.style.background = '#636366';
  }
}

/* ─────────────────────────────
   SETTINGS PANEL
   ───────────────────────────── */
var _settingsOpen = false;

function openSettings() {
  _closeProfilePanel(false);
  _renderSettings();
  document.getElementById('side-backdrop').classList.add('open');
  document.getElementById('settings-panel').classList.add('open');
  _settingsOpen = true;
}

function closeSettings() {
  document.getElementById('side-backdrop').classList.remove('open');
  document.getElementById('settings-panel').classList.remove('open');
  _settingsOpen = false;
}

function _renderSettings() {
  var p = profileGet();
  var s = settingsGet();

  var avHtml = p && p.name
    ? '<div class="settings-av" style="background:' + (p.color || AVATAR_COLORS[0]) + '">' + esc(getInitials(p.name)) + '</div>'
    : '<div class="settings-av" style="background:#636366"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>';

  var nameHtml = p && p.name
    ? '<div class="settings-profile-name">' + esc(p.name) + '</div>' +
      (p.role ? '<div class="settings-profile-role">' + esc(p.role) + '</div>' : '')
    : '<div class="settings-profile-name" style="color:#aeaeb2">Sem perfil</div>' +
      '<div class="settings-profile-role">Clique em Editar para criar</div>';

  document.getElementById('settings-body').innerHTML =
    '<div class="settings-block">' +
      '<div class="settings-section-lbl">Conta</div>' +
      '<div class="settings-profile-row">' +
        avHtml +
        '<div>' + nameHtml + '</div>' +
        '<button class="settings-edit-btn" onclick="closeSettings();openProfilePanel()">Editar →</button>' +
      '</div>' +
    '</div>' +

    '<div class="settings-block">' +
      '<div class="settings-section-lbl">Aparência</div>' +
      '<div class="settings-row" style="flex-direction:column;align-items:stretch;gap:10px;">' +
        '<div class="settings-row-label">Tema</div>' +
        '<div class="theme-switcher">' +
          '<button class="theme-opt' + (s.theme !== 'dark' ? ' active' : '') + '" data-theme="light" onclick="setTheme(\'light\')">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
              '<circle cx="12" cy="12" r="5"/>' +
              '<line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>' +
              '<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>' +
              '<line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>' +
              '<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>' +
            '</svg>' +
            'Claro' +
          '</button>' +
          '<button class="theme-opt' + (s.theme === 'dark' ? ' active' : '') + '" data-theme="dark" onclick="setTheme(\'dark\')">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
              '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>' +
            '</svg>' +
            'Escuro' +
          '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
}

/* ─────────────────────────────
   PROFILE PANEL
   ───────────────────────────── */
var _profileOpen = false;
var _selColor = AVATAR_COLORS[0];

function openProfilePanel() {
  closeSettings();
  var p = profileGet();
  _selColor = (p && p.color) || AVATAR_COLORS[0];
  _renderProfilePanel(p);
  document.getElementById('side-backdrop').classList.add('open');
  document.getElementById('profile-panel').classList.add('open');
  _profileOpen = true;
}

function _closeProfilePanel(hideBackdrop) {
  if (hideBackdrop !== false) {
    document.getElementById('side-backdrop').classList.remove('open');
  }
  document.getElementById('profile-panel').classList.remove('open');
  _profileOpen = false;
}

function closeProfilePanel() { _closeProfilePanel(true); }

function closeSidePanels() {
  document.getElementById('side-backdrop').classList.remove('open');
  document.getElementById('settings-panel').classList.remove('open');
  document.getElementById('profile-panel').classList.remove('open');
  _settingsOpen = false;
  _profileOpen  = false;
}

function _renderProfilePanel(p) {
  var name = (p && p.name) || '';
  var role = (p && p.role) || '';

  var swatches = AVATAR_COLORS.map(function(c) {
    return '<button class="color-swatch' + (c === _selColor ? ' sel' : '') + '" ' +
      'style="background:' + c + '" ' +
      'onclick="pickAvatarColor(this,\'' + c + '\',\'profile-av-lg\')" aria-label="Cor ' + c + '"></button>';
  }).join('');

  document.getElementById('profile-body').innerHTML =
    '<div class="profile-avatar-area">' +
      '<div class="profile-av-lg" id="profile-av-lg" style="background:' + _selColor + '">' +
        esc(name ? getInitials(name) : '?') +
      '</div>' +
      '<div class="profile-name-prev" id="pf-name-prev">' + esc(name || 'Seu nome') + '</div>' +
      '<div class="profile-role-prev" id="pf-role-prev">' + esc(role || 'Cargo / Função') + '</div>' +
    '</div>' +

    '<div class="profile-field">' +
      '<label>Nome completo <span class="req">*</span></label>' +
      '<input type="text" id="pf-name" value="' + esc(name) + '" placeholder="ex: Antony Araújo" oninput="profilePreview()" />' +
    '</div>' +
    '<div class="profile-field">' +
      '<label>Cargo / Função</label>' +
      '<input type="text" id="pf-role" value="' + esc(role) + '" placeholder="ex: Network Engineer" />' +
    '</div>' +
    '<div class="profile-field">' +
      '<label>Cor do avatar</label>' +
      '<div class="color-palette">' + swatches + '</div>' +
    '</div>';
}

function profilePreview() {
  var name = (document.getElementById('pf-name') || {}).value || '';
  var role = (document.getElementById('pf-role') || {}).value || '';
  var av = document.getElementById('profile-av-lg');
  var np = document.getElementById('pf-name-prev');
  var rp = document.getElementById('pf-role-prev');
  if (av) av.textContent = name ? getInitials(name) : '?';
  if (np) np.textContent = name || 'Seu nome';
  if (rp) rp.textContent = role || 'Cargo / Função';
}

function pickAvatarColor(btn, color, avId) {
  /* track in whichever context is visible */
  if (avId === 'pmodal-av') { _fl_selColor = color; _selColor = color; }
  else { _selColor = color; }
  var palette = btn.closest('.color-palette');
  if (palette) palette.querySelectorAll('.color-swatch').forEach(function(s) { s.classList.remove('sel'); });
  btn.classList.add('sel');
  var av = document.getElementById(avId);
  if (av) av.style.background = color;
}

function saveProfile() {
  var nameEl = document.getElementById('pf-name');
  var name   = nameEl ? nameEl.value.trim() : '';
  if (!name) {
    if (nameEl) { nameEl.focus(); nameEl.style.borderColor = '#dc2626'; }
    return;
  }
  var role = (document.getElementById('pf-role') || {}).value || '';
  profileSave({ name: name, role: role.trim(), color: _selColor });
  renderTopbarAvatar();
  closeProfilePanel();
}

/* ─────────────────────────────
   FIRST-LAUNCH MODAL
   ───────────────────────────── */
var _fl_selColor = AVATAR_COLORS[0];

function showFirstLaunchModal() {
  _fl_selColor = AVATAR_COLORS[0];

  var swatches = AVATAR_COLORS.map(function(c) {
    return '<button class="color-swatch' + (c === _fl_selColor ? ' sel' : '') + '" ' +
      'style="background:' + c + '" ' +
      'onclick="pickAvatarColor(this,\'' + c + '\',\'pmodal-av\')" aria-label="Cor ' + c + '"></button>';
  }).join('');

  var bd = document.createElement('div');
  bd.className = 'pmodal-bd';
  bd.id = 'pmodal-bd';
  bd.innerHTML =
    '<div class="pmodal">' +
      '<div class="pmodal-title">Criar perfil</div>' +
      '<div class="pmodal-sub">Configure seu perfil para personalizar o portal.</div>' +
      '<div class="pmodal-av-wrap">' +
        '<div class="pmodal-av" id="pmodal-av" style="background:' + _fl_selColor + '">?</div>' +
      '</div>' +
      '<div class="profile-field">' +
        '<label>Nome completo <span class="req">*</span></label>' +
        '<input type="text" id="pmodal-name" placeholder="ex: Antony Araújo" oninput="pmodalPreview()" />' +
      '</div>' +
      '<div class="profile-field">' +
        '<label>Cargo / Função</label>' +
        '<input type="text" id="pmodal-role" placeholder="ex: Network Engineer" />' +
      '</div>' +
      '<div class="profile-field">' +
        '<label>Cor do avatar</label>' +
        '<div class="color-palette">' + swatches + '</div>' +
      '</div>' +
      '<button class="btn-blue" style="width:100%;justify-content:center;margin-top:6px;" onclick="saveFirstLaunch()">Salvar perfil</button>' +
    '</div>';

  document.body.appendChild(bd);
  setTimeout(function() {
    var inp = document.getElementById('pmodal-name');
    if (inp) inp.focus();
  }, 320);
}

function pmodalPreview() {
  var name = (document.getElementById('pmodal-name') || {}).value || '';
  var av   = document.getElementById('pmodal-av');
  if (av) av.textContent = name ? getInitials(name) : '?';
  /* reuse _selColor via pickAvatarColor, but track separately for modal */
}

function saveFirstLaunch() {
  var nameEl = document.getElementById('pmodal-name');
  var name   = nameEl ? nameEl.value.trim() : '';
  if (!name) {
    if (nameEl) { nameEl.focus(); nameEl.style.borderColor = '#dc2626'; }
    return;
  }
  var role = (document.getElementById('pmodal-role') || {}).value || '';
  profileSave({ name: name, role: role.trim(), color: _selColor });
  renderTopbarAvatar();
  var bd = document.getElementById('pmodal-bd');
  if (bd) {
    bd.style.opacity = '0';
    bd.style.transition = 'opacity .2s';
    setTimeout(function() { bd.remove(); }, 220);
  }
}

/* ─────────────────────────────
   INIT
   ───────────────────────────── */
function initProfile() {
  applyTheme(settingsGet().theme);
  renderTopbarAvatar();
  if (!profileGet()) showFirstLaunchModal();
}
