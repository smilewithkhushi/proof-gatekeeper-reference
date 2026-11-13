import test from 'node:test';
import assert from 'node:assert/strict';
import { finalize } from '../src/kurier.js';
const config={apiUrl:'https://api-testnet.kurier.xyz/api/v1',apiKey:'test-only',vkHash:undefined};
const e={proof:{protocol:'groth16'},public_signals:['1']};
test('Kurier waits through inclusion until Finalized and sends the full VK on testnet',async()=>{
  const stages=[{jobId:'job',optimisticVerify:'success'},{jobId:'job',status:'IncludedInBlock'},
    {jobId:'job',status:'Finalized',txHash:'0x'+'ab'.repeat(32)}];
  const fetcher=(async(url,init)=>{
    if(stages.length===3) {
      const body=JSON.parse(String(init?.body));assert.equal(body.vkRegistered,false);assert.deepEqual(body.proofData.vk,{test:'vk'});
      assert.ok(String(url).includes('/submit-proof/'));
    } else assert.ok(String(url).includes('/job-status/test-only/job'));
    return Response.json(stages.shift());
  }) as typeof fetch;
  assert.equal((await finalize(e,config,{test:'vk'},AbortSignal.timeout(5000),fetcher)).txHash,'0x'+'ab'.repeat(32));
  assert.equal(stages.length,0);
});
test('failed, ambiguous and nonfinal relay jobs cannot authorize',async()=>{
  for(const response of [{jobId:'job',optimisticVerify:'failed'},{job_id:'job'},
    {jobId:'job',optimisticVerify:'success'}]) {
    let count=0;
    const fetcher=(async()=>Response.json(count++===0?response:{jobId:'job',status:'Failed'})) as typeof fetch;
    await assert.rejects(finalize(e,config,{},AbortSignal.timeout(100),fetcher));
  }
  let count=0;
  const fetcher=(async()=>Response.json(count++===0?{jobId:'job',optimisticVerify:'success'}:{jobId:'job',status:'IncludedInBlock'})) as typeof fetch;
  await assert.rejects(finalize(e,config,{},AbortSignal.timeout(50),fetcher));
});
