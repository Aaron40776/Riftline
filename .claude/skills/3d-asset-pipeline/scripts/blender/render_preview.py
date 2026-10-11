"""Render turntable preview PNGs of a model, headless (tested on Blender 5.2.2 LTS).

  blender -b --factory-startup --python-exit-code 1 -P render_preview.py -- \
      --in model.glb --out-dir previews/ [--views 4] [--size 512] [--engine cycles|eevee|workbench] [--samples 24]

Imports .glb/.gltf/.fbx/.obj, frames a camera on the bounding box, adds a neutral three-light rig and a
grey studio world, renders N views around the model (30 deg elevation). Default engine is Cycles on CPU
because it renders without a GPU; EEVEE/Workbench need an OpenGL/Vulkan context and fail on headless
servers without one. If the model has animations, --frame N poses it at that frame first.
Prints RESULT {...} with the written file paths. Combine with visual-art-ui-vfx/scripts/contact_sheet.py.
"""
import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--in", dest="inp", required=True)
ap.add_argument("--out-dir", required=True)
ap.add_argument("--views", type=int, default=4)
ap.add_argument("--size", type=int, default=512)
ap.add_argument("--engine", default="cycles", choices=["cycles", "eevee", "workbench"])
ap.add_argument("--samples", type=int, default=24)
ap.add_argument("--frame", type=int, default=None)
a = ap.parse_args(argv)

bpy.ops.wm.read_factory_settings(use_empty=True)
ext = os.path.splitext(a.inp)[1].lower()
if ext in (".glb", ".gltf"):
    bpy.ops.import_scene.gltf(filepath=a.inp)
elif ext == ".fbx":
    bpy.ops.import_scene.fbx(filepath=a.inp)
elif ext == ".obj":
    bpy.ops.wm.obj_import(filepath=a.inp)
else:
    sys.exit(f"unsupported input {ext}")

scene = bpy.context.scene
if a.frame is not None:
    scene.frame_set(a.frame)
dg = bpy.context.evaluated_depsgraph_get()
lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
for o in scene.objects:
    if o.type == "MESH":
        for c in o.evaluated_get(dg).bound_box:
            w = o.matrix_world @ Vector(c)
            lo, hi = Vector(map(min, lo, w)), Vector(map(max, hi, w))
if lo.x > hi.x:
    sys.exit("no mesh objects imported")
center, radius = (lo + hi) / 2, max((hi - lo).length / 2, 1e-3)

cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 50
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
dist = radius / math.sin(cam_data.angle / 2) * 1.15

for name, energy, rot in (("key", 2.2, (50, 0, 35)), ("fill", 0.5, (60, 0, -60)), ("rim", 1.6, (120, 0, 180))):
    ld = bpy.data.lights.new(name, "SUN")
    ld.energy = energy
    lo_ = bpy.data.objects.new(name, ld)
    lo_.rotation_euler = [math.radians(v) for v in rot]
    scene.collection.objects.link(lo_)
world = bpy.data.worlds.new("studio")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.18, 0.18, 0.2, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.25
scene.world = world

r = scene.render
r.resolution_x = r.resolution_y = a.size
r.film_transparent = False
r.image_settings.file_format = "PNG"
if a.engine == "cycles":
    r.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = a.samples
    scene.cycles.use_denoising = True
elif a.engine == "eevee":
    r.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in [e.identifier for e in r.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE_NEXT"
else:
    r.engine = "BLENDER_WORKBENCH"
scene.view_settings.view_transform = "AgX" if "AgX" in [v.name for v in bpy.types.ColorManagedViewSettings.bl_rna.properties["view_transform"].enum_items] else "Filmic"

os.makedirs(a.out_dir, exist_ok=True)
stem = os.path.splitext(os.path.basename(a.inp))[0]
files = []
for i in range(a.views):
    az = math.radians(35 + 360 * i / a.views)
    el = math.radians(30)
    cam.location = center + Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el))) * dist
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    r.filepath = os.path.join(os.path.abspath(a.out_dir), f"{stem}_v{i}.png")
    bpy.ops.render.render(write_still=True)
    files.append(r.filepath)
print("RESULT " + json.dumps({"files": files, "engine": r.engine, "bbox_size": list(hi - lo)}))
