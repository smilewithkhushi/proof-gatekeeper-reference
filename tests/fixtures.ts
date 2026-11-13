import { randomBytes, randomUUID } from 'node:crypto';
import type { Task } from '../src/protocol.js';
import { config } from '../src/config.js';
export function settings() {return config({AGENT_GAMES_HMAC_SECRET:randomBytes(32).toString('hex'),KURIER_API_KEY:randomBytes(16).toString('hex')});}
export function fixture(): Task {
  return {type:'agent-games.proof-gatekeeper.v1',task_id:'task_R01_'+randomUUID(),mode:'practice',
    issued_at:new Date().toISOString(),deadline_at:new Date(Date.now()+60000).toISOString(),
    input:{registered_vk:'0x4a9f2c',proof_vk:'0x4a9f2c',minimum:'1000',public_balance:'1460',
      expiry_block:8430000,current_block:8420000,recipient:'0x'+'12'.repeat(20),
      condition_recipient:'0x'+'12'.repeat(20),amount:'500',max_transfer:'1000',proof_tx:'0x'+randomBytes(16).toString('hex')}};
}
