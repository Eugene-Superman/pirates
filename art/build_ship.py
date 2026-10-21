"""
Pirate ship for the game, built from code.

Run:
  in Blender: Scripting tab -> Open -> build_ship.py -> Run Script
  from a terminal: blender --background --python build_ship.py

The script deletes the "Ship" collection (if any) and builds the ship from scratch.
Textures go to the textures/ folder next to the .blend (or next to the script).

Axes and scale match the game (src/client/scene/models/ship3d.ts):
  1 Blender unit = 1 game unit
  the bow points to +X, port side to +Y, starboard to -Y, Z up
  waterline at Z = 0
"""

import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

# ---------------------------------------------------------------------------
# Dimensions
# ---------------------------------------------------------------------------

KEEL_Z = -3.0
DECK_Z = 10.5  # main deck
QD_Z = 16.0  # quarterdeck, the raised deck at the stern
FC_Z = 13.6  # forecastle, the raised deck at the bow
QD_FRONT = -18.0  # front wall of the quarterdeck
FC_BACK = 27.0  # back wall of the forecastle
BEAM = 13.0  # largest half-width of the hull
WALL = 0.6  # hull wall thickness

BRACE = 0.22  # radians: the yards are turned a little so the sails are visible from the side too

# Cartoon palette: saturated warm colors, dark outline (sRGB)
COLORS = {
    "hull": 0x9B5A2E,
    "hull_dark": 0x4E2C1A,
    "gold": 0xF5B83D,
    "interior": 0xC2412D,
    "deck": 0xD69A55,
    "castle": 0xA9653A,
    "mast": 0x7A4826,
    "sail": 0xFFF3D6,
    "sail_trim": 0xE9CC98,
    "flag": 0xD7372A,
    "pennant": 0xE04A2F,
    "iron": 0x3A3A44,
    "port": 0x2A1810,
    "lid": 0xD0402C,
    "rope": 0x5A3A22,
    "glass": 0xFFD66B,
    "crate": 0xD39A5A,
    "grate": 0x4A2E1A,
    "outline": 0x2B1A10,
}

# Ink outline thickness (in the game 1 unit = 2.8 atlas pixels)
OUTLINE_HULL = 0.35
OUTLINE = {
    "Castles": 0.18,
    "Spars": 0.12,
    "GoldTrim": 0.15,
    "Cargo": 0.18,
    "Iron": 0.15,
    "Lanterns": 0.12,
    "GunportLids": 0.12,
    "Hatches": 0.18,
}


def script_dir():
    if bpy.data.filepath:
        return os.path.dirname(bpy.data.filepath)
    try:
        return os.path.dirname(os.path.abspath(__file__))
    except NameError:
        return os.getcwd()


OUT_DIR = os.environ.get("SHIP_OUT") or script_dir()
TEX_DIR = os.path.join(OUT_DIR, "textures")


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def srgb(hex_color):
    return [((hex_color >> s) & 0xFF) / 255 for s in (16, 8, 0)]


def linear(hex_color):
    out = []
    for c in srgb(hex_color):
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return out + [1.0]


# ---------------------------------------------------------------------------
# Hull shape
# ---------------------------------------------------------------------------


def x_bow(z):
    """The stem leans forward: the higher, the farther the bow"""
    return 34 + 0.9 * z - 0.012 * z * z


def x_stern(z):
    """The transom overhangs slightly backwards"""
    return -33 - 0.3 * z


def section(z):
    """Section width at height z (0..1): round bottom, and the sides lean inwards at the top"""
    widest = 6.0
    if z <= widest:
        t = (widest - z) / (widest - KEEL_Z)
        return max(0.0, 1 - t * t) ** 0.5
    return 1 - 0.0011 * (z - widest) ** 2


def plan(x, z):
    """Half-width at deck height depending on x: blunt bow, wide stern"""
    xs, xb = x_stern(z), x_bow(z)
    if x >= xb:
        return 0.0
    if x > 8:
        t = (x - 8) / (xb - 8)
        return BEAM * max(0.0, 1 - t * t) ** 0.62
    if x < -15:
        t = min(1.0, (-15 - x) / (-15 - xs))
        return BEAM * (1 - 0.25 * t**1.6)
    return BEAM


def half_width(x, z):
    return plan(x, z) * section(z)


def rail_z(x):
    """Top of the hull side: high quarterdeck at the stern, slightly raised forecastle at the bow"""
    return (
        12.6
        + 6.4 * smoothstep(-14, -21, x)
        + 1.2 * smoothstep(-30, -38, x)
        + 3.0 * smoothstep(23, 29, x)
        + 1.0 * smoothstep(36, 44, x)
    )


def hull_point(x, z, side):
    """Point on the hull side and its outward normal. side = +1 port, -1 starboard"""
    e = 0.05
    w = half_width(x, z)
    dwdx = (half_width(x + e, z) - half_width(x - e, z)) / (2 * e)
    dwdz = (half_width(x, z + e) - half_width(x, z - e)) / (2 * e)
    n = Vector((-dwdx, side, -dwdz)).normalized()
    return Vector((x, side * w, z)), n


def inner_width(x, z):
    return max(0.0, half_width(x, z) - WALL * 1.05)


# ---------------------------------------------------------------------------
# Textures (generated so the model doesn't depend on external files)
# ---------------------------------------------------------------------------


