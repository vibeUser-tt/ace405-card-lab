import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {levels,factors,performance,qualified,change,pointById,provenance} from '../src/model.ts';
import {beginRun,playCard,endTurn} from '../src/game.ts';

// Each term is multilinear in monotone, separately warped inputs. With seven
// inputs fixed, each output's extrema are therefore at this axis's endpoints.
// Fail if a future fit breaks that assumption, instead of claiming a false proof.
export function auditSingleFactors() {
 for(const metric of ['D','E']) {
  assert(provenance.shapes[metric].every(p=>Number.isFinite(p)&&p!==0));
  for(const term of provenance.models[metric])assert.equal(new Set(term.axes).size,term.axes.length);
 }
 const rows=[];
 for(const level of levels)for(const factor of factors) {
  const endpoints=[0,1].map(x=>performance({...level.initial,[factor]:x}));
  const bestD=Math.max(...endpoints.map(v=>v.D)),bestE=Math.min(...endpoints.map(v=>v.E));
  const impossibleD=bestD+1e-8<level.limits.D,impossibleE=bestE>level.limits.E+1e-8;
  assert(impossibleD||impossibleE,level.id+' / '+factor+' lacks an impossible metric');
  // Also exercise all interior intervals to catch changes to the evaluator.
  for(let i=0;i<=1000;i++)assert(!qualified(performance({...level.initial,[factor]:i/1000}),level));
  rows.push({level:level.id,factor,bestD,bestE,blockedBy:[...(impossibleD?['D']:[]),...(impossibleE?['E']:[])]});
 }
 return rows;
}

export function combinedWitnesses() {
 const result=[];
 for(const level of levels) {
  let best=null;
  for(let i=0;i<factors.length;i++)for(let j=i+1;j<factors.length;j++)
   for(const a of [-1,1])for(const b of [-1,1])for(let p=1;p<=27;p++)for(let q=1;q<=27;q++) {
    if(best&&p+q>=best.points)continue;
    const config=change(change(level.initial,factors[i],a,p),factors[j],b,q);
    if(qualified(performance(config),level))best={level:level.id,points:p+q,adjustments:[{factor:factors[i],direction:a,points:p},{factor:factors[j],direction:b,points:q}],config,values:performance(config)};
   }
  assert(best,level.id+' needs a reachable two-factor solution');
  result.push(best);
 }
 return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 const runs=Number(process.argv.find(x=>x.startsWith('--runs='))?.split('=')[1]??500);
 const report={runs,offset:210001,sources:{},envelopes:auditSingleFactors(),witnesses:combinedWitnesses(),games:[]};
 for(const path of ['src/model.ts','src/game.ts','src/response-fit.json','scripts/single-factor-audit.mjs'])report.sources[path]=createHash('sha256').update(await readFile(path)).digest('hex');
 for(let level=0;level<levels.length;level++)for(const factor of factors)for(const direction of [-1,1]) {
  const row={level:levels[level].id,factor,direction,victory:0,defeat:0,draw:0,qualified:0,guard:0};
  for(let seed=report.offset;seed<report.offset+runs;seed++) {
   let g=beginRun(level,seed);
   while(g.phase==='battle'&&g.round<80) {
    while(!qualified(performance(g.player.config),levels[level])) {
     const candidates=g.player.hand.map((id,index)=>({index,rank:pointById[id].rank})).filter(c=>c.rank<=g.player.energy).sort((a,b)=>b.rank-a.rank);
     if(!candidates.length)break;
     g=playCard(g,'player',{kind:'point',index:candidates[0].index,mode:'self',factor,direction});
    }
    g=endTurn(g);
   }
   row[g.phase==='battle'?'guard':g.phase]++;
   row.qualified+=Number(qualified(performance(g.player.config),levels[level]));
  }
  report.games.push(row);
 }
 await writeFile('validation/points-single-factor.json',JSON.stringify(report,null,2));
 const total=report.games.reduce((a,r)=>({games:a.games+runs,wins:a.wins+r.victory,qualified:a.qualified+r.qualified,guard:a.guard+r.guard}),{games:0,wins:0,qualified:0,guard:0});
 console.log(JSON.stringify({envelopes:report.envelopes.length,witnesses:report.witnesses,total},null,2));
 assert.equal(total.wins,0);assert.equal(total.qualified,0);assert.equal(total.guard,0);
}
