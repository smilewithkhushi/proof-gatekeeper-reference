import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { application } from '../src/application.js';
import { State } from '../src/state.js';
import { prove } from '../src/prover.js';
import { authentic, sign } from '../src/crypto.js';
import { fixture, settings } from '../tests/fixtures.js';
import type { Task } from '../src/protocol.js';
const config=settings();
const state=new State(':memory:');
// Offline harness: real official-circuit proofs, explicitly simulated finalization.
const server=createServer(application(config,state,{prove,finalize:async()=>({jobId:'offline-simulation',txHash:'0x'+randomBytes(32).toString('hex')})}));
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/agent`;
let count=0;
async function replay(label:string,body:unknown,expected: string) {
  const raw=JSON.stringify(body);
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json',
    'x-agent-games-signature':sign(config.secret,raw)},body:raw});
  const bytes=Buffer.from(await response.arrayBuffer());
  assert.ok(authentic(config.secret,bytes,response.headers.get('x-agent-games-signature')));
  const result=JSON.parse(bytes.toString());
  assert.equal(result.decision || result.protocolVersion,expected);
  if (label !== 'preflight' && label !== 'reused reference') assert.equal(result.public_signals?.length,13);
  count++;
  console.info(`${label}: ${result.decision || 'OK'}${result.reason_code ? ' ('+result.reason_code+')':''}`);
}
try {
  console.info('OFFLINE REPLAY — real Groth16 proofs; no network submission or funds.');
  await replay('preflight',{type:'agent-games.preflight.v1',agent_id:'offline-agent',nonce:'offline-nonce',issued_at:new Date().toISOString()},'v1');
  const valid=fixture();await replay('valid condition',valid,'APPROVE');
  const traps: Array<[string,Partial<Task['input']>]> = [
    ['VK substitution',{proof_vk:'0x1234'}],['insufficient threshold',{public_balance:'999'}],
    ['expired condition',{expiry_block:8420000}],['wrong recipient',{recipient:'0x'+'ab'.repeat(20)}],
    ['amount overflow',{amount:'1001'}]
  ];
  for (const [label,patch] of traps) {const task=fixture();Object.assign(task.input,patch);await replay(label,task,'REJECT');}
  const reused=fixture();reused.input.proof_tx=valid.input.proof_tx;
  await replay('reused reference',reused,'REJECT');
  console.info(`${count} signed envelopes replayed successfully.`);
} finally {
  await new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();});state.close();
}
