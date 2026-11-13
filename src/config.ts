import { z } from 'zod';
export const MAINNET_VK = '0x6b79c6012a6d8651f3e13bc4d2a20370280ab49700c90c5316d4168bfbad77b0';
export function config(env: NodeJS.ProcessEnv = process.env) {
  const network = z.enum(['testnet','mainnet']).parse(env.NETWORK || 'testnet');
  const secret = z.string().min(32).parse(env.AGENT_GAMES_HMAC_SECRET);
  const apiKey = z.string().min(1).parse(env.KURIER_API_KEY);
  const vkHash = env.REGISTERED_CIRCUIT_VK_HASH || undefined;
  // Only the official key is accepted on mainnet. Testnet uses the exported full VK.
  if (network === 'testnet' && vkHash) throw new Error('Testnet requires full verification key submission');
  if (network === 'mainnet' && vkHash && vkHash !== MAINNET_VK) throw new Error('Incorrect registered circuit key');
  const agentPath = env.AGENT_PATH || '/agent';
  if (!/^\/[a-zA-Z0-9/_-]+$/.test(agentPath)) throw new Error('Invalid handler path');
  if (Boolean(env.TLS_CERT_PATH) !== Boolean(env.TLS_KEY_PATH)) throw new Error('TLS needs certificate and key');
  return {secret, apiKey, network, vkHash: network === 'mainnet' ? MAINNET_VK : undefined,
    apiUrl: network === 'testnet' ? 'https://api-testnet.kurier.xyz/api/v1' : 'https://api.kurier.xyz/api/v1',
    agentPath, port: z.coerce.number().int().min(1).max(65535).parse(env.PORT || 3000),
    host: env.HOST || '0.0.0.0', statePath: env.STATE_PATH || './data/state.sqlite',
    tlsCert: env.TLS_CERT_PATH, tlsKey: env.TLS_KEY_PATH};
}
export type Config = ReturnType<typeof config>;
