import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createPedestrians, stepPedestrians } from './pedestrians';
import type { PedestrianSimulation } from './pedestrians';
import { loadBlenderDisplay, useBlenderDisplay } from './blender-display';

export const modernLighting = {
  sunPosition: new THREE.Vector3(-3, 7, 4),
  sunColor: new THREE.Color().setRGB(1, .91, .77), sunIntensity: 2.25,
  skyColor: new THREE.Color().setRGB(.75, .83, 1), skyIntensity: .55 * Math.PI,
};
type ComponentAnimation = { node: string; kind: string; webAxis?: 'x'|'y'|'z'; rangeRadians?: number[] };
type ComponentSpec = { node: string; layout?: string; hideRoof?: boolean; bake?: {ambient:string;material:string}; animatedNodes: ComponentAnimation[]; layoutMounts?: {node:string;kind:'side'|'roof'}[] };
export type ModernAssets = { building: GLTF; citizen: GLTF; components: GLTF; manifest: { cards: Record<string, ComponentSpec> }; ambient: THREE.Texture; openAmbient:THREE.Texture; shallowSiteAmbient:THREE.Texture };
export type ModernInstance = {
  group: THREE.Group; people: { root: THREE.Object3D; mixer: THREE.AnimationMixer; phase: number }[];
  door: THREE.Object3D | undefined; time: number; simulation: PedestrianSimulation;
  components: THREE.Group; animations: {node:THREE.Object3D;spec:ComponentAnimation;rest:THREE.Euler}[];
  ownedMaterials: THREE.Material[]; shellMaterial:THREE.Material; siteMaterial:THREE.Material; floorHeight:number; dispose: () => void;
};
let pending: Promise<ModernAssets> | undefined;
const base = `${import.meta.env.BASE_URL}assets/modern-v2/`;

/** One application-wide cache. Clones share immutable mesh/texture resources. */
export function loadModernAssets(): Promise<ModernAssets> {
  if (pending) return pending;
  const loader = new GLTFLoader();
  pending = Promise.all([
    loader.loadAsync(`${base}building.glb`), loader.loadAsync(`${base}citizen.glb`),
    new THREE.TextureLoader().loadAsync(`${base}ambient.png`),
    loader.loadAsync(`${base}components.glb`),
    fetch(`${base}components-manifest.json`).then(r=>{if(!r.ok)throw Error('Component manifest unavailable');return r.json();}),
    new THREE.TextureLoader().loadAsync(`${base}ambient-site-p1.png`),
    new THREE.TextureLoader().loadAsync(`${base}ambient-open.png`),
    loadBlenderDisplay(base),
  ]).then(async ([building, citizen, ambient, components, manifest, shallowSiteAmbient, openAmbient, display]) => {
    ambient.flipY = false; ambient.colorSpace = THREE.LinearSRGBColorSpace;
    ambient.channel = 1; ambient.anisotropy = 4;
    for(const tex of [shallowSiteAmbient,openAmbient]){tex.flipY=false;tex.colorSpace=THREE.LinearSRGBColorSpace;tex.channel=1;tex.anisotropy=4;}
    const converted = new Map<string, THREE.MeshLambertMaterial>(), replaced=new Set<THREE.Material>();
    const layoutAmbient: Record<string,THREE.Texture> = {};
    // Layout shells have their own atlas because their geometry changes the skylight occlusion.
    for (const id of ['P1','P2']) {
      if (manifest.layouts?.[`Layout_${id}`]?.bake) {
        const tex=await new THREE.TextureLoader().loadAsync(`${base}ambient-layout-${id.toLowerCase()}.png`);
        tex.flipY=false;tex.colorSpace=THREE.LinearSRGBColorSpace;tex.channel=1;tex.anisotropy=4;
        layoutAmbient[`BakedLayout_${id}`]=tex;
      }
    }
    await Promise.all(Object.values(manifest.cards as Record<string,ComponentSpec>).map(async spec=>{
      if(!spec.bake)return;
      const tex=await new THREE.TextureLoader().loadAsync(`${base}${spec.bake.ambient}`);
      tex.flipY=false;tex.colorSpace=THREE.LinearSRGBColorSpace;tex.channel=1;tex.anisotropy=4;
      layoutAmbient[spec.bake.material]=tex;
    }));
    for (const asset of [building, citizen, components]) asset.scene.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const source = o.material as THREE.MeshStandardMaterial;
      const key=source.uuid+(o.name==='Site'?'_site':'');
      let material = converted.get(key);replaced.add(source);
      if (!material) {
        material = new THREE.MeshLambertMaterial({ name: source.name, color: source.color, map: source.map, vertexColors: source.vertexColors });
        // Matte diffuse shading matches the Blender source. Glass is also opaque.
        if (source.name === 'BakedArchitecture' || layoutAmbient[source.name]) {
          material.lightMap = layoutAmbient[source.name] || ambient; material.lightMapIntensity = Math.PI;
          material.userData.bakedSky = true;
        }
        useBlenderDisplay(material, display, !!material.userData.bakedSky);
        converted.set(key, material);
      }
      o.material = material;
      if (material.lightMap && !o.geometry.attributes.uv1) o.geometry.setAttribute('uv1', o.geometry.attributes.uv.clone());
      o.castShadow = true; o.receiveShadow = true; o.userData.sharedAsset = true;
    });
    for (const material of replaced) material.dispose();
    return { building, citizen, ambient, components, manifest, openAmbient, shallowSiteAmbient };
  }).catch(error => { pending = undefined; throw error; });
  return pending;
}

