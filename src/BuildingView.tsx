import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createArchitecture, loadArchitecture } from './architecture';
import type { Config } from './model';
export function BuildingView({ config, side }: {
    config: Config;
    side: string;
}) {
    const host = useRef<HTMLDivElement>(null), current = useRef(config), instance = useRef<ReturnType<typeof createArchitecture> | null>(null);
    const [status, setStatus] = useState('loading');
    current.current = config;
    useEffect(() => { instance.current?.setConfig(config); }, [config]);
    useEffect(() => {
        const container = host.current!;
        let disposed = false, frame = 0, renderer: THREE.WebGLRenderer;
        try {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        }
        catch {
            setStatus('error');
            return;
        }
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.AgXToneMapping;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);
        const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-5, 5, 4, -4, .1, 60);
        camera.position.set(5, 5.8, 8);
        camera.lookAt(0, 1, 0);
        const sun = new THREE.DirectionalLight('#fff0cc', 2.25);
        sun.position.set(-3, 7, 4);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: .1, far: 30 });
        sun.shadow.normalBias = .015;
        scene.add(sun, new THREE.HemisphereLight('#c1d4ff', '#b0a67c', 1.6));
        const resize = () => { const { width, height } = container.getBoundingClientRect(); renderer.setSize(width, height); const aspect = width / Math.max(1, height), half = Math.max(3.15, 4.8 / aspect); camera.left = -half * aspect; camera.right = half * aspect; camera.top = half; camera.bottom = -half; camera.updateProjectionMatrix(); };
        const observer = new ResizeObserver(resize);
        observer.observe(container);
        resize();
        let last = 0, angle = -.10, dragX: number | null = null;
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const down = (e: PointerEvent) => { dragX = e.clientX; container.setPointerCapture(e.pointerId); };
        const move = (e: PointerEvent) => { if (dragX !== null) {
            angle += (e.clientX - dragX) * .008;
            dragX = e.clientX;
        } };
        const up = () => { dragX = null; };
        container.addEventListener('pointerdown', down);
        container.addEventListener('pointermove', move);
        container.addEventListener('pointerup', up);
        container.addEventListener('pointercancel', up);
        loadArchitecture().then(assets => {
            if (disposed)
                return;
            const inst = createArchitecture(assets, side === 'npc' ? .5 : 0);
            instance.current = inst;
            scene.add(inst.group);
            inst.setConfig(current.current);
            setStatus('ready');
            const animate = (time: number) => { if (disposed)
                return; const dt = Math.min(.05, (time - last) / 1000 || 0); last = time; inst.group.rotation.y = angle; inst.update(dt, reduced); renderer.render(scene, camera); frame = requestAnimationFrame(animate); };
            frame = requestAnimationFrame(animate);
        }).catch(() => { if (!disposed)
            setStatus('error'); });
        return () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); container.removeEventListener('pointerdown', down); container.removeEventListener('pointermove', move); container.removeEventListener('pointerup', up); container.removeEventListener('pointercancel', up); instance.current?.dispose(); instance.current = null; renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); };
    }, [side]);
    return <div ref={host} className="building-view" data-assets={status} aria-label={`${side === 'npc' ? '对手' : '你的'}建筑模型，可拖动旋转`}>{status === 'loading' && <span className="model-status">正在搭建建筑…</span>}{status === 'error' && <span className="model-status">模型暂时无法显示，参数与游戏仍可使用。</span>}</div>;
}
