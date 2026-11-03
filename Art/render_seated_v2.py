"""Native Blender reference for the same planted-foot pose used in the browser."""
import bpy, json, math, runpy, shutil
from pathlib import Path
from mathutils import Vector

root=Path(__file__).resolve().parent
layout=json.loads((root.parent/'src/pedestrian-layout.json').read_text(encoding='utf-8'))
rig=layout['person'];bench=layout['benches'];x=bench['x'][1]
hip_y=bench['seatHeight']+rig['pelvisHeight']
knee_y=rig['ankleHeight']+rig['shinLength']
forward=math.sqrt(rig['thighLength']**2-(hip_y-knee_y)**2)
hip=-math.atan2(forward,hip_y-knee_y)
scene=bpy.context.scene;scene.frame_set(1)
person=bpy.data.objects['Citizen'];person.location=(x,-bench['hipZ'],hip_y-rig['standingHipHeight'])
for side in ['L','R']:
    leg=bpy.data.objects['Leg_'+side];leg.animation_data_clear();leg.rotation_euler.x=hip
    bpy.data.objects['Knee_'+side].rotation_euler.x=-hip
    bpy.data.objects['Ankle_'+side].rotation_euler.x=0
    arm=bpy.data.objects['Arm_'+side];arm.animation_data_clear();arm.rotation_euler.x=-.75
camera=scene.camera;camera.location=(x+3,1.7,1.15)
camera.rotation_euler=(Vector((x,-bench['hipZ'],.32))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.ortho_scale=2.3
scene.cycles.samples=96
runpy.run_path(str(root/'build_modern_v2.py'))['device']()
bpy.ops.wm.save_as_mainfile(filepath=str(root/'modern-seated-v2.blend'))
scene.render.filepath=str(root/'renders/blender-reference-v2-seated.png')
bpy.ops.render.render(write_still=True)
shutil.copyfile(scene.render.filepath,root.parent/'public/assets/modern-v2/reference-seated.png')
print('SEATED_NATIVE_REFERENCE_COMPLETE',flush=True)
