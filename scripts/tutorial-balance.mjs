import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {beginRun,initialGame,endTurn,playCard,designById,physical,review,boardAfterBuild,canBuild,qualified,levels,gates,score,reachablePlans} from '../src/game.ts';

// Ordinary policies inspect the visible board and hand, not hidden piles or NPC hand.
// Only "guided" additionally uses the same route count exposed by the UI.
const rng=seed=>{let n=seed>>>0;return()=>{n=(n+0x6D2B79F5)>>>0;let t=Math.imul(n^(n>>>15),n|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};};
const level=levels[0],keys=['E','D','H','C'],scales={E:30,D:20,H:60,C:80};
const deficit=v=>keys.reduce((s,k)=>s+Math.max(0,(k==='D'?level.limits[k]-v[k]:v[k]-level.limits[k])/scales[k]),0);
const count=v=>Object.values(gates(v,level)).filter(Boolean).length;
const value=(g,id)=>{
 const before=physical(g.playerBoard),after=physical(boardAfterBuild(g.playerBoard,id));
 return 100*(deficit(before)-deficit(after))+8*(count(after)-count(before))+.05*(score(after,level)-score(before,level));
};
function ordinaryTurn(start,style,random){
 let g=start;const miss=style==='one_mistake'&&g.round===2;
 for(let step=0;step<8;step++){
  if(qualified(review(g.playerBoard,g.effects,'player'),level))break;
  let options=g.hand.filter(id=>designById[id]&&canBuild({...g,energy:Math.min(5,g.energy+1)},id));
  if(style==='guided')options=options.filter(id=>reachablePlans(g,'player',id).length);
  const ranked=[...options].sort((a,b)=>value(g,b)-value(g,a));
  let candidate=ranked.find(id=>value(g,id)>0);
  if(style==='random')candidate=options[Math.floor(random()*options.length)];
  if(style==='daylight_only')candidate=options.sort((a,b)=>physical(boardAfterBuild(g.playerBoard,b)).D-physical(boardAfterBuild(g.playerBoard,a)).D).find(id=>physical(boardAfterBuild(g.playerBoard,id)).D>physical(g.playerBoard).D);
  if(style==='fill_slots'){
   const empty=options.filter(id=>!g.playerBoard.some(x=>designById[x].slot===designById[id].slot));
   if(empty.length)candidate=empty[Math.floor(random()*empty.length)];
  }
  if(style==='casual'&&options.length&&random()<.2)candidate=options[Math.floor(random()*options.length)];
  if(!g.built&&!miss&&candidate){
   if(canBuild(g,candidate)){g=playCard(g,g.hand.indexOf(candidate),'build');continue;}
   if(g.hand.includes('F03')&&g.functions<2&&g.energy>=1&&g.extraEnergy<2){g=playCard(g,g.hand.indexOf('F03'),'function');continue;}
  }
  // Keep useful uninstalled devices using only immediate visible benefits.
  if(style!=='random'&&g.built&&g.hand.includes('F04')&&g.functions<2&&g.energy>=1){
   const retain=g.hand.map((id,i)=>({id,i})).filter(c=>designById[c.id]&&value(g,c.id)>0).sort((a,b)=>value(g,b.id)-value(g,a.id)).slice(0,2).map(c=>c.i);
   if(retain.length){g=playCard(g,g.hand.indexOf('F04'),'function',undefined,undefined,undefined,retain);continue;}
  }
  if(!g.built&&!miss&&g.hand.includes('F01')&&g.functions<2&&g.energy>=1&&g.extraDraw<4){g=playCard(g,g.hand.indexOf('F01'),'function');continue;}
  if(style!=='random'&&!g.built&&!miss&&g.hand.includes('F02')&&g.functions<2&&g.hand.length>1){
   const i=g.hand.indexOf('F02'),discard=g.hand.findIndex((id,j)=>j!==i&&(!designById[id]||value(g,id)<=0));
   if(discard>=0){g=playCard(g,i,'function',undefined,undefined,discard);continue;}
  }
  break;
 }
 return g;
}
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const runs=Number(args.runs||1000),offset=Number(args.offset||0),original=level.tutorial;
const variants=args.sweep?{baseline:undefined,opening_only:{opening_designs:2,npc_setup_rounds:0},delay_only:{opening_designs:0,npc_setup_rounds:1},opening_and_delay:{opening_designs:2,npc_setup_rounds:1},tutorial:original}:{baseline:undefined,tutorial:original};
const rows=[];
for(const [variant,config] of Object.entries(variants)){
 level.tutorial=config;
 for(const style of ['random','daylight_only','fill_slots','greedy','casual','one_mistake','guided']){
  let victory=0,draw=0,timeouts=0,noOpening=0;const roundCounts={};
  for(let i=1;i<=runs;i++){
   Math.random=rng(offset+i);const random=rng((offset+i)^0x9e3779b9);let g=beginRun(initialGame(),0);
   if(!g.hand.some(id=>designById[id]&&canBuild(g,id)))noOpening++;
   const originalCounts=g.deck.reduce((o,id)=>(o[id]=(o[id]||0)+1,o),{});
   while(g.phase==='battle'){
    g=endTurn(ordinaryTurn(g,style,random));
    for(const zones of [[g.playerBoard,g.hand,g.drawPile,g.discard],[g.npcBoard,g.npcHand,g.npcDraw,g.npcDiscard]]){
     const counts=zones.flat().reduce((o,id)=>(o[id]=(o[id]||0)+1,o),{});for(const id in counts)assert(counts[id]<=originalCounts[id],`duplicate ${id}`);
    }
    assert(physical(g.playerBoard).budget<=100&&physical(g.npcBoard).budget<=100);assert(g.round<=5&&g.energy>=0&&g.npcEnergy>=0);
   }
   victory+=g.phase==='victory';draw+=g.phase==='draw';timeouts+=g.result.includes('双方都未');roundCounts[g.round]=(roundCounts[g.round]||0)+1;
  }
  rows.push({variant,style,runs,winRate:100*victory/runs,drawRate:100*draw/runs,lossRate:100*(runs-victory-draw)/runs,timeoutRate:100*timeouts/runs,noOpening,roundCounts});
 }
}
level.tutorial=original;
const report={method:'Deterministic script proxies, not human win rates. Ordinary policies see hand and board only; guided also sees public route hints. one_mistake deliberately misses round 2 installation. No ordinary policy uses attacks.',runsPerCell:runs,seedOffset:offset,config:original,rows};
if(args.output)writeFileSync(args.output,JSON.stringify(report,null,2));
console.table(rows.map(({variant,style,winRate,drawRate,timeoutRate})=>({variant,style,winRate,drawRate,timeoutRate})));
