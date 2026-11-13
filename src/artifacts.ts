import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { digest } from './crypto.js';
export const wasm = resolve('circuits/gatekeeper.wasm');
export const zkey = resolve('circuits/gatekeeper_final.zkey');
export const vkPath = resolve('circuits/verification_key.json');
const expected = ['be00aefe3c8ba910951a242f50e55937bf82a0375ad4b69c2ef10629ab92764f',
  'adfe95a439a7063a82a4967ef026d2dd6857a4d02c63b3caf63dac02e01af80d'];
export function checkArtifacts() {
  for (const [index,path] of [wasm,zkey].entries()) {
    if (digest(readFileSync(path)) !== expected[index]) throw new Error('Circuit integrity check failed');
  }
}
export function readVk(): Record<string,unknown> {return JSON.parse(readFileSync(vkPath,'utf8')) as Record<string,unknown>;}
