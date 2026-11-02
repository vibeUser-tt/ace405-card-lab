import * as THREE from 'three';

const shader = /* glsl */`
uniform highp sampler3D blenderDisplay;
vec3 blenderAgX(vec3 color) {
  // This chart was rendered through Blender 4.1's AgX / None display pipeline.
  // It already returns display-linear sRGB; the normal output chunk encodes it.
  vec3 lattice = clamp((log2(max(color, vec3(1e-10))) + 12.47393) / 16.499999, 0.0, 1.0);
  return texture(blenderDisplay, (lattice * 56.0 + 0.5) / 57.0).rgb;
}
`;

export async function loadBlenderDisplay(base: string): Promise<THREE.Data3DTexture> {
  const response = await fetch(`${base}blender-agx.rgba16f`);
  if (!response.ok) throw Error('Blender color calibration unavailable');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== 57 ** 3 * 4 * 2) throw Error('Invalid Blender color calibration');
  const texture = new THREE.Data3DTexture(new Uint16Array(bytes), 57, 57, 57);
  texture.format = THREE.RGBAFormat; texture.type = THREE.HalfFloatType;
  texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.unpackAlignment = 1; texture.needsUpdate = true;
  return texture;
}

export function useBlenderDisplay(material: THREE.Material, texture: THREE.Data3DTexture, bakedSky = false) {
  material.onBeforeCompile = program => {
    program.uniforms.blenderDisplay = { value: texture };
    program.fragmentShader = shader + program.fragmentShader;
    program.fragmentShader = program.fragmentShader.replace('#include <tonemapping_fragment>',
      'gl_FragColor.rgb = blenderAgX(gl_FragColor.rgb * toneMappingExposure);');
    if (bakedSky) {
      const lights = THREE.ShaderChunk.lights_fragment_begin.replace(
        'irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );',
        'irradiance += vec3( 0.0 );',
      );
      program.fragmentShader = program.fragmentShader.replace('#include <lights_fragment_begin>', lights);
    }
  };
  material.customProgramCacheKey = () => `blender-display-v2-${bakedSky}`;
}
