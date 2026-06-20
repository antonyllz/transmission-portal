/* ═══════════════════════════════════
   DATABASE — localStorage helpers
   ═══════════════════════════════════ */

/* ── CASES (timeline tickets) ── */
function dbGetAll() {
  try { return JSON.parse(localStorage.getItem('net_cases') || '[]'); }
  catch (e) { return []; }
}
function dbSave(a)   { localStorage.setItem('net_cases', JSON.stringify(a)); }
function dbGetCase(id) {
  return dbGetAll().find(function(c) { return c.ticketId === id; }) || null;
}
function dbUpsert(obj) {
  var a = dbGetAll();
  var i = a.findIndex(function(c) { return c.ticketId === obj.ticketId; });
  if (i >= 0) { a[i] = obj; } else { a.unshift(obj); }
  dbSave(a);
  updateBadge();
}
function dbDelete(id) {
  dbSave(dbGetAll().filter(function(c) { return c.ticketId !== id; }));
  updateBadge();
}

/* ── DEMANDS (note board) ── */
function dmdGetAll() {
  try { return JSON.parse(localStorage.getItem('net_demands') || '[]'); }
  catch (e) { return []; }
}
function dmdSave(a) { localStorage.setItem('net_demands', JSON.stringify(a)); }
function dmdDelete(id) {
  dmdSave(dmdGetAll().filter(function(d) { return d.id !== id; }));
}
