import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { application, type Dependencies } from '../src/application.js';
import { State } from '../src/state.js';
import { authentic, sign } from '../src/crypto.js';
import { fixture, settings } from './fixtures.js';
const evidence={proof:{protocol:'groth16'},public_signals:['test-double']};
async function setup(deps?: Dependencies) {
  const config=settings(), state=new State(':memory:');let work=0;
  const server=createServer(application(config,state,deps || {
    prove:async()=>{work++;return evidence;},finalize:async()=>({jobId:'test-job',txHash:'0x'+'aa'.repeat(32)})}));
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/agent`;
  const post=async(body:unknown,signature?:string)=>{
    const raw=typeof body==='string'?body:JSON.stringify(body);
    const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json',
      'x-agent-games-signature':signature ?? sign(config.secret,raw)},body:raw});
    const bytes=Buffer.from(await response.arrayBuffer());
    assert.equal(authentic(config.secret,bytes,response.headers.get('x-agent-games-signature')),true);
    return {status:response.status,body:JSON.parse(bytes.toString()) as Record<string,unknown>};
  };
  return {post,work:()=>work,close:async()=>{await new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();});state.close();}};
}
test('signed preflight, authentication before parsing, raw body integrity and idempotent tasks',async()=>{
  const s=await setup();try {
    const pre={type:'agent-games.preflight.v1',agent_id:'test-agent',nonce:'test-nonce',issued_at:new Date().toISOString()};
    assert.deepEqual((await s.post(pre)).body,{ok:true,protocolVersion:'v1'});
    assert.equal((await s.post(pre)).body.decision,'REJECT');
    assert.equal((await s.post('{','00'.repeat(32))).status,401);
    assert.equal((await s.post('{')).status,400);
    assert.equal(s.work(),0);
    const task=fixture();const first=await s.post(task);
    assert.equal(first.body.decision,'APPROVE');assert.deepEqual((await s.post(task)).body,first.body);assert.equal(s.work(),1);
    task.task_id=fixture().task_id;
    assert.equal((await s.post(task)).body.reason_code,'PROOF_REUSED');assert.equal(s.work(),1);
    const stale=fixture();stale.issued_at=new Date(Date.now()-120000).toISOString();
    assert.equal((await s.post(stale)).body.reason_code,'STALE_TASK');
  } finally {await s.close();}
});
test('relay failure never returns an approval proof; circuit rejection retains its proof',async()=>{
  const s=await setup({prove:async()=>evidence,finalize:async()=>{throw new Error('sensitive remote failure');}});
  try {
    const reply=(await s.post(fixture())).body;
    assert.equal(reply.decision,'REJECT');assert.equal(reply.reason_code,'FINALIZATION_FAILED');assert.equal(reply.proof,undefined);
    const trap=fixture();trap.input.amount='1001';const rejection=(await s.post(trap)).body;
    assert.equal(rejection.decision,'REJECT');assert.deepEqual(rejection.proof,evidence.proof);
    assert.ok(!JSON.stringify(reply).includes('sensitive'));
  } finally {await s.close();}
});
test('deadline aborts in-flight work and responds REJECT',async()=>{
  const s=await setup({prove:async(_t,_d,signal)=>new Promise((_resolve,reject)=>{
    signal.addEventListener('abort',()=>reject(new Error('timeout')),{once:true});
  }),finalize:async()=>{throw new Error();}});
  try {const task=fixture();task.deadline_at=new Date(Date.now()+700).toISOString();
    assert.equal((await s.post(task)).body.reason_code,'TIMEOUT');
  } finally {await s.close();}
});
