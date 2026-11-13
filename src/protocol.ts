import { z } from 'zod';
export const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const uint32 = z.string().regex(/^(0|[1-9][0-9]{0,9})$/).refine(v => /^(0|[1-9][0-9]{0,9})$/.test(v) && BigInt(v) <= 0xffffffffn);
const block = z.number().int().min(0).max(0xffffffff);
const hexField = z.string().regex(/^0x[0-9a-fA-F]{1,64}$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const instant = z.string().datetime({ offset: true });
export const taskSchema = z.object({
  type: z.literal('agent-games.proof-gatekeeper.v1'),
  task_id: z.string().max(160).regex(/(?:^|_)[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/),
  mode: z.enum(['practice', 'competition']), issued_at: instant, deadline_at: instant,
  input: z.object({registered_vk: hexField, proof_vk: hexField, minimum: uint32,
    public_balance: uint32, expiry_block: block, current_block: block,
    recipient: address, condition_recipient: address, amount: uint32, max_transfer: uint32,
    proof_tx: z.string().regex(/^0x[0-9a-fA-F]{1,64}$/)
  }).strict()
}).strict();
export const preflightSchema = z.object({type: z.literal('agent-games.preflight.v1'),
  agent_id: z.string().min(1).max(160), issued_at: instant, nonce: z.string().min(1).max(256)
}).strict();
export type Task = z.infer<typeof taskSchema>;
export type Decision = 'APPROVE' | 'REJECT';
export type Evidence = { proof: Record<string, unknown>; public_signals: string[] };
export type Reply = {decision: Decision; reason_code: string; proof_tx?: string} & Partial<Evidence>;
export function reject(reason_code: string): Reply { return {decision: 'REJECT', reason_code}; }
export function policy(t: Task): Reply {
  const i = t.input;
  const reason = BigInt(i.registered_vk) !== BigInt(i.proof_vk) ? 'VK_SUBSTITUTION'
    : BigInt(i.public_balance) < BigInt(i.minimum) ? 'THRESHOLD_MISMATCH'
    : i.expiry_block <= i.current_block ? 'EXPIRED_CONDITION'
    : BigInt(i.recipient) !== BigInt(i.condition_recipient) ? 'RECIPIENT_MISMATCH'
    : BigInt(i.amount) > BigInt(i.max_transfer) ? 'AMOUNT_OVERFLOW' : 'CONDITION_VALID';
  return {decision: reason === 'CONDITION_VALID' ? 'APPROVE' : 'REJECT', reason_code: reason};
}
export function publicInputs(t: Task, decision: Decision): string[] {
  const i = t.input;
  return [i.registered_vk, i.proof_vk, i.minimum, i.public_balance, i.expiry_block,
    i.current_block, i.recipient, i.condition_recipient, i.amount, i.max_transfer,
    decision === 'APPROVE' ? 1 : 0, '0x' + t.task_id.slice(-36).replaceAll('-', '')
  ].map(v => (BigInt(v) % FIELD).toString());
}
export const witnessNames = ['registeredVkHash','proofVkHash','minimum','publicBalance',
  'expiryBlock','currentBlock','recipient','conditionRecipient','amount','maxTransfer','decision','taskId'] as const;
export function fresh(issuedAt: string, now = Date.now()): boolean {
  const issued = Date.parse(issuedAt);
  return Number.isFinite(issued) && issued <= now + 5000 && now - issued <= 60000;
}
