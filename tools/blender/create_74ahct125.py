import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = ROOT / "artifacts" / "blender" / "sn74ahct125n-dip14.blend"
RENDER_PATH = ROOT / "src" / "assets" / "components" / "sn74ahct125n-dip14.png"


def material(name, color, metallic=0.0, roughness=0.4):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1.0)
    value.use_nodes = True
    principled = value.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1.0)
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    return value


def box(name, size, location, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = tuple(value / 2 for value in size)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("Soft molded edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 5
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.materials.append(mat)
    return obj


def text_object(body, size, location, mat):
    bpy.ops.object.text_add(location=location, rotation=(0, 0, math.radians(90)))
    obj = bpy.context.object
    obj.data.body = body
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.size = size
    obj.data.extrude = 0.012
    obj.data.bevel_depth = 0.004
    obj.data.materials.append(mat)
    return obj


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

black = material("Molded epoxy", (0.035, 0.041, 0.048), roughness=0.26)
black_edge = material("Notch interior", (0.004, 0.005, 0.006), roughness=0.38)
metal = material("Tin plated copper", (0.48, 0.53, 0.58), metallic=0.93, roughness=0.2)
marking = material("Laser marking", (0.57, 0.60, 0.61), metallic=0.05, roughness=0.5)

body = box("SN74AHCT125N molded body", (7.2, 19.3, 3.25), (0, 0, 2.0), black, bevel=0.42)

bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=1.28, depth=4.5, location=(0, 9.66, 2.2))
cutter = bpy.context.object
cutter.name = "Orientation notch cutter"
boolean = body.modifiers.new("Orientation notch", "BOOLEAN")
boolean.operation = "DIFFERENCE"
boolean.solver = "EXACT"
boolean.object = cutter
bpy.context.view_layer.objects.active = body
bpy.ops.object.modifier_apply(modifier=boolean.name)
bpy.data.objects.remove(cutter, do_unlink=True)

pin_y_positions = [7.62, 5.08, 2.54, 0.0, -2.54, -5.08, -7.62]
for side_name, side in (("L", -1), ("R", 1)):
    for row, y in enumerate(pin_y_positions, start=1):
        pin_number = row if side < 0 else 15 - row
        inner = box(
            f"Pin {pin_number:02d} inner",
            (1.5, 0.64, 0.34),
            (side * 4.15, y, 1.8),
            metal,
            bevel=0.09,
        )
        inner.rotation_euler[1] = side * math.radians(-7)
        box(
            f"Pin {pin_number:02d} foot",
            (1.35, 0.68, 0.32),
            (side * 5.18, y, 0.48),
            metal,
            bevel=0.1,
        )

bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=0.42, location=(-2.42, 7.2, 3.66))
dimple = bpy.context.object
dimple.name = "Pin 1 orientation dimple"
dimple.scale.z = 0.16
dimple.data.materials.append(black_edge)

text_object("SN74AHCT125N", 0.86, (0.1, 0.35, 3.67), marking)
text_object("TI  24A9", 0.47, (-1.06, 0.2, 3.67), marking)
text_object("G4  6CA", 0.43, (1.07, 0.2, 3.67), marking)

for obj in bpy.context.scene.objects:
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = False

world = bpy.context.scene.world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.018, 0.022, 0.027, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.32

def area_light(name, location, energy, size, color):
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.name = name
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    light.data.color = color
    return light


area_light("Large soft key", (-11, -8, 22), 1350, 9.0, (0.88, 0.94, 1.0))
area_light("Warm edge", (10, 4, 13), 980, 6.0, (1.0, 0.73, 0.48))
area_light("Pin fill", (0, 12, 9), 760, 5.0, (0.62, 0.78, 1.0))
area_light("Top softbox", (0, 0, 18), 1050, 12.0, (0.91, 0.96, 1.0))

bpy.ops.object.camera_add(location=(0, 0, 42), rotation=(0, 0, 0))
camera = bpy.context.object
camera.name = "Orthographic wiring-diagram camera"
camera.data.type = "ORTHO"
camera.data.ortho_scale = 23.7
bpy.context.scene.camera = camera

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 700
scene.render.resolution_y = 1200
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.film_transparent = True
scene.render.filepath = str(RENDER_PATH)
scene.render.image_settings.color_depth = "8"
scene.render.image_settings.compression = 85
scene.render.resolution_percentage = 100
scene.view_settings.look = "AgX - Medium High Contrast"

MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
RENDER_PATH.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(MODEL_PATH))
bpy.ops.render.render(write_still=True)

print(f"MODEL={MODEL_PATH}")
print(f"RENDER={RENDER_PATH}")
