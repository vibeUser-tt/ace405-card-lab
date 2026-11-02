"""Reproducible Blender 4.1 authoring, Cycles baking and web export for ACE405.

Run build() through Blender MCP; bake/export/render can run in a separate
background Blender so the interactive scene remains responsive.
"""
import bpy, math, json, random, sys, shutil
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / 'public/assets/modern-v1'
SCENE_FILE = ROOT / 'modern-building-v1.blend'
RNG = random.Random(405)
STATIC = []

def rgb(hex):
    v = [int(hex[i:i+2], 16)/255 for i in (0,2,4)]
    return tuple(x/12.92 if x <= .04045 else ((x+.055)/1.055)**2.4 for x in v)

def material(name, color, noise=0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    n = m.node_tree.nodes; n.clear(); l = m.node_tree.links
    out = n.new('ShaderNodeOutputMaterial'); bs = n.new('ShaderNodeBsdfDiffuse')
    bs.inputs['Color'].default_value = (*rgb(color),1); bs.inputs['Roughness'].default_value = 0
    l.new(bs.outputs[0],out.inputs['Surface'])
    if noise:
        tex = n.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value=85
        tex.inputs['Detail'].default_value=2
        ramp = n.new('ShaderNodeValToRGB')
        for e,factor in zip(ramp.color_ramp.elements,[1-noise,1+noise]):
            e.color = (*(min(1,x*factor) for x in rgb(color)),1)
        l.new(tex.outputs['Fac'],ramp.inputs[0]); l.new(ramp.outputs['Color'],bs.inputs['Color'])
    m.diffuse_color=(*rgb(color),1)
    return m

def box(name, loc, dims, mat, bevel=.01, parent=None, static=True):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); o=bpy.context.object; o.name=name
    o.dimensions=dims; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat)
    if bevel:
        mod=o.modifiers.new('Soft architectural edge','BEVEL'); mod.width=bevel; mod.segments=2
        bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL'); mod.keep_sharp=True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if parent: o.parent=parent
    if static: STATIC.append(o)
    return o

def sphere(name, loc, scale, mat, parent=None, static=True, detail=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=detail,radius=1,location=loc)
    o=bpy.context.object; o.name=name; o.scale=scale; o.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if parent:o.parent=parent
    if static:STATIC.append(o)
    return o

def empty(name,loc=(0,0,0),parent=None):
    o=bpy.data.objects.new(name,None); bpy.context.scene.collection.objects.link(o);o.location=loc;o.parent=parent
    return o

