import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { designById, gates, levels, metricNames, physical, review, score, slotNames } from './game';
import type { Game, Metric } from './game';
export type Cue = { serial: number; side: 'player' | 'npc'; target: string; kind: 'build' | 'attack' | 'buff' | 'shield' | 'dismantle'; origin?: { x: number; y: number } };
type Props = { game: Game; cue: Cue | null; onTarget: (side: 'player' | 'npc', id: string) => void; onInspect?: (message: string) => void; slotSelection?: { side: 'player' | 'npc'; targets: string[]; selected: string } };
const slots = ['window', 'wall', 'shade', 'plan', 'material', 'system'];
const anchors: Record<string, [number, number, number]> = { window: [0, 1.5, 1.36], wall: [-1.6, 1.3, .3], shade: [0, 2, 1.65], plan: [0, 2.7, 0], material: [1.5, 1.3, .4], system: [.65, 3.1, 0] };
const slotTints: Record<string, string> = { window:'#96e5ff', wall:'#e7c18d', shade:'#eec97c', plan:'#a5e5d6', material:'#c0d893', system:'#84dce5' };
const center = (side: string) => side === 'npc' ? -5.5 : 5.5;
function box(parent: THREE.Object3D, size: number[], pos: number[], color: string, glow = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size as [number, number, number]), new THREE.MeshStandardMaterial({ color, roughness: .6, metalness: .15, emissive: color, emissiveIntensity: glow }));
  mesh.position.set(...pos as [number, number, number]); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function release(root: THREE.Object3D) { root.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Line) { o.geometry.dispose(); const mats = Array.isArray(o.material) ? o.material : [o.material]; mats.forEach(m => m.dispose()); } }); }
