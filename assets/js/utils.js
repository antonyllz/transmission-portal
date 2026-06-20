/* ═══════════════════
   UTILS
   ═══════════════════ */

function pad(n) { return String(n).padStart(2, '0'); }

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtCountdown(sec) {
  if (sec <= 0) return 'Expirado';
  var d = Math.floor(sec / 86400);
  var h = Math.floor((sec % 86400) / 3600);
  var m = Math.floor((sec % 3600) / 60);
  var s = sec % 60;
  if (d > 0) return d + 'd ' + pad(h) + 'h ' + pad(m) + 'm';
  return pad(h) + 'h ' + pad(m) + 'm ' + pad(s) + 's';
}
