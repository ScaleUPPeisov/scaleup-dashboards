// Run ONLY on a trusted owner's machine.
// Never commit generated keys or paste the VAPID private key into a chat/log.
import { generateKeyPairSync } from 'node:crypto';
const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const jwk=pair.privateKey.export({format:'jwk'});
const x=Buffer.from(jwk.x,'base64url'),y=Buffer.from(jwk.y,'base64url');
const publicKey=Buffer.concat([Buffer.from([4]),x,y]).toString('base64url');
const privateKey=jwk.d;
if(x.length!==32||y.length!==32||Buffer.from(privateKey,'base64url').length!==32)
  throw new Error('Unexpected VAPID key lengths');
process.stdout.write(
  'VAPID_PUBLIC_KEY='+publicKey+'\n'+
  'VAPID_PRIVATE_KEY='+privateKey+'\n'+
  '# Save the private key directly in Cloudflare Worker Secrets, never in Git.\n'
);
