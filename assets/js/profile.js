/* ═══════════════════════════════
   SETTINGS
   ═══════════════════════════════ */

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

/* ─────────────────────────────
   SETTINGS PANEL
   ───────────────────────────── */
var _settingsOpen = false;

function openSettings() {
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

function closeSidePanels() {
  document.getElementById('side-backdrop').classList.remove('open');
  document.getElementById('settings-panel').classList.remove('open');
  _settingsOpen = false;
}

function _renderSettings() {
  var s = settingsGet();

  document.getElementById('settings-body').innerHTML =
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
   INIT
   ───────────────────────────── */
function initProfile() {
  applyTheme(settingsGet().theme);
}
