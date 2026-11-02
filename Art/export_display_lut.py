"""Render a numerical color chart through Blender's actual AgX display transform.

This exports Blender-generated calibration pixels, not a third-party shader or
copied OCIO LUT. Runtime samples the chart inside the existing material pass.
"""
import bpy
import json
import numpy as np
from pathlib import Path

root = Path(__file__).resolve().parent
output = root.parent / 'public/assets/modern-v2'
size, minimum, maximum = 57, -12.47393, 4.026069
scene = bpy.context.scene
scene.display_settings.display_device = 'sRGB'
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1
scene.render.dither_intensity = 0
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '16'
blue, green, red = np.indices((size, size, size), dtype=np.float32)
values = np.stack([red, green, blue], axis=-1)
values = np.exp2(minimum + values / (size - 1) * (maximum - minimum))
rgba = np.ones((size, size, size, 4), dtype=np.float32)
rgba[..., :3] = values
chart = bpy.data.images.new('AgX calibration input', width=size*size, height=size, float_buffer=True)
chart.colorspace_settings.name = 'Linear Rec.709'
chart.pixels.foreach_set(rgba.ravel())
filename = root / 'renders/agx-calibration.png'
chart.save_render(str(filename), scene=scene)
display = bpy.data.images.load(str(filename), check_existing=False)
display.colorspace_settings.name = 'Non-Color'
pixels = np.empty(size**3*4, dtype=np.float32)
display.pixels.foreach_get(pixels)
pixels = pixels.reshape((-1, 4))
rgb = pixels[:, :3]
pixels[:, :3] = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055)**2.4)
pixels.astype('<f2').tofile(output / 'blender-agx.rgba16f')
metadata = dict(size=size, minEV=minimum, maxEV=maximum, format='little-endian RGBA16F; red-fastest, green, blue',
                input='scene-linear Rec.709 log2 lattice', output='display-linear sRGB; apply output sRGB encoding once',
                producer='Blender '+bpy.app.version_string, view='AgX', look='None', exposure=0,
                method='Render 16-bit PNG calibration chart with Image.save_render; decode sRGB to linear and store half floats',
                bytes=(output / 'blender-agx.rgba16f').stat().st_size)
(output / 'blender-agx.json').write_text(json.dumps(metadata, indent=2)+'\n', encoding='utf-8')
print('DISPLAY_CALIBRATION_EXPORTED', json.dumps(metadata), flush=True)
