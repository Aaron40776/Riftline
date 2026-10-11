"""Procedural rigged + animated low-poly biped -> GLB, headless (tested on Blender 5.2.2 LTS).

  blender -b --factory-startup --python-exit-code 1 -P rig_creature.py -- --out creature.glb \
      [--max-tris 1500] [--fps 30] [--color 0.25,0.5,0.3]

Pipeline it demonstrates (reuse the pieces for real characters):
  joint graph -> Skin modifier mesh -> armature from the same joints -> automatic (heat) weights with
  envelope fallback -> one Action per clip (Idle loop, Walk loop, Attack one-shot), each pushed to its own
  NLA track -> glTF export with skins + all actions -> RESULT line with bone/clip/weight stats.
Root motion is NOT baked into Walk (in-place cycle); the game moves the object.
Loops: first and last keys are identical so the clip loops without a pop.
"""
import argparse
import json
import math
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
ap.add_argument("--max-tris", type=int, default=1500)
ap.add_argument("--fps", type=int, default=30)
ap.add_argument("--color", default="0.22,0.45,0.28")
a = ap.parse_args(argv)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = a.fps

# ---- joints (Blender: Z up, -Y forward, metres) and skin radii ----
J = {"hips": (0, 0, 0.92), "spine": (0, 0, 1.18), "chest": (0, 0, 1.42), "head": (0, 0, 1.78),
     "shoulder.L": (0.24, 0, 1.40), "elbow.L": (0.42, 0, 1.15), "hand.L": (0.50, -0.04, 0.92),
     "hip.L": (0.12, 0, 0.90), "knee.L": (0.14, -0.04, 0.50), "foot.L": (0.14, 0, 0.06)}
for k in [k for k in J if k.endswith(".L")]:
    x, y, z = J[k]
    J[k[:-2] + ".R"] = (-x, y, z)
R = {"hips": 0.17, "spine": 0.19, "chest": 0.21, "head": 0.17, "shoulder": 0.08, "elbow": 0.065, "hand": 0.075,
     "hip": 0.09, "knee": 0.075, "foot": 0.08}
EDGES = [("hips", "spine"), ("spine", "chest"), ("chest", "head")]
for s in ("L", "R"):
    EDGES += [("chest", f"shoulder.{s}"), (f"shoulder.{s}", f"elbow.{s}"), (f"elbow.{s}", f"hand.{s}"),
              ("hips", f"hip.{s}"), (f"hip.{s}", f"knee.{s}"), (f"knee.{s}", f"foot.{s}")]
# bones: name -> (head joint, tail joint, parent)
BONES = {"hips": ("hips", "spine", None), "spine": ("spine", "chest", "hips"), "head": ("chest", "head", "spine")}
for s in ("L", "R"):
    BONES.update({f"upper_arm.{s}": (f"shoulder.{s}", f"elbow.{s}", "spine"),
                  f"forearm.{s}": (f"elbow.{s}", f"hand.{s}", f"upper_arm.{s}"),
                  f"thigh.{s}": (f"hip.{s}", f"knee.{s}", "hips"),
                  f"shin.{s}": (f"knee.{s}", f"foot.{s}", f"thigh.{s}")})

# ---- mesh via Skin modifier ----
names = list(J)
me = bpy.data.meshes.new("body")
me.from_pydata([J[n] for n in names], [(names.index(u), names.index(v)) for u, v in EDGES], [])
body = bpy.data.objects.new("creature_body", me)
scene.collection.objects.link(body)
bpy.context.view_layer.objects.active = body
sk = body.modifiers.new("skin", "SKIN")
for i, n in enumerate(names):
    r = R[n.split(".")[0]]
    me.skin_vertices[0].data[i].radius = (r, r)
    me.skin_vertices[0].data[i].use_root = n == "hips"
sub = body.modifiers.new("sub", "SUBSURF")
sub.levels = 1
for m in list(body.modifiers):
    bpy.ops.object.modifier_apply(modifier=m.name)
tris = sum(len(p.vertices) - 2 for p in me.polygons)
if tris > a.max_tris:
    d = body.modifiers.new("dec", "DECIMATE")
    d.ratio = a.max_tris / tris * 0.98
    bpy.ops.object.modifier_apply(modifier=d.name)
body.select_set(True)  # shade_smooth only touches selected objects; data-API objects start unselected
bpy.ops.object.shade_smooth(keep_sharp_edges=False)
mat = bpy.data.materials.new("skin")
mat.use_nodes = True
mat.use_backface_culling = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (*[float(c) for c in a.color.split(",")], 1)
bsdf.inputs["Roughness"].default_value = 0.6
me.materials.append(mat)

