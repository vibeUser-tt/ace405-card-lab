"""Render the 24 card illustrations from the authored Blender component library.

Run with Blender 4.1 in background mode. This only writes cards/<ID>.png;
the source blend, component atlases and glTF library are never saved or changed.
"""
import bpy
import bmesh
import json
import math
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT.parent / 'public/assets/modern-v2'
OUTPUT = ASSETS / 'cards'
SOURCE = ROOT / 'components-v2.blend'
TEMPORARY = []


def matte(name, hex_color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    values = [int(hex_color[i:i+2], 16) / 255 for i in (0, 2, 4)]
    linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values]
    bs = mat.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*linear, 1)
    bs.inputs['Roughness'].default_value = 1
    bs.inputs['Specular IOR Level'].default_value = 0
    return mat


def box(name, location, dimensions, material, bevel=.008):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = 'IconContext_' + name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('Soft silhouette edges', 'BEVEL')
        modifier.width = min(bevel, min(dimensions) * .2)
        modifier.segments = 2
    TEMPORARY.append(obj)
    return obj


def show(root):
    for obj in [root, *root.children_recursive]:
        obj.hide_render = False


def bounds(objects):
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ Vector(corner) for obj in objects if obj.type == 'MESH' for corner in obj.bound_box]
    assert points
    lower = Vector([min(point[index] for point in points) for index in range(3)])
    upper = Vector([max(point[index] for point in points) for index in range(3)])
    return points, (lower + upper) / 2


def frame(camera, objects, direction):
    points, target = bounds(objects)
    direction = Vector(direction).normalized()
    orientation = (-direction).to_track_quat('-Z', 'Y')
    inverse = orientation.inverted()
    # A mild perspective makes the geometry feel like a tangible tabletop piece.
    camera.data.type = 'PERSP'
    camera.data.lens = 55
    camera.data.sensor_width = 36
    tangent = math.tan(2 * math.atan(36 / (2 * 55)) / 2)
    fit = .80
    distance = max(max((inverse @ (point - target)).z + abs((inverse @ (point - target)).x) / (tangent * fit), (inverse @ (point - target)).z + abs((inverse @ (point - target)).y) / (tangent * fit)) for point in points)
    camera.location = target + direction * distance
    camera.rotation_euler = orientation.to_euler()
    camera.data.clip_start = .01
    camera.data.clip_end = 100


WINDOWS = [(x, z) for z in (.66, 1.81) for x in (-1.025, 0, 1.025) if not (z == .66 and x == 0)]


def front_context(materials, upper_only=False, panes_only=False):
    if not panes_only:
        box('Facade silhouette', (0, -1.31, 1.82 if upper_only else 1.25), (3.27, .075, 1.06 if upper_only else 2.50), materials['backing'])
    for x, z in WINDOWS:
        if upper_only and z < 1:
            continue
        box('Window silhouette', (x, -1.365, z), (.78, .015, .75), materials['glass'], .006)
    if not upper_only and not panes_only:
        box('Entrance silhouette', (0, -1.366, .57), (.83, .015, 1.12), materials['glass'], .006)


def side_context(materials, side=-1):
    box('Side facade silhouette', (side * 1.64, 0, 1.25), (.075, 2.59, 2.5), materials['backing'])
    for y in (-.68, .68):
        for z in (.66, 1.81):
            box('Side window silhouette', (side * 1.69, y, z), (.015, .77, .75), materials['glass'], .006)


def duplicate_region(source, name, predicate):
    obj = source.copy()
    obj.data = source.data.copy()
    obj.name = name
    obj.parent = None
    obj.matrix_world = source.matrix_world.copy()
    bpy.context.scene.collection.objects.link(obj)
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    doomed = [vertex for vertex in mesh.verts if not predicate(obj.matrix_world @ vertex.co)]
    bmesh.ops.delete(mesh, geom=doomed, context='VERTS')
    mesh.to_mesh(obj.data)
    mesh.free()
    obj.hide_render = False
    TEMPORARY.append(obj)
    return obj


def place_piece(obj, center, scale):
    points, old_center = bounds([obj])
    # Bake only this temporary icon copy into a conveniently centered transform.
    obj.data.transform(obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)
    for vertex in obj.data.vertices:
        vertex.co = (vertex.co - old_center) * scale + Vector(center)


