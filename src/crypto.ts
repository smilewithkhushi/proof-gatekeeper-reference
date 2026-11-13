import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
export function sign(secret: string, raw: Uint8Array | string): string {
  return createHmac('sha256', secret).update(raw).digest('hex');
}
export function authentic(secret: string, raw: Uint8Array, signature: unknown): boolean {
  return typeof signature === 'string' && /^[a-f0-9]{64}$/i.test(signature)
    && timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(secret, raw), 'hex'));
}
export function digest(raw: Uint8Array | string): string { return createHash('sha256').update(raw).digest('hex'); }
