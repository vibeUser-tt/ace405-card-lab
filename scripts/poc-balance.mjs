import {writeFile,readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {beginRun,autoTurn,endTurn,opponentTuning,remainingPoints} from '../src/game.ts';
import {levels,qualified,performance,pointById,turnRules,pointStep,factors,functions,functionById} from '../src/model.ts';
const arg=(name,fallback)=>process.argv.find(s=>s.startsWith('--'+name+'='))?.split('=')[1]??fallback;
const runs=+arg('runs','100'),offset=+arg('offset','1'),tag=arg('tag','pilot'),first=arg('first','player'),npcPolicy=arg('opponent','opponent');
for(const [name,key] of [['guided','guidedChance'],['attacks','attackChance'],['quiet','quietRounds'],['pressure-guided','pressuredGuidedChance'],['pressure-gap','pressureGap'],['counter-weight','counterWeight']])opponentTuning[key]=+arg(name,String(opponentTuning[key]));
if(arg('shield','')){functionById.F08.ap=+arg('shield','2');functionById.F08.cost=+arg('shield','2');}
if(arg('stress','')==='true')for(const l of levels){l.limits.D+=6;l.limits.E-=7;}
const policies=arg('policies','random,skilled,learner,tactical,idle').split(',');
const report={runs,offset,tag,first,npcPolicy,opponent:{...opponentTuning},turnRules,pointStep,functions,levels,policyDefinitions:{random:'uniform card then random parameter/direction; 25% counters',skilled:'fixed coarse trends and value-weighted plausible actions; knows suits/costs; no prospective response-model output',learner:'learns slopes from prior observed actions',tactical:'exact response-model greedy reference, not the human-skill target'},sources:{},results:[]};
for(const name of ['src/model.ts','src/game.ts','src/response-fit.json','scripts/poc-balance.mjs'])report.sources[name]=createHash('sha256').update(await readFile(name)).digest('hex');
for(let level=0;level<3;level++)for(const policy of policies){
 const tally={victory:0,defeat:0,draw:0,stalled:0,guard:0},ends=[],costs=[],winCosts=[],factorUse=Object.fromEntries(factors.map(f=>[f,0])),rankUse=Array(11).fill(0);
 const hands={turns:0,totalCards:0,pointCards:0,functionCards:0,zeroPointStarts:0,onePointStarts:0,noPointPlayTurns:0,unfinishedTurns:0,emptyPointEnds:0,unaffordablePointEnds:0,unusedEnergy:0};
 let npcAttacks=0,npcAttackGames=0,npcHarmful=0,npcBlocked=0,npcNoops=0,npcMatched=0,attacks=0,blocks=0,blockedPoints=0,shields=0,noops=0,plays=0,remaining=0,firstLoss=0,qualifiedCount=0,overshoot=0;
 for(let i=0;i<runs;i++){
  let g=beginRun(level,offset+i,first,npcPolicy),idleRounds=0;
  while(g.phase==='battle'&&g.round<=160){
   const before=g.events.length,active=remainingPoints(g.player)>0&&!qualified(performance(g.player.config),levels[level]);
   if(active){hands.turns++;hands.totalCards+=g.player.hand.length+g.player.functionHand.length;hands.pointCards+=g.player.hand.length;hands.functionCards+=g.player.functionHand.length;hands.zeroPointStarts+=Number(g.player.hand.length===0);hands.onePointStarts+=Number(g.player.hand.length===1);}
   g=autoTurn(g,'player',policy);
   if(active){hands.unusedEnergy+=g.player.energy;hands.noPointPlayTurns+=Number(!g.events.slice(before).some(e=>e.side==='player'&&e.kind==='point'));}
   if(active&&remainingPoints(g.player)>0&&!qualified(performance(g.player.config),levels[level])){
    hands.unfinishedTurns++;
    if(g.player.energy>0){hands.emptyPointEnds+=Number(g.player.hand.length===0);hands.unaffordablePointEnds+=Number(g.player.hand.length>0&&!g.player.hand.some(id=>pointById[id].rank<=g.player.energy));}
   }
   g=endTurn(g);
   idleRounds=g.events.length===before?idleRounds+1:0;
   if(idleRounds>=3)break;
  }
  const state=g.phase==='battle'?(idleRounds>=3?'stalled':'guard'):g.phase;tally[state]++;
  ends.push(g.round);costs.push(g.player.spent);if(g.phase==='victory')winCosts.push(g.player.spent);
  if(g.round===1&&g.phase==='defeat')firstLoss++;
  qualifiedCount+=Number(qualified(performance(g.player.config),levels[level]));remaining+=remainingPoints(g.player);
  npcAttackGames+=Number(g.events.some(e=>e.side==='npc'&&e.mode==='counter'));
  for(const e of g.events){if(e.side==='npc'&&e.mode==='counter'){npcAttacks++;npcBlocked+=Number(!!e.blocked);npcNoops+=Number(!e.blocked&&e.before===e.after);npcMatched+=Number(e.multiplier===2);npcHarmful+=Number(!e.blocked&&((e.afterValues?.D??0)<(e.beforeValues?.D??0)-1e-8||(e.afterValues?.E??0)>(e.beforeValues?.E??0)+1e-8));}if(e.card==='F08')shields++;if(e.blocked){blocks++;blockedPoints+=e.points;}
   if(e.side==='player'&&e.kind==='point'){plays++;factorUse[e.factor]++;rankUse[e.points]++;if(e.mode==='counter')attacks++;if(e.before===e.after&&!e.blocked)noops++;if(!e.blocked)overshoot+=Math.max(0,e.points-Math.abs(e.after-e.before)/(pointStep*(e.multiplier??1)));}
  }
 }
 ends.sort((a,b)=>a-b);const mean=a=>a.reduce((s,n)=>s+n,0)/(a.length||1),q=p=>ends[Math.floor((ends.length-1)*p)];
 const row={level:levels[level].id,policy,...tally,winRate:tally.victory/runs,qualifiedRate:qualifiedCount/runs,firstRoundLoss:firstLoss/runs,meanRounds:mean(ends),medianRounds:q(.5),p95Rounds:q(.95),meanCost:mean(costs),winnerCost:mean(winCosts),remainingPoints:remaining/runs,attacksPerGame:attacks/runs,npcCounter:{attacks:npcAttacks,games:npcAttackGames,gameRate:npcAttackGames/runs,perGame:npcAttacks/runs,harmful:npcHarmful,blocked:npcBlocked,noops:npcNoops,matched:npcMatched},noopRate:noops/(plays||1),wastedBoundaryPoints:overshoot/runs,shieldsPerGame:shields/runs,shieldTriggerRate:blocks/(shields||1),blockedPointsPerShield:blockedPoints/(shields||1),factorUse,rankUse,handMetrics:{...hands,meanCards:hands.totalCards/(hands.turns||1),meanPoints:hands.pointCards/(hands.turns||1),meanFunctions:hands.functionCards/(hands.turns||1),zeroPointStartRate:hands.zeroPointStarts/(hands.turns||1),onePointStartRate:hands.onePointStarts/(hands.turns||1),noPointPlayRate:hands.noPointPlayTurns/(hands.turns||1),meanUnusedEnergy:hands.unusedEnergy/(hands.turns||1),emptyPointEndRate:hands.emptyPointEnds/(hands.unfinishedTurns||1),unaffordablePointEndRate:hands.unaffordablePointEnds/(hands.unfinishedTurns||1)}};
 report.results.push(row);console.log(JSON.stringify({level:row.level,policy,...tally,win:row.winRate,rounds:row.meanRounds,cost:row.meanCost,p95:row.p95Rounds,npcCounterRate:row.npcCounter.gameRate}));
}
await mkdir('validation',{recursive:true});await writeFile('validation/points-'+tag+'.json',JSON.stringify(report,null,2));
