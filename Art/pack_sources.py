"""Run in background Blender to make the checked-in .blend sources self-contained."""
import bpy
import json
from pathlib import Path

root = Path(__file__).resolve().parent
report = []
for source in sorted(root.glob('*.blend')):
    bpy.ops.wm.open_mainfile(filepath=str(source))
    for image in bpy.data.images:
        if image.source == 'FILE' and not image.packed_file and image.filepath:
            filename = Path(bpy.path.abspath(image.filepath))
            if not filename.is_file():
                raise RuntimeError(f'Missing source texture for {source.name}: {image.name}')
    bpy.ops.file.pack_all()
    bpy.ops.file.make_paths_relative()
    bpy.ops.wm.save_as_mainfile(filepath=str(source))
    report.append({'source': source.name, 'packed_images': sum(bool(image.packed_file) for image in bpy.data.images)})
(root / 'packed-sources.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print('PACKED_EDITABLE_SOURCES', json.dumps(report), flush=True)
