import test from 'node:test';
import assert from 'node:assert/strict';
import { prove } from '../src/prover.js';
import { publicInputs } from '../src/protocol.js';
import { fixture } from './fixtures.js';
// snarkjs verifier owns worker threads; run verification in the killable proof worker.
test('official artifacts prove both decisions, bind every public signal and reject forged decisions',async()=>{
  const task=fixture();
  const approved=await prove(task,'APPROVE',AbortSignal.timeout(20000));
  assert.equal(approved.proof.protocol,'groth16');assert.equal(approved.proof.curve,'bn128');
  assert.deepEqual(approved.public_signals.slice(1),publicInputs(task,'APPROVE'));
  task.input.proof_vk='0x1234';
  const rejected=await prove(task,'REJECT',AbortSignal.timeout(20000));
  assert.deepEqual(rejected.public_signals.slice(1),publicInputs(task,'REJECT'));
  await assert.rejects(prove(task,'APPROVE',AbortSignal.timeout(20000)));
  // Boundary expiry must reject inside the actual circuit too.
  task.input.proof_vk=task.input.registered_vk;task.input.expiry_block=task.input.current_block;
  assert.equal((await prove(task,'REJECT',AbortSignal.timeout(20000))).public_signals[11],'0');
});
test('proving worker respects cancellation',async()=>{
  await assert.rejects(prove(fixture(),'APPROVE',AbortSignal.timeout(1)));
});
