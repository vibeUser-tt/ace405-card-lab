import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createPedestrians, stepPedestrians } from './pedestrians';
import { seatedPose } from './seating';
import { loadBlenderDisplay, useBlenderDisplay } from './blender-display';
import type { Config, Factor } from './model';

const factorKeys: Factor[] = ['WWR', 'WD', 'GLZ', 'EW', 'R', 'Gnd', 'VR', 'HR'];
const bounded = (value: number) => THREE.MathUtils.clamp(value, 0, 1);

/**
 * The Blender export provides authored endpoint meshes. Continuous dimensions
 * reuse one endpoint instead of hiding every mesh at an intermediate value.
 * All coordinates here are the exported glTF coordinates: Y up, south = +Z.
 */
export function bindDesignGeometry(building: THREE.Object3D) {
    const variants: THREE.Object3D[] = [];
    building.traverse(object => {
        if (object.userData.factor) variants.push(object);
    });
    const variant = (factor: Factor, option: number) => {
        const found = variants.find(object => object.userData.factor === factor && Number(object.userData.option) === option);
        if (!found) throw new Error(`Building asset is missing ${factor} option ${option}`);
        return found;
    };
    const windows = variant('WWR', 1);
    const surrounds = variant('WD', 1);
    const walls = variant('EW', 0);
    const roof = variant('R', 0);
    const ground = variant('Gnd', 0);
    const recovery = variant('HR', 1);
    const bypassSource = variant('HR', 0).children.find(object => object.name.startsWith('Bypass_duct'));
    const bypass = bypassSource?.clone(true);
    if (bypass) recovery.add(bypass);

    const centers = [-1.025, 0, 1.025];
    const windowCenter = (x: number) => centers.reduce((best, value) => Math.abs(x - value) < Math.abs(x - best) ? value : best);
    const windowParts = windows.children.map(object => ({ object, x: object.position.x, center: windowCenter(object.position.x) }));
    const surroundParts = surrounds.children.map(object => ({ object, x: object.position.x, center: windowCenter(object.position.x) }));
    const fixedVariants = new Set([windows, surrounds, walls, roof, ground, recovery]);

    return (config: Config) => {
        for (const object of variants) {
            const factor = object.userData.factor as Factor;
            object.visible = fixedVariants.has(object) ||
                ((factor === 'GLZ' || factor === 'VR') && Number(object.userData.option) === Math.round(config[factor]));
        }

        // Constant pane height makes glass area proportional to the WWR setting.
        // 20%, 30%, 40% correspond to 0.41, 0.615, 0.82 model-space width.
        const width = .41 + .41 * bounded(config.WWR);
        for (const { object, x, center } of windowParts) {
            object.position.x = center + (x - center) * width / .82;
            if (object.name.startsWith('Glass_pane')) object.scale.x = width / .82;
            else if (object.name.startsWith('Sky_band')) object.scale.x = (width - .045) / (.82 - .045);
            else if (object.name.startsWith('Transom')) object.scale.x = (width + .05) / (.82 + .05);
            else if (object.name.startsWith('Sill')) object.scale.x = (width + .15) / (.82 + .15);
            // Vertical frame thickness stays constant while its position changes.
        }

        // The visual model uses a compact depth scale; width follows the same pane.
        const depth = .12 + .22 * bounded(config.WD);
        for (const { object, x, center } of surroundParts) {
            object.position.z = 1.4 + depth / 2;
            object.scale.z = depth / .34;
            if (object.name.startsWith('Upper_surround')) object.scale.x = (width + .14) / .96;
            else object.position.x = center + Math.sign(x - center) * (width / 2 + .06);
        }

        // These layers communicate relative insulation, not a construction-detail
        // conversion of U-value into an assumed real material thickness.
        const wallThickness = .17 - .10 * bounded(config.EW);
        for (const object of walls.children) {
            if (object.name.startsWith('Wall_insulation')) {
                object.scale.x = wallThickness / .17;
                object.position.x = 1.655 + wallThickness / 2;
            } else if (object.name.startsWith('Wall_exterior_skin')) object.position.x = 1.665 + wallThickness;
        }
        const roofThickness = .17 - .10 * bounded(config.R);
        for (const object of roof.children) {
            if (object.name.startsWith('Roof_insulation')) {
                object.scale.y = roofThickness / .17;
                object.position.y = 2.48 + roofThickness / 2;
            } else if (object.name.startsWith('Roof_finish')) object.position.y = 2.50 + roofThickness;
            else if (object.name.startsWith('Roof_coping')) object.position.y = 2.57 + roofThickness;
        }
        for (const object of variants) {
            if (object.userData.factor === 'VR' || object.userData.factor === 'HR') object.position.y = roofThickness - .17;
        }
        const groundThickness = .17 - .10 * bounded(config.Gnd);
        for (const object of ground.children) {
            if (object.name.startsWith('Foundation_insulation')) {
                object.scale.y = groundThickness / .17;
                object.position.y = -.08 - groundThickness / 2;
            } else if (object.name.startsWith('Foundation_edge')) object.position.y = -.09 - groundThickness;
        }
        const recoveryFraction = bounded(config.HR);
        for (const object of recovery.children) {
            if (object.name.startsWith('Heat_exchange_plate')) {
                object.visible = recoveryFraction > .001;
                object.scale.y = Math.max(.001, recoveryFraction);
            }
        }
        if (bypass) bypass.visible = recoveryFraction <= .001;
        building.userData.visualParameters = { ...config };
        building.userData.windowWidth = width;
        building.userData.windowDepth = depth;
    };
}
type Assets = {
    site: GLTF;
    citizen: GLTF;
    building: GLTF;
};
let promise: Promise<Assets> | undefined;
export function loadArchitecture(): Promise<Assets> {
    if (promise)
        return promise;
    const base = import.meta.env.BASE_URL, loader = new GLTFLoader();
    promise = Promise.all([loader.loadAsync(`${base}assets/modern-v2/building.glb`), loader.loadAsync(`${base}assets/modern-v2/citizen.glb`), loader.loadAsync(`${base}assets/design-lab/building.glb`), new THREE.TextureLoader().loadAsync(`${base}assets/modern-v2/ambient.png`), loadBlenderDisplay(`${base}assets/modern-v2/`)]).then(([site, citizen, building, ambient, display]) => {
        ambient.flipY = false;
        ambient.channel = 1;
        ambient.colorSpace = THREE.LinearSRGBColorSpace;
        const converted = new Map<THREE.Material, THREE.Material>();
        for (const asset of [site, citizen])
            asset.scene.traverse(o => {
                if (!(o instanceof THREE.Mesh))
                    return;
                const old = o.material as THREE.MeshStandardMaterial;
                let m = converted.get(old);
                if (!m) {
                    const mat = new THREE.MeshLambertMaterial({ color: old.color, map: old.map, vertexColors: old.vertexColors });
                    const baked = old.name === 'BakedArchitecture';
                    if (baked) {
                        mat.lightMap = ambient;
                        mat.lightMapIntensity = Math.PI;
                    }
                    useBlenderDisplay(mat, display, baked);
                    m = mat;
                    converted.set(old, m);
                }
                o.material = m;
                o.castShadow = true;
                o.receiveShadow = true;
                if ((m as THREE.MeshLambertMaterial).lightMap && !o.geometry.attributes.uv1)
                    o.geometry.setAttribute('uv1', o.geometry.attributes.uv.clone());
            });
        for (const old of converted.keys())
            old.dispose();
        building.scene.traverse(o => { if (o instanceof THREE.Mesh) {
            o.castShadow = true;
            o.receiveShadow = true;
        } });
        return { site, citizen, building };
    }).catch(error => { promise = undefined; throw error; });
    return promise;
}
export function createArchitecture(assets: Assets, phase: number) {
    const group = new THREE.Group(), site = assets.site.scene.clone(true), building = assets.building.scene.clone(true);
    group.add(site, building);
    for (const name of ['BuildingShell', 'Roof', 'EntryDoor']) {
        const o = site.getObjectByName(name);
        if (o)
            o.visible = false;
    }
    const glassMaterials: THREE.MeshStandardMaterial[] = [];
    building.traverse(o => { if (o instanceof THREE.Mesh && (o.material as THREE.Material).name === 'Glass') {
        o.material = (o.material as THREE.MeshStandardMaterial).clone();
        glassMaterials.push(o.material);
    } });
    const simulation = createPedestrians(2, phase);
    const people = simulation.people.map(() => { const root = assets.citizen.scene.clone(true); group.add(root); const mixer = new THREE.AnimationMixer(root); mixer.clipAction(assets.citizen.animations.find(c => c.name === 'Walk')!).play(); return { root, mixer }; });
    let target: Config | undefined;
    let displayed: Config | undefined;
    const applyGeometry = bindDesignGeometry(building);
    const fans: THREE.Object3D[] = [];
    building.traverse(object => { if (object.userData.spin) fans.push(object); });
    const insulatingGlass = new THREE.Color('#2589b8');
    const transparentGlass = new THREE.Color('#66cbd6');
    const applyAppearance = () => {
        if (!displayed) return;
        applyGeometry(displayed);
        for (const material of glassMaterials) material.color.copy(insulatingGlass).lerp(transparentGlass, displayed.GLZ);
    };
    return { group,
        setConfig(config: Config) {
            target = { ...config };
            if (!displayed) {
                displayed = { ...config };
                applyAppearance();
            }
        },
        update(dt: number, reduced: boolean) {
            if (target && displayed) {
                let changed = false;
                for (const factor of factorKeys) {
                    const previous = displayed[factor];
                    const next = reduced ? target[factor] : THREE.MathUtils.lerp(previous, target[factor], 1 - Math.exp(-dt * 10));
                    displayed[factor] = Math.abs(next - target[factor]) < .0001 ? target[factor] : next;
                    changed ||= displayed[factor] !== previous;
                }
                if (changed) applyAppearance();
            }
            if (!reduced)
                stepPedestrians(simulation, dt);
            people.forEach(({ root, mixer }, i) => {
                const p = simulation.people[i], pose = seatedPose(p.seatBlend);
                root.position.set(p.x, pose.rootY, p.z);
                root.rotation.y = p.heading;
                root.visible = p.visible;
                if (p.walking && !reduced)
                    mixer.update(dt * .64);
                else
                    mixer.setTime(0);
                for (const side of ['L', 'R']) {
                    const hip = root.getObjectByName(`Leg_${side}`)!, knee = root.getObjectByName(`Knee_${side}`)!, ankle = root.getObjectByName(`Ankle_${side}`)!;
                    knee.rotation.x = pose.knee;
                    if (p.seatBlend > 0 || !p.walking || reduced)
                        hip.rotation.x = pose.hip;
                    ankle.rotation.x = -hip.rotation.x - knee.rotation.x;
                }
            });
            if (!reduced)
                for (const fan of fans)
                    fan.rotation.y += dt * (5 - 2.5 * (displayed?.VR ?? 0));
        }, dispose() { for (const p of people) {
            p.mixer.stopAllAction();
            p.mixer.uncacheRoot(p.root);
        } for (const m of glassMaterials)
            m.dispose(); } };
}