function building(ids: string[], side: string, game: Game) {
  const root = new THREE.Group(); root.position.x = center(side); root.rotation.y = -.35; root.scale.setScalar(.72);
  const accent = side === 'npc' ? '#ef9974' : '#69e7c5';
  box(root, [4.3, .18, 3.6], [0, -.12, 0], '#253b49');
  box(root, [4.35, .035, .055], [0, .01, 1.82], accent, .7);
  box(root, [3.25, 2.5, 2.6], [0, 1.25, 0], '#b5c7c8');
  box(root, [3.5, .16, 2.85], [0, 2.55, 0], '#556c7c');
  for (const y of [.55, 1.65]) for (const x of [-1, 0, 1]) box(root, [.6, .65, .06], [x, y, 1.32], '#448596', .15);
  for (const id of ids) {
    const card = designById[id], variant = Number(id.slice(1)); const part = new THREE.Group(); part.userData = { id, side }; root.add(part);
    if (card.slot === 'window') {
      for (const y of [.57, 1.68]) for (const x of [-1, 0, 1]) {
        box(part, [variant === 2 ? .96 : .76, .86, .09], [x, y, 1.38], variant === 4 ? '#73e6cf' : variant === 3 ? '#6fbde9' : '#82b7d1', .3);
        box(part, [.035, .88, .11], [x, y, 1.45], '#dbe8e8');
        if (variant === 3) box(part, [.74, .025, .12], [x, y, 1.46], '#c0f3ff');
      }
    } else if (card.slot === 'wall') {
      for (let i = 0; i < (variant === 2 ? 6 : 4); i++) box(part, [.13 + variant * .02, 2.4, .38], [-1.7, 1.25, -1 + i * .43], variant === 3 ? '#b7bd79' : '#e1ceb1');
      if (variant === 4) for (const y of [.08, 2.4]) box(part, [3.4, .07, .1], [0, y, 1.4], '#e9bd68', .4);
    } else if (card.slot === 'shade') {
      for (const y of [1.04, 2.16]) for (let i = 0; i < (variant === 2 ? 3 : 1); i++) {
        const blade = box(part, [3.4, .06, variant === 3 ? .2 : .48], [0, y + i * .12, 1.57], '#dfb879'); blade.rotation.x = variant === 2 ? -.35 : 0;
      }
      if (variant === 4) for (let i = 0; i < 6; i++) box(part, [.09, 1, .12], [-1.4 + i * .55, 1.6, 1.8], '#7ca988');
    } else if (card.slot === 'plan') {
      const n = variant === 1 ? 2 : variant === 2 ? 4 : 3;
      for (let i = 0; i < n; i++) box(part, [.65, .22 + (variant === 2 ? .35 : 0), 1.9], [-1.05 + i * .7, 2.75, 0], variant === 3 ? '#eff4d1' : '#8ab7b8');
      if (variant === 4) box(part, [.65, .15, 2.3], [0, 3.02, 0], '#b8f2ec', .4);
    } else if (card.slot === 'material') {
      const colors = ['#b79264', '#c4c6ad', '#a7bf9b', '#c38e72'];
      for (let i = 0; i < 7; i++) box(part, [.08, 2.3, .24], [1.67, 1.25, -1.15 + i * .36], colors[variant - 1]);
      box(part, [3.35, .17, .09], [0, .08, 1.4], colors[variant - 1]);
    } else {
      if (variant === 1) {
        box(part,[1.2,.6,.9],[.5,2.95,0],'#426675');
        for (const x of [.2,.8]) { const fan=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.08,12),new THREE.MeshStandardMaterial({color:'#8ac8d0',metalness:.6,roughness:.4}));fan.position.set(x,3.3,0);part.add(fan);box(part,[.09,.12,1.5],[x,2.8,.5],x<.5?'#e8a76d':'#77c9dc',.4); }
      } else if (variant === 2) {
        for (const x of [-.8,.8]) { box(part,[.5,.5,.5],[x,2.9,0],'#718f99'); for(let i=0;i<4;i++)box(part,[.48,.035,.06],[x,2.75+i*.1,.27],'#91dbe7',.3); }
      } else if (variant === 3) {
        box(part,[.65,.65,.35],[.7,2.95,0],'#315462');box(part,[.5,.35,.025],[.7,3,.2],'#54e5cd',.65);
        for(let i=0;i<3;i++)box(part,[.06,.06,.04],[.5+i*.18,2.76,.22],'#f4ce77',1);
      } else {
        for(const x of [-1.2,0,1.2])box(part,[.45,.06,.13],[x,2.38,1.42],'#fff1ae',1.5);
        box(part,[.08,.45,.08],[.8,2.85,-.4],'#647d89');box(part,[.24,.1,.24],[.8,3.1,-.4],'#e7ddb7');
      }
    }
  }
  if (ids.some(id => ['T1','T2'].includes(id))) {
    root.userData.flows = [];
    for (let i=0;i<10;i++) { const mote = new THREE.Mesh(new THREE.SphereGeometry(.055,5,4),new THREE.MeshBasicMaterial({color:i%2 ? '#f8ad68':'#77e9ff'})); root.add(mote); root.userData.flows.push(mote); }
  }
  for (const effect of game.effects.filter(e => e.side === side && e.fraction < 0)) {
    const slot = designById[effect.target].slot, a = anchors[slot];
    const points = [new THREE.Vector3(a[0] - .6, a[1] + .6, a[2] + .12),new THREE.Vector3(a[0] + .05,a[1] + .1,a[2] + .13),new THREE.Vector3(a[0] - .3,a[1] - .2,a[2] + .13),new THREE.Vector3(a[0] + .6,a[1] - .6,a[2] + .13)];
    root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({color:'#ff785b'})));
    box(root,[.09,.09,.1],[a[0],a[1],a[2]+.15],'#ff7c50',2);
  }
  if (side === 'player' && game.shields.length) {
    const shield=new THREE.Mesh(new THREE.SphereGeometry(2.4,16,10),new THREE.MeshBasicMaterial({color:'#6bb9ff',wireframe:true,transparent:true,opacity:.16}));shield.position.y=1.4;shield.raycast=()=>{};root.add(shield);
  }
  return root;
}

