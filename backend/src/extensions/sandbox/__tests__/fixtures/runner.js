const fs = require('fs');
const net = require('net');
const child = require('child_process');

function reply(id, ok, result) {
  process.stdout.write(`${JSON.stringify({ version: 1, id, ok, result })}\n`);
}

process.stdin.once('data', (buffer) => {
  const request = JSON.parse(buffer.toString('utf8'));
  const action = request.params.action;
  if (action === 'crash') process.exit(17);
  if (action === 'timeout') return setTimeout(() => reply(request.id, true, 'late'), 10_000);
  if (action === 'large-output') return process.stdout.write('x'.repeat(1_100_000));
  if (action === 'filesystem') {
    try { fs.readFileSync('/etc/passwd'); reply(request.id, true, 'filesystem-open'); }
    catch { reply(request.id, true, 'filesystem-denied'); }
    return;
  }
  if (action === 'network') {
    reply(request.id, true, process.permission.has('net') ? 'network-open' : 'network-denied');
    return;
  }
  if (action === 'child-process') {
    try { child.execFileSync('/bin/true'); reply(request.id, true, 'child-open'); }
    catch { reply(request.id, true, 'child-denied'); }
    return;
  }
  reply(request.id, true, action ?? 'ok');
});
