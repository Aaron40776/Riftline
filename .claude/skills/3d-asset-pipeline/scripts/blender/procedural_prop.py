"""Procedural game prop -> GLB, headless Blender (tested on Blender 5.2.2 LTS; uses only APIs present since 4.2).

  blender -b --factory-startup --python-exit-code 1 -P procedural_prop.py -- \
      --kind rock|crate|pillar|barrel --out prop.glb [--seed 7] [--max-tris 800] [--bake 512] [--color 0.45,0.42,0.4]

What it does: builds the base shape, adds bevel/displacement detail, applies modifiers, decimates down to
--max-tris, smart-UV-unwraps, assigns a Principled material, and (with --bake N) bakes the procedural
colour into an N x N PNG so it survives export (procedural shader nodes do NOT export to glTF).
Exports Y-up GLB in metres, origin at the base centre. Prints a JSON summary line prefixed RESULT.
"""
import argparse
import json
import math
import random
import sys

import bpy
import bmesh

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--kind", default="rock", choices=["rock", "crate", "pillar", "barrel"])
ap.add_argument("--out", required=True)
ap.add_argument("--seed", type=int, default=1)
ap.add_argument("--max-tris", type=int, default=1200)
ap.add_argument("--bake", type=int, default=0, help="bake base colour to an NxN texture (Cycles CPU)")
ap.add_argument("--color", default=None, help="linear RGB base colour r,g,b")
a = ap.parse_args(argv)
random.seed(a.seed)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def tri_count(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    m = obj.evaluated_get(dg).to_mesh()
    n = sum(len(p.vertices) - 2 for p in m.polygons)
    obj.evaluated_get(dg).to_mesh_clear()
    return n


def apply_all(obj):
    bpy.context.view_layer.objects.active = obj
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def make_material(name, base, rough, metal, noise_scale, noise_amt, dark, grain=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = True  # exports doubleSided=false: half the fragment work for closed meshes
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    # procedural colour variation: noise (or wood grain bands) -> colour ramp between base and a darker tone
    if grain:
        tex = nt.nodes.new("ShaderNodeTexWave")
        tex.wave_type = "BANDS"
        tex.bands_direction = "Z"
        tex.inputs["Scale"].default_value = noise_scale
        tex.inputs["Distortion"].default_value = 6
        tex.inputs["Detail"].default_value = 3
    else:
        tex = nt.nodes.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = noise_scale
        tex.inputs["Detail"].default_value = 6
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*[c * dark for c in base], 1)
    ramp.color_ramp.elements[1].color = (*base, 1)
    ramp.color_ramp.elements[0].position = 0.5 - noise_amt
    ramp.color_ramp.elements[1].position = 0.5 + noise_amt
    nt.links.new(tex.outputs["Fac" if not grain else "Color"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


base = tuple(float(x) for x in a.color.split(",")) if a.color else None
extra_mats = []
if a.kind == "rock":
    # stylised rock = sphere cut by random planes (flat chipped facets) + mild noise; reads as stone, not as a blob
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=0.5)
    obj = bpy.context.active_object
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for _ in range(random.randint(9, 13)):
        n = [random.gauss(0, 1), random.gauss(0, 1), random.gauss(0, 0.6)]
        ln = math.sqrt(sum(c * c for c in n))
        n = [c / ln for c in n]
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=[c * random.uniform(0.33, 0.44) for c in n], plane_no=n, clear_outer=True)
        bmesh.ops.holes_fill(bm, edges=bm.edges[:], sides=0)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(obj.data)
    bm.free()
    obj.scale = (1.0 + random.uniform(-.15, .15), 0.95, 0.7 + random.uniform(-.1, .1))
    t = bpy.data.textures.new("rockfine", "CLOUDS")
    t.noise_scale = 0.25
    d = obj.modifiers.new("fine", "DISPLACE")
    d.texture, d.strength, d.texture_coords = t, 0.03, "OBJECT"
    mat = make_material("rock", base or (0.20, 0.19, 0.17), 0.9, 0.0, 7.0, 0.22, 0.55)
elif a.kind == "crate":
    # framed panels: inset every face, push the panel in, bevel the hard edges
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.active_object
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    res = bmesh.ops.inset_individual(bm, faces=bm.faces[:], thickness=0.1, depth=-0.05)
    for f in res["faces"]:  # the frame ring around each panel gets material slot 1
        f.material_index = 1
    bm.to_mesh(obj.data)
    bm.free()
    b = obj.modifiers.new("bevel", "BEVEL")
    b.width, b.segments, b.limit_method = 0.012, 1, "ANGLE"
    mat = make_material("wood", base or (0.23, 0.12, 0.05), 0.75, 0.0, 2.5, 0.3, 0.5, grain=True)
    extra_mats = [make_material("wood_frame", (0.09, 0.05, 0.025), 0.8, 0.0, 2.5, 0.3, 0.6, grain=True)]
elif a.kind == "pillar":
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.3, depth=3.0)
    obj = bpy.context.active_object
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for v in bm.verts:  # slight entasis (bulge) and flutes
        ang = math.atan2(v.co.y, v.co.x)
        k = 1 + 0.06 * math.cos(math.pi * v.co.z / 3.0) - 0.04 * (math.cos(ang * 8) > 0.7)
        v.co.x, v.co.y = v.co.x * k, v.co.y * k
    bm.to_mesh(obj.data)
    bm.free()
    b = obj.modifiers.new("bevel", "BEVEL")
    b.width, b.segments, b.limit_method = 0.03, 2, "ANGLE"
    mat = make_material("marble", base or (0.75, 0.72, 0.66), 0.45, 0.0, 3.0, 0.15, 0.8)
