import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = ROOT / "artifacts" / "blender" / "inmp441-breakout.blend"
RENDER_PATH = ROOT / "src" / "assets" / "components" / "inmp441-breakout.png"


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
        modifier = obj.modifiers.new("Rounded edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 5
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.materials.append(mat)
    return obj


def cylinder(name, radius, depth, location, mat, vertices=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def text_object(body, size, location, mat, align="CENTER"):
    bpy.ops.object.text_add(location=location)
    obj = bpy.context.object
    obj.name = f"Silkscreen {body}"
    obj.data.body = body
    obj.data.align_x = align
    obj.data.align_y = "CENTER"
    obj.data.size = size
    obj.data.extrude = 0.008
    obj.data.bevel_depth = 0.003
    obj.data.materials.append(mat)
    return obj


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

pcb = material("Blue solder mask", (0.008, 0.13, 0.36), roughness=0.3)
pcb_edge = material("PCB substrate edge", (0.025, 0.075, 0.085), roughness=0.55)
gold = material("ENIG pads", (0.74, 0.42, 0.055), metallic=0.86, roughness=0.2)
solder = material("Solder", (0.46, 0.52, 0.57), metallic=0.9, roughness=0.17)
silver = material("MEMS can", (0.48, 0.53, 0.56), metallic=0.88, roughness=0.23)
black = material("Component epoxy", (0.018, 0.023, 0.028), roughness=0.28)
cream = material("Ceramic capacitor", (0.78, 0.72, 0.57), roughness=0.42)
silk = material("White silkscreen", (0.82, 0.86, 0.85), roughness=0.5)
trace = material("Traces under mask", (0.04, 0.3, 0.5), metallic=0.12, roughness=0.35)

box("FR4 substrate", (22.0, 16.0, 1.25), (0, 0, 0.75), pcb_edge, bevel=0.72)
box("Blue solder mask top", (21.8, 15.8, 0.22), (0, 0, 1.48), pcb, bevel=0.65)

pin_names = ["SCK", "WS", "L/R", "SD", "VDD", "GND"]
pin_y = [6.35, 3.81, 1.27, -1.27, -3.81, -6.35]
for index, (label, y) in enumerate(zip(pin_names, pin_y), start=1):
    # A broad plated annulus and solder fillet make each wiring destination obvious.
    cylinder(f"Pad {index} {label}", 0.98, 0.12, (-9.55, y, 1.66), gold)
    cylinder(f"Header pin {index} {label}", 0.43, 2.35, (-9.55, y, 2.28), solder, vertices=32)
    cylinder(f"Pad hole {index} {label}", 0.29, 0.15, (-9.55, y, 1.74), black, vertices=32)
    text_object(label, 0.72, (-7.85, y - 0.24, 1.63), silk, align="LEFT")
    box(f"Trace {label}", (5.0 + (index % 3), 0.18, 0.035), (-5.8 + (index % 3) * 0.4, y, 1.62), trace, bevel=0.06)

# The familiar top-port MEMS package, including a recessed acoustic port.
box("INMP441 MEMS package", (5.0, 4.1, 0.85), (2.6, 0.8, 2.02), silver, bevel=0.28)
cylinder("Acoustic port", 0.54, 0.08, (2.6, 0.8, 2.49), black)
cylinder("Acoustic port bevel", 0.78, 0.025, (2.6, 0.8, 2.52), silver)
cylinder("Acoustic opening", 0.47, 0.04, (2.6, 0.8, 2.55), black)

# Representative regulator-free breakout passives and soldered terminations.
passives = [
    ("C1", (-0.4, -4.7), cream, (1.45, 0.72, 0.42)),
    ("R1", (2.0, -4.7), black, (1.35, 0.66, 0.36)),
    ("C2", (4.2, -4.7), cream, (1.3, 0.68, 0.4)),
    ("R2", (6.4, -4.7), black, (1.3, 0.65, 0.36)),
    ("C3", (7.2, 4.9), cream, (1.25, 0.68, 0.4)),
]
for name, (x, y), mat, size in passives:
    box(name, size, (x, y, 1.9), mat, bevel=0.1)
    box(f"{name} left termination", (0.2, size[1] + 0.06, 0.18), (x - size[0] / 2, y, 1.84), solder, bevel=0.04)
    box(f"{name} right termination", (0.2, size[1] + 0.06, 0.18), (x + size[0] / 2, y, 1.84), solder, bevel=0.04)

text_object("INMP441", 1.15, (3.7, 6.25, 1.65), silk)
text_object("I2S MEMS MIC", 0.58, (3.7, 5.0, 1.65), silk)
text_object("LEFT: L/R -> GND", 0.52, (3.8, -6.3, 1.65), silk)

for obj in bpy.context.scene.objects:
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = False

world = bpy.context.scene.world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.012, 0.018, 0.026, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.3


def area_light(name, location, energy, size, color):
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.name = name
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    light.data.color = color
    return light


area_light("Large cool key", (-10, -7, 20), 1200, 10.0, (0.78, 0.9, 1.0))
area_light("Warm rim", (11, 5, 14), 900, 7.0, (1.0, 0.7, 0.42))
area_light("Header fill", (-12, 2, 10), 700, 5.0, (0.68, 0.82, 1.0))
area_light("Top softbox", (0, 0, 22), 1150, 13.0, (0.94, 0.97, 1.0))

bpy.ops.object.camera_add(location=(0, 0, 38), rotation=(0, 0, 0))
camera = bpy.context.object
camera.name = "Orthographic wiring-diagram camera"
camera.data.type = "ORTHO"
camera.data.ortho_scale = 24.5
bpy.context.scene.camera = camera

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1100
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.color_depth = "8"
scene.render.image_settings.compression = 85
scene.render.film_transparent = True
scene.render.filepath = str(RENDER_PATH)
scene.view_settings.look = "AgX - Medium High Contrast"

MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
RENDER_PATH.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(MODEL_PATH))
bpy.ops.render.render(write_still=True)

print(f"MODEL={MODEL_PATH}")
print(f"RENDER={RENDER_PATH}")
