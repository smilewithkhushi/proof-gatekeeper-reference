import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import type { Config } from './config.js';
import type { Evidence } from './protocol.js';
const submission = z.object({jobId:z.string().min(1).max(160), optimisticVerify:z.literal('success')});
const statusSchema = z.object({jobId:z.string(),status:z.enum(['Queued','Valid','Submitted','IncludedInBlock','Finalized','Failed']),
  proofType:z.literal('groth16').optional(), txHash:z.string().regex(/^0x[0-9a-fA-F]{64}$/).nullable().optional()});
export async function finalize(evidence: Evidence, config: Pick<Config,'apiUrl'|'apiKey'|'vkHash'>,
  vk: Record<string,unknown>, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<{jobId:string;txHash:string}> {
  const request = async (path: string, body?: unknown) => {
    signal.throwIfAborted();
    const result = await fetcher(`${config.apiUrl}/${path}`,{method:body ? 'POST':'GET',
      headers:{'content-type':'application/json'},body:body ? JSON.stringify(body):undefined,
      signal:AbortSignal.any([signal,AbortSignal.timeout(8000)]), redirect:'error'});
    if (!result.ok) throw new Error('Relay request failed');
    const raw = await result.text();
    if (raw.length > 262144) throw new Error('Relay response too large');
    return JSON.parse(raw) as unknown;
  };
  const key = encodeURIComponent(config.apiKey);
  const job = submission.parse(await request(`submit-proof/${key}`,{
    proofType:'groth16',vkRegistered:Boolean(config.vkHash),
    proofOptions:{library:'snarkjs',curve:'bn128'},
    proofData:{proof:evidence.proof,publicSignals:evidence.public_signals,vk:config.vkHash || vk}
  }));
  while (true) {
    const result = statusSchema.parse(await request(`job-status/${key}/${encodeURIComponent(job.jobId)}`));
    if (result.jobId !== job.jobId || result.status === 'Failed') throw new Error('Relay verification failed');
    if (result.status === 'Finalized') {
      signal.throwIfAborted();
      if (!result.txHash) throw new Error('Missing finalized transaction');
      return {jobId:job.jobId,txHash:result.txHash};
    }
    await delay(1000,undefined,{signal});
  }
}
