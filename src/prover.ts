import { fork } from 'node:child_process';
import { publicInputs, type Task, type Decision, type Evidence } from './protocol.js';
export function prove(task: Task, decision: Decision, signal: AbortSignal): Promise<Evidence> {
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const child = fork(new URL(import.meta.url.endsWith('.ts') ? './proof-worker.ts' : './proof-worker.js',import.meta.url),[],{
      stdio:['ignore','ignore','ignore','ipc'],
      // Do not inherit parent eval, test-runner or debugger flags.
      execArgv: import.meta.url.endsWith('.ts') ? ['--import','tsx'] : [],
      // No HMAC or relay secrets are passed into the proving process.
      env:{PATH:process.env.PATH, NODE_ENV:'production'}, serialization:'json'
    });
    let settled = false;
    const finish = (error?: Error, result?: Evidence) => {
      if (settled) return; settled = true;
      signal.removeEventListener('abort',abort); child.kill('SIGKILL');
      if (error) reject(error); else resolve(result!);
    };
    const abort = () => finish(new Error('Deadline exceeded'));
    signal.addEventListener('abort',abort,{once:true});
    child.once('error',()=>finish(new Error('Prover unavailable')));
    child.once('exit',()=>finish(new Error('Proof generation failed')));
    child.once('message',(value: Evidence & {error?:boolean})=>{
      if (value.error || !value.proof || !Array.isArray(value.public_signals)) finish(new Error('Proof generation failed'));
      else finish(undefined,value);
    });
    child.send(publicInputs(task,decision));
  });
}
