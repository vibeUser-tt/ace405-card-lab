"""Editable Blender component library for every ACE405 design card.

Run: blender --background --python Art/build_components_v2.py
The component origins are the building origin. Blender +Z is up and -Y is front.
No live Blender session is used. Every visible surface is opaque and matte.
"""
import bpy
import json
import math
import random
import struct
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / 'public/assets/modern-v2'
SOURCE = ROOT / 'components-v2.blend'
RNG = random.Random(40524)
ROOTS = {}
META = {}


def linear(hex_color):
    values = [int(hex_color[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values)


def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*linear(color), 1)
    mat.use_nodes = True
    bs = mat.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = mat.diffuse_color
    bs.inputs['Roughness'].default_value = 1
    bs.inputs['Specular IOR Level'].default_value = 0
    return mat


def empty(name, parent=None, loc=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    obj.location = loc
    return obj


def box(name, loc, dims, mat, parent, bevel=.008):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Soft matte edges', 'BEVEL')
        mod.width = min(bevel, min(dims) * .24)
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod = obj.modifiers.new('Architectural normals', 'WEIGHTED_NORMAL')
        mod.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.parent = parent
    obj.location = loc
    return obj


def sphere(name, loc, scale, mat, parent):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    obj.parent = parent
    obj.location = loc
    return obj


def cylinder(name, loc, radius, depth, mat, parent, rotation=(0, 0, 0), vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    obj.parent = parent
    obj.location = loc
    obj.rotation_euler = rotation
    return obj


def beam(name, a, b, width, depth, mat, parent):
    midpoint = (Vector(a) + Vector(b)) / 2
    delta = Vector(b) - Vector(a)
    obj = box(name, midpoint, (width, depth, delta.length), mat, parent)
    obj.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
    return obj


def palette_merge(parent, name):
    objects = [obj for obj in parent.children if obj.type == 'MESH']
    if not objects:
        return None
    # Preserve colors when a later asset pass appends geometry to an existing card.
    for part in objects:
        colors = part.data.color_attributes.get('Palette')
        if colors is None:
            colors = part.data.color_attributes.new(name='Palette', type='FLOAT_COLOR', domain='CORNER')
            for polygon in part.data.polygons:
                color = part.data.materials[polygon.material_index].diffuse_color
                for index in polygon.loop_indices:
                    colors.data[index].color = color
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    colors = obj.data.color_attributes['Palette']
    obj.data.color_attributes.active_color = colors
    obj.data.materials.clear()
    obj.data.materials.append(M['vertex'])
    for polygon in obj.data.polygons:
        polygon.material_index = 0
    return obj


def card(cid, semantics, **kwargs):
    root = empty('Card_' + cid)
    root['card_id'] = cid
    root['asset_role'] = 'design_card_component'
    root['semantics'] = semantics
    ROOTS[cid] = root
    META[cid] = dict(node=root.name, semantics=semantics, animatedNodes=[], **kwargs)
    return root


def joint(cid, name, loc, axis, kind, limits=None):
    obj = empty(name, ROOTS[cid], loc)
    obj['animation_axis'] = axis
    obj['animation_kind'] = kind
    data = dict(node=name, axis=axis, kind=kind)
    if limits:
        data['rangeRadians'] = limits
    META[cid]['animatedNodes'].append(data)
    return obj


WINDOWS = [(x, z) for z in (.66, 1.81) for x in (-1.025, 0, 1.025) if not (z == .66 and x == 0)]


def front_window(parent, x, z, w, h, mode='standard', y=-1.485):
    box('Window recessed surround', (x, y + .025, z), (w + .08, .08, h + .08), M['recess'], parent)
    box('Opaque blue grey glazing', (x, y - .025, z), (w - .055, .035, h - .055), M['glass'], parent)
    box('Painted sky glazing band', (x, y - .045, z + h * .29), (w - .07, .006, h * .23), M['glasslight'], parent, 0)
    for xx in (-w / 2, w / 2):
        box('Thermally separated window jamb', (x + xx, y - .04, z), (.035, .10, h + .045), M['metal'], parent)
    for zz in (-h / 2, h / 2):
        box('Window head and sill', (x, y - .04, z + zz), (w + .035, .10, .035), M['metal'], parent)
    box('Projecting stone sill', (x, y - .08, z - h / 2 - .045), (w + .10, .16, .045), M['stone'], parent)
    if mode in ('standard', 'triple'):
        box('Slender centre mullion', (x, y - .064, z), (.021, .07, h), M['metal'], parent)
    if mode == 'triple':
        # Stepped edge strips reveal three physically separated glazing layers.
        for layer in range(3):
            yy = y - .08 - layer * .022
            ww = w - .025 - layer * .025
            for sign in (-1, 1):
                box('Triple glazing visible edge %d' % layer, (x + sign * ww / 2, yy, z), (.013, .014, h - .055), M['glassedge'], parent, .002)
            box('Triple glazing lower spacer %d' % layer, (x, yy, z - h / 2 + .035 + layer * .015), (ww, .014, .012), M['glassedge'], parent, .002)
    if mode == 'selective':
        # Ceramic frit dots are actual geometry so this remains legible in a matte material.
        for row in range(3):
            for column in range(8):
                xx = x - w * .37 + column * w * .105
                zz = z + h * .29 - row * .035
                box('Selective coating frit', (xx, y - .052, zz), (.014, .006, .014), M['frit'], parent, 0)
        box('Selective layer edge', (x + w / 2 - .035, y - .061, z), (.012, .016, h - .07), M['brass'], parent, .002)


def make_windows():
    root = card('W1', 'Moderately enlarged front glazing with real frame and sill geometry.')
    for x, z in WINDOWS:
        front_window(root, x, z, .90, .84)
    root = card('W2', 'Larger uninterrupted front glazing; wider and taller openings with slimmer frames.')
    for x, z in WINDOWS:
        front_window(root, x, z, .98, .96, 'large')
    root = card('W3', 'Low U-value triple glazing: three stepped glass edges and spacer bars.')
    for x, z in WINDOWS:
        front_window(root, x, z, .85, .81, 'triple')
    root = card('W4', 'Selective transmission glazing with a visible selective coating/frit pattern; fully opaque render.')
    for x, z in WINDOWS:
        front_window(root, x, z, .85, .81, 'selective')


def make_insulation():
    for cid, depth, mat in [('I1', .09, M['ivory']), ('I2', .20, M['warm']), ('I3', .145, M['woodlight'])]:
        root = card(cid, {'I1': 'Continuous conventional exterior insulation on the left facade with exposed layered end section.', 'I2': 'Deeper exterior insulation and stepped insulated window returns on the left facade.', 'I3': 'Bio-based fibre insulation with timber fixing battens and a visible layered section.'}[cid], sideFacade='left')
        x = -1.70 - depth / 2
        for z, height in ((.13, .24), (1.23, .28), (2.36, .25)):
            box('Continuous insulated floor band', (x, 0, z), (depth, 2.57, height), mat, root)
        for y, width in ((-1.19, .18), (0, .48), (1.19, .18)):
            box('Insulated facade pier', (x, y, 1.25), (depth, width, 2.46), mat, root)
        for y in (-.68, .68):
            for z in (.66, 1.81):
                for yy in (y - .435, y + .435):
                    box('Insulated window return', (x - .01, yy, z), (depth + .02, .045, .83), M['stone'], root)
                box('Insulated sill return', (x - .02, y, z - .44), (depth + .04, .89, .04), M['stone'], root)
        # Legible cut end at the rear left corner, clear of the pedestrian route.
        for layer in range(3):
            box('Exposed insulation construction layer', (-1.72 - layer * depth / 3, 1.315, 1.25), (depth / 3 - .003, .028, 2.42), [M['stone'], mat, M['ivory']][layer], root, .002)
        if cid == 'I2':
            for y in (-1.16, -.08, .08, 1.16):
                box('Deep insulation stepped joint', (-1.912, y, 1.25), (.02, .018, 2.40), M['seam'], root, .002)
        if cid == 'I3':
            for y in (-1.17, -.13, .13, 1.17):
                box('Timber insulation fixing batten', (-1.86, y, 1.25), (.025, .035, 2.4), M['wood'], root)
            for z in (.26, .60, .94, 1.40, 1.78, 2.13):
                box('Fibre layer exposed strand', (-1.80, 1.336, z), (.10, .01, .018), M['fibre'], root, 0)
    root = card('I4', 'Thermal bridge treatment: continuous floor edge break, insulated corner and separated reveal nodes.')
    for side in (-1, 1):
        for z in (.18, 1.25, 2.42):
            box('Continuous thermal break floor edge', (side * 1.714, 0, z), (.032, 2.57, .065), M['fibre'], root, .004)
        for y in (-1.30, 1.30):
            box('Continuous corner insulation', (side * 1.707, y, 1.25), (.055, .055, 2.45), M['ivory'], root)
    for x, z in WINDOWS:
        for sign in (-1, 1):
            box('Thermally broken reveal pad', (x + sign * .46, -1.455, z), (.027, .035, .84), M['fibre'], root, .003)


def make_shading():
    root = card('S1', 'Fixed projecting exterior sun hoods above each front window.')
    for x, z in WINDOWS:
        top = z + .51
        box('Fixed external sun hood', (x, -1.65, top), (.96, .43, .055), M['ivory'], root)
        for side in (-1, 1):
            beam('Sun hood bracket', (x + side * .36, -1.45, top - .16), (x + side * .36, -1.77, top - .025), .027, .026, M['metal'], root)
    root = card('S2', 'Adjustable exterior horizontal louver arrays; each blade rotates around its local X hinge.')
    for number, (x, z) in enumerate(WINDOWS):
        for sign in (-1, 1):
            box('Louver supporting side rail', (x + sign * .46, -1.57, z + .06), (.027, .035, .90), M['metal'], root)
        for row in range(3):
            pivot = joint('S2', 'Louver_%02d_%d' % (number, row), (x, -1.59, z + .32 - row * .26), 'x', 'tilt', [-.70, .65])
            box('Adjustable sun blade', (0, 0, 0), (.94, .26, .027), M['ivory'], pivot)
            box('Blade leading edge', (0, -.13, 0), (.94, .015, .033), M['stone'], pivot, .003)
            palette_merge(pivot, pivot.name + '_Mesh')
    root = card('S3', 'Interior roller blinds visible in the window recess, with a roll, fabric and lower rail.')
    for x, z in WINDOWS:
        cylinder('Interior blind roll', (x, -1.50, z + .36), .037, .78, M['linen'], root, (0, math.pi / 2, 0))
        box('Interior blind fabric', (x, -1.491, z + .135), (.75, .016, .41), M['linen'], root, .002)
        box('Interior blind lower rail', (x, -1.51, z - .075), (.77, .027, .024), M['wood'], root, .003)
        for xx in (-.33, .33):
            box('Blind guide cord', (x + xx, -1.515, z + .13), (.004, .006, .41), M['stone'], root, 0)
    root = card('S4', 'Seasonal deciduous shading trellis with sparse leaf clusters; geometry is above the entrance and walking clearance.')
    # Only upper-storey trellises: no vegetation overlaps the door or people.
    for x in (-1.025, 0, 1.025):
        for yy in (-1.48, -1.86):
            box('Seasonal trellis crossbar', (x, yy, 2.35), (.96, .026, .036), M['wood'], root)
        for xx in (-.38, -.19, 0, .19, .38):
            box('Seasonal trellis rafter', (x + xx, -1.67, 2.36), (.025, .43, .025), M['woodlight'], root)
            for yy in (-1.54, -1.75):
                sphere('Deciduous seasonal leaf cluster', (x + xx + RNG.uniform(-.025, .025), yy, 2.40), (.10, .12, .065), M['leaf'] if xx < 0 else M['leaflight'], root)


def flat_roof(parent, back, courtyard=False):
    front = -1.34
    center = (front + back) / 2
    depth = back - front
    if courtyard:
        for yy, dd in ((-.92, .84), (1.07, .54)):
            box('Courtyard roof front back slab', (0, yy, 2.50), (3.33, dd, .12), M['roof'], parent)
        for xx in (-1.1575, 1.1575):
            box('Courtyard roof side slab', (xx, .15, 2.50), (1.015, 1.3, .12), M['roof'], parent)
        for xx in (-.65, .65):
            box('Courtyard roof opening reveal', (xx, .15, 2.55), (.05, 1.34, .12), M['stone'], parent)
        for yy in (-.5, .8):
            box('Courtyard roof opening reveal', (0, yy, 2.55), (1.3, .05, .12), M['stone'], parent)
    else:
        box('Roof deck', (0, center, 2.50), (3.33, depth, .12), M['roof'], parent)
    for xx in (-1.68, 1.68):
        box('Parapet', (xx, center, 2.61), (.10, depth + .08, .18), M['ivory'], parent)
        box('Zinc coping', (xx, center, 2.715), (.14, depth + .15, .035), M['metal'], parent)
    for yy in (front - .02, back + .02):
        box('Parapet', (0, yy, 2.61), (3.38, .10, .18), M['ivory'], parent)
        box('Zinc coping', (0, yy, 2.715), (3.48, .14, .035), M['metal'], parent)


def template_window(parent, x, y, z, angle=0, width=.82):
    group = empty('Template window', parent, (x, y, z))
    group.rotation_euler.z = angle
    front_window(group, 0, 0, width, .79, y=-.08)
    # Flatten each window to one colored mesh; flatten into template later.
    return group


def consolidate_descendant_meshes(root, target, exclude=None):
    # Reparent preserving transforms, then merge; used only for template windows.
    bpy.context.view_layer.update()
    meshes = [obj for obj in root.children_recursive if obj.type == 'MESH' and (not exclude or exclude not in obj.name)]
    for obj in meshes:
        matrix = obj.matrix_world.copy()
        obj.parent = target
        obj.matrix_world = matrix


def make_template(name, shallow=False, courtyard=False):
    root = empty(name)
    root['asset_role'] = 'architecture_template'
    root['door_interface'] = 'front x=0 y=-1.30 z=0..1.15; door supplied by base scene'
    architecture = empty(name + '_Architecture', root)
    back = .30 if shallow else 1.30
    depth = back + 1.30
    center = (back - 1.30) / 2
    if courtyard:
        # The opening continues through both floor slabs into a paved courtyard.
        for floor in (.04, 1.25):
            for yy, dd in ((-.90, .80), (1.05, .50)):
                box('Courtyard floor wing', (0, yy, floor), (3.25, dd, .12), M['recess'], architecture)
            for xx in (-1.1375, 1.1375):
                box('Courtyard floor side wing', (xx, .15, floor), (.975, 1.30, .12), M['recess'], architecture)
        box('Open sky courtyard paving', (0, .15, .075), (1.30, 1.30, .06), M['stone'], architecture)
        for xx in (-.65, .65):
            box('Courtyard inner wall parapet', (xx, .15, 1.02), (.08, 1.30, .30), M['ivory'], architecture)
            for yy in (-.48, .15, .78):
                box('Courtyard inner window post', (xx, yy, 1.30), (.06, .045, 2.38), M['wood'], architecture)
            for z in (.60, 1.80):
                box('Courtyard inner glazing', (xx, .15, z), (.025, 1.20, .85), M['glasslight'], architecture)
        for yy in (-.50, .80):
            box('Courtyard inner wall base', (0, yy, 1.28), (1.30, .055, .14), M['ivory'], architecture)
            for xx in (-.62, 0, .62):
                box('Courtyard inner front back post', (xx, yy, 1.30), (.045, .06, 2.38), M['wood'], architecture)
            for z in (.60, 1.80):
                box('Courtyard inner front back glazing', (0, yy, z), (1.20, .025, .85), M['glasslight'], architecture)
        box('Courtyard planting bed', (.34, .42, .16), (.36, .43, .15), M['ivory'], architecture)
        box('Courtyard planting soil', (.34, .42, .24), (.31, .38, .016), M['soil'], architecture)
        sphere('Courtyard low planting', (.34, .42, .31), (.18, .19, .13), M['leaf'], architecture)
    else:
        for floor in (.04, 1.25):
            box('Floor slab', (0, center, floor), (3.25, depth, .12), M['recess'], architecture)
    for yy, facing in ((-1.30, 0), (back, math.pi)):
        for z, height in ((.12, .24), (1.23, .30), (2.36, .28)):
            if yy < 0 and z == .12:
                for xx in (-1.04, 1.04):
                    box('Entry level facade band', (xx, yy, z), (1.17, .14, height), M['ivory'], architecture)
            else:
                box('Facade horizontal band', (0, yy, z), (3.25, .14, height), M['ivory'], architecture)
        for xx in (-1.53, -.52, .52, 1.53):
            box('Facade pier', (xx, yy, 1.25), (.19, .14, 2.5), M['ivory'], architecture)
        for z in (.66, 1.81):
            for xx in (-1.025, 0, 1.025):
                if yy == -1.30 and z == .66 and xx == 0:
                    continue
                template_window(architecture, xx, yy, z, facing)
    for sign in (-1, 1):
        xx = sign * 1.625
        for z, height in ((.12, .24), (1.23, .30), (2.36, .28)):
            box('Side facade band', (xx, center, z), (.14, depth, height), M['ivory'], architecture)
        if shallow:
            for yy in (-1.19, .19):
                box('Shallow side facade pier', (xx, yy, 1.25), (.14, .22, 2.5), M['ivory'], architecture)
            for z in (.66, 1.81):
                template_window(architecture, xx, center, z, sign * math.pi / 2, 1.08)
        else:
            for yy, thick in ((-1.19, .22), (0, .50), (1.19, .22)):
                box('Side facade pier', (xx, yy, 1.25), (.14, thick, 2.5), M['ivory'], architecture)
            for yy in (-.68, .68):
                for z in (.66, 1.81):
                    template_window(architecture, xx, yy, z, sign * math.pi / 2)
    # Front entrance trim has the exact same aperture as the baseline building.
    for xx in (-.46, .46):
        box('Entrance jamb', (xx, -1.40, .59), (.055, .07, 1.18), M['metal'], architecture)
    box('Entrance head', (0, -1.40, 1.19), (.97, .07, .055), M['metal'], architecture)
    consolidate_descendant_meshes(architecture, architecture)
    palette_merge(architecture, name + '_Walls')
    for obj in list(architecture.children):
        if obj.type == 'EMPTY':
            bpy.data.objects.remove(obj, do_unlink=True)
    roof = empty(name + '_Roof', root)
    flat_roof(roof, back + .04, courtyard)
    palette_merge(roof, name + '_RoofMesh')
    return root


def make_plan():
    root = card('P1', 'Actual shallow-depth building template: original front interface, rear wall moved to y=0.30.', layout='Layout_P1')
    # Thin front lintel identifies the chosen compact-plan design without blocking glazing.
    box('Shallow plan entrance lintel', (0, -1.48, 1.30), (.96, .055, .045), M['wood'], root)
    root = card('P2', 'Actual open-sky courtyard building template with an open roof, ring floor slabs, inner walls and a visible courtyard base.', layout='Layout_P2')
    box('Courtyard entry lintel', (0, -1.48, 1.30), (.96, .055, .045), M['stone'], root)
    make_template('Layout_P1', shallow=True)
    make_template('Layout_P2', courtyard=True)
    root = card('P3', 'Roof cutaway exposing light reflective upper-floor interior surfaces and light shelves.', hideRoof=True)
    box('High reflectance interior floor', (0, 0, 1.34), (2.96, 2.31, .04), M['bright'], root)
    for xx in (-1.46, 1.46):
        box('High reflectance side interior lining', (xx, 0, 1.91), (.035, 2.22, 1.08), M['bright'], root)
    box('High reflectance rear interior lining', (0, 1.125, 1.91), (2.89, .035, 1.08), M['linen'], root)
    for xx in (-1.025, 0, 1.025):
        box('Interior daylight shelf', (xx, -.985, 2.01), (.79, .34, .025), M['bright'], root)
    box('Light reflective centre partition', (.52, .42, 1.88), (.055, 1.24, 1.0), M['bright'], root)
    root = card('P4', 'Roof cutaway exposing a genuine upper-floor rearrangement: separated quiet rooms and a shared circulation area.', hideRoof=True)
    box('Open work zone flooring', (-.68, -.08, 1.34), (1.40, 2.10, .04), M['woodlight'], root)
    box('Shared circulation strip', (.22, 0, 1.345), (.38, 2.14, .045), M['stone'], root)
    box('Quiet room flooring', (.89, .08, 1.34), (.91, 2.12, .04), M['linen'], root)
    # Openings in the partition retain an actual path between rooms.
    for yy, dd in ((-.90, .35), (.16, .82), (1.02, .12)):
        box('Relocated interior partition', (.44, yy, 1.83), (.055, dd, .98), M['ivory'], root)
    box('Quiet room divider', (.93, .10, 1.83), (.96, .055, .98), M['ivory'], root)
    for xx, yy in ((-.82, -.62), (-.82, .52), (.94, -.54), (.94, .65)):
        box('Space planning worktable', (xx, yy, 1.72), (.55, .30, .035), M['wood'], root)
        for dx in (-.21, .21):
            box('Worktable legs', (xx + dx, yy, 1.53), (.025, .24, .36), M['metal'], root)
        box('Space planning seat', (xx, yy + .26, 1.54), (.23, .23, .26), M['blue'], root, .018)


def make_materials_cards():
    root = card('M1', 'Reused structural components: bolted splice plates, visible old module joints and repair inserts.')
    for xx in (-1.57, 1.57):
        box('Reused front edge member', (xx, -1.47, 1.26), (.10, .075, 2.40), M['wood'], root)
        for zz in (.42, 1.22, 2.08):
            box('Reused component splice plate', (xx, -1.523, zz), (.14, .026, .16), M['metal'], root, .003)
            for dx in (-.043, .043):
                for dz in (-.05, .05):
                    cylinder('Reversible bolt', (xx + dx, -1.544, zz + dz), .011, .012, M['brass'], root, (math.pi / 2, 0, 0), 8)
    for zz in (1.25, 2.41):
        box('Reused frontage beam', (0, -1.467, zz), (3.12, .070, .09), M['woodlight'], root)
        for xx in (-.9, .13, 1.08):
            box('Reclaimed beam repair insert', (xx, -1.509, zz), (.10, .015, .072), M['wood'], root, .002)
    root = card('M2', 'Low-carbon mineral material substitution: large pale mineral modules with staggered joints.')
    for zz in (.12, 1.24, 2.38):
        for idx in range(8):
            xx = -1.48 + idx * .423
            if zz == .12 and abs(xx) < .50:
                continue
            box('Low carbon mineral facade module', (xx, -1.445, zz), (.409, .055, .19), M['mineral'] if idx % 3 else M['ivory'], root)
    for xx in (-1.54, 1.54):
        for idx in range(7):
            box('Low carbon mineral corner block', (xx, -1.451, .30 + idx * .31), (.16, .06, .295), M['mineral'], root)
    root = card('M3', 'Lightweight timber post-and-beam structure with visible timber columns, floor beams and knee braces.')
    for xx in (-1.55, 1.55):
        box('Timber front structural post', (xx, -1.49, 1.25), (.13, .11, 2.47), M['wood'], root)
    for side in (-1, 1):
        for yy in (-1.19, 0, 1.19):
            box('Timber side structural post', (side * 1.738, yy, 1.25), (.11, .13, 2.47), M['wood'], root)
        for zz in (1.25, 2.43):
            box('Timber side floor beam', (side * 1.738, 0, zz), (.12, 2.55, .13), M['woodlight'], root)
        for yy in (-1.19, 1.19):
            direction = 1 if yy < 0 else -1
            beam('Timber knee brace', (side * 1.74, yy, 2.10), (side * 1.74, yy + direction * .30, 2.39), .065, .065, M['woodlight'], root)
    for zz in (1.25, 2.43):
        box('Timber front floor beam', (0, -1.49, zz), (3.21, .12, .13), M['woodlight'], root)
    root = card('M4', 'Material-efficient reduced-section frame: open I-section members and diagonal stiffness brackets.')
    for side in (-1, 1):
        xx = side * 1.735
        for yy in (-1.17, 1.17):
            box('Optimized section column web', (xx, yy, 1.25), (.025, .075, 2.45), M['metal'], root, .003)
            for offset in (-.038, .038):
                box('Optimized section column flange', (xx, yy + offset, 1.25), (.11, .018, 2.45), M['blue'], root, .003)
            beam('Reduced material brace', (xx, yy, 2.05), (xx, yy + (-.37 if yy > 0 else .37), 2.42), .025, .035, M['metal'], root)
        for zz in (1.25, 2.43):
            box('Open floor member web', (xx, 0, zz), (.025, 2.49, .08), M['metal'], root, .003)
            for dz in (-.044, .044):
                box('Open floor member flange', (xx, 0, zz + dz), (.12, 2.49, .018), M['blue'], root, .003)


def make_technology():
    root = card('T1', 'Roof heat recovery unit with separate supply/exhaust ducts and rotating visible fans.', anchor='roof', roofAnchorBlender=[0, 0, 2.56])
    box('Heat recovery service base', (.45, .48, 2.605), (1.18, .72, .08), M['stone'], root)
    box('Heat recovery enclosure', (.45, .48, 2.79), (.98, .56, .29), M['ivory'], root)
    box('Exchanger access panel', (.45, .181, 2.79), (.53, .028, .22), M['blue'], root)
    for x in (.27, .36, .45, .54, .63):
        box('Heat exchanger core fins', (x, .162, 2.79), (.027, .018, .18), M['metal'], root, .002)
    for x in (.14, .76):
        cylinder('Fan housing rim', (x, .48, 2.959), .18, .028, M['metal'], root)
        cylinder('Fan housing recess', (x, .48, 2.977), .15, .014, M['recess'], root)
        pivot = joint('T1', 'Fan_' + ('Supply' if x < .5 else 'Exhaust'), (x, .48, 2.99), 'z', 'spin')
        for angle in (0, 2 * math.pi / 3, 4 * math.pi / 3):
            obj = box('Heat recovery fan blade', (.067 * math.cos(angle), .067 * math.sin(angle), 0), (.16, .052, .012), M['stone'], pivot, .006)
            obj.rotation_euler.z = angle + .22
        cylinder('Fan hub', (0, 0, .009), .03, .024, M['brass'], pivot)
        palette_merge(pivot, pivot.name + '_Mesh')
    for yy in (.31, .66):
        box('Independent supply exhaust duct', (-.29, yy, 2.70), (.47, .16, .18), M['blue'], root)
        box('Duct insulated downstand', (-.56, yy, 2.635), (.14, .17, .16), M['metal'], root)
    root = card('T2', 'Night ventilation: operable roof ventilator flaps with visible shafts and pivoted panels.', anchor='roof', roofAnchorBlender=[0, 0, 2.56])
    for idx, xx in enumerate((-.65, .65)):
        box('Night ventilation curb', (xx, .40, 2.64), (.62, .55, .16), M['ivory'], root)
        box('Night ventilation dark shaft', (xx, .40, 2.729), (.49, .42, .02), M['recess'], root)
        pivot = joint('T2', 'Vent_Roof_%d' % idx, (xx, .645, 2.75), 'x', 'open', [0, .78])
        box('Operable ventilation flap', (0, -.245, 0), (.65, .52, .035), M['blue'], pivot)
        box('Ventilation flap insulated underside', (0, -.245, -.026), (.57, .44, .025), M['linen'], pivot)
        palette_merge(pivot, pivot.name + '_Mesh')
        for yy in (.29, .40, .51):
            box('Vent shaft bird guard', (xx, yy, 2.742), (.47, .015, .015), M['metal'], root, .002)
    root = card('T3', 'Demand-responsive control: entry control panel, occupancy/daylight sensors and small rooftop control cabinet.')
    box('Demand control entry controller', (.59, -1.49, .92), (.12, .075, .19), M['metal'], root)
    box('Demand control display', (.59, -1.532, .95), (.082, .009, .07), M['glasslight'], root, .003)
    for xx in (.565, .615):
        box('Controller button', (xx, -1.54, .877), (.019, .007, .015), M['linen'], root, .002)
    for xx in (-1.025, 1.025):
        sphere('Occupancy daylight sensor', (xx, -1.47, 2.29), (.037, .037, .029), M['ivory'], root)
        box('Sensor lens', (xx, -1.504, 2.29), (.029, .008, .017), M['glass'], root, .003)
    box('Demand controlled equipment cabinet', (-1.13, .67, 2.73), (.33, .34, .33), M['ivory'], root)
    box('Control cabinet access panel', (-1.13, .488, 2.73), (.25, .024, .25), M['blue'], root)
    for zz in (2.66, 2.70, 2.74):
        box('Control cabinet air slot', (-1.13, .471, zz), (.16, .009, .012), M['metal'], root, .002)
    root = card('T4', 'Daylight-linked lighting represented by dimmable window-head LED strips and daylight sensors; no real-time point lights.')
    luminous = empty('Daylight_LightStrips', root)
    luminous['animation_kind'] = 'brightness'
    META['T4']['animatedNodes'].append(dict(node=luminous.name, kind='brightness', emissiveAllowed=True, maxEmissiveIntensity=.24))
    for x, z in WINDOWS:
        box('LED window-head housing', (x, -1.49, z + .37), (.72, .055, .032), M['metal'], root, .004)
        box('Daylight linked light strip', (x, -1.522, z + .367), (.67, .012, .017), M['led'], luminous, .003)
        sphere('Daylight control photocell', (x + .36, -1.49, z + .38), (.025, .024, .023), M['linen'], root)
    palette_merge(luminous, 'Daylight_LightStripMesh')


def prepare_mounts():
    """Keep facade and roof adapters independent for the shallow building."""
    selectors = {
        'I4': ('SideMount', lambda obj: 'Thermally broken reveal' not in obj.name, 'side'),
        'M3': ('SideMount', lambda obj: 'Timber side' in obj.name or 'Timber knee' in obj.name, 'side'),
        'T3': ('RoofMount', lambda obj: 'cabinet' in obj.name.lower(), 'roof'),
    }
    for cid, (suffix, predicate, mount_type) in selectors.items():
        root = ROOTS[cid]
        mount = empty('Card_' + cid + '_' + suffix, root)
        mount['layout_mount'] = mount_type
        for obj in list(root.children):
            if obj.type == 'MESH' and predicate(obj):
                obj.parent = mount  # All roots and mounts share the same origin.
        palette_merge(mount, mount.name + '_Mesh')
        META[cid]['layoutMounts'] = [dict(node=mount.name, kind=mount_type)]
    for cid in ('I1', 'I2', 'I3', 'M4'):
        ROOTS[cid]['layout_mount'] = 'side'
        META[cid]['layoutMounts'] = [dict(node=ROOTS[cid].name, kind='side')]
    for cid in ('T1', 'T2'):
        ROOTS[cid]['layout_mount'] = 'roof'
        META[cid]['layoutMounts'] = [dict(node=ROOTS[cid].name, kind='roof')]


def add_service_platforms():
    for cid in ('P3', 'P4'):
        root = bpy.data.objects['Card_' + cid]
        if root.get('service_platform'):
            continue
        box('Rear roof services platform', (0, 1.15, 2.52), (3.1, .46, .06), bpy.data.materials['stone'], root)
        root['service_platform'] = True


def descendants(root):
    return [root, *root.children_recursive]


def bounds(root):
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ Vector(corner) for obj in root.children_recursive if obj.type == 'MESH' for corner in obj.bound_box]
    return dict(min=[round(min(p[i] for p in points), 4) for i in range(3)], max=[round(max(p[i] for p in points), 4) for i in range(3)])


def bake_layouts():
    """Bake each replacement building in isolation, then restore its removable roof."""
    global M
    M = {'vertex': bpy.data.materials['ComponentVertexPalette']}
    add_service_platforms()
    for cid in ('P3', 'P4'):
        palette_merge(bpy.data.objects['Card_' + cid], 'Card_' + cid + '_Mesh')
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 4
    try:
        preferences = bpy.context.preferences.addons['cycles'].preferences
        preferences.compute_device_type = 'OPTIX'
        preferences.get_devices()
        for device in preferences.devices:
            device.use = device.type == 'OPTIX'
        scene.cycles.device = 'GPU'
    except Exception as error:
        print('LAYOUT_BAKE_CPU_FALLBACK', str(error), flush=True)
    scene.world = bpy.data.worlds.new('Uniform soft sky')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.75, .83, 1, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .55
    scene.render.bake.margin = 8
    scene.render.bake.margin_type = 'EXTEND'
    scene.render.bake.use_clear = True
    scene.render.bake.use_selected_to_active = False
    manifest = json.loads((OUT / 'components-manifest.json').read_text(encoding='utf-8'))
    for cid in ('P3', 'P4'):
        manifest['cards'][cid]['boundsBlender'] = bounds(bpy.data.objects['Card_' + cid])
        manifest['cards'][cid]['rearServicePlatform'] = dict(centerBlender=[0, 1.15, 2.52], dimensions=[3.1, .46, .06])
    visibility = {obj.name: obj.hide_render for obj in scene.objects}
    for name in ('Layout_P1', 'Layout_P2'):
        root = bpy.data.objects[name]
        architecture = bpy.data.objects[name + '_Architecture']
        roof = bpy.data.objects[name + '_Roof']
        meshes = [obj for obj in root.children_recursive if obj.type == 'MESH']
        assert len(meshes) == 2
        for obj in scene.objects:
            if obj.type in ('MESH', 'LIGHT'):
                obj.hide_render = obj not in meshes
        for obj in meshes:
            group = obj.vertex_groups.new(name='Roof' if obj.parent == roof else 'Architecture')
            group.add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
        bpy.ops.object.select_all(action='DESELECT')
        for obj in meshes:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = next(obj for obj in meshes if obj.parent == architecture)
        bpy.ops.object.join()
        combined = bpy.context.object
        combined.name = name + '_BakeAssembly'
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=.003)
        bpy.ops.object.mode_set(mode='OBJECT')
        combined.data.uv_layers.active.name = 'AtlasUV'
        second = combined.data.uv_layers.new(name='LightmapUV')
        for original, duplicate in zip(combined.data.uv_layers[0].data, second.data):
            duplicate.uv = original.uv
        combined.data.uv_layers.active_index = 0
        baked_images = {}
        palette = combined.data.materials[0]
        for kind, color_space in (('albedo', 'sRGB'), ('ambient', 'Non-Color')):
            image = bpy.data.images.new(name + '_' + kind, width=2048, height=2048, alpha=False)
            image.colorspace_settings.name = color_space
            node = palette.node_tree.nodes.new('ShaderNodeTexImage')
            node.name = 'TEMP_LAYOUT_BAKE'
            node.image = image
            palette.node_tree.nodes.active = node
            scene.render.bake.use_pass_color = kind == 'albedo'
            scene.render.bake.use_pass_direct = kind == 'ambient'
            scene.render.bake.use_pass_indirect = kind == 'ambient'
            print('LAYOUT_BAKING', name, kind, flush=True)
            bpy.ops.object.bake(type='DIFFUSE')
            if kind == 'ambient':
                image.filepath_raw = str(OUT / ('ambient-' + name.lower().replace('_', '-') + '.png'))
                image.file_format = 'PNG'
                image.save()
            else:
                image.pack()
            palette.node_tree.nodes.remove(node)
            baked_images[kind] = image
        mat = bpy.data.materials.new('Baked' + name)
        mat.use_nodes = True
        bs = mat.node_tree.nodes.get('Principled BSDF')
        bs.inputs['Roughness'].default_value = 1
        bs.inputs['Specular IOR Level'].default_value = 0
        texture = mat.node_tree.nodes.new('ShaderNodeTexImage')
        texture.name = 'Baked albedo'
        texture.image = baked_images['albedo']
        mat.node_tree.links.new(texture.outputs['Color'], bs.inputs['Base Color'])
        combined.data.materials.clear()
        combined.data.materials.append(mat)
        for polygon in combined.data.polygons:
            polygon.material_index = 0
        # Albedo already contains the original vertex palette. Do not tint it twice.
        for attribute in list(combined.data.color_attributes):
            combined.data.color_attributes.remove(attribute)
        combined.vertex_groups.active_index = combined.vertex_groups['Roof'].index
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='DESELECT')
        bpy.ops.object.vertex_group_select()
        bpy.ops.mesh.separate(type='SELECTED')
        bpy.ops.object.mode_set(mode='OBJECT')
        roof_mesh = next(obj for obj in bpy.context.selected_objects if obj != combined and obj.type == 'MESH')
        transform = roof_mesh.matrix_world.copy()
        roof_mesh.parent = roof
        roof_mesh.matrix_world = transform
        roof_mesh.name = name + '_RoofMesh'
        combined.name = name + '_Walls'
        combined.parent = architecture
        manifest['layouts'][name]['bake'] = dict(material=mat.name, albedo='embedded:' + baked_images['albedo'].name, ambient=Path(baked_images['ambient'].filepath_raw).name, resolution=2048, uv='AtlasUV / copied LightmapUV', ambientEncoding='Linear RGB in PNG; no view transform', ambientIntensity=math.pi, source='Isolated template, uniform world (.75,.83,1) strength .55, no sun, diffuse direct + indirect with color excluded; separate albedo color-only pass', removableRoof=True)
    for obj in scene.objects:
        obj.hide_render = visibility.get(obj.name, False)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(OUT / 'components.glb'), export_format='GLB', use_selection=True, use_active_scene=True, export_colors=True, export_extras=True, export_animations=False, export_cameras=False, export_lights=False, export_yup=True)
    raw = (OUT / 'components.glb').read_bytes()
    length = struct.unpack_from('<I', raw, 12)[0]
    gltf = json.loads(raw[20:20+length])
    names = {node.get('name') for node in gltf['nodes']}
    expected = {'Card_' + cid for cid in manifest['cards']} | {'Layout_P1', 'Layout_P2'}
    assert expected <= names
    materials = gltf['materials']
    layout_primitives = 0
    card_primitives = 0
    for mesh in gltf['meshes']:
        for primitive in mesh['primitives']:
            mat_name = materials[primitive['material']]['name']
            if mat_name.startswith('BakedLayout_'):
                layout_primitives += 1
                assert 'TEXCOORD_0' in primitive['attributes']
                assert 'TEXCOORD_1' in primitive['attributes']
                assert 'baseColorTexture' in materials[primitive['material']]['pbrMetallicRoughness']
            else:
                card_primitives += 1
                assert 'COLOR_0' in primitive['attributes']
    assert layout_primitives == 4
    manifest['validation'] = dict(cardRoots=24, layoutRoots=2, meshCount=len(gltf['meshes']), primitiveCount=card_primitives + layout_primitives, materialCount=len(materials), allCardPrimitivesHaveVertexColor=True, allLayoutPrimitivesHaveBakedAlbedo=True, layoutBakedPrimitiveCount=layout_primitives, embeddedAlbedoImages=len(gltf.get('images', [])), glbBytes=len(raw))
    (OUT / 'components-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print('BAKED_COMPONENT_LIBRARY_VALIDATED', json.dumps(manifest['validation']), flush=True)


def bake_cards():
    """Add isolated diffuse-sky atlases without baking moving parts or other cards."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.cycles.max_bounces = 4
    scene.cycles.use_denoising = True
    try:
        preferences = bpy.context.preferences.addons['cycles'].preferences
        preferences.compute_device_type = 'OPTIX'
        preferences.get_devices()
        for device in preferences.devices:
            device.use = device.type == 'OPTIX'
        scene.cycles.device = 'GPU'
    except Exception as error:
        print('CARD_BAKE_CPU_FALLBACK', str(error), flush=True)
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.75, .83, 1, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .55
    scene.render.bake.margin_type = 'EXTEND'
    scene.render.bake.use_clear = True
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.use_pass_color = False
    scene.render.bake.use_pass_direct = True
    scene.render.bake.use_pass_indirect = True
    manifest = json.loads((OUT / 'components-manifest.json').read_text(encoding='utf-8'))
    visibility = {obj.name: obj.hide_render for obj in scene.objects}
    source_path = ROOT / 'modern-building-v2.blend'
    with bpy.data.libraries.load(str(source_path), link=False) as (source, destination):
        assert 'Architecture' in source.objects, 'Base Architecture occluder missing'
        destination.objects = ['Architecture']
    occluder = destination.objects[0]
    scene.collection.objects.link(occluder)
    occluder.name = 'TEMP_CardBake_ClosedArchitecture'
    open_occluder = occluder.copy()
    open_occluder.data = occluder.data.copy()
    scene.collection.objects.link(open_occluder)
    open_occluder.name = 'TEMP_CardBake_OpenArchitecture'
    assert 'Roof' in open_occluder.vertex_groups, 'Base Architecture Roof group missing'
    bpy.ops.object.select_all(action='DESELECT')
    open_occluder.select_set(True)
    bpy.context.view_layer.objects.active = open_occluder
    open_occluder.vertex_groups.active_index = open_occluder.vertex_groups['Roof'].index
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.vertex_group_select()
    bpy.ops.mesh.delete(type='VERT')
    bpy.ops.object.mode_set(mode='OBJECT')
    source_palette = bpy.data.materials['ComponentVertexPalette']
    export_materials = {}
    restored_parts = {}
    for cid, metadata in manifest['cards'].items():
        root = bpy.data.objects[metadata['node']]
        excluded = set()
        for animation in metadata['animatedNodes']:
            if animation['kind'] != 'brightness':
                animated_root = bpy.data.objects[animation['node']]
                excluded.update(obj.name for obj in animated_root.children_recursive if obj.type == 'MESH')
        pieces = [obj for obj in root.children_recursive if obj.type == 'MESH' and obj.name not in excluded]
        assert pieces, cid
        for obj in scene.objects:
            if obj.type in ('MESH', 'LIGHT'):
                obj.hide_render = True
        active_occluder = open_occluder if cid in ('P3', 'P4') else occluder
        active_occluder.hide_render = False
        bpy.context.view_layer.update()
        originals = []
        for index, obj in enumerate(pieces):
            obj.hide_render = False
            original = dict(name=obj.name, parent=obj.parent, matrix=obj.matrix_world.copy(), group='CARD_ATLAS_PART_%02d' % index, properties=dict(obj.items()))
            originals.append(original)
            for layer in list(obj.data.uv_layers):
                obj.data.uv_layers.remove(layer)
            group = obj.vertex_groups.new(name=original['group'])
            group.add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
        bpy.ops.object.select_all(action='DESELECT')
        for obj in pieces:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = pieces[0]
        if len(pieces) > 1:
            bpy.ops.object.join()
        combined = bpy.context.object
        combined.name = 'TEMP_CardBake_' + cid
        # One card atlas, so static submeshes never overlap one another in UV space.
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=.005)
        bpy.ops.object.mode_set(mode='OBJECT')
        combined.data.uv_layers.active.name = 'AtlasUV'
        lightmap_uv = combined.data.uv_layers.new(name='LightmapUV')
        for original, duplicate in zip(combined.data.uv_layers[0].data, lightmap_uv.data):
            duplicate.uv = original.uv
        combined.data.uv_layers.active_index = 0
        resolution = 1024 if cid[0] in ('W', 'I') or cid in ('P3', 'P4') else 512
        scene.render.bake.margin = 8 if resolution == 1024 else 4
        image = bpy.data.images.new('AmbientCard_' + cid, width=resolution, height=resolution, alpha=False)
        image.colorspace_settings.name = 'Non-Color'
        # The source material remains the vertex palette, with no baked illumination.
        for material in combined.data.materials:
            texture = material.node_tree.nodes.new('ShaderNodeTexImage')
            texture.name = 'TEMP_CARD_AMBIENT_BAKE'
            texture.image = image
            material.node_tree.nodes.active = texture
        print('CARD_BAKING', cid, resolution, len(originals), 'static parts', len(excluded), 'moving parts excluded', flush=True)
        bpy.ops.object.bake(type='DIFFUSE')
        filename = 'ambient-card-' + cid.lower() + '.png'
        image.filepath_raw = str(OUT / filename)
        image.file_format = 'PNG'
        image.save()
        for material in combined.data.materials:
            for texture in list(material.node_tree.nodes):
                if texture.name.startswith('TEMP_CARD_AMBIENT_BAKE'):
                    material.node_tree.nodes.remove(texture)
        # Restore the original mount hierarchy and transforms after atlas generation.
        rebuilt = []
        for original in originals[1:]:
            bpy.ops.object.select_all(action='DESELECT')
            combined.select_set(True)
            bpy.context.view_layer.objects.active = combined
            combined.vertex_groups.active_index = combined.vertex_groups[original['group']].index
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='DESELECT')
            bpy.ops.object.vertex_group_select()
            bpy.ops.mesh.separate(type='SELECTED')
            bpy.ops.object.mode_set(mode='OBJECT')
            part = next(obj for obj in bpy.context.selected_objects if obj != combined and obj.type == 'MESH')
            rebuilt.append((part, original))
        rebuilt.append((combined, originals[0]))
        for part, original in rebuilt:
            bpy.context.view_layer.update()
            part.data.transform(original['matrix'].inverted() @ part.matrix_world)
            part.parent = original['parent']
            part.matrix_world = original['matrix']
            part.name = original['name']
            for key, value in original['properties'].items():
                part[key] = value
            part.data.materials.clear()
            part.data.materials.append(source_palette)
            for polygon in part.data.polygons:
                polygon.material_index = 0
            for group in list(part.vertex_groups):
                if group.name.startswith('CARD_ATLAS_PART_'):
                    part.vertex_groups.remove(group)
        export_material = source_palette.copy()
        export_material.name = 'AmbientCard_' + cid
        export_materials[cid] = export_material
        restored_parts[cid] = [part for part, _ in rebuilt]
        metadata['bake'] = dict(ambient=filename, material=export_material.name, resolution=resolution, uv='AtlasUV / copied LightmapUV', ambientIntensity=math.pi, ambientEncoding='Linear RGB PNG, no view transform', occluder='openRoof Architecture' if cid in ('P3', 'P4') else 'closed Architecture', staticNodes=[part.name for part, _ in rebuilt], excludedMovingNodes=sorted(excluded), source='Diffuse direct + indirect with color excluded; uniform world (.75,.83,1) strength .55; sun and other cards excluded')
    bpy.data.objects.remove(occluder, do_unlink=True)
    bpy.data.objects.remove(open_occluder, do_unlink=True)
    for obj in scene.objects:
        obj.hide_render = visibility.get(obj.name, False)
    # Store unmodified shading in the authoring scene for independent Cycles reference renders.
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    for cid, pieces in restored_parts.items():
        for obj in pieces:
            obj.data.materials[0] = export_materials[cid]
    bpy.ops.object.select_all(action='DESELECT')
    for root in [obj for obj in scene.objects if obj.parent is None and (obj.name.startswith('Card_') or obj.name.startswith('Layout_'))]:
        for obj in [root, *root.children_recursive]:
            obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / 'components.glb'), export_format='GLB', use_selection=True, use_active_scene=True, export_colors=True, export_extras=True, export_animations=False, export_cameras=False, export_lights=False, export_yup=True)
    raw = (OUT / 'components.glb').read_bytes()
    length = struct.unpack_from('<I', raw, 12)[0]
    gltf = json.loads(raw[20:20+length])
    materials = gltf['materials']
    found = set()
    baked_card_primitives = 0
    moving_primitives = 0
    for mesh in gltf['meshes']:
        for primitive in mesh['primitives']:
            material_name = materials[primitive['material']]['name']
            if material_name.startswith('AmbientCard_'):
                found.add(material_name)
                baked_card_primitives += 1
                assert {'COLOR_0', 'TEXCOORD_0', 'TEXCOORD_1'} <= set(primitive['attributes'])
            elif material_name == 'ComponentVertexPalette':
                moving_primitives += 1
                assert 'COLOR_0' in primitive['attributes']
    expected = {'AmbientCard_' + cid for cid in manifest['cards']}
    assert found == expected, sorted(expected - found)
    assert len([node for node in gltf['nodes'] if node.get('name', '').startswith('TEMP_')]) == 0
    manifest['validation'].update(cardAmbientAtlases=len(found), staticCardBakedPrimitives=baked_card_primitives, unbakedMovingPrimitives=moving_primitives, allStaticCardPrimitivesHaveUv0Uv1AndVertexColor=True, materialCount=len(materials), glbBytes=len(raw))
    (OUT / 'components-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print('AMBIENT_CARD_LIBRARY_VALIDATED', json.dumps(manifest['validation']), flush=True)


def main():
    global M
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.name = 'ACE405_Components_V2'
    scene.unit_settings.system = 'METRIC'
    scene['ace405_generated'] = True
    colors = json.loads((ROOT / 'palette-v2.json').read_text(encoding='utf-8'))['components']
    M = {name: material(name, color) for name, color in colors.items()}
    M['vertex'] = material('ComponentVertexPalette', 'ffffff')
    nodes = M['vertex'].node_tree.nodes
    vertex = nodes.new('ShaderNodeVertexColor')
    vertex.layer_name = 'Palette'
    M['vertex'].node_tree.links.new(vertex.outputs['Color'], nodes.get('Principled BSDF').inputs['Base Color'])
    for fn in (make_windows, make_insulation, make_shading, make_plan, make_materials_cards, make_technology):
        fn()
    prepare_mounts()
    add_service_platforms()
    for cid, root in ROOTS.items():
        palette_merge(root, root.name + '_Mesh')
    config = json.loads((ROOT.parent / 'src/course-config.json').read_text(encoding='utf-8'))
    definitions = {item['id']: item for item in config['design_cards']}
    for cid, meta in META.items():
        meta['label'] = definitions[cid]['name']
        meta['slot'] = definitions[cid]['slot']
        meta['boundsBlender'] = bounds(ROOTS[cid])
        meta['meshCount'] = len([obj for obj in ROOTS[cid].children_recursive if obj.type == 'MESH'])
        # Local Blender X stays X; local Blender Z becomes web Y.
        for anim in meta['animatedNodes']:
            if 'axis' in anim:
                anim['webAxis'] = {'x': 'x', 'y': 'z', 'z': 'y'}[anim['axis']]
    manifest = dict(version=2, source='Art/components-v2.blend', asset='components.glb', coordinates=dict(authoring='Blender: X right, -Y front, Z up', web='glTF: X right, +Z front, Y up', buildingOuter=[3.25, 2.6, 2.5], roofHeight=2.715, componentBoundsXY=[-2.0, 2.0, -1.95, 1.95], pedestrianRing=dict(absX=2.65, absY=2.5), doorway=dict(x=[-.45, .45], y=-1.30, z=[0, 1.15])), material=dict(mode='opaque matte vertex color', shader='Principled BSDF roughness 1 specular 0', colorAttribute='COLOR_0', sharedMaterial='ComponentVertexPalette', transparency=False), cards=META, layouts={
        'Layout_P1': dict(card='P1', node='Layout_P1', architectureNode='Layout_P1_Architecture', roofNode='Layout_P1_Roof', semantics='Actual shallow-depth building. The entrance/front facade is unchanged; rear wall moves forward.', frontY=-1.30, rearY=.30, depth=1.60, centerY=-.50, sideComponentScaleY=1.6/2.6, sideComponentOffsetY=-.50, roofComponentOffsetY=-.50, boundsBlender=bounds(bpy.data.objects['Layout_P1'])),
        'Layout_P2': dict(card='P2', node='Layout_P2', architectureNode='Layout_P2_Architecture', roofNode='Layout_P2_Roof', semantics='Actual open courtyard with a roof opening, ring-shaped floors, inner facades and exposed ground-level paving.', frontY=-1.30, rearY=1.30, depth=2.60, centerY=0, courtyardBlender=dict(x=[-.65, .65], y=[-.50, .80]), roofComponentPlacement='Place technology on solid roof wings; do not cover courtyard opening.', boundsBlender=bounds(bpy.data.objects['Layout_P2']))
    }, integrationNotes=[
        'Clone one Card_<id> per selected slot, at the building origin. Roots are independent and contain all their component geometry.',
        'For P1/P2 hide the baseline Architecture and baseline Roof, and clone Layout_P1/Layout_P2. Keep the base Ground, entrance Door and people.',
        'P3/P4 are actual upper-floor interior modules. Hide only the Roof to reveal them. Their floor is at z=1.34 in Blender.',
        'P1: for each layoutMount of kind side, set scale.y=1.6/2.6 and position.y=-.50 in Blender (web scale.z and position.z=+.50). Front-facade components retain their existing coordinates. For roof mounts move Blender Y by -.50 (web Z by +.50).',
        'P2: relocate roof equipment onto side wings outside |x|<.65 and front/back wings outside -.50<y<.80. Use uniform scale .55 if needed.',
        'Fan hinges use Blender local Z / exported glTF local Y. Louver and Vent hinges use local X in both coordinate systems.',
        'T4 light-strip mesh is independently addressable for subtle material brightness. It needs no point lights.',
        'W card surfaces are opaque painted glazing with geometry layers; there is no transparency or environment reflection shader.'
    ])
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(OUT / 'components.glb'), export_format='GLB', use_selection=True, use_active_scene=True, export_colors=True, export_extras=True, export_animations=False, export_cameras=False, export_lights=False, export_yup=True)
    # Verify the exact binary delivery instead of assuming the exporter kept colors.
    raw = (OUT / 'components.glb').read_bytes()
    chunk_length, chunk_type = struct.unpack_from('<II', raw, 12)
    assert chunk_type == 0x4E4F534A
    gltf = json.loads(raw[20:20+chunk_length])
    names = {node.get('name') for node in gltf['nodes']}
    expected = {'Card_' + cid for cid in definitions} | {'Layout_P1', 'Layout_P2'}
    assert expected <= names, sorted(expected - names)
    missing_colors = [mesh.get('name') for mesh in gltf['meshes'] for primitive in mesh['primitives'] if 'COLOR_0' not in primitive['attributes']]
    assert not missing_colors, missing_colors
    material_count = len(gltf.get('materials', []))
    primitive_count = sum(len(mesh['primitives']) for mesh in gltf['meshes'])
    manifest['validation'] = dict(cardRoots=len(META), layoutRoots=2, meshCount=len(gltf['meshes']), primitiveCount=primitive_count, materialCount=material_count, allPrimitivesHaveVertexColor=True, glbBytes=len(raw))
    (OUT / 'components-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print('COMPONENT_LIBRARY_VALIDATED', json.dumps(manifest['validation']))


if __name__ == '__main__':
    if '--' in sys.argv and 'bake-cards' in sys.argv[sys.argv.index('--')+1:]:
        bake_cards()
    elif '--' in sys.argv and 'bake-layouts' in sys.argv[sys.argv.index('--')+1:]:
        bake_layouts()
    else:
        main()