else:  # barrel
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.35, depth=1.0)
    obj = bpy.context.active_object
    s = obj.modifiers.new("sub", "SUBSURF")
    s.levels = 1
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 0.5], cuts=4)
    for v in bm.verts:
        k = 1 + 0.12 * math.cos(math.pi * v.co.z)
        v.co.x, v.co.y = v.co.x * k, v.co.y * k
    bm.to_mesh(obj.data)
    bm.free()
    mat = make_material("barrelwood", base or (0.38, 0.22, 0.10), 0.7, 0.0, 22.0, 0.2, 0.6)

obj.name = a.kind
apply_all(obj)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# decimate to budget
tris = tri_count(obj)
if tris > a.max_tris:
    dm = obj.modifiers.new("dec", "DECIMATE")
    dm.ratio = a.max_tris / tris * 0.98
    apply_all(obj)

# origin at base centre, resting on z=0 (Blender Z-up -> glTF Y-up on export)
zmin = min(v.co.z for v in obj.data.vertices)
for v in obj.data.vertices:
    v.co.z -= zmin
bpy.ops.object.shade_smooth()  # Blender 4.1+: smoothing via sharp edges; auto smooth by angle:
try:
    bpy.ops.object.shade_auto_smooth(angle=math.radians(30))
except Exception:
    pass  # older builds: fine, smooth shading only

bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
bpy.ops.object.mode_set(mode="OBJECT")
obj.data.materials.append(mat)
for m in extra_mats:
    obj.data.materials.append(m)

if a.bake:
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 4
    img = bpy.data.images.new(f"{a.kind}_basecolor", a.bake, a.bake)
    nodes = []
    for m in obj.data.materials:  # every material bakes into the same image (one texture, one draw-friendly atlas)
        node = m.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = img
        m.node_tree.nodes.active = node
        nodes.append((m, node))
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, margin=4)
    img.pack()
    # rewire: baked texture drives base colour, procedural nodes removed
    for m, node in nodes:
        nt = m.node_tree
        for n in [n for n in nt.nodes if n.type in ("TEX_NOISE", "TEX_WAVE", "VALTORGB")]:
            nt.nodes.remove(n)
        nt.links.new(node.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
    if extra_mats:  # one baked texture now covers all slots: merge to a single material = one draw call
        for p in obj.data.polygons:
            p.material_index = 0
        while len(obj.data.materials) > 1:
            obj.data.materials.pop(index=1)
else:
    # no bake: the glTF exporter cannot translate noise/wave/ramp nodes, so fall back to flat base-colour factors
    for m in obj.data.materials:
        nt = m.node_tree
        ramp = next(n for n in nt.nodes if n.type == "VALTORGB")
        flat = [(x + y) / 2 for x, y in zip(ramp.color_ramp.elements[0].color, ramp.color_ramp.elements[1].color)]
        for n in [n for n in nt.nodes if n.type in ("TEX_NOISE", "TEX_WAVE", "VALTORGB")]:
            nt.nodes.remove(n)
        nt.nodes["Principled BSDF"].inputs["Base Color"].default_value = flat

final_tris = tri_count(obj)
bpy.ops.export_scene.gltf(filepath=a.out, export_format="GLB", export_yup=True, export_apply=True)
print("RESULT " + json.dumps({"out": a.out, "kind": a.kind, "tris": final_tris, "verts": len(obj.data.vertices),
                              "baked": bool(a.bake), "blender": bpy.app.version_string}))