def join(objects,name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    return o

def palette_merge(parent,name):
    objects=[o for o in parent.children if o.type=='MESH']
    if not objects:return
    obj=join(objects,name)
    colors=obj.data.color_attributes.new(name='Palette',type='FLOAT_COLOR',domain='CORNER')
    for p in obj.data.polygons:
        color=obj.data.materials[p.material_index].diffuse_color
        for i in p.loop_indices:colors.data[i].color=color
    mat=bpy.data.materials.get('VertexPalette') or material('VertexPalette','ffffff')
    nt=mat.node_tree
    if not nt.nodes.get('Palette'):
        v=nt.nodes.new('ShaderNodeVertexColor');v.name='Palette';v.layer_name='Palette'
        nt.links.new(v.outputs['Color'],next(n for n in nt.nodes if n.type=='BSDF_DIFFUSE').inputs['Color'])
    obj.data.materials.clear();obj.data.materials.append(mat)
    for p in obj.data.polygons:p.material_index=0

def window(x,y,z,w,h,angle,m):
    # Construct in a local front-facing frame. Only the opaque pane is flat.
    pieces=[]
    def b(label,p,d,mat,edge=.006):
        xx=x+p[0]*math.cos(angle)-p[1]*math.sin(angle)
        yy=y+p[0]*math.sin(angle)+p[1]*math.cos(angle)
        o=box(label,(xx,yy,z+p[2]),d,mat,edge);o.rotation_euler.z=angle;pieces.append(o)
    b('Window recess',(0,.065,0),(w+.05,.09,h+.05),m['recess'])
    b('Opaque stylized glass',(0,-.003,0),(w-.07,.025,h-.07),m['glass'])
    # Muted upper-sky band is painted geometry, without a reflection shader.
    b('Glass sky tint',(0,-.018,h*.30),(w-.09,.003,h*.22),m['glasslight'],0)
    for xx in [-w/2,w/2]:b('Window jamb',(xx,-.038,0),(.036,.082,h+.06),m['metal'])
    for zz in [-h/2,h/2]:b('Window transom',(0,-.038,zz),(w+.035,.082,.036),m['metal'])
    b('Centre mullion',(0,-.046,0),(.022,.088,h),m['metal'])
    b('Stone sill',(0,-.065,-h/2-.04),(w+.14,.17,.055),m['sill'])

def facade(y,angle,m,door=False):
    # Solid strips and piers leave genuine window/door openings.
    width=3.25
    for z,h in [(.12,.24),(1.23,.30),(2.36,.28)]:
        box('Facade horizontal band',(0,y,z),(width,.14,h),m['plaster'])
    for x,w in [(-1.53,.19),(-.52,.19),(.52,.19),(1.53,.19)]:
        box('Facade pier',(x,y,1.25),(w,.14,2.5),m['plaster'])
    for level,z in enumerate([.66,1.81]):
        for x in [-1.025,0,1.025]:
            if door and level==0 and x==0:continue
            window(x,y-.08 if angle==0 else y+.08,z,.82,.79,angle,m)

def make_person(m):
    root=empty('Citizen'); root['asset_role']='citizen'
    body=empty('Torso',(0,0,.27),root)
    box('Jacket',(0,0,.055),(.115,.075,.14),m['coat'],.025,body,False)
    box('Collar',(0,-.008,.133),(.065,.07,.022),m['shirt'],.007,body,False)
    sphere('Head',(0,0,.18),(.043,.041,.051),m['skin'],body,False,2)
    sphere('Hair',(0,.004,.204),(.044,.042,.031),m['hair'],body,False,2)
    joints=[]
    for sign in [-1,1]:
        leg=empty('Leg_L' if sign<0 else 'Leg_R',(sign*.034,0,.265),root)
        box('Trouser',(0,0,-.10),(.045,.05,.19),m['trouser'],.012,leg,False)
        box('Shoe',(0,-.018,-.207),(.048,.088,.035),m['shoe'],.01,leg,False)
        arm=empty('Arm_L' if sign<0 else 'Arm_R',(sign*.08,0,.36),root)
        box('Sleeve',(0,0,-.055),(.039,.05,.115),m['coat'],.012,arm,False)
        sphere('Hand',(0,0,-.125),(.019,.023,.028),m['skin'],arm,False,1)
        joints.extend([(leg,sign*.48),(arm,-sign*.36)])
    # NLA tracks of the same name export as a single reusable Walk clip.
    for joint,amplitude in joints:
        for frame,phase in [(1,0),(7,1),(13,0),(19,-1),(25,0)]:
            joint.rotation_euler.x=amplitude*phase
            joint.keyframe_insert(data_path='rotation_euler',frame=frame)
        action=joint.animation_data.action;action.name=joint.name+'_Walk'
        for curve in action.fcurves:
            for key in curve.keyframe_points:key.interpolation='BEZIER'
        track=joint.animation_data.nla_tracks.new();track.name='Walk'
        track.strips.new('Walk',1,action);joint.animation_data.action=None
    for part in [body,*(joint for joint,_ in joints)]:palette_merge(part,part.name+'_Mesh')
    return root

def build():
    OUT.mkdir(parents=True,exist_ok=True);(ROOT/'renders').mkdir(exist_ok=True)
    # Preserve any pre-existing interactive scene while authoring a dedicated scene.
    for previous in list(bpy.data.scenes):
        if previous.get('ace405_generated') or (previous.name.startswith('ACE405_Modern_V1') and Path(bpy.data.filepath)==SCENE_FILE):
            for obj in list(previous.objects):bpy.data.objects.remove(obj,do_unlink=True)
    RNG.seed(405)
    s=bpy.data.scenes.new('ACE405_Modern_V1');bpy.context.window.scene=s
    STATIC.clear();s.unit_settings.system='METRIC';s['ace405_generated']=True
    m={k:material(k,c,n) for k,c,n in [
        ('plaster','d8d3c1',.055),('sill','c7c4b8',.035),('concrete','b9bbb5',.05),
        ('paving','b9b5a8',.06),('roof','87918e',.07),('metal','526268',0),
        ('glass','456d7a',0),('glasslight','6f929a',0),('recess','233b46',0),
        ('soil','66614b',.08),('green','758665',.10),('greenlight','9ba57c',.08),
        ('trunk','85745c',.06),('brass','b7a47b',0),('coat','bd805d',0),
        ('shirt','ddd7c6',0),('skin','d0a987',0),('hair','4a443e',0),
        ('trouser','465a65',0),('shoe','e0dace',0)]}
    box('Plinth',(0,0,-.17),(4.65,4.1,.24),m['concrete'],.055)
    box('Plinth shadow reveal',(0,0,-.30),(4.35,3.85,.05),m['metal'],.018)
    for ix in range(10):
        for iy in range(9):
            x=-2.08+ix*.46;y=-1.81+iy*.45
            if abs(x)<1.66 and abs(y)<1.34:continue
            box('Paving slab',(x,y,-.035),(.448,.438,.04),m['paving'],.005)
    box('Ground floor',(0,0,.04),(3.25,2.6,.12),m['recess'])
    box('Upper floor',(0,0,1.25),(3.25,2.6,.12),m['recess'])
    facade(-1.30,0,m,True);facade(1.30,math.pi,m)
    for side in [-1,1]:
        x=side*1.625
        for z,h in [(.12,.24),(1.23,.30),(2.36,.28)]:
            box('Side band',(x,0,z),(.14,2.6,h),m['plaster'])
        for y,d in [(-1.19,.22),(0,.50),(1.19,.22)]:
            box('Side pier',(x,y,1.25),(.14,d,2.5),m['plaster'])
        for y in [-.68,.68]:
            for z in [.66,1.81]:window(x+side*.08,y,z,.82,.79,side*math.pi/2,m)
    # Flat roof with parapet, coping, subtle perimeter detailing. No upgrade hardware.
    box('Roof deck',(0,0,2.50),(3.33,2.69,.12),m['roof'],.02)
    for x in [-1.68,1.68]:
        box('Parapet',(x,0,2.61),(.10,2.77,.18),m['plaster'])
        box('Zinc coping',(x,0,2.715),(.14,2.84,.035),m['metal'],.008)
    for y in [-1.36,1.36]:
        box('Parapet',(0,y,2.61),(3.45,.10,.18),m['plaster'])
        box('Zinc coping',(0,y,2.715),(3.48,.14,.035),m['metal'],.008)
    for x in [-1.5,1.5]:box('Rainwater pipe',(x,1.40,1.26),(.047,.047,2.5),m['metal'],.012)
    box('Entry recess',(0,-1.24,.60),(.85,.07,1.12),m['recess'])
    box('Entry canopy',(0,-1.51,1.22),(1.13,.59,.06),m['metal'])
    for x in [-.46,.46]:box('Entry frame',(x,-1.40,.59),(.055,.11,1.13),m['metal'])
    box('Entrance threshold',(0,-1.46,.035),(1.02,.38,.06),m['sill'])
    door=empty('EntryDoor',(-.405,-1.405,.06));door['animation_role']='door'
    box('Door opaque glass',(.39,0,.51),(.78,.035,1.02),m['glass'],.005,door,False)
    for x in [0,.78]:box('Door stile',(x,-.02,.51),(.035,.065,1.03),m['metal'],.004,door,False)
    for z in [0,1.02]:box('Door rail',(.39,-.02,z),(.80,.065,.035),m['metal'],.004,door,False)
    box('Door pull',(.67,-.07,.52),(.018,.035,.20),m['brass'],.006,door,False)
    palette_merge(door,'DoorMesh')
    # Quiet planters keep a clear pedestrian path in front and on both sides.
    for x in [-1.72,1.72]:
        box('Planter edge',(x,-1.62,.07),(.69,.43,.17),m['sill'],.022)
        box('Planter soil',(x,-1.62,.16),(.61,.35,.018),m['soil'],0)
        for j in range(6):
            xx=x+RNG.uniform(-.24,.24);yy=-1.62+RNG.uniform(-.12,.12)
            sphere('Plant',(xx,yy,.24+RNG.random()*.06),(.10,.09,.15),m['green' if j%2 else 'greenlight'])
    # Small rear-side tree, low enough to preserve the architectural silhouette.
    box('Tree trunk',(-2.0,.95,.42),(.065,.065,.90),m['trunk'],.012)
    for j in range(7):
        sphere('Tree canopy',(-2.0+RNG.uniform(-.22,.22),.95+RNG.uniform(-.18,.18),.91+RNG.uniform(-.08,.28)),(.25,.23,.25),m['greenlight' if j%2 else 'green'],detail=2)
    shell=join(STATIC,'Architecture');shell['asset_role']='baked_architecture'
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.002)
    bpy.ops.object.mode_set(mode='OBJECT');shell.data.uv_layers.active.name='AtlasUV'
    second=shell.data.uv_layers.new(name='LightmapUV')
    for a,b in zip(shell.data.uv_layers[0].data,second.data):b.uv=a.uv
    shell.data.uv_layers.active_index=0
    for name,pos in {'Slot_window':(0,-1.40,1.5),'Slot_wall':(-1.76,0,1.3),'Slot_shade':(0,-1.6,2),'Slot_plan':(0,0,2.8),'Slot_material':(1.76,0,1.3),'Slot_system':(.65,0,2.85)}.items():empty(name,pos)
    person=make_person(m);person.location=(0,-1.83,0)
    s.frame_start=1;s.frame_end=25;s.render.fps=24;s.frame_set(1)
    s.world=bpy.data.worlds.new('Uniform soft sky');s.world.use_nodes=True
    s.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.75,.83,1,1)
    s.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.55
    data=bpy.data.lights.new('Fixed warm sun','SUN');data.energy=2.25;data.angle=.045;data.color=(1,.91,.77)
    sun=bpy.data.objects.new('Fixed warm sun',data);s.collection.objects.link(sun)
    sun.location=(-3,-4,7);sun.rotation_euler=(Vector((0,0,0))-sun.location).to_track_quat('-Z','Y').to_euler()
    camera_data=bpy.data.cameras.new('Reference camera');cam=bpy.data.objects.new('Reference camera',camera_data);s.collection.objects.link(cam)
    cam.location=(5,-8,6);target=Vector((0,0,1.0));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    camera_data.type='ORTHO';camera_data.ortho_scale=6.4;s.camera=cam
    s.render.engine='CYCLES';s.cycles.samples=64;s.cycles.use_denoising=True;s.cycles.max_bounces=4
    s.render.resolution_x=1200;s.render.resolution_y=1000;s.render.resolution_percentage=100
    s.render.film_transparent=True;s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA'
    s.view_settings.view_transform='AgX';s.view_settings.look='None';s.view_settings.exposure=0
    bpy.ops.wm.save_as_mainfile(filepath=str(SCENE_FILE))
    print('BUILD_COMPLETE',len(shell.data.polygons),str(SCENE_FILE),flush=True)