def arrange_control_icon():
    # The actual small controller, sensor and cabinet are spaced across a facade
    # in the game. Arrange copies together for a readable equipment illustration.
    source = bpy.data.objects['Card_T3_Mesh']
    panel = duplicate_region(source, 'Icon demand controller', lambda p: .45 < p.x < .75 and .75 < p.z < 1.10)
    sensor = duplicate_region(source, 'Icon occupancy sensor', lambda p: p.x > .8 and p.z > 2.20)
    cabinet_source = bpy.data.objects['Card_T3_RoofMount_Mesh']
    cabinet = duplicate_region(cabinet_source, 'Icon control cabinet', lambda p: True)
    place_piece(panel, (.52, -.16, .62), 4.6)
    place_piece(sensor, (.53, -.12, 1.25), 3.5)
    place_piece(cabinet, (-.32, .12, .64), 3.1)


def main():
    if Path(bpy.data.filepath) != SOURCE:
        bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 96
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
        print('ICON_CPU_FALLBACK', str(error), flush=True)
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.75, .83, 1, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .55
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = .85
    scene.render.resolution_x = 256
    scene.render.resolution_y = 256
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    scene.render.image_settings.compression = 30
    light_data = bpy.data.lights.new('Card illustration warm sun', 'SUN')
    light_data.energy = 2.25
    light_data.color = (1, .91, .77)
    light_data.angle = .16
    light = bpy.data.objects.new('Card illustration warm sun', light_data)
    scene.collection.objects.link(light)
    light.location = (-3, -4, 7)
    light.rotation_euler = (-light.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data = bpy.data.cameras.new('Card illustration camera')
    camera = bpy.data.objects.new('Card illustration camera', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    materials = dict(backing=matte('Icon quiet architectural silhouette', 'd4dfca'), glass=matte('Icon quiet glazing silhouette', '3389ab'))
    manifest = json.loads((ASSETS / 'components-manifest.json').read_text(encoding='utf-8'))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for cid in manifest['cards']:
        for obj in list(TEMPORARY):
            bpy.data.objects.remove(obj, do_unlink=True)
        TEMPORARY.clear()
        for obj in scene.objects:
            if obj.type == 'MESH':
                obj.hide_render = True
        root = bpy.data.objects[('Layout_' if cid in ('P1', 'P2') else 'Card_') + cid]
        show(root)
        direction = (3.1, -10, 4.7)
        if cid[0] == 'I':
            direction = (-9, -5.8, 5.5)
            side_context(materials)
            if cid == 'I4':
                front_context(materials)
        elif cid[0] == 'M':
            direction = (8, -10, 6.3)
            front_context(materials)
            if cid in ('M3', 'M4'):
                side_context(materials, side=1)
        elif cid[0] == 'S':
            direction = (4.0, -10, 5.4)
            front_context(materials, upper_only=cid == 'S4')
            if cid == 'S2':
                for animation in manifest['cards'][cid]['animatedNodes']:
                    bpy.data.objects[animation['node']].rotation_euler.x = -.34
        elif cid[0] == 'P':
            direction = (7.2, -10, 10.2 if cid in ('P1', 'P2') else 13)
            if cid in ('P3', 'P4'):
                # The rear service strip is useful in the full game combination,
                # but would float above and obscure this isolated interior cutaway.
                source = bpy.data.objects['Card_' + cid + '_Mesh']
                source.hide_render = True
                duplicate_region(source, 'Icon interior cutaway ' + cid, lambda p: p.z < 2.46)
        elif cid in ('T1', 'T2'):
            direction = (6.4, -9, 8.2)
            if cid == 'T2':
                for animation in manifest['cards'][cid]['animatedNodes']:
                    bpy.data.objects[animation['node']].rotation_euler.x = -.62
        elif cid == 'T3':
            for obj in root.children_recursive:
                obj.hide_render = True
            arrange_control_icon()
            direction = (4, -10, 5)
        elif cid == 'T4':
            front_context(materials, panes_only=True)
            direction = (3.1, -10, 4.7)
        visible = [obj for obj in scene.objects if obj.type == 'MESH' and not obj.hide_render]
        frame(camera, visible, direction)
        scene.render.filepath = str(OUTPUT / (cid + '.png'))
        bpy.ops.render.render(write_still=True)
        print('CARD_ICON_RENDERED', cid, str(OUTPUT / (cid + '.png')), flush=True)
    assert len([path for path in OUTPUT.glob('*.png') if path.stem in manifest['cards']]) == 24
    print('CARD_ICON_SET_COMPLETE', str(OUTPUT), flush=True)


if __name__ == '__main__':
    main()
