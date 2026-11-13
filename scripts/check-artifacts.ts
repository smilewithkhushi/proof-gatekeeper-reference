import { writeFileSync } from 'node:fs';
import { zKey } from 'snarkjs';
import { checkArtifacts, zkey, vkPath } from '../src/artifacts.js';
checkArtifacts();
const vk = await zKey.exportVerificationKey(zkey);
if (vk.protocol !== 'groth16' || vk.curve !== 'bn128' || vk.nPublic !== 13) throw new Error('Unexpected circuit');
writeFileSync(vkPath,JSON.stringify(vk,null,2)+'\n');
console.info('Official artifacts verified; Groth16/BN128 key exported (13 public signals).');
process.exit(0);
