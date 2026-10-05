// Reference implementation from 0.2.0-rc.1 (commit 3bd5334), kept only for measurement.
import {DFA} from '../dist/core/src/index.js';
const endsWith=(xs,p)=>xs.length>=p.length&&p.every((s,i)=>s===xs[xs.length-p.length+i]);
export function legacyForbidden(patterns){
 const prefixes=[[]],seen=new Set(['[]']);for(const p of patterns)for(let k=1;k<=p.length;k++){const x=p.slice(0,k),key=JSON.stringify(x);if(!seen.has(key)){seen.add(key);prefixes.push(x);}}
 return new DFA({startState:0,transition:(q,s)=>{const xs=[...prefixes[q],s];if(patterns.some(p=>endsWith(xs,p)))return null;let best=0;for(let i=1;i<prefixes.length;i++)if(prefixes[i].length>prefixes[best].length&&endsWith(xs,prefixes[i]))best=i;return best;},accept:()=>true});
}
