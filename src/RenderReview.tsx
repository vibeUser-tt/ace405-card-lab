import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { addModernLights, configureModernRenderer, createModernBuilding, installModernCards, loadModernAssets, updateModernBuilding } from './modern-assets';
import { designById } from './game';

/** Isolated, reproducible camera for Blender ↔ web art review, using production assets/shaders. */
export function RenderReview() {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('正在加载建筑与烘焙贴图…');
  const [animated, setAnimated] = useState(false);
  const [reference, setReference] = useState(false);
  const backView = new URLSearchParams(location.search).get('view') === 'back';
  const selectedCards=(new URLSearchParams(location.search).get('cards')||'').split(',').filter(id=>designById[id]);
  const preset=selectedCards.length===6&&selectedCards.every(id=>id.slice(1)===selectedCards[0].slice(1))?selectedCards[0].slice(1):'';
  const animateRef = useRef(false); animateRef.current = animated;
  useEffect(() => {
    const container = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    configureModernRenderer(renderer); renderer.setPixelRatio(1); renderer.setSize(1200, 1000);
    renderer.setClearColor(0,0); container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-5.55,5.55,5.55/1.2,-5.55/1.2,.1,100);
    const back = new URLSearchParams(location.search).get('view') === 'back';
    camera.position.set(5,6,back ? -8 : 8); camera.lookAt(0,1,0); addModernLights(scene);
    let disposed = false, frame = 0;
    let instance: ReturnType<typeof createModernBuilding> | undefined;
    loadModernAssets().then(assets => {
      if (disposed) return;
      instance = createModernBuilding(assets,1); scene.add(instance.group);
      installModernCards(instance,assets,selectedCards);
      // Exact reference pose: one citizen, frame 1, door closed.
      instance.people[0].root.position.set(0,0,2.5); instance.people[0].root.rotation.set(0,0,0);
      instance.people[0].mixer.setTime(0);
      container.dataset.ready = 'true'; setStatus('同相机 · 同模型 · Blender 烘焙贴图');
    }).catch(error => { if (!disposed) setStatus(`加载失败：${String(error)}`); });
    let last = performance.now();
    const render = (now: number) => {
      if (disposed) return;
      frame = requestAnimationFrame(render); const dt = Math.min((now-last)/1000,.06); last = now;
      if (instance && animateRef.current) updateModernBuilding(instance, dt, false);
      renderer.render(scene,camera);
      container.dataset.drawCalls=String(renderer.info.render.calls);
      container.dataset.triangles=String(renderer.info.render.triangles);
    };
    frame=requestAnimationFrame(render);
    return () => { disposed=true; cancelAnimationFrame(frame); instance?.dispose(); scene.traverse(o=>{if(o instanceof THREE.DirectionalLight)o.shadow.dispose();}); renderer.dispose(); renderer.domElement.remove(); };
  }, []);
  return <main style={{height:'100dvh',overflow:'auto',background:'#263744',color:'#eee',padding:20}}>
    <div style={{display:'flex',flexWrap:'wrap',gap:16,alignItems:'center',marginBottom:12}}><strong>现代建筑 · 渲染验证</strong><span>{reference?'Blender 原始参考渲染':status}</span><button disabled={!!selectedCards.length&&(!preset||backView)} onClick={()=>setReference(v=>!v)}>{reference?'查看网页实时效果':'查看 Blender 参考'}</button><button disabled={reference} onClick={()=>setAnimated(v=>!v)}>{animated?'暂停动画':'播放人物与门动画'}</button><a href={`?renderReview${backView?'':'&view=back'}${selectedCards.length?`&cards=${selectedCards.join(',')}`:''}`} style={{color:'#b9ddcf'}}>{backView?'正面机位':'侧后方机位'}</a><a href="./" style={{color:'#b9ddcf'}}>返回游戏</a></div>
    <nav style={{display:'flex',gap:14,flexWrap:'wrap',marginBottom:8}}><a href="?renderReview" style={{color:'#b9ddcf'}}>基础建筑</a>{[1,2,3,4].map(n=><a key={n} style={{color:'#b9ddcf'}} href={`?renderReview&cards=${['W','I','S','P','M','T'].map(c=>c+n).join(',')}`}>组合 {n}</a>)}<select aria-label="检查单张措施牌" value={selectedCards.length===1?selectedCards[0]:''} onChange={e=>{location.search=`?renderReview&cards=${e.target.value}`;}}><option value="">单张措施牌</option>{Object.entries(designById).map(([id,card])=><option value={id} key={id}>{id} · {card.name}</option>)}</select></nav>
    {!!selectedCards.length&&<div style={{fontSize:13,color:'#b9cbc5'}}>{selectedCards.map(id=>`${id} ${designById[id].name}`).join(' · ')}</div>}
    <div ref={host} className="render-review" style={{position:'relative',width:1200,aspectRatio:'6 / 5',maxWidth:'100%'}}>
      {reference&&<img src={`${import.meta.env.BASE_URL}assets/modern-v2/reference${preset?`-cards-${preset}`:backView?'-back':''}.png`} alt="相同相机下的 Blender 参考渲染" style={{position:'absolute',inset:0,width:'100%',height:'100%',zIndex:1}}/>}
    </div>
    <style>{'.render-review canvas{width:100%!important;height:auto!important}'}</style>
  </main>;
}