export function createModernBuilding(assets: ModernAssets, peopleCount = 2, phase = 0): ModernInstance {
  const group = new THREE.Group(); group.name = 'ModernBuilding'; group.userData.persistent = true;
  const architecture = assets.building.scene.clone(true); group.add(architecture);
  const people: ModernInstance['people'] = [];
  for (let i = 0; i < peopleCount; i++) {
    const root = assets.citizen.scene.clone(true); root.name = `Citizen_${i}`;
    group.add(root);
    const mixer = new THREE.AnimationMixer(root);
    for (const clip of assets.citizen.animations) mixer.clipAction(clip).play();
    people.push({ root, mixer, phase: phase + i / Math.max(1, peopleCount) });
  }
  const components=new THREE.Group();components.name='InstalledComponents';group.add(components);
  const instance: ModernInstance = {
    group, people, door: group.getObjectByName('EntryDoor'), time: 0, simulation:createPedestrians(peopleCount,phase),
    components, animations:[], ownedMaterials:[], floorHeight:.024, shellMaterial:(group.getObjectByName('BuildingShell') as THREE.Mesh).material as THREE.Material,
    siteMaterial:(group.getObjectByName('Site') as THREE.Mesh).material as THREE.Material,
    dispose: () => { for (const p of people) { p.mixer.stopAllAction(); p.mixer.uncacheRoot(p.root); } for(const m of instance.ownedMaterials)m.dispose(); },
  };
  updateModernBuilding(instance, 0, true);
  return instance;
}

export function updateModernBuilding(instance: ModernInstance, delta: number, reduced: boolean) {
  if (!reduced) stepPedestrians(instance.simulation, delta);
  instance.time=instance.simulation.time;
  instance.people.forEach((person,i)=>{
    const p=instance.simulation.people[i];
    const y=Math.abs(p.x)<.3?instance.floorHeight*THREE.MathUtils.clamp((1.65-p.z)/.35,0,1):0;
    person.root.position.set(p.x,y,p.z);person.root.rotation.y=p.heading;person.root.visible=p.visible;
    person.root.userData.state=p.state;
    person.mixer.timeScale=!reduced&&p.walking?.64:0;
    if(p.walking&&!reduced)person.mixer.update(Math.min(delta,.06));
    else person.mixer.setTime(0); // A stopped walker stands, rather than freezing mid-stride.
  });
  if(instance.door)instance.door.rotation.y=instance.simulation.doorAngle;
  for(const {node,spec,rest} of instance.animations) {
    const axis=spec.webAxis||'x', t=instance.time;
    if(spec.kind==='brightness') {
      node.traverse(o=>{if(o instanceof THREE.Mesh)(o.material as THREE.MeshLambertMaterial).emissiveIntensity=.10+.06*Math.sin(t*.5);});
    } else if(spec.kind==='spin')node.rotation[axis]=rest[axis]+t*2.4;
    else {const [lo,hi]=spec.rangeRadians||[0,.5];node.rotation[axis]=rest[axis]+lo+(hi-lo)*(.5+.5*Math.sin(t*.45));}
  }
}