# ---- armature ----
arm_data = bpy.data.armatures.new("rig")
rig = bpy.data.objects.new("creature", arm_data)
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
eb = {}
for bn, (h, t, p) in BONES.items():
    b = arm_data.edit_bones.new(bn)
    b.head, b.tail = J[h], J[t]
    b.roll = 0
    eb[bn] = b
for bn, (h, t, p) in BONES.items():
    if p:
        eb[bn].parent = eb[p]
        eb[bn].use_connect = J[BONES[p][1]] == J[h]
bpy.ops.object.mode_set(mode="OBJECT")

# ---- skinning: heat weights, envelope fallback ----
bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
unweighted = sum(1 for v in me.vertices if not any(g.weight > 0 for g in v.groups))
method = "heat"
if unweighted > len(me.vertices) * 0.02:
    for vg in list(body.vertex_groups):
        body.vertex_groups.remove(vg)
    bpy.ops.object.parent_set(type="ARMATURE_ENVELOPE")
    method = "envelope"
    unweighted = sum(1 for v in me.vertices if not any(g.weight > 0 for g in v.groups))

# ---- animation clips ----
rig.animation_data_create()
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="POSE")
for pb in rig.pose.bones:
    pb.rotation_mode = "XYZ"


def clip(name, length_s, keys, loop=True):
    """keys: {frame_fraction: {bone: (rx, ry, rz) degrees | ("loc", x, y, z)}}"""
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data.action = act
    n = round(length_s * a.fps)
    for frac, pose in sorted(keys.items()):
        f = round(frac * n)
        for pb in rig.pose.bones:
            pb.rotation_euler = (0, 0, 0)
            pb.location = (0, 0, 0)
        for bn, val in pose.items():
            pb = rig.pose.bones[bn]
            if val[0] == "loc":
                pb.location = val[1:]
            else:
                pb.rotation_euler = [math.radians(v) for v in val]
        for pb in rig.pose.bones:
            pb.keyframe_insert("rotation_euler", frame=f)
            if pb.name == "hips":  # only the root bone translates (bob); fewer channels = smaller file
                pb.keyframe_insert("location", frame=f)
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, act)
    rig.animation_data.action = None
    return n


def walk_pose(ph):
    s = math.sin(ph * 2 * math.pi)
    c = math.cos(ph * 2 * math.pi)
    return {"thigh.L": (32 * s, 0, 0), "thigh.R": (-32 * s, 0, 0),
            "shin.L": (-max(0, -c) * 40, 0, 0), "shin.R": (-max(0, c) * 40, 0, 0),
            "upper_arm.L": (-24 * s, 0, 0), "upper_arm.R": (24 * s, 0, 0),
            "forearm.L": (-15, 0, 0), "forearm.R": (-15, 0, 0),
            "hips": ("loc", 0, 0.03 * abs(math.cos(ph * 2 * math.pi)), 0), "spine": (3, 0, 6 * s)}


lengths = {}
lengths["Idle"] = clip("Idle", 2.0, {f: {"spine": (2.5 * math.sin(f * 2 * math.pi), 0, 0),
                                       "head": (-2 * math.sin(f * 2 * math.pi), 0, 0),
                                       "upper_arm.L": (0, 0, -4 - 2 * math.sin(f * 2 * math.pi)),
                                       "upper_arm.R": (0, 0, 4 + 2 * math.sin(f * 2 * math.pi))}
                                   for f in (0, 0.25, 0.5, 0.75, 1.0)})
lengths["Walk"] = clip("Walk", 1.0, {f: walk_pose(f) for f in (0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1.0)})
lengths["Attack"] = clip("Attack", 0.8, {0: {}, 0.3: {"upper_arm.R": (-110, 0, 20), "forearm.R": (-40, 0, 0), "spine": (0, 0, -20)},
                                         0.45: {"upper_arm.R": (40, 0, -10), "forearm.R": (-5, 0, 0), "spine": (8, 0, 25)},
                                         1.0: {}}, loop=False)
bpy.ops.object.mode_set(mode="OBJECT")
scene.frame_start, scene.frame_end = 0, max(lengths.values())

bpy.ops.export_scene.gltf(filepath=a.out, export_format="GLB", export_yup=True, export_skins=True,
                          export_animations=True, export_animation_mode="ACTIONS", export_apply=False)
print("RESULT " + json.dumps({"out": a.out, "bones": len(arm_data.bones), "tris": sum(len(p.vertices) - 2 for p in me.polygons),
                              "verts": len(me.vertices), "weights": method, "unweighted_verts": unweighted,
                              "clips": {k: round(v / a.fps, 3) for k, v in lengths.items()}, "blender": bpy.app.version_string}))
