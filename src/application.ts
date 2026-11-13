import type { IncomingMessage, ServerResponse } from 'node:http';
import { authentic, digest, sign } from './crypto.js';
import { fresh, policy, preflightSchema, reject, taskSchema, type Decision, type Evidence, type Reply, type Task } from './protocol.js';
import { prove } from './prover.js';
import { finalize } from './kurier.js';
import type { Config } from './config.js';
import { readVk } from './artifacts.js';
import type { State } from './state.js';
export type Dependencies = {
  prove:(task:Task,decision:Decision,signal:AbortSignal)=>Promise<Evidence>;
  finalize:(evidence:Evidence,signal:AbortSignal)=>Promise<{jobId:string;txHash:string}>;
};
export function application(config: Config, state: State, supplied?: Dependencies) {
  const deps: Dependencies = supplied || {prove, finalize:(e,s)=>finalize(e,config,readVk(),s)};
  let active = false;
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const started = Date.now();
    const controller = new AbortController();
    let sent = false;
    let claimedId: string | undefined;
    const send = (status: number, body: unknown) => {
      if (sent || res.destroyed) return;
      sent = true;
      const raw = JSON.stringify(body);
      res.writeHead(status,{'content-type':'application/json','cache-control':'no-store',
        'x-agent-games-signature':sign(config.secret,raw),'x-content-type-options':'nosniff'});
      res.end(raw);
    };
    const fail = (reason:string,status=200) => send(status,reject(reason));
    const expired = () => {controller.abort(); fail('TIMEOUT');};
    let timer = setTimeout(expired,58000);
    timer.unref();
    const disconnected = () => {if (!res.writableEnded) controller.abort();};
    res.once('close',disconnected);
    let ownsSlot = false;
    try {
      if (req.url === '/healthz' && req.method === 'GET') {send(200,{ok:true});return;}
      if (req.url !== config.agentPath) {fail('NOT_FOUND',404);return;}
      if (req.method !== 'POST') {fail('METHOD_NOT_ALLOWED',405);return;}
      if ((req.headers['content-type'] || '').split(';')[0]?.trim().toLowerCase() !== 'application/json') {fail('CONTENT_TYPE',415);return;}
      if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') {fail('CONTENT_ENCODING',415);return;}
      // Refuse work while one proving job is running; no unbounded queue.
      if (active) {fail('BUSY',503);return;}
      active = ownsSlot = true;
      const chunks: Buffer[] = [];
      let length = 0;
      const uploadTimer = setTimeout(()=>{controller.abort();fail('BODY_TIMEOUT',408);req.destroy();},5000);
      try {
        for await (const chunk of req) {
          controller.signal.throwIfAborted();
          const bytes = Buffer.from(chunk as Uint8Array);
          length += bytes.length;
          if (length > 32768) {fail('BODY_TOO_LARGE',413);return;}
          chunks.push(bytes);
        }
      } finally {clearTimeout(uploadTimer);}
      const raw = Buffer.concat(chunks);
      if (!authentic(config.secret,raw,req.headers['x-agent-games-signature'])) {fail('INVALID_SIGNATURE',401);return;}
      // Authentication deliberately precedes JSON decoding.
      let json: unknown;
      try {json = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}
      catch {fail('INVALID_JSON',400);return;}
      const preflight = preflightSchema.safeParse(json);
      if (preflight.success) {
        if (!fresh(preflight.data.issued_at) || !state.nonce(digest(preflight.data.agent_id+':'+preflight.data.nonce))) {fail('STALE_PREFLIGHT',400);return;}
        send(200,{ok:true,protocolVersion:'v1'}); return;
      }
      const parsed = taskSchema.safeParse(json);
      if (!parsed.success) {fail('INVALID_TASK',400);return;}
      const task = parsed.data;
      const deadline = Math.min(started+58000,Date.parse(task.deadline_at)-500);
      if (!fresh(task.issued_at) || Date.parse(task.deadline_at) <= Date.parse(task.issued_at) || deadline <= Date.now()) {fail('STALE_TASK');return;}
      clearTimeout(timer); timer = setTimeout(expired,deadline-Date.now());
      const claim = state.claim(task.task_id,digest(raw),task.input.proof_tx);
      if (claim.kind === 'conflict') {fail('TASK_ID_CONFLICT',409);return;}
      if (claim.kind === 'cached') {send(200,claim.reply);return;}
      claimedId = task.task_id;
      if (claim.kind === 'reused') {
        const reply = reject('PROOF_REUSED');state.save(task.task_id,reply);send(200,reply);return;
      }
      const candidate = policy(task);
      let evidence: Evidence;
      try {evidence = await deps.prove(task,candidate.decision,controller.signal);}
      catch {const reply = reject(controller.signal.aborted ? 'TIMEOUT' : 'PROOF_GENERATION_FAILED');state.save(task.task_id,reply);send(200,reply);return;}
      controller.signal.throwIfAborted();
      // Retain locally verified evidence before making the external request.
      state.audit(task.task_id,{decision:candidate.decision,...evidence});
      let reply: Reply = {...candidate,...evidence};
      try {
        const confirmed = await deps.finalize(evidence,controller.signal);
        controller.signal.throwIfAborted();
        if (Date.now() >= deadline) throw new Error('Deadline exceeded');
        reply.proof_tx = confirmed.txHash;
        state.audit(task.task_id,{decision:candidate.decision,...evidence,...confirmed});
      } catch {
        // A mathematically valid APPROVE proof cannot accompany a transport REJECT.
        reply = candidate.decision === 'REJECT' ? {...candidate,...evidence}
          : reject(controller.signal.aborted ? 'TIMEOUT' : 'FINALIZATION_FAILED');
      }
      if (controller.signal.aborted || Date.now() >= deadline) reply = reject('TIMEOUT');
      state.save(task.task_id,reply);
      send(200,reply);
    } catch {
      const reply = reject(controller.signal.aborted ? 'TIMEOUT' : 'INTERNAL_ERROR');
      // A crash or storage failure never leaves an APPROVE response in flight.
      if (claimedId) {try {state.save(claimedId,reply);} catch { /* existing claim stays fail closed */ }}
      send(200,reply);
    } finally {
      clearTimeout(timer);res.removeListener('close',disconnected);
      if (ownsSlot) active = false;
    }
  };
}
