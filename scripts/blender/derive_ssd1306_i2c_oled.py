"""Derive the generic four-pin SSD1306 I2C asset from the verified 0.96 OLED form.

Run Blender with the seven-pin SH1106 source blend already open, then pass the
target asset directory after ``--``. The two modules share the documented
0.96-inch PCB/panel form; this script changes the board dimensions, four-pin
header, silkscreen identity, output paths, and nothing about the proof artwork.
"""

from __future__ import annotations

import sys
from pathlib import Path

import bpy


def target_directory() -> Path:
    try:
        separator = sys.argv.index("--")
        target = Path(sys.argv[separator + 1]).resolve()
    except (ValueError, IndexError):
        raise SystemExit("usage: blender source.blend --python this.py -- <target-directory>")
    target.mkdir(parents=True, exist_ok=True)
    return target


TARGET = target_directory()
PREFIX = "SH1106 0.96"
NEW_PREFIX = "SSD1306 0.96 I2C"

# The source asset is the documented generic 27 x 28 mm seven-pin module form.
# The I2C module drawing is 27.3 x 27.8 mm, so carry every physical feature to
# that verified outline before replacing the connector row.
scale_x = 27.3 / 27.0
scale_y = 27.8 / 28.0
for obj in bpy.data.objects:
    if obj.type not in {"CAMERA", "LIGHT"}:
        obj.location.x *= scale_x
        obj.location.y *= scale_y
        obj.scale.x *= scale_x
        obj.scale.y *= scale_y

# Replace the seven-hole source PCB itself. Removing only its pad artwork would
# leave the old drilled holes visible, while moving the new four pads would put
# them over solid FR4. A fresh board outline with the verified holes keeps the
# mechanical drawing honest and lets the rest of the detailed source model stay
# intact.
source_pcb = next((obj for obj in bpy.data.objects if "OLED PCB" in obj.name), None)
if source_pcb is None:
    raise SystemExit("source blend has no OLED PCB object")
pcb_material = source_pcb.data.materials[0]
bpy.data.objects.remove(source_pcb, do_unlink=True)

bpy.ops.mesh.primitive_cube_add(location=(0, 0, 0))
pcb = bpy.context.object
pcb.name = f"{NEW_PREFIX} OLED PCB"
pcb.scale = (27.3 / 2, 27.8 / 2, 1.6 / 2)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
pcb.data.materials.append(pcb_material)
edge = pcb.modifiers.new("Rounded PCB corners", "BEVEL")
edge.width = 0.62
edge.segments = 6
bpy.context.view_layer.objects.active = pcb
bpy.ops.object.modifier_apply(modifier=edge.name)

mounting_centres = {
    (round(obj.location.x, 5), round(obj.location.y, 5))
    for obj in bpy.data.objects
    if obj.name.startswith(PREFIX) and "mounting hole" in obj.name and "plating" in obj.name
}
connector_y = -11.75 * scale_y
connector_centres = {(x, connector_y) for x in (-3.81, -1.27, 1.27, 3.81)}
for index, ((x, y), radius) in enumerate(
    [(point, 1.09) for point in sorted(mounting_centres)]
    + [(point, 0.57) for point in sorted(connector_centres)]
):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=radius, depth=2.4, location=(x, y, 0))
    cutter = bpy.context.object
    cutter.name = f"temporary PCB hole {index}"
    boolean = pcb.modifiers.new(f"PCB hole {index}", "BOOLEAN")
    boolean.operation = "DIFFERENCE"
    boolean.solver = "EXACT"
    boolean.object = cutter
    bpy.context.view_layer.objects.active = pcb
    bpy.ops.object.modifier_apply(modifier=boolean.name)
    bpy.data.objects.remove(cutter, do_unlink=True)

# Four-pin modules omit reset/data-command/chip-select and use the former SPI
# clock/data artwork as I2C SCL/SDA. Delete all three layers of each unused
# plated hole together with its label.
for obj in list(bpy.data.objects):
    if obj.name.startswith(PREFIX) and any(f" {pin}" in obj.name for pin in ("RES", "DC", "CS")):
        bpy.data.objects.remove(obj, do_unlink=True)

pin_changes = {
    "GND": ("GND", -3.81),
    "VCC": ("VCC", -1.27),
    "CLK": ("SCL", 1.27),
    "MOSI": ("SDA", 3.81),
}
for old_pin, (new_pin, x) in pin_changes.items():
    for obj in list(bpy.data.objects):
        if obj.name.startswith(PREFIX) and f" {old_pin}" in obj.name:
            obj.location.x = x
            obj.name = obj.name.replace(PREFIX, NEW_PREFIX).replace(f" {old_pin}", f" {new_pin}")
            if obj.type == "FONT" and obj.data.body == old_pin:
                obj.data.body = new_pin

for obj in bpy.data.objects:
    if obj.name.startswith(PREFIX):
        obj.name = obj.name.replace(PREFIX, NEW_PREFIX)

identity = bpy.data.objects.get(f"{NEW_PREFIX} identity")
if identity is not None:
    identity.data.body = "0.96 OLED · SSD1306 · I2C"
    identity.data.size *= 0.82

status = bpy.data.objects.get(f"{NEW_PREFIX} status")
if status is not None:
    status.data.body = "I2C READY"

scene = bpy.context.scene
scene.render.filepath = str(TARGET / "ssd1306-oled-096-128x64-i2c.png")
bpy.ops.wm.save_as_mainfile(filepath=str(TARGET / "ssd1306-oled-096-128x64-i2c.blend"))
bpy.ops.render.render(write_still=True)

print(f"MODEL={TARGET / 'ssd1306-oled-096-128x64-i2c.blend'}")
print(f"RENDER={TARGET / 'ssd1306-oled-096-128x64-i2c.png'}")
