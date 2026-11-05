"""Blender-authored variable building, card illustrations and reproducible previews."""
import bpy, math, json, shutil
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent
OUT=ROOT.parent/'public/assets/design-lab'
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'cards').mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
s=bpy.context.scene
def mat(name,color,metal=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.6;p.inputs['Metallic'].default_value=metal
    return m
cream=mat('Warm plaster',(.81,.71,.48));edge=mat('Dark blue frames',(.025,.12,.20));glass=mat('Glass',(.03,.40,.65),.18)
sky=mat('Glass reflection',(.20,.73,.84));foam=mat('Insulation cutaway',(.96,.48,.12));roof=mat('Roof finish',(.05,.28,.36))
steel=mat('Equipment',(.48,.63,.66),.2);red=mat('Warm exhaust',(.81,.20,.09));blue=mat('Fresh air',(.04,.47,.76));white=mat('Trim',(.95,.88,.67))
def group(name,factor=None,option=None):
    o=bpy.data.objects.new(name,None);s.collection.objects.link(o)
    if factor:o['factor']=factor;o['option']=option
    return o
def box(name,loc,size,m,parent=None,bevel=.012):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    if bevel:
        mod=o.modifiers.new('Soft edges','BEVEL');mod.width=bevel;mod.segments=2
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=o.modifiers.new('Normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=mod.name)
    o.parent=parent;return o
def cylinder(name,loc,radius,depth,m,parent=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=20,radius=radius,depth=depth,location=loc);o=bpy.context.object;o.name=name;o.data.materials.append(m);o.parent=parent;return o
core=group('Architecture')
box('Ground slab',(0,0,0),(3.35,2.7,.10),steel,core)
box('Upper floor',(0,0,1.23),(3.25,2.6,.12),white,core)
for y in [-1.36,1.22]:box('Facade backing',(0,y,1.25),(3.25,.10,2.5),cream,core)
for z,h in [(.12,.24),(1.23,.30),(2.36,.28)]:
    for y in [-1.3,1.3]:box('Horizontal facade',(0,y,z),(3.25,.14,h),cream,core)
for x in [-1.53,-.52,.52,1.53]:
    for y in [-1.3,1.3]:box('Facade pier',(x,y,1.25),(.19,.14,2.5),cream,core)
for x in [-1.625,1.625]:box('Side wall',(x,0,1.25),(.14,2.6,2.5),cream,core)
def window(parent,x,y,z,w=.82,h=.79,front=True):
    box('Glass pane',(x,y-.015,z),(w,.04,h),glass,parent)
    box('Sky band',(x,y-.040,z+h*.27),(w-.045,.008,h*.18),sky,parent,0)
    for xx in [-w/2,w/2,0]:box('Mullion',(x+xx,y-.06,z),(.035,.075,h+.04),edge,parent,.005)
    for zz in [-h/2,h/2]:box('Transom',(x,y-.06,z+zz),(w+.05,.08,.035),edge,parent,.005)
    box('Sill',(x,y-.09,z-h/2-.04),(w+.15,.19,.06),white,parent)
for option in [0,1]:
    p=group('WWR_'+str(option),'WWR',option)
    for z in [.66,1.81]:
        for x in [-1.025,0,1.025]:
            if z<1 and x==0:continue
            w=.46 if option==0 else .82
            window(p,x,-1.39,z,w)
            if option==0:
                for sign in [-1,1]:box('Window infill',(x+sign*.34,-1.3,z),(.24,.14,.84),cream,p)
for z in [.66,1.81]:
    for x in [-1.025,0,1.025]:window(core,x,1.36,z)
    for x in [-1.71,1.71]:
        for y in [-.65,.65]:
            pane=box('Side glass',(x,y,z),(.04,.78,.79),glass,core)
            for yy in [y-.40,y+.40,y]:box('Side frame',(x+(.035 if x>0 else -.035),yy,z),(.07,.035,.83),edge,core)
            for zz in [z-.4,z+.4]:box('Side rail',(x,y,zz),(.09,.82,.035),edge,core)
box('Entrance glass',(0,-1.405,.56),(.78,.05,1.02),glass,core)
for x in [-.43,.43]:box('Entrance frame',(x,-1.44,.59),(.06,.1,1.14),edge,core)
box('Entrance canopy',(0,-1.54,1.19),(1.1,.54,.06),edge,core)
box('Door handle',(.28,-1.46,.56),(.025,.03,.2),white,core)
for option in [0,1]:
    p=group('WD_'+str(option),'WD',option);depth=.12 if option==0 else .34
    for z in [.66,1.81]:
        for x in [-1.025,0,1.025]:
            if z<1 and x==0:continue
            box('Upper surround',(x,-1.4-depth/2,z+.44),(.96,depth,.055),white,p)
            for xx in [x-.47,x+.47]:box('Side surround',(xx,-1.4-depth/2,z),(.055,depth,.89),white,p)
for factor in ['EW','R','Gnd']:
    for option in [0,1]:
        p=group(f'{factor}_{option}',factor,option);t=.07 if option else .17
        if factor=='EW':
            # Visible cutaway at the rear corner communicates insulation thickness.
            box('Wall insulation',(1.74,.92,1.25),(t,.6,2.40),foam,p)
            box('Wall exterior skin',(1.75+t/2,.92,1.25),(.03,.6,2.42),white,p)
        elif factor=='R':
            box('Roof insulation',(0,0,2.48+t/2),(3.33,2.68,t),foam,p)
            box('Roof finish',(0,0,2.50+t),(3.45,2.8,.07),roof,p)
            for x in [-1.7,1.7]:box('Roof coping',(x,0,2.57+t),(.08,2.82,.12),edge,p)
        else:
            box('Foundation insulation',(0,0,-.08-t/2),(3.38,2.73,t),foam,p)
            box('Foundation edge',(0,0,-.09-t),(3.48,2.83,.055),steel,p)
def fan(parent,x,y,z,r=.12):
    cylinder('Fan collar',(x,y,z),r,.05,edge,parent)
    rotor=group('FanRotor');rotor.parent=parent;rotor.location=(x,y,z+.04);rotor['spin']=True
    for a in [0,2.094,4.189]:
        o=box('Fan blade',(0,0,0),(r*1.4,r*.30,.02),white,rotor,.003);o.location=(math.cos(a)*r*.35,math.sin(a)*r*.35,0);o.rotation_euler.z=a
    cylinder('Fan hub',(x,y,z+.06),r*.22,.03,steel,parent)
for option in [0,1]:
    p=group('VR_'+str(option),'VR',option)
    box('Ventilation housing',(-.85,.4,2.96),(.75,.65,.46),steel,p)
    for x in [-1.03,-.68] if option==0 else [-.85]:fan(p,x,.4,3.20)
    for j in range(4):box('Vent grille',(-.85,.055,2.83+j*.07),(.60,.02,.02),edge,p)
for option in [0,.5,1]:
    p=group('HR_'+str(option),'HR',option)
    box('Recovery housing',(.6,.4,2.91),(.72,.66,.34),steel,p)
    for x,m in [(.39,blue),(.81,red)]:cylinder('Air duct',(x,.4,3.17),.085,.22,m,p)
    if option>0:
        for i in range(3 if option==.5 else 6):
            o=box('Heat exchange plate',(.34+i*.09,.055,2.92),(.04,.05,.24),foam,p,.002);o.rotation_euler.y=.22
    else:box('Bypass duct',(.6,.04,2.92),(.5,.04,.10),edge,p)
# Small schematic double-glazing cutaway, used for its card image and on the side wall.
for option in [0,1]:
    p=group('GLZ_'+str(option),'GLZ',option)
    for i in range(3 if option==0 else 2):box('Glass assembly',(1.75+i*.025,-.9,1.9),(.018,.26,.32),sky,p,.002)

def descendants(p):
    return [p]+[o for c in p.children for o in descendants(c)]
def set_config(config):
    for p in [o for o in s.objects if 'factor' in o]:
        visible=abs(p['option']-config[p['factor']])<.001
        for o in descendants(p):o.hide_render=not visible;o.hide_set(not visible)
    color=(.03,.35,.54) if config['GLZ']==0 else (.12,.55,.68)
    glass.diffuse_color=(*color,1);glass.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*color,1)
base={'WWR':1,'WD':0,'GLZ':0,'EW':0,'R':0,'Gnd':0,'VR':0,'HR':.5}
# Export every option. The viewer changes visibility using the same factor values as the rules.
for o in s.objects:o.hide_set(False);o.hide_render=False
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT/'building.glb'),export_format='GLB',export_extras=True,export_yup=True)
floor=box('Display plinth',(0,0,-.36),(4.5,3.8,.14),mat('Stone',(.65,.70,.64)))
s.world=bpy.data.worlds.new('Sky');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.82,1,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.6
ld=bpy.data.lights.new('Sun','SUN');ld.energy=2.5;ld.angle=.12;sun=bpy.data.objects.new('Sun',ld);s.collection.objects.link(sun);sun.rotation_euler=(.5,-.5,-.5)
ld=bpy.data.lights.new('Softbox','AREA');ld.energy=450;ld.shape='DISK';ld.size=5;light=bpy.data.objects.new('Softbox',ld);s.collection.objects.link(light);light.location=(1,-4,6);light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
cd=bpy.data.cameras.new('Camera');cam=bpy.data.objects.new('Camera',cd);s.collection.objects.link(cam);s.camera=cam;cam.location=(5,-8,5.6);cam.rotation_euler=(Vector((0,0,1.3))-cam.location).to_track_quat('-Z','Y').to_euler();cd.type='ORTHO';cd.ortho_scale=5.8
s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=True;s.render.film_transparent=True;s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA';s.view_settings.view_transform='AgX'
set_config(base)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'design-lab.blend'))
s.render.resolution_x=900;s.render.resolution_y=760;s.render.resolution_percentage=100;s.render.filepath=str(ROOT/'renders/design-lab.png');bpy.ops.render.render(write_still=True)
shutil.copy2(ROOT/'renders/design-lab.png',OUT/'hero.png')
s.render.resolution_x=300;s.render.resolution_y=260
card_options={'W+':('WWR',1),'W-':('WWR',0),'D+':('WD',1),'D-':('WD',0),'G+':('GLZ',0),'G-':('GLZ',1),'E+':('EW',0),'E-':('EW',1),'R+':('R',0),'R-':('R',1),'B+':('Gnd',0),'B-':('Gnd',1),'V+':('VR',0),'V-':('VR',1),'H+':('HR',1),'H-':('HR',0)}
for id,(factor,value) in card_options.items():
    cfg={**base,factor:value};set_config(cfg)
    focus={'WWR':((3,-8,3),(0,-1,1.35),3.8),'WD':((4,-8,3.2),(0,-1.2,1.45),3.5),
           'GLZ':((5,-7,3),(0,-.6,1.5),3.8),'EW':((7,-4,3),(1.5,.5,1.4),3.1),
           'R':((5,-7,8),(0,0,2.5),4.6),'Gnd':((5,-7,2),(0,0,.1),4.3),
           'VR':((3,-6,7),(-.85,.4,2.95),1.65),'HR':((3,-6,6),(.6,.4,2.98),1.65)}[factor]
    cam.location=focus[0];cam.rotation_euler=(Vector(focus[1])-cam.location).to_track_quat('-Z','Y').to_euler();cd.ortho_scale=focus[2]
    filename=id[0]+('-up' if id.endswith('+') else '-down')+'.png'
    s.render.filepath=str(OUT/'cards'/filename);bpy.ops.render.render(write_still=True)
(OUT/'manifest.json').write_text(json.dumps({'source':'Art/design-lab.blend','factors':['WWR','WD','GLZ','EW','R','Gnd','VR','HR'],'cards':card_options,'coordinateSystem':'glTF Y up; south facade +Z'},indent=2))
set_config(base)
print('DESIGN_LAB_COMPLETE',flush=True)