export function BattleScene({ game, cue, onTarget, onInspect, slotSelection }: Props) {
  const host = useRef<HTMLDivElement>(null), latest = useRef({ game, cue, onTarget }); latest.current = { game, cue, onTarget };
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const el = host.current!; let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { setUnavailable(true); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace; el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.fog = new THREE.Fog('#101e2b', 24, 45);
    const camera = new THREE.OrthographicCamera(-11, 11, 6, -6, .1, 70); camera.position.set(0, 9, 17); camera.lookAt(0, 1, 0);
    scene.add(new THREE.HemisphereLight('#d7f7ff', '#283846', 2));
    const sun = new THREE.DirectionalLight('#fff0d7', 3.4); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
    scene.add(sun, sun.target);
    const lightCenter = new THREE.Vector3(0, 1, 0);
    let sunElapsed = 0, lastSunFrame = performance.now();
    function updateSun(elapsedMs: number) {
      // Y is up in this scene. Keep elevation fixed while the azimuth makes one turn per minute.
      const angle = elapsedMs / 60000 * Math.PI * 2, c = Math.cos(angle), s = Math.sin(angle);
      sun.target.position.copy(lightCenter);
      sun.position.set(lightCenter.x - 5*c + 8*s, lightCenter.y + 10, lightCenter.z + 5*s + 8*c);
    }
    const ground = box(scene, [100, .15, 100], [0, -.36, 0], '#142432'); ground.castShadow = false;
    const grid = new THREE.GridHelper(38, 38, '#31505b', '#1c3542'); grid.position.y = -.26; scene.add(grid);
    const roots: Record<string, THREE.Group> = {}; let boardKey = '', previous: Game | null = null, lastCue = -1, frame = 0, disposed = false, lastRender = 0;
    const yaw = { npc: -.35, player: -.35 };
    let drag: { id: number; side: 'npc' | 'player'; x: number; y: number; yaw: number; width: number; moved: boolean } | null = null;
    const bursts: { group: THREE.Group; start: number; cue: Cue; from: THREE.Vector3; to: THREE.Vector3 }[] = [];
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function targetPosition(c: Cue, out: THREE.Vector3) {
      out.set(...anchors[designById[c.target]?.slot || 'system']);
      return roots[c.side].localToWorld(out);
    }
    function fire(c: Cue, now: number) {
      const slot = designById[c.target]?.slot || 'system'; const to = targetPosition(c, new THREE.Vector3()); el.dataset.effect = `${c.kind}:${c.side}:${c.target}`;
      const from = new THREE.Vector3(c.side === 'npc' ? 3 : -3, 1, 3);
      if (c.origin) {
        const r = el.getBoundingClientRect(); const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((c.origin.x - r.left) / r.width * 2 - 1, -(c.origin.y - r.top) / r.height * 2 + 1), camera);
        ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -2), from);
      }
      const group = new THREE.Group(); group.userData.kind = c.kind; scene.add(group);
      const tint = c.kind === 'dismantle' ? '#b5c6cf' : c.kind === 'attack' ? '#ffb77f' : c.kind === 'shield' ? '#89b8ff' : c.kind === 'buff' ? '#8fffc2' : slotTints[slot];
      for (let i = 0; i < 32; i++) {
        const geometry = c.kind === 'attack' ? new THREE.TetrahedronGeometry(.12 + i % 3 * .03)
          : slot === 'window' ? new THREE.BoxGeometry(.1,.16,.025)
          : slot === 'wall' ? new THREE.BoxGeometry(.12,.08,.06)
          : slot === 'shade' ? new THREE.BoxGeometry(.22,.025,.05)
          : slot === 'plan' ? new THREE.BoxGeometry(.16,.02,.16)
          : slot === 'material' ? new THREE.OctahedronGeometry(.075)
          : new THREE.SphereGeometry(.055,5,4);
        const shard = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: c.kind === 'attack' && i % 2 ? slotTints[slot] : tint, transparent: true })); group.add(shard);
      }
      const ring = new THREE.Mesh(new THREE.RingGeometry(.3,.36,32),new THREE.MeshBasicMaterial({color:tint,transparent:true,opacity:0,side:THREE.DoubleSide}));ring.userData.ring=true;group.add(ring);
      bursts.push({ group, start: now, cue: c, from, to });
    }
    function fitBuildings() {
      const rect = el.getBoundingClientRect(), stage = el.parentElement!;
      for (const side of ['npc', 'player'] as const) {
        const root = roots[side]; if (!root) continue;
        const metrics = stage.querySelector(`.${side} .hud-metrics`)!.getBoundingClientRect();
        const slots = stage.querySelector(`.${side} .building-slots`)!.getBoundingClientRect();
        const top = metrics.bottom - rect.top + 4, bottom = slots.top - rect.top - 4;
        const screenY = (v: THREE.Vector3) => (1 - v.project(camera).y) * rect.height / 2;
        const projectedBounds = () => {
          root.updateWorldMatrix(true, true);
          const bounds = new THREE.Box3().setFromObject(root), ys: number[] = [];
          for (const x of [bounds.min.x,bounds.max.x]) for (const y of [bounds.min.y,bounds.max.y]) for (const z of [bounds.min.z,bounds.max.z]) ys.push(screenY(new THREE.Vector3(x,y,z)));
          return [Math.min(...ys),Math.max(...ys)];
        };
        root.position.z = 0; root.scale.setScalar(.72);
        const initial = projectedBounds();
        root.scale.setScalar(.72 * Math.min(1, Math.max(1,bottom-top) / Math.max(1,initial[1]-initial[0])));
        const fitted = projectedBounds();
        // Move along the ground, keeping the model between metrics and slot controls.
        const pixelsPerZ = screenY(new THREE.Vector3(0,0,1))-screenY(new THREE.Vector3(0,0,0));
        root.position.z = ((top+bottom)-(fitted[0]+fitted[1]))/2/pixelsPerZ;
      }
      if (roots.npc && roots.player) lightCenter.set(
        (roots.npc.position.x + roots.player.position.x) / 2,
        1.4 * (roots.npc.scale.y + roots.player.scale.y) / 2,
        (roots.npc.position.z + roots.player.position.z) / 2,
      );
    }
    function resize() { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); const aspect = w / Math.max(1,h); camera.top = 11 / aspect; camera.bottom = -11 / aspect; camera.updateProjectionMatrix(); fitBuildings(); }
    const observer = new ResizeObserver(resize); observer.observe(el); resize();
    const canvas = renderer.domElement;
    const pointerDown = (event: PointerEvent) => {
      if (drag || !event.isPrimary || event.button !== 0) return;
      const r = el.getBoundingClientRect(), side = event.clientX < r.left + r.width / 2 ? 'npc' : 'player';
      drag = { id: event.pointerId, side, x: event.clientX, y: event.clientY, yaw: yaw[side], width: Math.max(1, r.width / 2), moved: false };
      canvas.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.hypot(dx, dy) > 5) drag.moved = true;
      if (!drag.moved) return;
      el.dataset.dragging = 'true';
      // Y is vertical; neither pointer Y nor camera pitch affects the model rotation.
      const angle = drag.yaw + dx / drag.width * Math.PI * 2;
      yaw[drag.side] = Math.atan2(Math.sin(angle), Math.cos(angle));
      roots[drag.side]?.rotation.set(0, yaw[drag.side], 0);
    };
    const clearDrag = () => {
      const id = drag?.id; drag = null; delete el.dataset.dragging;
      if (id !== undefined && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    };
    const pointerUp = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      pointerMove(event);
      const moved = drag.moved; clearDrag();
      if (moved) return;
      const r = el.getBoundingClientRect(); const ray = new THREE.Raycaster();
      scene.updateMatrixWorld(true);
      ray.setFromCamera(new THREE.Vector2((event.clientX - r.left) / r.width * 2 - 1, -(event.clientY - r.top) / r.height * 2 + 1), camera);
      for (const hit of ray.intersectObjects(Object.values(roots), true)) {
        let o: THREE.Object3D | null = hit.object;
        while (o && !o.userData.id) o = o.parent;
        if (o?.userData.id) latest.current.onTarget(o.userData.side, o.userData.id);
        // An opaque facade must not select a hidden device behind it.
        break;
      }
    };
    const pointerCancel = (event: PointerEvent) => { if (drag?.id === event.pointerId) clearDrag(); };
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', pointerCancel);
    canvas.addEventListener('lostpointercapture', pointerCancel);
    renderer.domElement.addEventListener('webglcontextlost', lost);
    function lost(e: Event) { e.preventDefault(); setUnavailable(true); }
    function animate(now: number) {
      if (disposed) return; frame = requestAnimationFrame(animate); if (now-lastRender<33 && !bursts.length && !drag) return; lastRender=now; const { game: g, cue: c } = latest.current;
      const key = JSON.stringify([g.playerBoard, g.npcBoard, g.effects, g.shields]);
      if (key !== boardKey) {
        for (const side of ['npc', 'player'] as const) { if (roots[side]) { scene.remove(roots[side]); release(roots[side]); } roots[side] = building(side === 'npc' ? g.npcBoard : g.playerBoard, side, g); roots[side].rotation.set(0, yaw[side], 0); scene.add(roots[side]); }
        fitBuildings();
        boardKey = key; el.dataset.models = [...g.playerBoard, ...g.npcBoard].join(",");
      }
      if (previous && previous !== g && g.round >= previous.round && g.phase !== 'intro') {
        for (const side of ['player', 'npc'] as const) {
          const old = side === 'player' ? previous.playerBoard : previous.npcBoard, next = side === 'player' ? g.playerBoard : g.npcBoard;
          for (const id of old.filter(id => !next.includes(id))) fire({ serial: now, side, target: id, kind: 'dismantle' }, now);
        }
        for (const id of g.npcBoard.filter(id => !previous!.npcBoard.includes(id))) fire({ serial: now, side: 'npc', target: id, kind: 'build' }, now);
        const intent=previous.intent;
        if ((g.round !== previous.round || g.phase !== previous.phase) && intent.kind === 'attack' && intent.card && intent.target && previous.npcHand.includes(intent.card) && previous.playerBoard.includes(intent.target) && previous.npcEnergy>=1) fire({serial:now,side:'player',target:intent.target,kind:previous.shields.includes(intent.target)?'shield':'attack'},now);
      }
      previous = g;
      if (c && c.serial !== lastCue) { fire(c, now); lastCue = c.serial; }
      for (const side of ['npc', 'player'] as const) {
        const shake = bursts.reduce((sum, b) => { const impact = (now-b.start)/1000-.48; return sum + (b.cue.side===side && b.cue.kind==='attack' && impact>0 && impact<.35 ? Math.sin(impact*70)*.07 : 0); }, 0);
        roots[side].position.x = center(side) + shake;
      }
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i], t = (now - b.start) / 1000, flight = b.cue.kind === 'dismantle' ? 0 : b.cue.kind === 'attack' ? .48 : .28;
        if (t > 1.35 || reduced) { scene.remove(b.group); release(b.group); bursts.splice(i, 1); continue; }
        // Recompute every frame, including while dragging during projectile flight/impact.
        targetPosition(b.cue, b.to);
        b.group.children.forEach((child, j) => {
          const mesh = child as THREE.Mesh; const m = mesh.material as THREE.MeshBasicMaterial;
          if (mesh.userData.ring) { const age=Math.max(0,t-flight); mesh.position.copy(b.to);mesh.lookAt(camera.position);mesh.scale.setScalar(1+age*6);m.opacity=t>=flight?Math.max(0,.7-age):0;return; }
          if (t < flight) { const p = Math.max(0, Math.min(1, t / flight - j * .012)); mesh.position.lerpVectors(b.from, b.to, p); mesh.position.y += Math.sin(p * Math.PI) * 1.4; m.opacity = 1 - j / 40; }
          else { const age = t - flight, angle = j * 2.39996; mesh.position.copy(b.to).add(new THREE.Vector3(Math.cos(angle) * age * (1 + j % 4), Math.sin(angle) * age * 2 - age * age * 2, Math.sin(j * 5) * age * 2)); mesh.rotation.set(age * j, age * 3, j); m.opacity = Math.max(0, 1 - age); }
        });
        const root = roots[b.cue.side]; if (root) {
          if (b.cue.kind === 'build') {
            const part = root.children.find(child => child.userData.id === b.cue.target);
            if (part) part.scale.setScalar(Math.min(1, .35 + t * 1.6));
          }
        }
      }
      for (const root of Object.values(roots)) (root.userData.flows || []).forEach((m: THREE.Mesh,i: number) => { const t=(now/1500+i/10)%1;m.position.set(-.65+t*1.7,2.95+Math.sin(t*Math.PI)*.65,.6+(i%2)*.18); });
      // Pause the orbit in background tabs; avoid a sudden lighting jump when returning.
      if (!document.hidden) sunElapsed = (sunElapsed + Math.min(Math.max(0, now-lastSunFrame), 100)) % 60000;
      lastSunFrame = now;
      updateSun(reduced ? 0 : sunElapsed);
      renderer.render(scene, camera);
    }
    frame = requestAnimationFrame(animate);
    return () => { disposed = true; clearDrag(); cancelAnimationFrame(frame); observer.disconnect(); canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove); canvas.removeEventListener('pointerup', pointerUp); canvas.removeEventListener('pointercancel', pointerCancel); canvas.removeEventListener('lostpointercapture', pointerCancel); canvas.removeEventListener('webglcontextlost', lost); release(scene); grid.geometry.dispose(); (grid.material as THREE.Material).dispose(); renderer.dispose(); canvas.remove(); };
  }, []);
  return <div className="battle-stage"><div className="scene-host" ref={host} />{unavailable && <div className="scene-fallback">当前设备无法显示 3D，仍可通过下方装置与手牌操作。</div>}
    <div className="battle-huds">{(['npc', 'player'] as const).map(side => { const board = side === 'npc' ? game.npcBoard : game.playerBoard, value = review(board, game.effects, side), level = levels[game.level], pass = gates(value, level); return <div className={`battle-hud ${side}`} key={side}>
      <div className="hud-heading"><strong>{side === 'npc' ? '对手方案' : '我的方案'}</strong><b>{score(value, level).toFixed(1)}<small> 分</small></b><span>预算 {physical(board).budget}/100</span></div>
      <div className="hud-metrics">{(['E', 'D', 'H', 'C'] as Metric[]).map(k => <button onClick={() => onInspect?.(`${side === 'npc' ? '对手' : '己方'} · ${metricNames[k]}：原始 ${physical(board)[k]} → 本轮评审 ${Math.round(value[k]*10)/10}；权重 ${Math.round(level.weights[k]*100)}%`)} key={k} className={pass[k] ? 'pass' : 'fail'} title={`权重 ${Math.round(level.weights[k] * 100)}%`}><span>{metricNames[k]}</span><strong>{Math.round(value[k] * 10) / 10}</strong><small>{k === 'D' ? '≥' : '≤'}{level.limits[k]}</small></button>)}</div>
      <div className="building-slots">{slots.map(slot => {
        const id = board.find(id => designById[id].slot === slot);
        const optimized = game.effects.filter(e => e.side === side && e.target === id && e.fraction > 0);
        const eligible = !!id && slotSelection?.side === side && slotSelection.targets.includes(id);
        const selected = eligible && slotSelection?.selected === id;
        return <button key={slot} data-card-id={id} data-optimized={optimized.length ? 'true' : undefined} className={eligible ? selected ? 'slot-selected' : 'slot-eligible' : ''} disabled={!id || !!slotSelection && !eligible} aria-pressed={selected} title={id ? `${designById[id].name}${optimized.length ? ' · 永久优化：' + optimized.map(e => `${metricNames[e.metric]}收益 +25%`).join('、') : ''}` : '尚未安装'} onClick={() => id && onTarget(side, id)}><span className="slot-device">{selected ? '✓ ' : ''}{id ? designById[id].name : '未安装'}{optimized.length ? ' ↗' : ''}</span><small className="slot-category">{slotNames[slot]}</small></button>;
      })}</div>
    </div>; })}</div><div className="scene-caption">{game.intent.label || '选择委托，开始构筑'}<span>左右拖动旋转 · 点选装置查看</span></div>
  </div>;
}