def save_image(name, rgba):
    """rgba: h x w x 4 array in sRGB 0..1, row 0 at the top"""
    os.makedirs(TEX_DIR, exist_ok=True)
    h, w, _ = rgba.shape
    old = bpy.data.images.get(name)
    if old:
        bpy.data.images.remove(old)
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.pixels.foreach_set(np.ascontiguousarray(rgba[::-1]).astype(np.float32).ravel())
    path = os.path.join(TEX_DIR, name + ".png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    img.pack()
    return img


def plank_texture(name, hex_color, rows=6, joints=2, seed=1, size=512):
    """Painted planks: each with its own tint, a light strip on top, dark seams and nails"""
    rng = np.random.default_rng(seed)
    ys = np.arange(size)[:, None].astype(float)
    xs = np.arange(size)[None, :].astype(float)
    row_h = size / rows
    row = (ys // row_h).astype(int)
    frac = (ys % row_h) / row_h  # 0 top of the plank, 1 bottom
    offsets = rng.random(rows) * size
    seg_len = size / joints
    shifted = (xs + offsets[row]) % size
    seg = (shifted // seg_len).astype(int)

    tone = 1 + 0.08 * (rng.random((rows, joints + 1)) * 2 - 1)
    shade = tone[row, seg] * np.ones_like(xs)
    shade = np.where((frac > 0.1) & (frac < 0.22), shade * 1.13, shade)  # highlight
    shade = np.where(frac > 0.84, shade * 0.86, shade)  # shadow under the plank
    shade = np.where(frac < 0.1, 0.42, shade)  # seam
    in_seg = shifted % seg_len
    shade = np.where(in_seg < 5, 0.5, shade)  # butt joint
    # Nails next to the joints
    for dx in (12.0, seg_len - 9.0):
        for fy in (0.38, 0.68):
            d2 = (in_seg - dx) ** 2 + ((frac - fy) * row_h) ** 2
            shade = np.where(d2 < 2.6**2, 0.5, shade)

    base = np.array(srgb(hex_color))
    rgb = np.clip(base[None, None, :] * shade[..., None], 0, 1)
    rgba = np.concatenate([rgb, np.ones((size, size, 1))], axis=2)
    return save_image(name, rgba)


def sail_texture(name, patch=False, size=512):
    """Canvas: soft gradient, darker border, seams and, optionally, a patch"""
    n = (np.arange(size) + 0.5) / size
    xs = n[None, :]
    ys = 1 - n[:, None]  # 0 bottom, 1 top
    base = np.array(srgb(COLORS["sail"]))
    trim = np.array(srgb(COLORS["sail_trim"]))
    shade = (1 - 0.07 * ys) * np.ones_like(xs)
    panels = 7
    shade = np.where(np.abs(((xs * panels) % 1) - 0.5) > 0.485, 0.93, shade)
    rgb = base[None, None, :] * shade[..., None]

    edge = np.minimum(np.minimum(xs, 1 - xs), np.minimum(ys, 1 - ys))
    rgb = np.where((edge < 0.035)[..., None], trim, rgb)

    if patch:
        x0, x1, y0, y1 = 0.58, 0.8, 0.22, 0.42
        inside = (xs > x0) & (xs < x1) & (ys > y0) & (ys < y1)
        rgb = np.where(inside[..., None], np.array(srgb(0xF7DFAE)), rgb)
        border = inside & ~((xs > x0 + 0.012) & (xs < x1 - 0.012) & (ys > y0 + 0.012) & (ys < y1 - 0.012))
        rgb = np.where(border[..., None], trim * 0.85, rgb)
        # Stitches around the patch
        ring = inside & ~((xs > x0 + 0.03) & (xs < x1 - 0.03) & (ys > y0 + 0.03) & (ys < y1 - 0.03)) & ~border
        dash = ((xs + ys) * 60 % 1) < 0.5
        near = (np.minimum(np.minimum(np.abs(xs - x0), np.abs(xs - x1)), np.minimum(np.abs(ys - y0), np.abs(ys - y1))) < 0.026) & (
            np.minimum(np.minimum(np.abs(xs - x0), np.abs(xs - x1)), np.minimum(np.abs(ys - y0), np.abs(ys - y1))) > 0.019
        )
        rgb = np.where((ring & dash & near)[..., None], np.array(srgb(0xB0884F)), rgb)

    rgba = np.concatenate([np.clip(rgb, 0, 1), np.ones((size, size, 1))], axis=2)
    return save_image(name, rgba)


def flag_texture(name, size=256):
    """Red flag with a gold border and a diamond"""
    n = (np.arange(size) + 0.5) / size
    xs = n[None, :]
    ys = 1 - n[:, None]
    rgb = np.empty((size, size, 3))
    rgb[:] = np.array(srgb(COLORS["flag"]))
    gold = np.array(srgb(COLORS["gold"]))
    edge = np.minimum(np.minimum(xs, 1 - xs), np.minimum(ys, 1 - ys))
    rgb[(edge < 0.07) & (edge > 0.035)] = gold
    rgb[np.abs(xs - 0.5) / 0.22 + np.abs(ys - 0.5) / 0.3 < 1] = gold
    rgba = np.concatenate([rgb, np.ones((size, size, 1))], axis=2)
    return save_image(name, rgba)


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------


def material(name, color=None, image=None, rough=0.85, metal=0.0, emission=0.0, two_sided=False, spec=0.2):
    old = bpy.data.materials.get(name)
    if old:
        bpy.data.materials.remove(old)
    m = bpy.data.materials.new(name)
    if hasattr(m, "use_nodes"):
        m.use_nodes = True
    nodes = m.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Specular IOR Level"].default_value = spec
    if color is not None:
        bsdf.inputs["Base Color"].default_value = linear(color)
        m.diffuse_color = linear(color)
    if image is not None:
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = image
        tex.location = (-400, 200)
        m.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if emission > 0:
        bsdf.inputs["Emission Color"].default_value = linear(color)
        bsdf.inputs["Emission Strength"].default_value = emission
    m.use_backface_culling = not two_sided
    return m


def outline_material():
    """Inverted-hull outline: only the back faces peeking out from behind the edge are visible"""
    old = bpy.data.materials.get("Outline")
    if old:
        bpy.data.materials.remove(old)
    m = bpy.data.materials.new("Outline")
    if hasattr(m, "use_nodes"):
        m.use_nodes = True
    nodes = m.node_tree.nodes
    links = m.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    geo = nodes.new("ShaderNodeNewGeometry")
    mix = nodes.new("ShaderNodeMixShader")
    ink = nodes.new("ShaderNodeEmission")
    clear = nodes.new("ShaderNodeBsdfTransparent")
    ink.inputs["Color"].default_value = linear(COLORS["outline"])
    ink.inputs["Strength"].default_value = 1.0
    # Only the camera sees the outline: it is transparent to shadows and bounced light,
    # otherwise the shell around the ship would shade the ship itself
    path = nodes.new("ShaderNodeLightPath")
    not_camera = nodes.new("ShaderNodeMath")
    not_camera.operation = "SUBTRACT"
    not_camera.inputs[0].default_value = 1.0
    links.new(path.outputs["Is Camera Ray"], not_camera.inputs[1])
    hide = nodes.new("ShaderNodeMath")
    hide.operation = "MAXIMUM"
    links.new(geo.outputs["Backfacing"], hide.inputs[0])
    links.new(not_camera.outputs["Value"], hide.inputs[1])
    links.new(hide.outputs["Value"], mix.inputs["Fac"])
    links.new(ink.outputs["Emission"], mix.inputs[1])
    links.new(clear.outputs["BSDF"], mix.inputs[2])
    links.new(mix.outputs["Shader"], out.inputs["Surface"])
    m.use_backface_culling = True
    m.diffuse_color = linear(COLORS["outline"])
    return m


def add_outline(obj, outline_mat, thickness):
    obj.data.materials.append(outline_mat)
    mod = obj.modifiers.new("Outline", "SOLIDIFY")
    mod.thickness = thickness
    mod.offset = 1.0
    mod.use_flip_normals = True
    mod.use_rim = False
    mod.use_even_offset = False  # an even offset makes spikes stick out at sharp corners
    mod.material_offset = 1000  # clamped to the last slot, i.e. the outline


def make_materials():
    tex_hull = plank_texture("hull_planks", COLORS["hull"], seed=3)
    tex_deck = plank_texture("deck_planks", COLORS["deck"], rows=7, joints=2, seed=7)
    tex_castle = plank_texture("castle_planks", COLORS["castle"], seed=11)
    tex_sail = sail_texture("sail")
    tex_sail_patch = sail_texture("sail_patched", patch=True)
    tex_flag = flag_texture("flag")
    return {
        "hull": material("Hull", COLORS["hull"], tex_hull),
        "hull_dark": material("HullDark", COLORS["hull_dark"]),
        "gold": material("Gold", COLORS["gold"], rough=0.5, spec=0.35),
        "interior": material("Interior", COLORS["interior"]),
        "deck": material("Deck", COLORS["deck"], tex_deck),
        "castle": material("Castle", COLORS["castle"], tex_castle),
        "mast": material("MastWood", COLORS["mast"]),
        "sail": material("Sail", COLORS["sail"], tex_sail, rough=0.95, two_sided=True, spec=0.1),
        "sail_patch": material("SailPatched", COLORS["sail"], tex_sail_patch, rough=0.95, two_sided=True, spec=0.1),
        "flag": material("Flag", COLORS["flag"], tex_flag, rough=0.95, two_sided=True, spec=0.1),
        "pennant": material("Pennant", COLORS["pennant"], rough=0.9, two_sided=True, spec=0.1),
        "iron": material("Iron", COLORS["iron"], rough=0.5, metal=0.3, spec=0.4),
        "port": material("Gunport", COLORS["port"], rough=1.0, spec=0.0),
        "lid": material("Lid", COLORS["lid"]),
        "rope": material("Rope", COLORS["rope"], rough=1.0, spec=0.0),
        "glass": material("Glass", COLORS["glass"], rough=0.3, emission=1.6),
        "lantern": material("Lantern", COLORS["glass"], rough=0.3, emission=5.0),
        "crate": material("Crate", COLORS["crate"]),
        "grate": material("Grate", COLORS["grate"], rough=1.0, spec=0.0),
        "outline": outline_material(),
    }


# ---------------------------------------------------------------------------
# Geometry generators (bmesh)
# ---------------------------------------------------------------------------


class Parts:
    """A separate bmesh per material; each becomes a separate object at the end"""

    def __init__(self):
        self.meshes = {}

    def __getitem__(self, key):
        if key not in self.meshes:
            bm = bmesh.new()
            bm.loops.layers.uv.verify()
            self.meshes[key] = bm
        return self.meshes[key]


def basis(axis):
    """Rotation matrix that turns Z into the direction of axis"""
    return axis.normalized().to_track_quat("Z", "Y").to_matrix().to_4x4()


def lathe(bm, profile, segs, matrix, cap_bottom=True, cap_top=True, phase=0.0):
    """Solid of revolution around the local Z axis. profile: [(radius, z), ...] from bottom to top"""
    rings = []
    for r, z in profile:
        ring = []
        for i in range(segs):
            a = phase + 2 * math.pi * i / segs
            ring.append(bm.verts.new(matrix @ Vector((r * math.cos(a), r * math.sin(a), z))))
        rings.append(ring)
    for k in range(len(rings) - 1):
        lo, hi = rings[k], rings[k + 1]
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    if cap_bottom:
        bm.faces.new(list(reversed(rings[0])))
    if cap_top:
        bm.faces.new(rings[-1])
    return rings


def rod(bm, a, b, r1, r2=None, segs=8, caps=True):
    a, b = Vector(a), Vector(b)
    d = b - a
    m = Matrix.Translation(a) @ basis(d)
    lathe(bm, [(r1, 0.0), (r2 if r2 is not None else r1, d.length)], segs, m, caps, caps)


def box(bm, center, size, axes=None):
    """Box centered at center with dimensions size along axes (three vectors)"""
    if axes is None:
        axes = (Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
    rot = Matrix((axes[0], axes[1], axes[2])).transposed().to_4x4()
    m = Matrix.Translation(Vector(center)) @ rot @ Matrix.Diagonal((size[0], size[1], size[2], 1.0))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)


def polygon(bm, points, uv_scale=None, flip=False):
    verts = [bm.verts.new(Vector(p)) for p in points]
    if flip:
        verts.reverse()
    face = bm.faces.new(verts)
    if uv_scale:
        uv = bm.loops.layers.uv.active
        su, sv, ax_u, ax_v = uv_scale
        for loop in face.loops:
            co = loop.vert.co
            loop[uv].uv = (co[ax_u] / su, co[ax_v] / sv)
    return face


def grid_surface(bm, point_at, cols, rows, two_uv=True):
    """cols x rows grid; point_at(u, v) -> Vector, u, v in 0..1. UV = (u, v)"""
    uv = bm.loops.layers.uv.active
    verts = [[bm.verts.new(point_at(i / cols, j / rows)) for i in range(cols + 1)] for j in range(rows + 1)]
    for j in range(rows):
        for i in range(cols):
            quad = [verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]]
            coords = [(i / cols, j / rows), ((i + 1) / cols, j / rows), ((i + 1) / cols, (j + 1) / rows), (i / cols, (j + 1) / rows)]
            uniq = []
            for v, c in zip(quad, coords):
                if not uniq or uniq[-1][0] is not v:
                    uniq.append((v, c))
            if uniq[0][0] is uniq[-1][0]:
                uniq.pop()
            if len(uniq) < 3:
                continue
            try:
                f = bm.faces.new([v for v, _ in uniq])
            except ValueError:
                continue
            for loop, (_, c) in zip(f.loops, uniq):
                loop[uv].uv = c
    return verts


# ---------------------------------------------------------------------------
# Hull
# ---------------------------------------------------------------------------

HULL_ROWS = [-3.0, -2.6, -1.8, -0.8, 0.4, 1.8, 3.3, 4.8, 6.2, 7.6, 9.2, 10.8, 12.6]
TOP_ROWS = 5
HULL_COLS = 72
BAND = (7.6, 9.2)


def build_hull(mats, coll):
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    us = [0.5 - 0.5 * math.cos(math.pi * i / HULL_COLS) for i in range(HULL_COLS + 1)]
    base_z = HULL_ROWS[-1]

    def x_at(u, z):
        return x_stern(z) + u * (x_bow(z) - x_stern(z))

    # Grid points: row heights depend on the column because the top of the side rises
    columns = []
    for u in us:
        top = rail_z(x_at(u, base_z))
        zs = HULL_ROWS + [base_z + (top - base_z) * k / TOP_ROWS for k in range(1, TOP_ROWS + 1)]
        columns.append([(x_at(u, z), z) for z in zs])

    shared = {}

    def vert(c, r, side):
        x, z = columns[c][r]
        w = half_width(x, z)
        if w < 1e-4:
            key = (c, r)
            if key not in shared:
                shared[key] = bm.verts.new((x, 0.0, z))
            return shared[key]
        return bm.verts.new((x, side * w, z))

    rows = len(columns[0])
    grid = {side: [[vert(c, r, side) for c in range(len(us))] for r in range(rows)] for side in (1, -1)}

    def add_face(vs):
        clean = []
        for v in vs:
            if not clean or clean[-1] is not v:
                clean.append(v)
        if clean[0] is clean[-1]:
            clean.pop()
        if len(clean) < 3:
            return None
        f = bm.faces.new(clean)
        zc = sum(v.co.z for v in clean) / len(clean)
        if zc < 1.8:
            f.material_index = 2
        elif BAND[0] <= zc <= BAND[1]:
            f.material_index = 1
        else:
            f.material_index = 0
        for loop in f.loops:
            loop[uv].uv = (loop.vert.co.x / 24.0, loop.vert.co.z / 10.4)
        return f

    for side in (1, -1):
        g = grid[side]
        for r in range(rows - 1):
            for c in range(len(us) - 1):
                if side == 1:
                    add_face([g[r][c], g[r + 1][c], g[r + 1][c + 1], g[r][c + 1]])
                else:
                    add_face([g[r][c], g[r][c + 1], g[r + 1][c + 1], g[r + 1][c]])

    # Transom: the flat back of the stern
    for r in range(rows - 1):
        add_face([grid[-1][r][0], grid[-1][r + 1][0], grid[1][r + 1][0], grid[1][r][0]])

    bm.normal_update()
    build_hull_outline(bm, mats, coll)
    mesh = bpy.data.meshes.new("Hull")
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new("Hull", mesh)
    coll.objects.link(obj)
    # 0 wood, 1 gold, 2 dark bottom; inner side +10, top edge of the wall +20
    slots = [mats["hull"], mats["gold"], mats["hull_dark"]]
    for i in range(23):
        if i < 3:
            obj.data.materials.append(slots[i])
        elif 10 <= i <= 12:
            obj.data.materials.append(mats["interior"])
        elif 20 <= i <= 22:
            obj.data.materials.append(mats["gold"])
        else:
            obj.data.materials.append(mats["hull"])

    mod = obj.modifiers.new("Solidify", "SOLIDIFY")
    mod.thickness = WALL
    mod.offset = -1
    mod.use_even_offset = True
    mod.use_rim = True
    mod.material_offset = 10
    mod.material_offset_rim = 20

    # Apply the modifier and squeeze the material list down to four
    dg = bpy.context.evaluated_depsgraph_get()
    baked = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    remap = {0: 0, 1: 1, 2: 2, 10: 3, 11: 3, 12: 3, 20: 1, 21: 1, 22: 1}
    indices = [remap.get(p.material_index, 0) for p in baked.polygons]
    # clear() resets the indices, so materials go first, then indices
    baked.materials.clear()
    for m in (mats["hull"], mats["gold"], mats["hull_dark"], mats["interior"]):
        baked.materials.append(m)
    for p, i in zip(baked.polygons, indices):
        p.material_index = i
    obj.modifiers.clear()
    old = obj.data
    obj.data = baked
    bpy.data.meshes.remove(old)
    baked.name = "Hull"
    for p in baked.polygons:
        p.use_smooth = False
    return obj


def build_hull_outline(shell, mats, coll):
    """Hull outline: a copy of the outer planking, inflated outwards and turned inside out.
    A separate object because the finished hull also has an inner wall, and the modifier would give spikes at the corners"""
    bm = shell.copy()
    for v in bm.verts:
        v.co += v.normal * OUTLINE_HULL
    bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    for f in bm.faces:
        f.material_index = 0
    mesh = bpy.data.meshes.new("HullOutline")
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mats["outline"])
    obj = bpy.data.objects.new("HullOutline", mesh)
    obj.visible_shadow = False
    obj.visible_diffuse = False
    obj.visible_glossy = False
    obj.visible_transmission = False
    coll.objects.link(obj)
    return obj


def deck_outline(z, x0, x1, steps=40):
    """Deck outline inside the hull walls between x0 and x1"""
    xs = [x0 + (x1 - x0) * i / steps for i in range(steps + 1)]
    left = [(x, inner_width(x, z), z) for x in xs if inner_width(x, z) > 0.05]
    right = [(x, -y, z) for x, y, z in reversed(left)]
    return left + right


def build_decks(parts):
    deck = parts["deck"]
    castle = parts["castle"]
    gold = parts["gold"]

    # Main deck along the whole length (under the raised decks it simply isn't visible)
    xs0 = x_stern(DECK_Z) + WALL
    xb0 = x_bow(DECK_Z)
    polygon(deck, deck_outline(DECK_Z, xs0, xb0), uv_scale=(24.0, 8.8, 0, 1), flip=True)

    # Quarterdeck
    qd_x0 = x_stern(QD_Z) + WALL
    polygon(deck, deck_outline(QD_Z, qd_x0, QD_FRONT, 24), uv_scale=(24.0, 8.8, 0, 1), flip=True)
    front_wall(castle, gold, QD_FRONT, DECK_Z, QD_Z, facing=1)

    # Forecastle
    fc_x1 = x_bow(FC_Z)
    polygon(deck, deck_outline(FC_Z, FC_BACK, fc_x1, 24), uv_scale=(24.0, 8.8, 0, 1), flip=True)
    front_wall(castle, gold, FC_BACK, DECK_Z, FC_Z, facing=-1)


def front_wall(bm, gold, x, z0, z1, facing):
    """Cross wall of a raised deck. facing = +1 faces the bow, -1 the stern"""
    steps = 6
    zs = [z0 + (z1 - z0) * i / steps for i in range(steps + 1)]
    left = [(x, inner_width(x, z), z) for z in zs]
    right = [(x, -y, z) for x, y, z in reversed(left)]
    outline = left + right
    # The vertex order decides where the normal points
    polygon(bm, outline, uv_scale=(10.4, 10.4, 1, 2), flip=(facing < 0))
    # Gold rail along the top of the wall
    w = inner_width(x, z1)
    box(gold, (x + facing * 0.1, 0, z1 - 0.15), (0.5, 2 * w, 0.35))


def build_gunports(parts):
    """Gunports with open red lids and cannons"""
    ports_x = [-13.0, -4.0, 5.0, 14.0]
    zc = 5.6
    for side in (1, -1):
        for x in ports_x:
            p, n = hull_point(x, zc, side)
            up = Vector((0, 0, 1))
            t = Vector((1, 0, 0))
            t = (t - n * t.dot(n)).normalized()
            b = (up - n * up.dot(n) - t * up.dot(t)).normalized()
            # Dark opening
            box(parts["port"], p - n * 0.17, (2.3, 0.5, 2.1), (t, n, b))
            # Hinged lid, opened upwards
            hinge = p + b * 1.12 + n * 0.12
            angle = math.radians(118)
            d = (-b * math.cos(angle) + n * math.sin(angle)).normalized()
            w = t.cross(d).normalized()
            box(parts["lid"], hinge + d * 1.12, (2.5, 2.2, 0.2), (t, d, w))
            # Cannon
            nh = Vector((n.x, n.y, 0)).normalized()
            start = p - nh * 0.6 + Vector((0, 0, -0.15))
            m = Matrix.Translation(start) @ basis(nh)
            lathe(parts["iron"], [(0.58, 0), (0.58, 0.5), (0.5, 0.6), (0.43, 2.2), (0.5, 2.3), (0.5, 2.75), (0.3, 2.76)], 12, m)


def build_stern(parts):
    """Transom: captain's cabin windows, gold, lanterns"""
    zc = 14.4
    nx = Vector((-1, 0, -0.3)).normalized()
    up = Vector((0.3, 0, -1)).normalized() * -1  # up along the transom
    side = Vector((0, 1, 0))
    for y in (-6.3, -2.1, 2.1, 6.3):
        x = x_stern(zc)
        c = Vector((x, y, zc)) + nx * 0.05
        box(parts["gold"], c, (2.6, 0.2, 2.9), (side, nx, up))
        box(parts["glass"], c + nx * 0.08, (2.0, 0.2, 2.3), (side, nx, up))
    # Gold stripes across the transom
    for zc2 in (11.4, 17.3):
        w = half_width(x_stern(zc2), zc2)
        c = Vector((x_stern(zc2), 0, zc2)) + nx * 0.12
        box(parts["gold"], c, (2 * w - 0.3, 0.25, 0.55), (side, nx, up))

    # Stern lanterns
    top = rail_z(x_stern(20))
    for y, size, h in ((-6.0, 0.9, 2.2), (6.0, 0.9, 2.2)):
        x = x_stern(top) + 1.0
        base = Vector((x, y, top))
        rod(parts["mast"], base, base + Vector((0, 0, h)), 0.14, segs=6)
        c = base + Vector((0, 0, h + size * 0.9))
        m = Matrix.Translation(c - Vector((0, 0, size * 0.9)))
        lathe(parts["lantern"], [(size * 0.45, 0), (size * 0.6, size * 0.6), (size * 0.55, size * 1.4), (size * 0.3, size * 1.6)], 6, m)
        lathe(parts["gold"], [(size * 0.5, size * 1.55), (size * 0.75, size * 1.7), (size * 0.08, size * 2.3)], 6, m)

    # Small windows on the sides of the stern castle
    for side_sign in (1, -1):
        for x in (-34.0, -30.5):
            p, n = hull_point(x, 13.4, side_sign)
            t = Vector((1, 0, 0))
            t = (t - n * t.dot(n)).normalized()
            b = t.cross(n) if side_sign < 0 else n.cross(t)
            b = b if b.z > 0 else -b
            box(parts["gold"], p + n * 0.02, (1.7, 0.2, 1.7), (t, n, b))
            box(parts["glass"], p + n * 0.1, (1.2, 0.2, 1.2), (t, n, b))


def build_channels_and_anchors(parts):
    """Channels (ledges for the shrouds) and anchors"""
    chains = {}
    for name, x0, z in (("fore", 17.0, 11.7), ("main", -4.0, 11.7), ("mizzen", -27.0, 17.6)):
        for side in (1, -1):
            pts = []
            for dx in (-1.0, -3.5, -6.0):
                p, n = hull_point(x0 + dx, z, side)
                pts.append(p + n * 1.15 + Vector((0, 0, 0.25)))
            p, n = hull_point(x0 - 3.5, z, side)
            t = Vector((1, 0, 0))
            box(parts["castle"], p + n * 0.7, (7.8, 1.4, 0.35), (t, Vector((0, side, 0)), Vector((0, 0, 1))))
            chains[(name, side)] = pts

    for side in (1, -1):
        p, n = hull_point(33.0, 12.0, side)
        o = n * 0.55
        top = p + o + Vector((0, 0, 0.6))
        bottom = p + o + Vector((-0.6, 0, -5.4))
        rod(parts["iron"], top, bottom, 0.22, segs=6)
        rod(parts["mast"], top + Vector((-1.4, 0, 0)), top + Vector((1.4, 0, 0)), 0.22, segs=6)
        for dx in (-1.9, 1.9):
            tip = bottom + Vector((dx, 0, 1.6))
            rod(parts["iron"], bottom, tip, 0.2, segs=6)
            box(parts["iron"], tip, (0.9, 0.25, 0.7))
    return chains


# ---------------------------------------------------------------------------
# Deck details
# ---------------------------------------------------------------------------


def barrel(parts, x, y, z, r=0.85, h=2.0):
    m = Matrix.Translation((x, y, z))
    prof = [(r * 0.86, 0), (r, h * 0.3), (r * 1.04, h * 0.5), (r, h * 0.7), (r * 0.86, h)]
    lathe(parts["crate"], prof, 12, m)
    rr = r * 0.9 + 0.04
    for zz in (0.18, h - 0.18):
        lathe(parts["iron"], [(rr, zz - 0.09), (rr, zz + 0.09)], 12, m, False, False)


def crate(parts, x, y, z, s=1.8, rot=0.0):
    axes = (Vector((math.cos(rot), math.sin(rot), 0)), Vector((-math.sin(rot), math.cos(rot), 0)), Vector((0, 0, 1)))
    box(parts["crate"], (x, y, z + s / 2), (s, s, s), axes)
    for k in (-1, 1):
        c = Vector((x, y, z + s / 2)) + axes[0] * (k * s * 0.42)
        box(parts["castle"], c, (0.22, s + 0.04, s + 0.04), axes)


def hatch(parts, x, y, sx, sy):
    z = DECK_Z
    box(parts["grate"], (x, y, z + 0.3), (sx, sy, 0.6))
    for dx in (-1, 1):
        box(parts["castle"], (x + dx * (sx / 2), y, z + 0.4), (0.35, sy + 0.35, 0.8))
    for dy in (-1, 1):
        box(parts["castle"], (x, y + dy * (sy / 2), z + 0.4), (sx + 0.35, 0.35, 0.8))
    for i in range(1, 4):
        box(parts["castle"], (x - sx / 2 + sx * i / 4, y, z + 0.62), (0.16, sy, 0.1))


def balustrade(parts, x, z, facing):
    w = inner_width(x, z) - 0.25
    n = int(2 * w / 1.15)
    for i in range(n + 1):
        y = -w + 2 * w * i / n
        rod(parts["mast"], (x + facing * 0.25, y, z), (x + facing * 0.25, y, z + 1.6), 0.13, segs=6)
    box(parts["gold"], (x + facing * 0.25, 0, z + 1.7), (0.3, 2 * w + 0.3, 0.22))


def ladder(parts, y):
    a = Vector((QD_FRONT + 4.2, y, DECK_Z))
    b = Vector((QD_FRONT + 0.2, y, QD_Z))
    for s in (-0.85, 0.85):
        rod(parts["mast"], a + Vector((0, s, 0)), b + Vector((0, s, 0)), 0.14, segs=6)
    for i in range(1, 8):
        p = a.lerp(b, i / 8)
        box(parts["castle"], p, (0.5, 1.6, 0.14))


def capstan(parts, x, y):
    m = Matrix.Translation((x, y, DECK_Z))
    lathe(parts["castle"], [(1.25, 0), (1.25, 0.3), (0.8, 0.45), (0.8, 1.5), (1.35, 1.6), (1.35, 2.0), (0.3, 2.1)], 12, m)
    for a in (0.3, 0.3 + math.pi / 2):
        d = Vector((math.cos(a), math.sin(a), 0)) * 2.4
        c = Vector((x, y, DECK_Z + 1.8))
        rod(parts["mast"], c - d, c + d, 0.12, segs=6)


def wheel(parts, x, z):
    base = Vector((x, 0, z))
    box(parts["castle"], base + Vector((0, 0, 1.1)), (0.6, 0.7, 2.2))
    c = base + Vector((0.55, 0, 2.6))
    pts = []
    for i in range(16):
        a = 2 * math.pi * i / 16
        pts.append(c + Vector((0, math.cos(a), math.sin(a))) * 1.45)
    for i in range(16):
        rod(parts["mast"], pts[i], pts[(i + 1) % 16], 0.12, segs=5, caps=False)
    for i in range(8):
        a = 2 * math.pi * i / 8
        rod(parts["mast"], c, c + Vector((0, math.cos(a), math.sin(a))) * 1.95, 0.09, segs=5)
    lathe(parts["gold"], [(0.3, -0.2), (0.3, 0.2)], 8, Matrix.Translation(c) @ basis(Vector((1, 0, 0))))


def figurehead(parts):
    z = 11.5
    x = x_bow(z) - 0.2
    m = Matrix.Translation((x, 0, z)) @ basis(Vector((1, 0, 0.55)))
    lathe(parts["gold"], [(0.15, -0.5), (0.7, 0.3), (0.8, 1.2), (0.55, 2.2), (0.15, 2.8)], 10, m)


def build_deck_details(parts):
    hatch(parts, 6.5, 0, 5.5, 4.2)
    hatch(parts, -10.0, 0, 3.8, 3.4)
    capstan(parts, -15.2, 0)
    for y in (-1, 1):
        ladder(parts, y * 9.6)
    balustrade(parts, QD_FRONT, QD_Z, 1)
    balustrade(parts, FC_BACK, FC_Z, -1)
    wheel(parts, -22.0, QD_Z)
    figurehead(parts)

    barrel(parts, 23.0, -7.2, DECK_Z)
    barrel(parts, 23.2, -9.0, DECK_Z)
    barrel(parts, 24.6, -8.0, DECK_Z)
    barrel(parts, -16.0, 6.0, DECK_Z, r=0.75, h=1.8)
    barrel(parts, -16.0, 4.4, DECK_Z, r=0.75, h=1.8)
    crate(parts, 11.0, 8.2, DECK_Z, rot=0.2)
    crate(parts, 11.3, 6.1, DECK_Z, s=1.6, rot=-0.15)
    crate(parts, 11.1, 7.4, DECK_Z + 1.8, s=1.5, rot=0.5)
    crate(parts, -31.0, 6.0, QD_Z, s=1.5)


# ---------------------------------------------------------------------------
# Masts, sails, rigging
# ---------------------------------------------------------------------------

MASTS = [
    # x, base, height, radius, top platform (height from the base), platform radius,
    # sails: (bottom, top, half-width at the bottom, half-width at the top)
    dict(name="fore", x=17.0, base=DECK_Z, height=52.0, r=0.95, top=32.0, top_r=3.0,
         sails=[(12.0, 30.0, 15.5, 13.5), (33.5, 47.0, 11.5, 8.5)], patch=None),
    dict(name="main", x=-4.0, base=DECK_Z, height=62.0, r=1.05, top=37.0, top_r=3.4,
         sails=[(12.0, 35.0, 18.5, 16.0), (38.5, 56.0, 13.0, 9.5)], patch=0),
    dict(name="mizzen", x=-27.0, base=QD_Z, height=34.0, r=0.75, top=21.0, top_r=2.2,
         sails=[], patch=None),
]


def braced(mast_x, along, across, z):
    """Point in the sail's frame (along = forward, across = to port) with the yards braced"""
    c, s = math.cos(BRACE), math.sin(BRACE)
    return Vector((mast_x + along * c - across * s, along * s + across * c, z))


def build_masts(parts, chains):
    rigging = parts["rope"]
    tops = {}
    for m in MASTS:
        x, base, h, r = m["x"], m["base"], m["height"], m["r"]
        plat = base + m["top"]
        top = base + h
        tops[m["name"]] = (plat, top)
        mt = Matrix.Translation((x, 0, 0))
        lathe(parts["mast"], [(r, base - 1), (r, base), (r * 0.72, plat + 1.5)], 10, mt)
        lathe(parts["mast"], [(r * 0.58, plat - 1.0), (r * 0.36, top), (r * 0.5, top + 0.2), (r * 0.5, top + 0.8), (0.05, top + 1.0)], 10, mt)
        box(parts["castle"], (x - 0.4, 0, plat + 1.4), (2.6, 1.6, 0.6))

        # Top: a platform with a rim
        R = m["top_r"]
        lathe(parts["castle"], [(0.3, plat - 0.25), (R, plat - 0.25), (R, plat + 0.2), (0.3, plat + 0.2)], 16, mt)
        lathe(parts["mast"], [(R - 0.12, plat + 0.2), (R, plat + 0.2), (R, plat + 1.1), (R - 0.12, plat + 1.1)], 16, mt, False, False)

        for k, (b, t, hw_b, hw_t) in enumerate(m["sails"]):
            square_sail(parts, x, base + b, base + t, hw_b, hw_t, patch=(m["patch"] == k))
            yard_z = base + t + 0.35
            hw = hw_t + 2.2
            left, right = braced(x + 0.9, 0, hw, yard_z), braced(x + 0.9, 0, -hw, yard_z)
            mid = braced(x + 0.9, 0, 0, yard_z)
            rod(parts["mast"], mid, left, 0.42, 0.2, segs=8)
            rod(parts["mast"], mid, right, 0.42, 0.2, segs=8)
            # Braces from the yards backwards
            if m["name"] != "mizzen":
                for end in (left, right):
                    rod(rigging, end, Vector((x - 14.0, math.copysign(inner_width(x - 14, 12.0), end.y), rail_z(x - 14.0) + 0.3)), 0.09, segs=4, caps=False)

        # Shrouds: from the top platform to the channels
        for side in (1, -1):
            for p in chains[(m["name"], side)]:
                rod(rigging, Vector((x, side * 0.8, plat - 0.4)), p, 0.13, segs=4, caps=False)
            for dx in (0.6, -0.9):
                rod(rigging, Vector((x + dx, side * (R - 0.4), plat + 0.3)), Vector((x, side * 0.3, top - 3.0)), 0.1, segs=4, caps=False)
            # Backstay from the masthead to the aft channel
            rod(rigging, Vector((x, side * 0.3, top - 2.0)), chains[(m["name"], side)][-1], 0.1, segs=4, caps=False)

    return tops


def square_sail(parts, mast_x, z0, z1, hw0, hw1, patch=False):
    bulge = 0.36 * hw1

    def point(u, v):
        s = u * 2 - 1
        hw = hw0 + (hw1 - hw0) * v
        fv = math.sin(math.pi * (1 - v) * 0.5) ** 0.7
        along = bulge * (1 - s * s) ** 0.85 * fv
        z = z0 + (z1 - z0) * v + 1.1 * (1 - s * s) * (1 - v) ** 3
        return braced(mast_x + 0.9, along, -s * hw, z)

    grid_surface(parts["sail_patch" if patch else "sail"], point, 14, 10)


def gaff_sail(parts, tops):
    m = MASTS[2]
    x, base = m["x"], m["base"]
    boom0, boom1 = Vector((x - 0.8, 0, base + 5.4)), Vector((x - 14.5, 0, base + 5.0))
    gaff0, gaff1 = Vector((x - 0.8, 0, base + 20.0)), Vector((x - 12.5, 0, base + 25.5))

    def point(u, v):
        bottom = boom0.lerp(boom1, u)
        top = gaff0.lerp(gaff1, u)
        p = bottom.lerp(top, v)
        p.y += 2.0 * math.sin(math.pi * u) * math.sin(math.pi * min(1.0, v * 1.05 + 0.02)) ** 0.8
        return p

    grid_surface(parts["sail"], point, 10, 10)
    rod(parts["mast"], boom0, boom1 + Vector((-0.6, 0, 0)), 0.32, 0.22)
    rod(parts["mast"], gaff0, gaff1 + Vector((-0.4, 0, 0.2)), 0.28, 0.18)


def triangle_sail(parts, tack, head, clew, belly):
    def point(u, v):
        foot = tack.lerp(clew, u)
        p = foot.lerp(head, v)
        p.y += belly * math.sin(math.pi * u) * (1 - v)
        return p

    grid_surface(parts["sail"], point, 8, 10)


def build_bowsprit_and_jibs(parts, tops):
    root = Vector((35.0, 0, 14.6))
    tip = Vector((60.5, 0, 22.8))
    rod(parts["mast"], root, tip, 0.75, 0.32)
    fore = MASTS[0]
    fx = fore["x"]
    fplat, ftop = tops["fore"]
    triangle_sail(parts, Vector((57.5, 0, 21.4)), Vector((fx + 0.8, 0, ftop - 6.0)), Vector((39.0, 2.0, 17.5)), 2.2)
    triangle_sail(parts, Vector((47.5, 0, 18.0)), Vector((fx + 0.8, 0, fplat + 3.0)), Vector((32.5, 1.4, 16.2)), 1.8)

    rope = parts["rope"]
    rod(rope, Vector((fx, 0, ftop - 1.0)), tip, 0.14, segs=4, caps=False)
    rod(rope, Vector((fx, 0, fplat + 3.5)), Vector((47.5, 0, 18.0)), 0.12, segs=4, caps=False)
    rod(rope, tip, Vector((37.6, 0, 4.0)), 0.12, segs=4, caps=False)  # bobstay

    mplat, mtop = tops["main"]
    zplat, ztop = tops["mizzen"]
    mx, zx = MASTS[1]["x"], MASTS[2]["x"]
    rod(rope, Vector((mx, 0, mplat + 1.0)), Vector((fx, 0, DECK_Z + 1.5)), 0.16, segs=4, caps=False)
    rod(rope, Vector((mx, 0, mtop - 1.5)), Vector((fx, 0, fplat + 1.5)), 0.12, segs=4, caps=False)
    rod(rope, Vector((zx, 0, ztop - 1.0)), Vector((mx, 0, mplat - 6.0)), 0.12, segs=4, caps=False)


def flags(parts, tops):
    # Flag on the main mast
    mx = MASTS[1]["x"]
    _, mtop = tops["main"]
    rod(parts["mast"], Vector((mx, 0, mtop)), Vector((mx, 0, mtop + 3.5)), 0.15, segs=6)
    z_top = mtop + 3.3

    def flag_point(u, v):
        return Vector((mx - 0.2 - 11.0 * u, 1.0 * math.sin(u * 3.3 + 0.3) * u, z_top - 6.8 * (1 - v) - 0.6 * u))

    grid_surface(parts["flag"], flag_point, 10, 4)

    # Red pennants on the fore and mizzen masts
    for name, length in (("fore", 9.0), ("mizzen", 7.0)):
        x = next(m["x"] for m in MASTS if m["name"] == name)
        _, top = tops[name]

        def pennant_point(u, v, x=x, top=top, length=length):
            half = 0.9 * (1 - u)
            return Vector((x - 0.2 - length * u, 0.8 * math.sin(u * 4.0) * u, top + 0.6 - half + 2 * half * v))

        grid_surface(parts["pennant"], pennant_point, 10, 1)


# ---------------------------------------------------------------------------
# Assembly
# ---------------------------------------------------------------------------


def clear_previous():
    coll = bpy.data.collections.get("Ship")
    if coll:
        for obj in list(coll.objects):
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if data is not None and data.users == 0:
                bpy.data.meshes.remove(data)
        bpy.data.collections.remove(coll)


def build():
    clear_previous()
    coll = bpy.data.collections.new("Ship")
    bpy.context.scene.collection.children.link(coll)

    mats = make_materials()
    root = bpy.data.objects.new("Ship", None)
    root.empty_display_type = "ARROWS"
    root.empty_display_size = 20
    coll.objects.link(root)

    hull = build_hull(mats, coll)
    hull.parent = root
    bpy.data.objects["HullOutline"].parent = root

    parts = Parts()
    build_decks(parts)
    build_gunports(parts)
    build_stern(parts)
    chains = build_channels_and_anchors(parts)
    build_deck_details(parts)
    tops = build_masts(parts, chains)
    gaff_sail(parts, tops)
    build_bowsprit_and_jibs(parts, tops)
    flags(parts, tops)

    names = {
        "deck": "Decks", "castle": "Castles", "gold": "GoldTrim", "port": "Gunports", "lid": "GunportLids",
        "iron": "Iron", "glass": "Windows", "lantern": "Lanterns", "mast": "Spars", "rope": "Rigging",
        "sail": "Sails", "sail_patch": "MainSail", "flag": "Flag", "pennant": "Pennants",
        "crate": "Cargo", "grate": "Hatches",
    }
    for key, bm in parts.meshes.items():
        mesh = bpy.data.meshes.new(names[key])
        bm.to_mesh(mesh)
        bm.free()
        mesh.materials.append(mats[key])
        obj = bpy.data.objects.new(names[key], mesh)
        coll.objects.link(obj)
        obj.parent = root

    for name, thickness in OUTLINE.items():
        obj = bpy.data.objects.get(name)
        if obj is not None:
            add_outline(obj, mats["outline"], thickness)

    return root


if __name__ == "__main__":
    build()
