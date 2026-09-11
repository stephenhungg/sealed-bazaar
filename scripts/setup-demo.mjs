import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {createPublicClient,http,erc20Abi} from 'viem';
import {tempoModerato} from 'viem/chains';
import {execFileSync} from 'node:child_process';
if(existsSync('.env.local')||existsSync('work/testnet-wallets.json'))throw Error('Local keys already exist; refusing to overwrite them.');
mkdirSync('work',{recursive:true});
const wallets=Object.fromEntries(['seller','buyer','arbiter'].map(role=>[role,generatePrivateKey()]));
writeFileSync('work/testnet-wallets.json',JSON.stringify(wallets),{mode:0o600});
const client=createPublicClient({chain:tempoModerato,transport:http()});
if(await client.getChainId()!==42431)throw Error('Wrong chain: refusing to fund.');
for(const [role,key] of Object.entries(wallets)){
 const address=privateKeyToAccount(key).address;
 const response=await fetch(tempoModerato.rpcUrls.default.http[0],{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tempo_fundAddress',params:[address]})});
 const data=await response.json();if(data.error)throw Error('Faucet declined: '+data.error.message);
 for(const hash of data.result)await client.waitForTransactionReceipt({hash});
 const balance=await client.readContract({address:'0x20c0000000000000000000000000000000000001',abi:erc20Abi,functionName:'balanceOf',args:[address]});
 console.log(role,address,'test AlphaUSD:',Number(balance)/1e6);
}
// Preserve the old public ciphertext; new keys necessarily require new commitments.
if(existsSync('lib/sealed-reports.json'))renameSync('lib/sealed-reports.json','work/previous-sealed-reports.json');
execFileSync(process.execPath,['scripts/prepare-demo.mjs'],{stdio:'inherit'});
console.log('Next: npm run deploy:contract. Never publish .env.local or work/.');
