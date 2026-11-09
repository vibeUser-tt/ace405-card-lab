import { defineConfig } from 'vite';
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';

// Relative assets work for both a repository Pages URL and a user Pages URL.
// Keep historical art on disk, but only ship assets used by the current game.
export default defineConfig(({command})=>({
  base:'./',
  publicDir:command==='build'?false:'public',
  plugins:[{
    name:'current-game-assets',apply:'build',
    async closeBundle(){
      const files=['favicon.svg','assets/modern-v2/building.glb','assets/modern-v2/citizen.glb','assets/modern-v2/ambient.png','assets/modern-v2/blender-agx.rgba16f','assets/design-lab/building.glb','assets/design-lab/hero.png'];
      for(const file of files){const destination=path.resolve('dist',file);await mkdir(path.dirname(destination),{recursive:true});await cp(path.resolve('public',file),destination,{recursive:true});}
    }
  }],
  build:{rollupOptions:{
    input: ['index.html', 'en/index.html', 'cn/index.html'],
    output:{manualChunks:{three:['three']}}
  }}
}));
