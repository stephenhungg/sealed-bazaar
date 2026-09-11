import {readFileSync,readdirSync,statSync} from 'node:fs';
const secrets=readFileSync('.env.local','utf8').trim().split('\n').map(x=>x.slice(x.indexOf('=')+1)).filter(Boolean);
function walk(dir){return readdirSync(dir).flatMap(x=>{const p=dir+'/'+x;return statSync(p).isDirectory()?walk(p):[p];});}
const hits=walk('dist').filter(p=>{try{const text=readFileSync(p,'utf8');return secrets.some(s=>text.includes(s));}catch{return false;}});
if(hits.length)throw Error('Secret material detected in build outputs: '+hits.join(', '));
console.log('PASS no configured secrets embedded in deployment output');