/** Replace only installed upgrades: walking, door reservations and camera rotation persist. */
export function installModernCards(instance:ModernInstance,assets:ModernAssets,ids:string[],side='player') {
  instance.components.clear();instance.animations=[];
  for(const m of instance.ownedMaterials)m.dispose();instance.ownedMaterials=[];
  const plan=ids.find(id=>id.startsWith('P')), planSpec=plan?assets.manifest.cards[plan]:undefined;
  instance.floorHeight=planSpec?.layout ? .10:.024;
  const shell=instance.group.getObjectByName('BuildingShell') as THREE.Mesh;
  shell.visible=!planSpec?.layout;shell.material=instance.shellMaterial;
  if(planSpec?.hideRoof){const mat=(instance.shellMaterial as THREE.MeshLambertMaterial).clone();mat.lightMap=assets.openAmbient;mat.onBeforeCompile=instance.shellMaterial.onBeforeCompile;mat.customProgramCacheKey=instance.shellMaterial.customProgramCacheKey;shell.material=mat;instance.ownedMaterials.push(mat);}
  const site=instance.group.getObjectByName('Site') as THREE.Mesh;site.material=instance.siteMaterial;
  if(plan==='P1'||planSpec?.hideRoof){const mat=(instance.siteMaterial as THREE.MeshLambertMaterial).clone();mat.lightMap=plan==='P1'?assets.shallowSiteAmbient:assets.openAmbient;mat.onBeforeCompile=instance.siteMaterial.onBeforeCompile;mat.customProgramCacheKey=instance.siteMaterial.customProgramCacheKey;site.material=mat;instance.ownedMaterials.push(mat);}
  instance.group.getObjectByName('Roof')!.visible=!planSpec?.layout&&!planSpec?.hideRoof;
  if(planSpec?.layout) {
    const shell=assets.components.scene.getObjectByName(planSpec.layout)!.clone(true);
    shell.userData={...shell.userData,id:plan,side};instance.components.add(shell);
  }
  for(const id of ids) {
    const spec=assets.manifest.cards[id];if(!spec)continue;
    // Wrapper keeps installation effects independent of layout-specific mount transforms.
    const wrapper=new THREE.Group();wrapper.name=`Installed_${id}`;wrapper.userData={id,side};
    const part=assets.components.scene.getObjectByName(spec.node)!.clone(true);wrapper.add(part);instance.components.add(wrapper);
    for(const mount of spec.layoutMounts||[]) {
      const node=part.getObjectByName(mount.node)!;
      if(plan==='P1') {node.position.z+=.5;if(mount.kind==='side')node.scale.z*=1.6/2.6;}
      if((plan==='P2'||planSpec?.hideRoof)&&mount.kind==='roof') {
        // Small mechanical equipment sits on a solid rear service wing / cutaway ledge.
        node.scale.setScalar(.5);node.position.set(-.2,1.36,-1.02);
      }
    }
    for(const animation of spec.animatedNodes) {
      const node=part.getObjectByName(animation.node);if(!node)continue;
      if(animation.kind==='brightness')node.traverse(o=>{if(o instanceof THREE.Mesh){const source=o.material as THREE.MeshLambertMaterial;const mat=source.clone();mat.onBeforeCompile=source.onBeforeCompile;mat.customProgramCacheKey=source.customProgramCacheKey;mat.emissive.set('#ffe185');o.material=mat;instance.ownedMaterials.push(mat);}});
      instance.animations.push({node,spec:animation,rest:node.rotation.clone()});
    }
  }
}

export function configureModernRenderer(renderer: THREE.WebGLRenderer) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

export function addModernLights(scene: THREE.Scene, shadowSize = 2048) {
  const fill = new THREE.HemisphereLight(modernLighting.skyColor, modernLighting.skyColor, modernLighting.skyIntensity);
  const sun = new THREE.DirectionalLight(modernLighting.sunColor, modernLighting.sunIntensity);
  sun.position.copy(modernLighting.sunPosition); sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: .1, far: 50 });
  sun.shadow.normalBias = .012; sun.shadow.bias = -.0001;
  scene.add(fill, sun, sun.target); return sun;
}
