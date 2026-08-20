# IsoCity 3D assets via Blender Lab MCP (execute_blender_code).
# Cada asset se construye en una escena EXPORT_* y se exporta como GLB
# sin tocar la escena del usuario.
import bpy
import math
import os

OUT_DIR = "/Users/arturodominguez/projects/isogame/grok/public/assets/models"
os.makedirs(OUT_DIR, exist_ok=True)

_user = [s for s in bpy.data.scenes if not s.name.startswith("EXPORT_")]
USER_SCENE = _user[0] if _user else bpy.context.scene
USER_WINDOW_SCENE = USER_SCENE

for s in list(bpy.data.scenes):
    if s.name.startswith("EXPORT_"):
        bpy.data.scenes.remove(s)
for o in list(bpy.data.objects):
    if not o.users_scene:
        bpy.data.objects.remove(o)


def srgb(hex_str):
    hex_str = hex_str.lstrip("#")
    r, g, b = (int(hex_str[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return tuple(round(c ** 2.2, 5) for c in (r, g, b))


def make_mat(name, hex_str, emission=0.0, metallic=0.0, roughness=0.9):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*srgb(hex_str), 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission > 0.0:
        bsdf.inputs["Emission Color"].default_value = (*srgb(hex_str), 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission
    return m


def _finish(obj, name, mat, bevel=0.0):
    obj.name = name
    if mat:
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = False
    if bevel > 0.0:
        mod = obj.modifiers.new("bev", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def cube(name, loc, dims, mat, bevel=0.0, rot=None):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.active_object
    o.scale = (dims[0] / 2, dims[1] / 2, dims[2] / 2)
    bpy.ops.object.transform_apply(scale=True)
    if rot:
        o.rotation_euler = rot
        bpy.ops.object.transform_apply(rotation=True)
    return _finish(o, name, mat, bevel)


def cyl(name, radius, depth, loc, mat, vertices=8, rot=None, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    o = bpy.context.active_object
    if rot:
        o.rotation_euler = rot
        bpy.ops.object.transform_apply(rotation=True)
    return _finish(o, name, mat, bevel)


def ico(name, radius, loc, mat, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=radius, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    return _finish(o, name, mat)


def cone(name, r1, r2, depth, loc, mat, vertices=6):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=depth, location=loc)
    return _finish(bpy.context.active_object, name, mat)


def origin_at(obj, point):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.context.scene.cursor.location = point
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    obj.select_set(False)


def join_parts(name, objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    return o


def export_glb(filename):
    path = os.path.join(OUT_DIR, filename)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_animations=False,
        export_skins=False,
        export_cameras=False,
        export_lights=False,
        use_selection=True,
        use_visible=True,
        use_active_scene=True,
    )
    return path


def fresh_scene(name):
    scn = bpy.data.scenes.new(name)
    bpy.context.window.scene = scn
    for o in list(scn.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    return scn


def cleanup_scene(scn):
    bpy.context.window.scene = USER_WINDOW_SCENE
    bpy.data.scenes.remove(scn)


def cube_geom(loc, dims, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.active_object
    o.scale = (dims[0] / 2, dims[1] / 2, dims[2] / 2)
    bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        mod = o.modifiers.new("bev", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return o


def prism_roof(name, half=0.46, z0=0.68, z1=1.0):
    v = [
        (-half, -half, z0), (half, -half, z0), (half, half, z0), (-half, half, z0),
        (-half, 0, z1), (half, 0, z1),
    ]
    f = [
        (0, 1, 5, 4),
        (3, 2, 5, 4),
        (0, 4, 3),
        (1, 2, 5),
        (0, 3, 2, 1),
    ]
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(v, [], f)
    o = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(o)
    return o


def join_all(name, objs):
    if len(objs) == 1:
        o = objs[0]
        o.name = name
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode="OBJECT")
        return o
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    return o


SPLIT = 0.5


def uv_bands(obj, roof_z=None):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=1.0, correct_aspect=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    me = obj.data
    me.update()
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        us = [uv[li].uv.x for li in poly.loop_indices]
        vs = [uv[li].uv.y for li in poly.loop_indices]
        u0, u1 = min(us), max(us)
        v0, v1 = min(vs), max(vs)
        du = (u1 - u0) or 1.0
        dv = (v1 - v0) or 1.0
        is_roof = abs(poly.normal.z) >= 0.5 or (roof_z is not None and poly.center.z > roof_z)
        for j, li in enumerate(poly.loop_indices):
            nu = (us[j] - u0) / du
            nv = (vs[j] - v0) / dv
            uv[li].uv.x = nu
            uv[li].uv.y = (nv * SPLIT) if is_roof else (SPLIT + nv * (1.0 - SPLIT))


def export_building(obj, filename):
    mat = bpy.data.materials.get("BuildingUV") or bpy.data.materials.new("BuildingUV")
    if not obj.data.materials:
        obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = False
    return export_glb(filename)


M = {
    "Trunk": make_mat("Trunk", "#6a4a2c", roughness=0.85),
    "Bark": make_mat("Bark", "#4a321c", roughness=0.95),
    "LeafA": make_mat("LeafA", "#3a7c36"),
    "LeafB": make_mat("LeafB", "#56a04a"),
    "LeafC": make_mat("LeafC", "#286028"),
    "LeafD": make_mat("LeafD", "#1e4a1e"),
    "LampPost": make_mat("LampPost", "#1a1a1c", metallic=0.35, roughness=0.45),
    "LampGlow": make_mat("LampGlow", "#f4dc7a", emission=2.4),
    "CarPaint": make_mat("CarPaint", "#c83c38", metallic=0.18, roughness=0.32),
    "CarGlass": make_mat("CarGlass", "#1e334c", roughness=0.12),
    "Tire": make_mat("Tire", "#1a1410", roughness=0.95),
    "Hub": make_mat("Hub", "#c4c0b8", metallic=0.85, roughness=0.28),
    "Chrome": make_mat("Chrome", "#d0d6dc", metallic=1.0, roughness=0.12),
    "CarLight": make_mat("CarLight", "#fff2c0", emission=2.0),
    "TailLight": make_mat("TailLight", "#c02018", emission=1.4),
    "Grill": make_mat("Grill", "#2a2c30", metallic=0.6, roughness=0.4),
    "Hull": make_mat("Hull", "#ececec", roughness=0.45),
    "Sail": make_mat("Sail", "#f2efe8", roughness=0.8),
    "Mast": make_mat("Mast", "#5a381c", roughness=0.85),
    "BoatCab": make_mat("BoatCab", "#8a887e", roughness=0.55),
    "Rope": make_mat("Rope", "#c4a070"),
    "Skin": make_mat("Skin", "#e4b494"),
    "Hair": make_mat("Hair", "#2a1c14"),
    "Shirt": make_mat("Shirt", "#f05638"),
    "ShirtDark": make_mat("ShirtDark", "#c83c28"),
    "Pants": make_mat("Pants", "#2c3c5c"),
    "Shoe": make_mat("Shoe", "#1a1410"),
    "Dark": make_mat("Dark", "#1a1210"),
    "Piling": make_mat("Piling", "#3a2414"),
    "Pier": make_mat("Pier", "#7a5234"),
    "Band": make_mat("Band", "#5a381c"),
    "Rust": make_mat("Rust", "#a05030", metallic=0.25, roughness=0.7),
}

exported = []


def add_leaves(points):
    for i, (name, r, loc, mat, sc) in enumerate(points):
        ico(name, r, loc, M[mat], scale=sc)


# TREE
scn = fresh_scene("EXPORT_tree")
cyl("Trunk", 0.075, 0.38, (0, 0, 0.19), M["Trunk"], vertices=8)
cyl("TrunkFlare", 0.10, 0.08, (0, 0, 0.04), M["Bark"], vertices=8)
cyl("BranchA", 0.032, 0.28, (0.10, 0.04, 0.40), M["Trunk"], vertices=6, rot=(0.85, 0.15, 0.55))
cyl("BranchB", 0.028, 0.24, (-0.12, -0.05, 0.44), M["Trunk"], vertices=6, rot=(-0.75, 0.2, -0.6))
cyl("BranchC", 0.022, 0.18, (0.02, 0.12, 0.52), M["Bark"], vertices=6, rot=(0.4, 1.1, 0.2))
add_leaves([
    ("LeafMain", 0.30, (0.0, 0.0, 0.62), "LeafA", (1.05, 1.0, 0.9)),
    ("LeafTop", 0.20, (0.08, 0.05, 0.84), "LeafB", (1, 1, 1)),
    ("LeafSide", 0.18, (-0.18, -0.06, 0.66), "LeafC", (1.1, 0.95, 0.85)),
    ("LeafBack", 0.16, (0.12, -0.14, 0.70), "LeafB", (1, 1, 0.9)),
    ("LeafLow", 0.14, (-0.08, 0.14, 0.52), "LeafD", (1.15, 1.1, 0.7)),
    ("LeafFar", 0.13, (0.22, 0.08, 0.58), "LeafC", (1, 1, 0.8)),
    ("LeafTip", 0.11, (-0.04, -0.02, 0.94), "LeafA", (1, 1, 1)),
])
exported.append(export_glb("tree.glb"))
cleanup_scene(scn)

# TREE TALL
scn = fresh_scene("EXPORT_tree_tall")
cyl("Trunk", 0.065, 0.58, (0, 0, 0.29), M["Trunk"], vertices=8)
cyl("TrunkFlare", 0.09, 0.08, (0, 0, 0.04), M["Bark"], vertices=8)
cyl("BranchA", 0.028, 0.26, (0.08, 0.03, 0.52), M["Trunk"], vertices=6, rot=(0.7, 0.1, 0.45))
cyl("BranchB", 0.024, 0.22, (-0.10, -0.04, 0.62), M["Trunk"], vertices=6, rot=(-0.65, 0.25, -0.5))
add_leaves([
    ("LeafMain", 0.24, (0, 0, 0.78), "LeafA", (0.85, 0.85, 1.2)),
    ("LeafTop", 0.16, (0.04, 0.03, 1.04), "LeafB", (1, 1, 1)),
    ("LeafSide", 0.14, (-0.12, -0.05, 0.86), "LeafC", (1, 1, 0.9)),
    ("LeafMid", 0.15, (0.10, -0.08, 0.70), "LeafB", (1.1, 1, 0.8)),
    ("LeafHigh", 0.12, (-0.06, 0.08, 0.96), "LeafD", (1, 1, 1)),
    ("LeafLow", 0.12, (0.14, 0.06, 0.58), "LeafC", (1.2, 1.1, 0.7)),
])
exported.append(export_glb("tree_tall.glb"))
cleanup_scene(scn)

# TREE SMALL / BUSH
scn = fresh_scene("EXPORT_tree_sm")
cyl("Trunk", 0.05, 0.14, (0, 0, 0.07), M["Trunk"], vertices=6)
add_leaves([
    ("LeafMain", 0.22, (0, 0, 0.28), "LeafA", (1.2, 1.15, 0.72)),
    ("LeafSide", 0.14, (0.12, -0.05, 0.24), "LeafB", (1, 1, 0.8)),
    ("LeafSide2", 0.13, (-0.10, 0.08, 0.22), "LeafC", (1.1, 1, 0.75)),
    ("LeafFront", 0.11, (0.04, 0.12, 0.20), "LeafD", (1, 1.1, 0.7)),
    ("LeafTop", 0.10, (-0.02, -0.02, 0.38), "LeafB", (1, 1, 1)),
])
exported.append(export_glb("tree_sm.glb"))
cleanup_scene(scn)

# LAMP
scn = fresh_scene("EXPORT_lamp")
cyl("LampBase", 0.07, 0.08, (0, 0, 0.04), M["LampPost"], vertices=8)
cyl("LampPole", 0.028, 0.92, (0, 0, 0.50), M["LampPost"], vertices=8)
cube("LampArm", (0.16, 0, 0.94), (0.34, 0.05, 0.045), M["LampPost"], bevel=0.01)
cube("LampBrace", (0.08, 0, 0.88), (0.18, 0.03, 0.03), M["LampPost"], rot=(0, 0, 0.4))
cube("LampHousing", (0.34, 0, 0.88), (0.12, 0.12, 0.08), M["LampPost"], bevel=0.02)
ico("LampGlow", 0.07, (0.34, 0, 0.82), M["LampGlow"], scale=(1.1, 1.1, 0.7))
cone("LampShade", 0.11, 0.04, 0.06, (0.34, 0, 0.92), M["LampPost"], vertices=8)
exported.append(export_glb("lamp.glb"))
cleanup_scene(scn)

# CAR
scn = fresh_scene("EXPORT_car")
cube("CarBody", (0, 0, 0.17), (0.98, 0.46, 0.16), M["CarPaint"], bevel=0.05)
cube("CarSkirt", (0, 0, 0.095), (0.96, 0.48, 0.05), M["Grill"], bevel=0.01)
cube("CarCabin", (-0.06, 0, 0.32), (0.48, 0.40, 0.16), M["CarGlass"], bevel=0.04)
cube("CarRoof", (-0.06, 0, 0.41), (0.42, 0.36, 0.04), M["CarPaint"], bevel=0.02)
cube("BumperF", (0.50, 0, 0.13), (0.08, 0.44, 0.10), M["Chrome"], bevel=0.02)
cube("BumperR", (-0.50, 0, 0.13), (0.08, 0.44, 0.10), M["Chrome"], bevel=0.02)
cube("Grill", (0.48, 0, 0.18), (0.04, 0.28, 0.07), M["Grill"])
cube("Plate", (0.51, 0, 0.12), (0.02, 0.14, 0.06), M["Chrome"])
for i, (wx, wy) in enumerate(((0.30, 0.22), (0.30, -0.22), (-0.30, 0.22), (-0.30, -0.22))):
    cyl(f"Wheel{i}", 0.09, 0.07, (wx, wy, 0.09), M["Tire"], vertices=12, rot=(math.pi / 2, 0, 0))
    cyl(f"Hub{i}", 0.045, 0.08, (wx, wy, 0.09), M["Hub"], vertices=10, rot=(math.pi / 2, 0, 0))
for wy in (0.14, -0.14):
    cube("HeadLight", (0.50, wy, 0.19), (0.05, 0.09, 0.055), M["CarLight"], bevel=0.015)
    cube("TailLight", (-0.50, wy, 0.19), (0.05, 0.09, 0.05), M["TailLight"], bevel=0.012)
cube("MirrorL", (0.16, 0.26, 0.28), (0.06, 0.03, 0.05), M["CarPaint"], bevel=0.01)
cube("MirrorR", (0.16, -0.26, 0.28), (0.06, 0.03, 0.05), M["CarPaint"], bevel=0.01)
cube("WingL", (0.16, 0.245, 0.28), (0.04, 0.02, 0.03), M["Chrome"])
cube("WingR", (0.16, -0.245, 0.28), (0.04, 0.02, 0.03), M["Chrome"])
exported.append(export_glb("car.glb"))
cleanup_scene(scn)

# BOAT
scn = fresh_scene("EXPORT_boat")
cube("Hull", (0, 0, 0.11), (1.28, 0.50, 0.18), M["Hull"], bevel=0.08)
cube("Bow", (0.52, 0, 0.12), (0.42, 0.32, 0.14), M["Hull"], bevel=0.08, rot=(0, 0, 0.0))
cube("BowTip", (0.78, 0, 0.13), (0.22, 0.18, 0.10), M["Hull"], bevel=0.05)
cube("Trim", (0, 0, 0.20), (1.22, 0.48, 0.04), M["BoatCab"], bevel=0.01)
cube("Deck", (0, 0, 0.22), (1.10, 0.42, 0.03), M["Hull"])
cube("BoatCab", (-0.22, 0, 0.34), (0.46, 0.36, 0.22), M["Hull"], bevel=0.04)
cube("CabWin", (-0.10, 0, 0.38), (0.20, 0.38, 0.10), M["CarGlass"])
cube("CabinRoof", (-0.22, 0, 0.47), (0.48, 0.38, 0.04), M["BoatCab"], bevel=0.01)
for sx in (-0.16, 0.16):
    cube("RailPost", (-0.05, sx, 0.28), (0.03, 0.03, 0.14), M["Chrome"])
    cube("RailPost2", (0.35, sx, 0.26), (0.03, 0.03, 0.12), M["Chrome"])
cube("Rail", (0.12, 0.16, 0.34), (0.7, 0.025, 0.025), M["Chrome"])
cube("Rail2", (0.12, -0.16, 0.34), (0.7, 0.025, 0.025), M["Chrome"])
cyl("Mast", 0.022, 0.72, (0.10, 0, 0.58), M["Mast"], vertices=8)
cyl("Boom", 0.016, 0.55, (0.32, 0, 0.38), M["Mast"], vertices=6, rot=(0, math.pi / 2, 0))
cyl("Stay", 0.008, 0.5, (0.28, 0, 0.55), M["Rope"], vertices=5, rot=(0, 0.7, 0))
mesh = bpy.data.meshes.new("SailMesh")
verts = [(0.10, 0.01, 0.30), (0.10, 0.01, 0.88), (0.62, 0.01, 0.36)]
mesh.from_pydata(verts, [], [(0, 1, 2)])
sail = bpy.data.objects.new("Sail", mesh)
scn.collection.objects.link(sail)
sail.data.materials.append(M["Sail"])
sol = sail.modifiers.new("sol", "SOLIDIFY")
sol.thickness = 0.014
bpy.context.view_layer.objects.active = sail
sail.select_set(True)
bpy.ops.object.modifier_apply(modifier=sol.name)
exported.append(export_glb("boat.glb"))
cleanup_scene(scn)

# PILING
scn = fresh_scene("EXPORT_piling")
cyl("Piling", 0.065, 0.70, (0, 0, -0.18), M["Piling"], vertices=8)
cyl("Wrap", 0.072, 0.08, (0, 0, 0.02), M["Band"], vertices=8)
cyl("Wrap2", 0.072, 0.06, (0, 0, -0.22), M["Rust"], vertices=8)
cube("Cap", (0, 0, 0.20), (0.16, 0.16, 0.06), M["Pier"], bevel=0.012)
cube("BoltA", (0.05, 0.05, 0.24), (0.03, 0.03, 0.02), M["Rust"])
cube("BoltB", (-0.05, -0.05, 0.24), (0.03, 0.03, 0.02), M["Rust"])
exported.append(export_glb("piling.glb"))
cleanup_scene(scn)

# CHARACTER
scn = fresh_scene("EXPORT_char")
F = -1.0
for side, sx in (("L", -0.075), ("R", 0.075)):
    leg = cube(f"legmesh{side}", (sx, 0, 0.225), (0.11, 0.12, 0.27), M["Pants"], bevel=0.02)
    shoe = cube(f"shoemesh{side}", (sx, 0.02 * -F, 0.035), (0.12, 0.17, 0.07), M["Shoe"], bevel=0.02)
    joined = join_parts(f"Leg{side}", [leg, shoe])
    origin_at(joined, (sx, 0, 0.36))
for side, sx in (("L", -0.205), ("R", 0.205)):
    arm = cube(f"Arm{side}", (sx, 0, 0.515), (0.09, 0.10, 0.29), M["ShirtDark"], bevel=0.02)
    origin_at(arm, (sx, 0, 0.66))
cube("Body", (0, 0, 0.515), (0.30, 0.18, 0.31), M["Shirt"], bevel=0.04)
cube("Collar", (0, 0, 0.66), (0.22, 0.16, 0.05), M["ShirtDark"], bevel=0.01)
head = cube("headmesh", (0, 0, 0.79), (0.22, 0.21, 0.20), M["Skin"], bevel=0.04)
hair = cube("hairmesh", (0, 0.015, 0.905), (0.24, 0.23, 0.09), M["Hair"], bevel=0.03)
hairB = cube("hairback", (0, 0.04, 0.84), (0.20, 0.08, 0.14), M["Hair"], bevel=0.02)
eyeL = cube("eyeLmesh", (-0.05, 0.105 * -F, 0.80), (0.045, 0.02, 0.045), M["Dark"])
eyeR = cube("eyeRmesh", (0.05, 0.105 * -F, 0.80), (0.045, 0.02, 0.045), M["Dark"])
join_parts("Head", [head, hair, hairB, eyeL, eyeR])
exported.append(export_glb("character.glb"))
cleanup_scene(scn)

# BUILDINGS
scn = fresh_scene("EXPORT_bldA")
a = join_all("BuildingA", [
    cube_geom((0, 0, 0.5), (0.92, 0.92, 1.0)),
    cube_geom((0, 0, 1.03), (0.98, 0.98, 0.07)),
    cube_geom((0, 0, 0.03), (0.96, 0.96, 0.06)),
    cube_geom((0, 0.48, 0.16), (0.20, 0.05, 0.32)),
    cube_geom((0, 0.47, 0.02), (0.26, 0.10, 0.04)),
])
uv_bands(a)
exported.append(export_building(a, "building_a.glb"))
cleanup_scene(scn)

scn = fresh_scene("EXPORT_bldB")
b = join_all("BuildingB", [
    cube_geom((0, 0, 0.36), (0.92, 0.92, 0.72)),
    cube_geom((0, 0, 0.86), (0.58, 0.58, 0.28), bevel=0.02),
    cube_geom((0, 0, 0.74), (0.96, 0.96, 0.06)),
    cube_geom((0, 0.48, 0.14), (0.18, 0.04, 0.26)),
    cube_geom((0.12, 0.12, 1.04), (0.16, 0.16, 0.12)),
])
uv_bands(b)
exported.append(export_building(b, "building_b.glb"))
cleanup_scene(scn)

scn = fresh_scene("EXPORT_bldC")
c = join_all("BuildingC", [
    cube_geom((0, 0, 0.44), (0.92, 0.92, 0.88)),
    cube_geom((0, 0, 0.90), (0.98, 0.98, 0.05)),
    cube_geom((-0.2, 0.15, 0.98), (0.30, 0.26, 0.14), bevel=0.015),
    cube_geom((0.18, -0.18, 0.96), (0.24, 0.22, 0.10), bevel=0.015),
    cube_geom((0.22, 0.22, 1.02), (0.16, 0.16, 0.18)),
    cube_geom((0, 0.48, 0.14), (0.16, 0.04, 0.24)),
])
uv_bands(c, roof_z=0.88)
exported.append(export_building(c, "building_c.glb"))
cleanup_scene(scn)

scn = fresh_scene("EXPORT_bldD")
d = join_all("BuildingD", [
    cube_geom((0, 0, 0.34), (0.92, 0.92, 0.68)),
    prism_roof("RoofD"),
    cube_geom((0.22, 0.0, 0.92), (0.10, 0.10, 0.22)),
    cube_geom((0, 0.48, 0.14), (0.18, 0.04, 0.26)),
    cube_geom((0, 0, 0.70), (0.96, 0.96, 0.04)),
])
uv_bands(d)
exported.append(export_building(d, "building_d.glb"))
cleanup_scene(scn)

scn = fresh_scene("EXPORT_bldE")
e = join_all("BuildingE", [
    cube_geom((0, 0, 0.5), (0.92, 0.55, 1.0)),
    cube_geom((0, 0, 0.5), (0.55, 0.92, 1.0)),
    cube_geom((0, 0, 1.03), (0.98, 0.60, 0.07)),
    cube_geom((0, 0, 1.03), (0.60, 0.98, 0.07)),
    cube_geom((0, 0.48, 0.14), (0.16, 0.04, 0.24)),
])
uv_bands(e)
exported.append(export_building(e, "building_e.glb"))
cleanup_scene(scn)

result = {
    "exported": [os.path.basename(p) for p in exported],
    "count": len(exported),
    "out": OUT_DIR,
    "user_scene": bpy.context.window.scene.name,
}
