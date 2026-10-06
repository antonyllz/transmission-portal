/* Container entrypoint: runs the data API (server.js) and the public server
   (public-server.js) side by side. If either exits, the container exits so
   Docker's restart policy brings both back. */
'use strict';
const { spawn } = require('child_process');
const path = require('path');

const procs = ['server.js', 'public-server.js'].map((f) => {
  const p = spawn(process.execPath, [path.join(__dirname, '..', 'server', f)], { stdio: 'inherit', env: process.env });
  p.on('exit', (code) => {
    console.error(f + ' exited with code ' + code + ' — stopping container');
    procs.forEach((q) => { if (q !== p) q.kill('SIGTERM'); });
    process.exit(code || 1);
  });
  return p;
});

['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, () => {
  procs.forEach((p) => p.kill('SIGTERM'));
  setTimeout(() => process.exit(0), 2000);
}));
