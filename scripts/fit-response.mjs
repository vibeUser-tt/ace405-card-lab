import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const bytes=await readFile('src/gothenburg.json'),data=JSON.parse(bytes);
const factors=['WWR','WD','GLZ','EW','R','Gnd','VR','HR'];
const rows=data.rows.map(r=>({x:factors.map(k=>{const v=Number(r.key.match(new RegExp(`_${k}(\\d)`))[1]);return k==='VR'?1-v:v;}),D:r.D,E:r.E}));
const terms=[[],...factors.map((_,i)=>[i]),...factors.flatMap((_,i)=>factors.slice(i+1).map((__,j)=>[i,i+j+1]))];
const basis=(x,t)=>t.reduce((v,i)=>v*(2*x[i]-1),1);
function fit(rows,terms,k){
 const n=terms.length,a=Array.from({length:n},()=>Array(n+1).fill(0));
 for(const r of rows){const f=terms.map(t=>basis(r.x,t));for(let i=0;i<n;i++){for(let j=0;j<n;j++)a[i][j]+=f[i]*f[j];a[i][n]+=f[i]*r[k];}}
 for(let i=0;i<n;i++){let p=i;for(let j=i+1;j<n;j++)if(Math.abs(a[j][i])>Math.abs(a[p][i]))p=j;[a[i],a[p]]=[a[p],a[i]];const d=a[i][i];if(Math.abs(d)<1e-9)throw Error('Singular fit');for(let j=i;j<=n;j++)a[i][j]/=d;for(let j=0;j<n;j++)if(j!==i){const f=a[j][i];for(let c=i;c<=n;c++)a[j][c]-=f*a[i][c];}}
 return a.map(r=>r[n]);
}
const models={},validation={};
for(const k of ['D','E']){
 // D excludes tiny, inconsistent changes in non-geometric factors; this is a
 // declared denoising choice, not evidence of exact physical independence.
 const active=k==='D'?[[],[0],[1],[0,1]]:terms;
 const coefficients=fit(rows,active,k);const errors=[];
 for(let fold=0;fold<5;fold++){
  const train=rows.filter((_,i)=>(i*73%257)%5!==fold),test=rows.filter((_,i)=>(i*73%257)%5===fold),c=fit(train,active,k);
  for(const r of test)errors.push(c.reduce((s,v,i)=>s+v*basis(r.x,active[i]),0)-r[k]);
 }
 models[k]=active.map((axes,i)=>({axes,coefficient:coefficients[i]}));
 validation[k]={heldOutCount:errors.length,rmse:Math.sqrt(errors.reduce((s,e)=>s+e*e,0)/errors.length),maxAbsError:Math.max(...errors.map(Math.abs))};
}
const output={sourceSha256:createHash('sha256').update(bytes).digest('hex'),scenarios:256,method:'Factorial response surface: D geometry main/pair terms; E all main/pair terms. Five-fold held-out endpoint validation.',limitations:'Only two observed endpoints per factor. Interior curvature is an explicit teaching prior, not learned or validated interior simulation. D minor non-geometric variation is denoised.',models,
 // Each metric has its own shape. Preserve endpoints and conditional interactions.
 shapes:{D:[-1.45,1.35,1,1,1,1,1,1],E:[-1.1,1.15,1.4,1.65,1.5,1.25,1.15,-1.6]},validation};
await writeFile('src/response-fit.json',JSON.stringify(output,null,2)+'\n');await mkdir('validation',{recursive:true});await writeFile('validation/points-curves.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(validation));