def device():
    try:
        pref=bpy.context.preferences.addons['cycles'].preferences;pref.compute_device_type='OPTIX';pref.get_devices()
        for d in pref.devices:d.use=d.type=='OPTIX'
        bpy.context.scene.cycles.device='GPU'
    except Exception as e:print('CPU fallback',str(e),flush=True)

def bake():
    device();s=bpy.context.scene;obj=bpy.data.objects['Architecture'];s.cycles.samples=32
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    # Only the rigid assembly participates. Doors/people never leave baked ghosts.
    hidden=[]
    for o in s.objects:
        if o.type=='MESH' and o!=obj:hidden.append((o,o.hide_render));o.hide_render=True
    sun=bpy.data.objects['Fixed warm sun'];sun.hide_render=True
    s.render.bake.margin=8;s.render.bake.margin_type='EXTEND';s.render.bake.use_clear=True;s.render.bake.use_selected_to_active=False
    images={}
    for name,kind,size,space in [('albedo','DIFFUSE',2048,'sRGB'),('ambient','DIFFUSE',2048,'Non-Color'),('ao','AO',1024,'Non-Color')]:
        img=bpy.data.images.new('Modern_'+name,width=size,height=size,alpha=False,float_buffer=False)
        img.colorspace_settings.name=space
        for mat in obj.data.materials:
            nt=mat.node_tree;n=nt.nodes.new('ShaderNodeTexImage');n.name='BAKE_'+name;n.image=img;nt.nodes.active=n
        s.render.bake.use_pass_color=name=='albedo'
        s.render.bake.use_pass_direct=name=='ambient';s.render.bake.use_pass_indirect=name=='ambient'
        print('BAKING',name,flush=True);bpy.ops.object.bake(type=kind)
        img.filepath_raw=str(OUT/(name+'.png'));img.file_format='PNG';img.save();images[name]=img
    for o,v in hidden:o.hide_render=v
    sun.hide_render=False
    # Keep source procedural materials in the blend; the export uses a clean atlas material.
    bpy.ops.wm.save_as_mainfile(filepath=str(SCENE_FILE))
    export(images)

