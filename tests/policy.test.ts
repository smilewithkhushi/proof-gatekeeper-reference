import test from 'node:test';
import assert from 'node:assert/strict';
import { policy, taskSchema, fresh, publicInputs } from '../src/protocol.js';
import { fixture } from './fixtures.js';
import { State } from '../src/state.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('valid condition and every deterministic circuit trap',()=>{
  assert.equal(policy(fixture()).decision,'APPROVE');
  const cases = [
    [{proof_vk:'0x1234'},'VK_SUBSTITUTION'], [{public_balance:'999'},'THRESHOLD_MISMATCH'],
    [{expiry_block:8420000},'EXPIRED_CONDITION'], [{expiry_block:8419999},'EXPIRED_CONDITION'],
    [{recipient:'0x'+'34'.repeat(20)},'RECIPIENT_MISMATCH'],[{amount:'1001'},'AMOUNT_OVERFLOW']
  ] as const;
  for (const [patch,reason] of cases) {
    const task=fixture();Object.assign(task.input,patch);assert.deepEqual(policy(task),{decision:'REJECT',reason_code:reason});
  }
  const boundary=fixture();boundary.input.amount='1000';boundary.input.public_balance='1000';
  assert.equal(policy(boundary).decision,'APPROVE');
});
test('strict schema rejects malformed values and encodes full-width VK hashes in the scalar field',()=>{
  for (const value of ['4294967296','-1','1.5','01']) {
    const task=fixture();task.input.amount=value;assert.equal(taskSchema.safeParse(task).success,false);
  }
  const task=fixture();task.input.registered_vk='0x'+'ff'.repeat(32);
  assert.equal(taskSchema.safeParse(task).success,true);
  assert.ok(BigInt(publicInputs(task,'REJECT')[0]!) < 21888242871839275222246405745257275088548364400416034343698204186575808495617n);
  assert.equal(taskSchema.safeParse({...fixture(),proof_system:'plonk'}).success,false);
  assert.equal(fresh(new Date(Date.now()-61000).toISOString()),false);
  assert.equal(fresh(new Date(Date.now()+10000).toISOString()),false);
  assert.equal(publicInputs(fixture(),'REJECT')[10],'0');
});
test('claims persist across restarts and prevent reuse, conflicting IDs and replay races',()=>{
  const dir=mkdtempSync(join(tmpdir(),'gatekeeper-'));
  try {
    let state=new State(join(dir,'state.sqlite'));
    assert.equal(state.claim('one','digest','0xab').kind,'new');state.close();
    state=new State(join(dir,'state.sqlite'));
    const cached=state.claim('one','digest','0xab');
    assert.equal(cached.kind,'cached');if(cached.kind==='cached')assert.equal(cached.reply.decision,'REJECT');
    assert.equal(state.claim('two','digest','0xAB').kind,'reused');
    assert.equal(state.claim('one','different','0xac').kind,'conflict');
    assert.equal(state.nonce('nonce'),true);assert.equal(state.nonce('nonce'),false);state.close();
  } finally {rmSync(dir,{recursive:true,force:true});}
});
