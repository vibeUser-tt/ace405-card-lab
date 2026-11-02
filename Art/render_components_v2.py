"""Render four native Blender assemblies, using the same selected components as the web review."""
import bpy,bmesh,json,sys,runpy,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parent
OUT=ROOT.parent/'public/assets/modern-v2'
manifest=json.loads((OUT/'components-manifest.json').read_text(encoding='utf-8'))
variant=int(sys.argv[sys.argv.index('--')+1])
ids=[prefix+str(variant) for prefix in ['W','I','S','P','M','T']]
scene=bpy.context.scene;scene.camera.data.ortho_scale=11.1
architecture=bpy.data.objects['Architecture']
keep_groups=['Site'] if variant<=2 else ['Site','BuildingShell']
indices={architecture.vertex_groups[k].index for k in keep_groups}
keep={v.index for v in architecture.data.vertices if any(g.group in indices and g.weight>.5 for g in v.groups)}
bm=bmesh.new();bm.from_mesh(architecture.data);bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.index not in keep],context='VERTS');bm.to_mesh(architecture.data);bm.free()
wanted={'Card_'+cid for cid in ids}
if variant<=2:wanted.add('Layout_P'+str(variant))
with bpy.data.libraries.load(str(ROOT/'components-v2.blend'),link=False) as (source,target):target.objects=source.objects
for obj in target.objects:
    if not obj:continue
    root=obj
    while root.parent:root=root.parent
    if root.name in wanted:scene.collection.objects.link(obj);obj.hide_render=False
for cid in ids:
    for mount in manifest['cards'][cid].get('layoutMounts',[]):
        obj=bpy.data.objects[mount['node']]
        if variant==1:
            obj.location.y-=.5
            if mount['kind']=='side':obj.scale.y*=1.6/2.6
        elif mount['kind']=='roof':obj.scale=(.5,.5,.5);obj.location=(-.2,1.02,1.36)
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/f'modern-cards-v2-{variant}.blend'))
helpers=runpy.run_path(str(ROOT/'build_modern_v2.py'));helpers['device']()
scene.cycles.samples=96
scene.render.filepath=str(ROOT/f'renders/blender-reference-v2-cards-{variant}.png')
bpy.ops.render.render(write_still=True)
shutil.copyfile(scene.render.filepath,OUT/f'reference-cards-{variant}.png')
print('NATIVE_COMPONENT_REFERENCE_COMPLETE',ids,flush=True)