def export(images=None):
    s=bpy.context.scene;obj=bpy.data.objects['Architecture']
    if images is None:images={name:bpy.data.images.load(str(OUT/(name+'.png')),check_existing=True) for name in ['albedo','ambient','ao']}
    original=list(obj.data.materials);indices=[p.material_index for p in obj.data.polygons]
    mat=bpy.data.materials.new('BakedArchitecture');mat.use_nodes=True;nt=mat.node_tree;bs=nt.nodes.get('Principled BSDF')
    bs.inputs['Roughness'].default_value=1;bs.inputs['Specular IOR Level'].default_value=0
    tex=nt.nodes.new('ShaderNodeTexImage');tex.image=images['albedo'];nt.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
    obj.data.materials.clear();obj.data.materials.append(mat)
    for p in obj.data.polygons:p.material_index=0
    # Dynamic pieces use inexpensive, opaque base colors.
    swaps=[]
    for o in s.objects:
        if o.type!='MESH' or o==obj:continue
        for slot in o.material_slots:
            old=slot.material
            if old is None:continue
            new=bpy.data.materials.get('Web_'+old.name)
            if not new:
                new=bpy.data.materials.new('Web_'+old.name);new.use_nodes=True
                b=new.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=old.diffuse_color
                b.inputs['Roughness'].default_value=1;b.inputs['Specular IOR Level'].default_value=0
                if old.node_tree.nodes.get('Palette'):
                    vertex=new.node_tree.nodes.new('ShaderNodeVertexColor');vertex.layer_name='Palette'
                    new.node_tree.links.new(vertex.outputs['Color'],b.inputs['Base Color'])
            swaps.append((slot,old));slot.material=new
    bpy.ops.object.select_all(action='DESELECT')
    citizen=bpy.data.objects['Citizen']
    for o in [citizen,*citizen.children_recursive]:o.select_set(True)
    origin=citizen.location.copy();citizen.location=(0,0,0)
    bpy.ops.export_scene.gltf(filepath=str(OUT/'citizen.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=True,export_nla_strips=True,export_force_sampling=True)
    citizen.location=origin
    bpy.ops.object.select_all(action='DESELECT')
    citizens=[citizen,*citizen.children_recursive]
    for o in s.objects:
        if o.type not in ['CAMERA','LIGHT'] and o not in citizens:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/'building.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=False,export_extras=True)
    obj.data.materials.clear()
    for m in original:obj.data.materials.append(m)
    for p,index in zip(obj.data.polygons,indices):p.material_index=index
    for slot,old in swaps:slot.material=old
    cam=s.camera
    manifest={'version':1,'building':'building.glb','citizen':'citizen.glb','textures':{'albedo':'albedo.png','ambient':'ambient.png','ao':'ao.png'},
        'bake':{'engine':'Cycles','ambient':'Uniform sky diffuse direct + indirect, color excluded; sun, door and people excluded','uv':'AtlasUV / copied LightmapUV','ambientEncoding':'linear RGB in PNG, no view transform','ambientIntensity':math.pi,'aoUsage':'Separate diagnostic/fallback. Occlusion already present in ambient; do not multiply twice.'},
        'reference':{'cameraPosition':[cam.location.x,cam.location.z,-cam.location.y],'target':[0,1,0],'orthoWidth':cam.data.ortho_scale,'width':1200,'height':1000,'sunPosition':[-3,7,4],'sunColor':[1,.91,.77],'sunIntensity':2.25,'viewTransform':'AgX','exposure':1},
        'mesh':{'polygons':len(obj.data.polygons),'vertices':len(obj.data.vertices)},'animations':['Walk'],'glass':'opaque painted diffuse, no reflection or transmission'}
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    print('EXPORT_COMPLETE',flush=True)

def render(view='front'):
    device();s=bpy.context.scene;s.cycles.samples=96;s.frame_set(1)
    camera=s.camera;original=camera.matrix_world.copy()
    if view=='back':
        camera.location=(5,8,6);camera.rotation_euler=(Vector((0,0,1))-camera.location).to_track_quat('-Z','Y').to_euler()
    suffix='-back' if view=='back' else ''
    s.render.filepath=str(ROOT/('renders/blender-reference-v1'+suffix+'.png'));bpy.ops.render.render(write_still=True)
    shutil.copyfile(s.render.filepath,OUT/('reference'+suffix+'.png'))
    camera.matrix_world=original
    print('RENDER_COMPLETE',flush=True)

if __name__=='__main__':
    mode=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'build'
    if mode=='build':build()
    elif mode=='bake':bake();render()
    elif mode=='export':export()
    elif mode=='render':render()
    elif mode=='render-back':render('back')
