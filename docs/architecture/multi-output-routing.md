# Multi-output routing

Each `MatrixOutput` node is an explicit hardware route. Its incoming `frame`
cable selects the frame-producing branch for that controller; the node owns the
controller's pins, chipset, color order, physical dimensions, XY layout, and
brightness. Multiple routes render in one firmware loop and are presented by
one synchronized `FastLED.show()`.

Firmware evaluates frame branches on one logical **composition canvas**. Its
size is the largest configured output dimension on each axis (including a 2×
supersampled route). Each output then maps its branch into its physical grid:

- `fit` box-filters the complete composition into the output dimensions;
- `crop` selects an output-sized, wrapping viewport from `routeX`, `routeY`.

The preview uses the same composition and mapping rules. When more than one
output exists, its Route selector chooses which physical result is displayed;
node thumbnails continue to be produced by the shared evaluation pass.

All GPIO consumers remain in one resource namespace. Graph Health and deploy
validation therefore reject reuse between outputs and between an output and
microphone, SD, button, potentiometer, or encoder pins. Layout validation runs
for every output. Power estimates sum physical LEDs and configured caps; RAM
estimates include every physical LED array plus the union of frame branches on
the shared composition canvas.

Existing projects need no migration: a single `MatrixOutput` retains its prior
dimensions, layout, preview, and generated-sketch path. Missing routing
properties default to `fit` with origin `(0, 0)`.
