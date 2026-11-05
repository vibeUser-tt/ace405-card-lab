import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {beginRun,autoTurn,endTurn,opponentTuning} from '../src/game.ts';
import {levels,performance,qualified,keyOf,turnRules} from '../src/model.ts';
const runs=Number(process.argv.find(s=>s.startsWith('--runs='))?.split('=')[1]||200);
const offset=Number(process.argv.find(s=>s.startsWith('--offset='))?.split('=')[1]||1);
const ai='stamina-only-v1';
const tag=process.argv.find(s=>s.startsWith('--tag='))?.split('=')[1]||'baseline';
const horizon=Number(process.argv.find(s=>s.startsWith('--horizon='))?.split('=')[1]||0);
if(horizon)for(const level of levels)level.rounds=horizon;
for(const [arg,key] of [['guided','guidedChance'],['attacks','attackChance'],['quiet','quietRounds']]){
 const setting=process.argv.find(s=>s.startsWith(`--${arg}=`));if(setting)opponentTuning[key]=Number(setting.split('=')[1]);
}
const policies=(process.argv.find(s=>s.startsWith('--policies='))?.split('=')[1]||'random,learner,tactical,idle').split(',');
const sources={};for(const name of ['src/model.ts','src/game.ts','scripts/poc-balance.mjs'])sources[name]=createHash('sha256').update(await readFile(name)).digest('hex');
const report={runs,offset,ai,tag,horizon,turnRules:{...turnRules},opponent:{...opponentTuning},levels:structuredClone(levels),sources,results:[]};
for(let level=0;level<levels.length;level++)for(const policy of policies){
 const counts={victory:0,defeat:0,draw:0,timeout:0};let rounds=0,attacks=0,npcAttacks=0,changes=0,noops=0,qualifiedPlayer=0,multiSelf=0,multiCounter=0,multiFunction=0,maxActions=0,firstRoundLosses=0;const finals=new Set(),ends=[];
 for(let i=0;i<runs;i++){
  let g=beginRun(level,offset+i);
  while(g.phase==='battle'){g=autoTurn(g,'player',policy);g=endTurn(g);}
  counts[g.phase]++;rounds+=g.round;qualifiedPlayer+=qualified(performance(g.player.config),levels[level])?1:0;finals.add(keyOf(g.player.config));
  if(g.phase!=='timeout')ends.push(g.round);
  if(g.round===1&&g.phase==='defeat')firstRoundLosses++;
  const turns=new Map();
  for(const e of g.events)if(e.side==='player'){const tally=turns.get(e.round)||{self:0,counter:0,function:0,total:0};tally[e.mode]++;if(e.card==='F06')tally.counter++;tally.total++;turns.set(e.round,tally);}
  for(const t of turns.values()){multiSelf+=t.self>1?1:0;multiCounter+=t.counter>1?1:0;multiFunction+=t.function>2?1:0;maxActions=Math.max(maxActions,t.total);}
  for(const e of g.events){if(e.mode==='counter'||e.card==='F06'){if(e.side==='player')attacks++;else npcAttacks++;}if(e.side==='player'&&e.factor&&e.before!==undefined){changes++;if(e.before===e.after)noops++;}}
 }
 ends.sort((a,b)=>a-b);const percentile=p=>ends[Math.min(ends.length-1,Math.floor(ends.length*p))]??null;
 const row={level:levels[level].id,policy,...counts,winRate:counts.victory/runs,completionRate:1-counts.timeout/runs,qualifiedRate:qualifiedPlayer/runs,meanRounds:rounds/runs,medianFinish:percentile(.5),p90Finish:percentile(.9),p95Finish:percentile(.95),finishBy:Object.fromEntries([1,2,4,8,10,12,14,16,20,24,30,40,60].map(n=>[n,ends.filter(r=>r<=n).length/runs])),firstRoundLossRate:firstRoundLosses/runs,multiSelfTurnRate:multiSelf/rounds,multiCounterTurnRate:multiCounter/rounds,multiFunctionTurnRate:multiFunction/rounds,maxActions,attacksPerGame:attacks/runs,npcAttacksPerGame:npcAttacks/runs,noopRate:changes?noops/changes:0,distinctFinals:finals.size};
 report.results.push(row);console.log(JSON.stringify(row));
}
await mkdir('validation',{recursive:true});await writeFile(`validation/poc-${tag}.json`,JSON.stringify(report,null,2));
