import { randomBytes } from 'node:crypto';
import { groth16, zKey } from 'snarkjs';
import { checkArtifacts, wasm, zkey } from './artifacts.js';
import { FIELD, witnessNames } from './protocol.js';
process.once('message', async (values: string[]) => {
  try {
    checkArtifacts();
    const witness = Object.fromEntries(witnessNames.map((name,i) => [name, values[i]!]));
    witness.salt = (BigInt('0x'+randomBytes(32).toString('hex')) % FIELD).toString();
    const result = await groth16.fullProve(witness,wasm,zkey);
    if (result.publicSignals.length !== 13 || result.publicSignals.slice(1).some((v,i)=>v !== values[i])) throw new Error();
    const vk = await zKey.exportVerificationKey(zkey);
    if (!await groth16.verify(vk,result.publicSignals,result.proof)) throw new Error();
    process.send?.({proof:result.proof,public_signals:result.publicSignals},()=>process.exit(0));
  } catch { process.send?.({error:true},()=>process.exit(1)); }
});
