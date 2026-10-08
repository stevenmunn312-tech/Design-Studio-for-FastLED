# Hardware workbench guide

Studio shows one project in four tabs: **Hardware**, **Graph**, **Upload**
and **Build Diagram**. The Hardware tab is the workbench, showing the physical
rig; the Graph tab shows its signal flow. This guide describes the current
implementation.

## Start with the board

Click the board on the Hardware tab and choose its family and exact physical
profile. A profile identifies the headers and fitted hardware, whereas an FQBN
can identify only a chip family or build target. The eye button opens the
reviewed pinout for the selected profile.

The board owns settings that one generated sketch can apply only once:

- master brightness;
- clockless-chipset overclock;
- global FastLED power cap;
- render-buffer PSRAM policy and interface; and
- serial routing on supported native-USB ESP32 targets.

`Auto` is the safe default for PSRAM. It enables external render buffers only
when the exact profile records a PSRAM interface. `Auto` serial routing examines
the selected USB port and chooses native USB or a UART bridge from its identity;
an unknown device falls back to UART unless the user overrides it.

### Use a custom board

When no profile matches your board, choose **Custom board** in the family
list. Name it, then pick the template that uses the **same processor and
module** — its flash, PSRAM and pin limits apply to your board. Set the number
of pins on each side, front side up with row 1 at the top, and define every
position: a GPIO by its Arduino number (with the label printed beside it, such
as `D4`), a supply pad by its voltage and direction, ground, reset, reserved or
unconnected. **Copy pin map** seeds the rows from the template's own header;
supply pads arrive undefined for you to confirm.

Choose the controller power method and, if your board's I2C pins differ, pick
SDA and SCL from its enabled GPIOs. The preview shows the board as every view
will draw it, and the editor lists any existing part whose pin your board will
not offer before you apply. Those parts keep their pins and block the upload
until you move them. **Cancel** changes nothing; **Edit** reopens the board.

A custom board is a schematic of your own declarations, not a verified
pinout. Check every pad against the real board before wiring, and treat a pad
printed VIN as unrated until you have checked it. Custom boards are
experimental in the support matrix.

## Add the parts that exist

Use the **Hardware shelf** in the Hardware tab's left panel. The current
categories are:

- **Inputs** — microphone, PCM1802 line-in ADC, button, button bank,
  Grove capacitive touch sensor, demodulating IR receiver, potentiometer,
  encoder, PIR motion sensor,
  HLK-LD2410C radar presence sensor, ambient-light sensor, INA219 power monitor,
  and RTC module;
- **Storage** — supported microSD modules;
- **Amplifiers & DACs** — the I2S stage on the board's pins (a MAX98357A
  speaker amplifier, or a PCM5102A or UDA1334A DAC), and the analog power
  amplifiers (PAM8403, PAM8610, DX-0809) that take line level and drive the
  speakers;
- **Displays** — segment readouts, OLED information panels, fixed-layout TFTs,
  and a custom touch display; and
- **LED outputs** — LED String, LED Matrix, LED Ring, LED Corkscrew, and HUB75 Panel.

A **Button Bank** starts with one hollow graph socket. Connect it to a named
input such as **Next** or **Brightness Up**: the bank creates a button with that
name, assigns a free GPIO, and leaves another empty socket ready. Use the
on-node button to test it in preview. Click the bank in Hardware to change its
GPIO or internal pull-up; unplugging a graph noodle does not erase the physical
button or its wiring. Remove the row from that Hardware inspector when the
physical button is no longer part of the build.

### Add a capacitive touch button

Choose **Inputs → Touch Button** for the Seeed Grove Touch Sensor. Power VCC
from **3V3**, connect **SIG** to the GPIO selected in Hardware, connect GND, and
leave **NC** unwired. With the touch face toward you and the connector holes at
the bottom, Studio shows the verified left-to-right order **SIG, NC, VCC, GND**.
The TTP223-BA6 drives SIG HIGH while the pad is touched, so Studio uses a plain
digital input and does not enable the internal pull-up used by many mechanical
buttons.

Wire the node's **Touched** output directly to a boolean action or through a
Trigger/Control Map when you need toggle or edge semantics. Press the on-node
touch control to exercise the same boolean in preview. This part is not the
**Touch** node used by a touchscreen display: that node carries screen
coordinates, while this sensor produces one momentary boolean.

### Measure a DC load

The **INA219 power monitor** reports a DC load's volts, amps and watts. Put it
in the supply lead: the supply's positive wire goes to **Vin+**, the load's
positive wire to **Vin-**, and the load shares ground with the board. It reads
up to 26 V and 3.2 A. Power the monitor from the board's 3V3 pin, not 5 V: its
data pull-ups follow its supply. It joins the board's I2C pins, which it can
share with an RTC or an I2C display; if you use more than one monitor, bridge
the A0/A1 jumpers so each has its own address, and pick that address on the
node. In preview there is no sensor, so drag the node's volts and amps sliders.
Amps run from 0 to 3.2, so put a **Map Range** in front of anything that
expects 0 to 1.

The **INA226 power monitor** does the same job for bigger loads: up to 36 V and
20 A. Wire it the same way, with the supply's positive wire to **IN+** and the
load's positive wire to **IN-**, and power **VCC** from 3V3. Leave **ALE** and
**VBS** as they come. Its A0 and A1 pads select sixteen addresses, 0x40 to 0x4F,
and the node's address list follows the part you added. Raise the node's
**Overcurrent** limit to suit the load: the slider reaches 20 A. It is
experimental until a reading is compared with a meter.

For either monitor, tick **Debug**, upload again, and open the serial monitor
at **115200 baud**. `FLS_POWER_DEBUG` identifies the chip and I2C address,
reports the setup write and configuration readback, then prints raw bus/shunt
readings, volts, amps, watts and overcurrent once per second. `connected=0`,
`read_failed` or `short_read` distinguishes a failed measurement from a real
zero; check power, ground, SDA/SCL and the address jumpers. Debug also works
before any outputs are wired, in normal, slideshow and SD-player uploads.
It is off by default.

### Feed a converter from a USB-C charger

Choose **Add Hardware → Power conversion → ZY12PDN** to record a USB-C PD trigger on
the bench. The ZY12PDN asks a power-delivery charger for 5, 9, 12, 15 or 20 V and puts
that voltage on its output pads, so it is the supply for a converter or a load rather
than a signal device: nothing on it connects to a GPIO. Choose the voltage on the board
itself with its button or solder pads (its LED colour shows the choice), then set the
same value in **Requested V** on the part, because Studio cannot read what the board
chose.

The Build Diagram then checks the trigger against the converters on the bench. It
warns if a converter's source voltage is not the voltage the trigger requests, if there
are two triggers, or if the converters would draw more than the trigger's 5 A. Set the
voltage before you connect anything: the output sits at the requested voltage as soon as
the charger is plugged in, and the charger must support PD, since a plain 5 V USB
charger will not negotiate. Read the silkscreen on your own board for the output
polarity. The trigger appears in the parts list and the plan but is not drawn on the
wiring diagram, and it is experimental until a charger has been measured.

### Switch loads to ground with a ULN2803A

Choose **Add Hardware → Switching power → ULN2803A** for eight switches that pull a
load to ground. Wire each input **1B** to **8B** to the GPIO the part shows, and
**GND** to the controller's ground. Each output **1C** to **8C** sinks its load: connect
the load between its own supply and the output, never between the output and ground,
and join the load supply's ground to the controller's ground. For relay coils, solenoids
and motors, tie **COM** to the load supply so the clamp diodes can absorb the kick.

The **Darlington Driver** node has eight boolean inputs, **Channel 1** to **Channel 8**:
a true channel turns its output on. The firmware holds every input low through reset and
setup so nothing pulses on. Each channel takes up to 500 mA at up to 50 V, but do not run
all eight at full current, because the package limits the total heat. The array only
sinks and cannot source current, so it cannot drive a load that needs its positive
side switched. It is experimental until a load has been switched on a board.

### Dim lights or drive servos with a PCA9685

Choose **Add Hardware → Switching power → Adafruit PCA9685** for sixteen PWM
outputs on two I2C wires. Power **VCC** from 3V3, join **GND**, and wire **SDA**
and **SCL** to the board's I2C pins, which it can share with other I2C parts.
Leave **OE** unconnected to keep the outputs enabled. Each output has three
holes in a row: the PWM signal, the **V+** supply and ground. Feed the V+
terminal from a separate supply (5 to 6 V for hobby servos); Studio does not
draw that rail.

The **PWM Driver** node has sixteen inputs, **Channel 0** to **Channel 15**, each a
0 to 1 level: 0 is fully off and 1 fully on. Only the channels you wire are
written, and the chip keeps each waveform running between updates. All sixteen
share one frequency, set on the node: 1000 Hz suits LEDs and about 50 Hz suits
servos. The chip's own clock is only accurate to a few percent, so the real
frequency can differ a little. Pick an address from the node's list when you
chain boards, so each has its own (0x40 to 0x6F). The PCA9685 is not an
addressable-pixel output; use an LED output for those. The browser preview makes
no PWM, and the driver is experimental until a board has been measured.

### Sound a buzzer

Choose **Add Hardware → Amplifiers & DACs → KY-012 active buzzer** for a beep you
can trigger from the graph. Wire **SIG** to the GPIO the part shows and **GND** to
ground, and leave the middle pin unconnected. The **Buzzer** node has one boolean
input, **Sound**: the buzzer sounds while it is true and stops when it is false.
An active buzzer has its own oscillator, so its pitch is fixed at about 2.5 kHz and
the graph cannot change it. It draws about 30 mA, more than a GPIO should supply
for long or frequent sounds, so switch it through a transistor for those. It is
quieter from 3.3 V than from 5 V. The browser preview is silent, and the buzzer is
experimental until it has been sounded on a board.

For tones, choose **KY-006 passive buzzer** from the same menu. Wire **S** to the
GPIO and **-** to ground, and leave the middle pin unconnected; Joy-IT prints +V
there, but the buzzer sounds without it. A passive buzzer has no oscillator, so
the node gains a **Pitch** input: while **Sound** is true the controller plays a
square wave at that many hertz, from 100 to 10,000, and the pin rests low
otherwise. With nothing wired to Pitch it plays the **Pitch (Hz)** setting,
2000 Hz to start, which is where the KY-006 is loudest. Wire a Map Range in front
of Pitch to turn a knob or sensor into a pitch. A board plays one passive buzzer
at a time, so Graph Health refuses a second. It draws 25 mA or less from the pin;
if yours reads a few tens of ohms on a meter rather than open, it is a coil type
and needs a transistor. It is experimental too.

### Switch or dim a DC load

Choose **Switching power → LR7843 MOSFET switch** to turn a 6-28 V DC load on
and off, such as a 12 V LED strip that is not addressable, a fan, or a lamp.
Wire the board's GPIO to **PWM** and ground to **GND**. On the power end, the
load supply goes across **+** and **-**, the load's positive lead to **+**,
and its negative lead to **LOAD**. The board has no flyback diode, so add one
across a motor, solenoid or relay coil.

The node has two inputs:

- **On** switches the load. Nothing wired means off, so a switch you have just
  added never powers its load by surprise.
- **Level** dims it, from 0 to 1. Leave it at 1 for a plain on/off switch.
  Set it lower, or wire a knob, a sensor or a wave into it, and the firmware
  drives the pin with PWM at 500 Hz instead. That is slow on purpose: this
  board's MOSFET is driven through its optocoupler and resistors, not a gate
  driver, and a faster rate would heat it. With **On** unwired, a wire on
  **Level** runs the load by itself, so a potentiometer alone can be a dimmer.

The node's **Load** bar shows the share of power the load will receive, so a
dimmer can be tried in preview before anything is on the bench. The Build
Diagram lists the switch's drive as **on/off** or **PWM 500 Hz**. Dimming does
not suit addressable strips such as WS2812B: they need steady power and are
dimmed through their LED output instead. Very fast camera shutters can show
banding on a PWM-dimmed lamp.

### Switch four small DC loads

Choose **Switching power → MonkMakes Mosfetti** for four smaller loads from
one board: fans, pumps, indicator lamps or short 12 V accent strips. It arrives
as a kit, so solder its header and screw terminals first. Wire four GPIOs to
the header's **A**, **B**, **C** and **D**, and the board's ground to the fifth
pin, which carries a ground symbol rather than a label. That ground is not
optional: the Mosfetti is not isolated, and its header ground is the load
supply's negative. The load supply, 3-16 V DC, goes to the separate two-way
power terminal. Each load then connects across its channel's pair of output
terminals: the square pad is the supply's **+**, the other the switched
negative lead.

The node has an **On** and a **Level** for each channel, lettered as the board
is, and they work as the LR7843's do. A channel's Level below 1, or wired,
dims it with PWM at 1 kHz, the rate MonkMakes' own examples use. The node
shows a Load bar per channel.

Keep the loads small. One resettable fuse protects the whole board, so 2 A is
the limit for all four channels together, not for each one. Every channel has
its own flyback diode, so a pump or motor needs nothing extra. For a load
above 2 A, such as a long LED strip, use an LR7843 per load or the YYNMOS-4
below instead.

### Switch four LED rails

Choose **Switching power → YYNMOS-4 (LR7843)** to switch or dim four 12 V or
24 V LED rails, or other DC loads up to 5 A each, from one opto-isolated
board. Three different boards are sold under the YYNMOS-4 name; this is the
one with four LR7843 MOSFETs, four PC817 optocouplers and a small 78L12
regulator beside the supply terminals. Its screw terminals come fitted.

- The bottom row is the input side, a **PWM** and a **GND** for each channel.
  Wire each **PWM** to its GPIO and every **GND1** to **GND4** to the
  controller's ground: each input is its own optocoupler, so a channel whose
  GND is left off never switches. The Build Diagram draws a ground on all four.
- The top row is the load side. The load supply goes to **DC+** and **DC-**.
  Each load's positive lead goes to its channel's **OUT+** and its negative
  lead to **OUT-**.
- The board is not printed with its terminal names on top. Check the order on
  the board in hand before applying power.

Use a 7-28 V DC load supply. The gates are driven from the onboard 12 V
regulator, which cannot drive them properly from less than about 7 V, so this
board cannot switch a 5 V LED rail. Keep each channel to 5 A, or fit a
heatsink above that, and the whole board to 10 A, because every channel
returns through the one **DC-** terminal. Each channel has a small 1 A flyback
diode: enough for a relay coil or a solenoid, not for a large motor dimmed with
PWM.

The node has an **On** and a **Level** for channels 1 to 4. A Level below 1, or
wired, dims that channel with PWM at 500 Hz, the LR7843's rate. The listing
rates the inputs from 3 V; a 3.3 V pin is at the bottom of that range, so if a
channel does not switch, drive it from 5 V through a transistor or buffer.

### Cool an enclosure and read fan speed

Choose **Add Hardware → Cooling → Noctua NF-A4x10 5V PWM**. Connect the black
wire to **GND**, yellow to **5V**, green to the selected **RPM** GPIO and blue
to the selected **PWM** GPIO. The controller and fan must share ground. The RPM
wire is an open-collector output; generated firmware enables the controller's
pull-up, so do not add a pull-up to 5 V.

The **Cooling Fan** node accepts **Speed** from 0 to 1. It outputs active-high
PWM at 25 kHz and reads two tachometer pulses per revolution. **RPM** reports
the measured speed every 500 ms, and **Running** becomes true after pulses are
seen. With no Speed wire, use the node's Speed property. The preview estimates
1050 rpm at 20% and 5000 rpm at full speed; uploaded firmware uses the actual
tachometer instead. This first firmware path supports ESP32-family boards and
the normal sketch only. The fan remains experimental until a physical run is
recorded in the support matrix.

### Detect stationary presence

The **HLK-LD2410C Presence Sensor** detects a person who is moving or sitting
still and reports their distance up to 6 m. Power VCC from 5 V and GND from the
board. Wire the sensor's **TX** pad to the ESP32 GPIO shown as **RX (sensor TX)**
in Studio; leave RX and OUT unwired. Its UART is 3.3 V logic, so no divider is
needed. Mount the component/antenna face toward the occupied area and keep
metal and dense power wiring out of the space immediately in front of it.

The node offers Presence, Moving, Still, and Distance outputs. In preview,
toggle Moving and Still and drag the distance slider. Only one sensor can be
active because the generated reader owns UART1. If a DMX512 input also uses
UART1, Graph Health asks you to move DMX to UART2 on a board that provides it.
The feature requires an
ESP32-family target and remains experimental until the support matrix records
a compile and a physical comparison against the module's OUT indicator.

### Measure ambient light

**Add Hardware → Inputs** offers two light sensors. The **LDR light sensor** is
an analog divider on one ADC pin; its **Level** output is relative brightness
from 0 to 1, and **Lux** stays at 0 because a bare LDR cannot be calibrated.
The **Adafruit BH1750** reports calibrated illuminance over I2C. Power its
**VIN** from **3V3**, not 5 V: the breakout pulls the controller's SDA and SCL
up to VIN. Wire SDA and SCL to the board's I2C pins, which Studio fills in for
you. Leave **ADDR** unconnected for address 0x23, or tie it high and choose
0x5C, which lets two sensors share the bus.

The BH1750 node's **Lux** output is the measured reading. **Level** is Lux
divided by **Max Lux**, so set Max Lux to the brightest light the build should
react to (a lit room is a few hundred lux, daylight tens of thousands). In
preview, drag the node's knob. The BH1750 is experimental until the support
matrix records it on a real board.

### Measure temperature, humidity and pressure

Choose **Add Hardware → Inputs → Adafruit BME280 environment sensor** for three
calibrated measurements from one I2C board. Power **VIN** from **3V3**. Wire the
controller's SCL to the breakout's **SCK** pad and SDA to **SDI**; Studio fills
in the board's shared I2C pins. Leave SDO and CS unwired for the default 0x77
address. To use 0x76, tie SDO low (or close the ADDR jumper) and select 0x76 in
the inspector.

The node publishes **Temperature** in °C, **Humidity** in percent relative
humidity, and **Pressure** in hPa. These are physical values rather than 0–1
signals, so use Map Range before wiring one into brightness, hue, speed, or a
similar normalized property. The three on-node sliders simulate the readings
in preview. BME280 support is experimental until a physical comparison is
recorded in the support matrix.

### Measure temperature with a waterproof probe

Choose **Add Hardware → Inputs → Waterproof DS18B20 temperature probe** for a
sealed steel-tube thermometer that reads -55 to 125 °C, useful for enclosures,
heatsinks and outdoor builds. It has three loose wires: **red** to **3V3**,
**black** to **GND** and **yellow** (DATA) to the GPIO shown in the inspector.
DATA also needs a **4.7 kΩ pull-up resistor** to 3V3; the bare probe has none,
and the Build Diagram draws it beside the probe. Power the probe from 3V3, not
5 V, so DATA never rises above the controller's pin limit. Use one probe per
pin.

The node publishes **Temperature** in °C and **Connected**. Temperature is a
physical value, so use Map Range before wiring it into brightness, hue or
speed. Connected turns false when a reading fails, for instance when the probe
is unplugged, and Temperature then holds its last good value. In preview, the
on-node slider simulates the reading. The probe is experimental until a
physical comparison is recorded in the support matrix.

### Touch pads with an MPR121

Choose **Add Hardware → Inputs → Adafruit MPR121 12-key touch sensor** for twelve
capacitive-touch electrodes on the board's I2C bus. Wire **Vin** to 3.3 V, **GND**,
**SCL** and **SDA** to the controller's I2C pins, and leave **IRQ** unconnected. Each
of the twelve numbered holes takes a wire to a pad or a piece of foil, and the chip
senses a finger on it. Tie **ADDR** to GND for address 0x5A, to 3V for 0x5B, to SDA
for 0x5C or to SCL for 0x5D, and pick the same address in the inspector so two
controllers on one bus do not collide.

The node publishes **Electrode**, the lowest electrode touched as an index from 0 to 11
that stays at its value after release, **Touched**, true while any electrode is down,
**Count**, how many are down, and **Connected**. Use Compare or Map Range to turn the
index into a scene, a preset or a level. The two thresholds set how far a pad must
change from its baseline to count as touched or released: lower them for a more
sensitive pad, and raise the touch threshold if a pad triggers by itself. In preview,
the twelve pads on the node stand in for the electrodes. The MPR121 is experimental
until a physical run is recorded in the support matrix.

### Pick scenes with a 4x4 keypad

Choose **Add Hardware → Inputs → 4x4 matrix keypad** for sixteen keys on eight
GPIOs. The keypad is a passive membrane, so it has no power or ground: its eight
lines, **R1 to R4** then **C1 to C4**, go to the eight GPIOs shown in the inspector.
Rows read through the controller's pull-up, so avoid GPIO 34 to 39 for them, and
columns are driven low one at a time, so they must be able to output. Check the
order against the markings on your keypad's tail, because some are printed the other
way round.

The node publishes **Key**, the last key pressed as an index from 0 to 15 row by
row (1 2 3 A, 4 5 6 B, 7 8 9 C, * 0 # D), and **Pressed**, true while any key is
down. Key stays at its value after the key is released, so it can pick a scene or a
preset; use Map Range or a comparison to turn it into a control. Two keys pressed
together can read as a third, because the matrix has no diodes, and only the first
key found is reported. In preview, the sixteen buttons on the node stand in for the
keys. The keypad is experimental until a physical run is recorded in the support
matrix.

### Sense movement with a microwave radar

The **Motion Sensor** node also takes an **RCWL-0516 microwave motion sensor**:
choose **Add Hardware → Inputs → RCWL-0516 microwave motion sensor**, or switch
the module in the inspector. It is a 3.2 GHz Doppler radar, so unlike the PIR it
senses movement through a plastic case, glass or a thin wall, at roughly 5 to 7 m
in every direction. Wire **VIN** to **5 V** (it takes 4 to 28 V), **GND** to
**GND** and **OUT** to the GPIO shown in the inspector. OUT is 3.3 V logic, safe
for an ESP32 pin. Leave **3V3**, which is an output, and **CDS** unwired. Keep more
than 1 cm of clear space behind the board and away from metal.

The node is the same as for the PIR: **Motion** is true while the radar senses
movement. The module holds OUT high for about two seconds after the last movement,
so it re-triggers rather than pulsing. Because it senses through walls, it can
trip on movement you cannot see. The RCWL-0516 is experimental until a physical
run is recorded in the support matrix.

### Read tilt and rotation with an accelerometer and gyroscope

Choose **Add Hardware → Inputs → GY-521 MPU-6050 accelerometer and gyroscope**
for a six-axis motion sensor, useful for portable or wearable builds. Wire
**VCC** to **3V3**, **GND** to **GND**, and **SDA** and **SCL** to the board's I2C
pins, which the shelf fills in. Leave **AD0** unwired for address 0x68, or tie it
high for 0x69. A DS3231 clock also answers at 0x68, so choose 0x69 when both share
a bus. XDA, XCL and INT are not needed.

The node publishes **Accel X, Y and Z** in g, **Gyro X, Y and Z** in degrees per
second, and **Connected**. Lying flat, gravity reads about +1 g on Z, so tilting
the board swings X and Y between -1 and +1. The ranges are plus or minus 2 g and
plus or minus 250 degrees per second. These are physical values, so use Map Range
before wiring one into brightness, hue or speed. Connected turns false when the
sensor stops answering, and the last good values are held. In preview, six sliders
stand in for the axes. The sensor is experimental until a physical run is recorded
in the support matrix.

### Steer with a thumb joystick

Choose **Add Hardware → Inputs → KY-023 analog joystick** for a thumb stick with
two analog axes and a push switch. It has five pins: **GND** to **GND**, **+5V**
to **3V3**, **VRx** and **VRy** to the two analog GPIOs shown in the inspector,
and **SW** to the third. The module is marked +5V, but it is only two
potentiometers and a switch; powering it from 3.3 V keeps both axis voltages
inside the controller's ADC range. On a classic ESP32 use ADC1 pins (32 to 39)
for the axes, because ADC2 stops working while Wi-Fi is on.

The node publishes **X** and **Y** from -1 to 1 with 0 at rest, and **Pressed**
while the stick is pushed down. Use Map Range to bridge an axis to brightness,
hue or speed. **Dead zone** sets how far the stick must move before an axis
leaves 0, so a stick that never rests exactly at centre does not flicker the
graph. Which direction is positive depends on how the module is mounted. In
preview, two sliders stand in for the axes and the button for the switch. The
joystick is experimental until a physical run is recorded in the support matrix.

### Measure distance with an ultrasonic sensor

Choose **Add Hardware → Inputs → HC-SR04 ultrasonic distance sensor** for a
non-contact reading from about 2 cm to 4 m. It has four pins: **VCC** to **5 V**,
**GND** to **GND**, **Trig** to the first GPIO shown in the inspector and
**Echo** to the second. Echo swings to 5 V, which a 3.3 V controller pin does not
tolerate, so it goes through a **1 kΩ and 2 kΩ divider** the Build Diagram draws
beside the module. Trig can be driven at 3.3 V.

The node publishes **Distance** in millimetres and **Connected**. Distance is a
physical value, so use Map Range before wiring it into brightness, hue or
speed. Connected turns false when no echo returns, for instance when nothing is
in range or the sensor is unplugged, and Distance then holds its last good
value. Readings are taken every 60 ms. Soft or steeply angled surfaces reflect
poorly and can read as no echo. In preview, the on-node slider simulates the
reading. The sensor is experimental until a physical comparison is recorded in
the support matrix.

### Measure distance with a VL53L0X laser sensor

Choose **Add Hardware → Inputs → VL53L0X laser distance sensor** for a reading from
about 3 cm to 1.2 m over I2C. Wire **VIN** to **3V3**, **GND** to **GND**, and **SDA**
and **SCL** to the board's I2C pins, which it can share with other I2C parts. One sensor
answers on 0x29; leave **2v8**, **GPIO** and **SHDN** unconnected. No jumper changes the
address. To put two on the same bus, wire a separate GPIO to each **SHDN** pin and give
each sensor its own address from 0x30 to 0x33. Every chip wakes on 0x29, so that address
stays free and the sketch holds the other sensor in reset while it moves one.

It uses the same **Distance Sensor** node as the ultrasonic part, with the same **Distance**
(millimetres) and **Connected** outputs. Unlike the other I2C parts it needs a library, the
Pololu VL53L0X library, which Studio installs the first time you compile a sketch that
uses it. A reading of 8190 mm or more means nothing is in range, and Distance holds its last
good value. If the sensor is unplugged, Connected goes false and Studio looks for it again
once a second; each look can stall the animation briefly. Accuracy is 3 to 12% depending on
the target and the light, and dark or very reflective surfaces read worst. It is experimental
until a physical comparison is recorded in the support matrix.

### Measure distance with a VL53L1X laser sensor

Choose **Add Hardware → Inputs → VL53L1X laser distance sensor** for the same kind of
reading as the VL53L0X but out to about 4 m. Its six header holes are **VIN**, **GND**,
**SDA**, **SCL**, **XSHUT** and **GPIO**: wire VIN to **3V3**, GND to **GND**, and SDA and
SCL to the board's I2C pins. One sensor leaves **XSHUT** and **GPIO** unconnected and
answers on 0x29. To share the bus with another VL53L0X or VL53L1X, wire a separate GPIO
to each **XSHUT** pin and give each sensor an address from 0x30 to 0x33. Two fitted STEMMA QT
connectors offer a plug-in alternative. It uses the same **Distance Sensor** node and
outputs, and needs Pololu's VL53L1X library, which Studio installs the first time you
compile a sketch that uses it. It runs in long distance mode, reading about every 50 ms;
a reading with a poor return holds the last good distance. It is experimental until a
physical comparison is recorded in the support matrix.

### Connect by Ethernet

Art-Net input and NTP clock sync normally use Wi-Fi. For a cable instead, choose
**Add Hardware → Network → WIZnet WIZ850io**. Power it from **3V3** only; it
draws up to about 140 mA once a link is up, so check that your board's 3.3 V
regulator has that to spare. Studio fills in its six signal pins (SCLK, MOSI,
MISO, SCNn, INTn, RSTn) for you. The module has no pin names printed on it, so
wire it from the Build Diagram, which names each pad.

With the module on the bench, the DMX / Art-Net and RTC Clock nodes stop asking
for a Wi-Fi network and password. Their hostname and DHCP or static-address
settings apply to the cable instead. The module needs an ESP32, ESP32-S2, S3,
C3 or C6 board. On a C3 or C6 it shares the one SPI bus with a colour display
panel, so give both the same SCK and MOSI pins. Wired Ethernet is experimental
until the support matrix records it on a real board.

### Add an IR remote receiver

Open **Inputs → IR Receiver** in the Hardware shelf, then choose the exact receiver
you own. The module choice is electrical, not cosmetic: a KY-022 breakout puts
supply on its centre pin, while a bare TSOP38238 puts ground there. KY-022
clones can also swap their outer signal and ground pins, so check the board's
silkscreen or data sheet before applying power. Configure the signal GPIO in
the Hardware inspector; the receiver itself drives that line, so Studio does
not enable an internal pull-up.

The receiver's graph node starts with **Learn button…** and no usable key
outputs. To create a mapping:

1. Click **Learn button…**, name the key, choose the board's serial port, and
   upload the temporary learning sketch. Studio deliberately does not reuse a
   cached project build for this diagnostic.
2. Press the remote key once. Studio records its protocol, address and command
   under a stable mapping id. Manual entry is available when a receiver cannot
   be connected during authoring.
3. Choose **Once** for an action that should fire on the first decoded frame,
   or **Held** when the remote's repeat frames should keep firing.
4. Wire a learned boolean output to an action. For numeric properties, wire
   increase/decrease/reset keys into **Step Value**, then wire its Value output
   to the property's exposed input. Power commonly goes through a
   **Trigger** in Toggle mode. For separate On and Off keys, connect them to
   Toggle's **On** and **Off** inputs, then connect **Out** to the LED output's
   **Enabled** input. Toggle remembers the state between presses; **Start on**
   chooses the startup state, and Off wins if both commands arrive together.
   In an SD/player graph, route player and LED
   controls through **Control Map → Music Player**.
5. Upload the project again after learning; the temporary learner is not the
   project firmware. Cancelling or completing the learner releases the serial
   port.

The learning upload is refused until the workspace is trusted. Project builds
pin Arduino-IRremote 4.7.1: the helper installs or vendors it lazily, an
exported `.ino` carries the exact `arduino-cli lib install IRremote@4.7.1`
instruction, and a project without an IR receiver does not include the
library. ESP32-S3 uses native RMT hardware to capture the signal and the same
library to decode it; it requires Arduino-ESP32 3.x or newer. The learner and
project firmware select this automatically, so the workflow above also applies
to S3. Other boards use the library's normal receiver. The selected GPIO must
be free, and a receiver connected directly to an S3 GPIO must use 3.3 V logic.

Resolve these Graph Health findings before upload or export:

| Finding | Repair |
| --- | --- |
| More than one IR receiver | Keep one root-owned receiver and move every mapping to it. |
| No learned keys | Learn a key or enter a complete mapping manually. |
| Blank, unsupported or out-of-range mapping | Relearn the key, or correct its protocol, address and command. |
| Duplicate key identity | Relearn or edit one row so protocol, address and command are unique. |
| Wired output has no mapping | Repair the retained mapping row or remove the stale wire. |
| Selected board is unsupported | Choose a supported FQBN or remove the receiver. |
| Receiver GPIO conflicts | Move the signal to a free digital-input GPIO. |
| Invalid Step Value range | Use finite values, a positive step, `Max > Min`, and an initial value inside the range. |

IR receive remains experimental until a row in the beta support matrix records
the exact receiver, remote, board, pin and press/hold behavior under active LED
output. A minimal learner succeeding is not evidence that long, interrupt-
blocking LED writes will preserve every repeat frame.

Hardware entries are intentionally absent from the Node Library. Creating the
part from the workbench means Studio knows which board owns it and can assign
board-appropriate starting pins.

Some components appear in both views because they carry a signal:

- microphone, line-in, and input/sensor parts produce graph data;
- RTC produces a clock signal; and
- an LED output consumes a frame.

Auxiliary displays also have graph nodes: fixed panels consume display data,
while touch panels can publish controls as well. They are separate screens and
do not consume any of the LED output's pixels.

Board, SD Card, and amplifier/DAC parts are workbench-only. They persist as part
of the project and affect validation or code generation, but they do not carry
a graph signal.

## Configure wiring

Click a part to open its wiring inspector. The pin picker:

- filters for the capability the connection needs;
- prefers unoccupied, known-good header GPIOs;
- identifies conflicts and caution pins; and
- provides **Other GPIO…** for deliberate hand wiring.

Changing the board retargets assignments Studio chose. Pins the user changed
are treated as intentional and remembered per physical board. This lets a
project move between boards without silently overwriting hand wiring.

Right-click a part for hardware actions. **Show in graph** is available for
signal-carrying parts. Removing a node on the graph disconnects it but does not
pretend the part vanished from the bench; use **Remove** in the
workbench to remove it completely.

### Connect a line-level player

On an ESP32-S3 project, add **PCM1802 line-in ADC** when an external audio
player cannot expose decoded PCM to Studio firmware. Connect the player's
line-level left/right output to the breakout's RCA inputs, then configure MCLK,
BCLK, LRCLK, DOUT, and the channel choice in the part inspector. Do not connect
a bridge-tied speaker output to the RCA inputs.

The part becomes an Audio source for FFT, beat, percussion, and feature nodes.
Generated firmware samples the physical ADC; browser preview uses the selected
browser/OS audio input because a web app cannot read the breakout directly.
Other controller targets are rejected until their master-clock path is
implemented and verified.

### Drive speakers from a power amplifier

An SD music show needs something on the board's pins to turn the song into
sound. A **MAX98357A** drives a small speaker directly. For a bigger amplifier,
add a **PCM5102A** or **UDA1334A** DAC and then a **power amplifier**
(**PAM8403**, **PAM8610** or **DX-0809**). The DAC takes the three I2S wires
from the board; plug its line out into the amplifier's line input, and the
amplifier drives the speakers. The power amplifier has no GPIO of its own, so
the Build Diagram labels its input with the DAC that feeds it rather than
drawing a wire.

- Volume is set on the DAC. With a DAC in the chain, the power amplifier's
  volume field is hidden, because the DAC is the part the board drives.
- The PAM8610 and DX-0809 run on 12 V and need their own supply. The controller
  cannot power them. Connect that supply's ground to the board and the DAC.
- For stereo without a power amplifier, add a **MAX98357A stereo pair**: two
  boards on the same BCLK, LRC and DIN lines, one per speaker. Set each board's
  SD pin so one plays left and the other right. An unmodified board plays the
  left-plus-right mix. The Build Diagram wires the left board and lists the
  lines the right board shares.
- A MAX98357A cannot feed a power amplifier. Its speaker output is not line
  level, and neither of its outputs is ground. Graph Health refuses that
  combination and asks for a DAC instead.
- With no DAC on the bench, a power amplifier takes line level from the classic
  ESP32's own DAC on GPIO25 and GPIO26. No other board has a DAC, so on an
  ESP32-S3 add a PCM5102A or UDA1334A.

Power amplifiers have no hardware validation yet; see the
[support matrix](../release/beta-support-matrix.md#experimental-until-validated).

## Configure LED outputs

One implementation type backs all five fixture forms, but the workbench offers
each as the object a user buys. Configuration is split by responsibility:

- the physical inspector owns GPIO assignments and module identity;
- the graph node owns pixel count or dimensions, chipset, colour order, frame
  fit/crop route, matrix/panel/custom layout, correction, dithering, and
  supersampling; and
- the Board owns master brightness and power policy shared by every output.

Each output renders in its own physical shape in the graph and workbench. Click
an output on the Hardware tab to make it the route displayed in the side preview.

For an LED Corkscrew, set the chain length, number of turns, LED 0 angle,
winding direction, cylinder diameter, and finished height. Studio authors the
effect on an unwrapped cylinder, then uses the same helical sample map for the
browser preview and generated firmware.

## Wire a knob or a button to something

Blackout, dimming and pattern intent are wires, not project settings. Add the
control as a part — **Potentiometer**, **Button**, **Rotary Encoder** — then
wire it to the property or named action it should control. Right-click a
runtime field and choose **Expose input** to draw that socket; dragging onto
the property row exposes and connects it in one step. Use **Control Map**
when you want one compact bundle, conversion, chaining or repeat settings.
Dropping on its trailing socket asks what that control should do and mints a
port named for the job, offering only the jobs this chain can actually carry
out: a bundle ending at an LED output is offered blackout and dimming, one
ending at a Pattern Slideshow is offered pattern intent, and one reaching Music
Player is offered all of it. Each option says whether it is an edge (*on each
press*) or a position (*holds its position, 0 to 1*).

The node's single **Controls** output then goes to whatever should obey it:

| Destination | What it takes |
| --- | --- |
| LED output **Controls** | Blackout toggle, brightness level and up/down steps |
| Pattern Slideshow **Controls** | Pattern selection, previous/next, confirm |
| Music Player **Controls** | Transport, volume, blackout, dimming and pattern intent |
| Another Control Map **Controls In** | Chains banks of controls into one bundle |

An LED output's **Enabled** and **Brightness** inputs take a plain wire too, for
a graph with no controls in it. Unwired, an output is lit and undimmed, so
adding these ports to an existing project cannot darken it. Blackout, dimming
and the Controls bundle combine rather than override each other.

Two Start Gallery patches arrive with both ends already wired: **Dimmer and
Blackout** (a knob and a button reaching an LED output, no player anywhere) and
**Browse a Slideshow** (an encoder turning a highlight, a press committing it,
and an OLED showing what you are about to play).

## Add and connect a display

Open **Displays** in the Hardware shelf, then choose the exact module you need.
Select the added part on the Hardware tab to configure its GPIO. The
[display reference](../reference/displays.md) lists the available modules,
connections, and build limitations. An unlisted controller, resolution, or
touch module is unsupported; choosing a similar-looking part does not make its
driver compatible.

For **Segment Display**, **Info Display**, and built-in **Display Panel**
screens, connect the source's **Display** output to the panel's **Display** input.
RTC Clock selects a clock, Music Player selects transport information,
Pattern Slideshow selects its pattern status/browser, and an LED output
selects **LED Status**. The TFT's presentation setting chooses between
treatments of its connected source. There are no separate
Title/Artist/Progress inputs on the physical panel.

On the Hardware tab, each display shows its live output on the module's own
screen, as the real part would with its header at the bottom. A rotation set
for an upside-down or sideways mounting therefore looks upside down or sideways
there, the way the panel would look on your desk. A disabled panel goes dark.
The XC4630 shield is pictured from its component side, so its screen is not
visible on the bench. A board with its own screen, such as the
ESP32-2432S028R, shows the output on that screen; click the screen to
configure the display.

For fixed music touch, wire named Touch outputs such as **Play / Pause**
straight to matching Music Player action inputs, or connect **Touch
Controls → Control Map Controls In → Music Player Controls** when you
want one compact bundle or need continuous volume/brightness. Custom
screens publish their individual widget outputs on the companion Touch
node. Fixed Show Status and Clock screens have no touch actions.

### Design a custom screen

1. Add a physical **Display panel** and choose its exact module. Set its
   GPIO/touch pins in Hardware.
2. Set the panel's **Layout** to **Custom design**, then click **Edit
   screen design** on its graph node. This mints a design on the panel
   itself — already sized to the glass — and opens the editor. Switching
   Layout back to a fixed presentation sets the design aside; choosing
   Custom design again restores it. There is no second node and no Screen Design cable. The
   panel keeps its Display wire: that source is what bound widgets read.
3. In **Design**, place widgets or a template, then edit labels, bounds,
   theme and assets. A template whose destination is unambiguous draws
   ordinary graph wires when it is placed; **Connect template controls**
   fills any that are still missing, without overriding a wire you
   already drew. **Portrait**/**Landscape** rotates the panel and re-fits
   the design to what it then shows, so the two can never disagree.
4. Return with **Graph**, or with the panel's own name in the breadcrumb
   to land on it. Widget outputs leave through the companion **Touch**
   node. A 0–1 Slider can drive a normal-sketch LED output's Brightness
   input. For SD music playback, assign fixture brightness through
   **Control Map → Music Player**; a player's own Volume is a direct
   property input. Bound readouts take a field of the panel's Display
   source from the inspector's **Reads** row; use **Song Info** only when
   you genuinely need one field on a cable.
5. **Run** exercises local touch controls and repaints graph-fed readouts as
   the graph publishes them. It is a simulation, not a hardware connection:
   it does not verify physical touch calibration or on-device draw rate.
6. Resolve Graph Health and resource issues, measure capacity, then upload.

For a panel self-test, choose **Diagnostics** in the panel's layout menu.
It overrides a screen design as well as the fixed layouts, so there is
nothing to disconnect first, and the Display source wire can stay.
Upload to check the physical panel and mapped XPT2046 touch coordinates;
choose the previous layout to restore content. Touch X/Y Min/Max
properties take measured raw bounds for that exact module. Save and
upload after changing them. Defaults are provisional and Diagnostics is
not a raw sample collector. The companion Touch node's **Calibrate
touch** wizard captures the four corners for you: choose the board's
port, press **Upload calibration sketch**, and it flashes a temporary
measuring sketch built from the panel alone, listens for the raw
readings it prints, and guides you corner by corner. It works on a graph
that cannot otherwise be deployed — a screen with no LED output, say —
because the sketch is built from the panel, not the graph. Saving
updates the Touch node and releases the port; upload your project again
to run with the measured bounds.

Readout widgets receive values. Buttons publish boolean outputs. Toggles,
sliders, and dials also have an optional **Set** input: touch owns a control
while held, and its wired Set value takes over after release. With Set
unwired, it retains its local value. See the
[widget role table](../reference/displays.md#widget-ports) for the complete map.

Renaming or moving widgets preserves connections. Deleting a wired widget
asks before removing its connections. Copying widgets creates independent
widgets that need their own graph wiring. The screen document is saved with the
project, and layout edits participate in undo/redo; temporary Run-mode touch
values are not saved.

Use distinct chip-select lines when sharing a compatible SPI bus between a TFT,
touch controller, and SD card. TM1637 is not I²C and needs a separate CLK/DIO
pair per module. Resolve pin conflicts in Graph Health and review the Build
Diagram. Shared-bus operation under audio and LED load, touch calibration, and
screen performance still need physical validation; successful compilation does
not close those checks.

## Navigate the workbench

The Hardware tab has the whole canvas to itself. Use **−**, **+**, and
**Fit** to navigate the true-scale arrangement. Studio keeps the view anchored
when the window or side panels change size, so the part being inspected does
not jump away.

Parts on the workbench light up as the real ones would while your project
runs. Power LEDs glow. A relay's channel LED lights while that channel is on,
and a Mosfetti channel LED dims with its channel. An IR receiver's indicator
lights while you hold one of its keys on the node, and a ZY12PDN shows the
colour of the voltage it asks for. A board shows only its power LED lit,
because an idle board's TX, RX and user LEDs are dark until a sketch drives
them.

The workbench is not the Build Diagram. Its automatic links answer “what is
connected to this board?” Open the **Build Diagram** tab for pin-level wiring,
power distribution, fusing, a parts list, connection CSV, SVG export, and print
sheets.

## Upload and inspect output

Open the **Upload** tab. Its left panel holds the controls and the canvas holds
the console:

- the guided setup wizard and Board/Port control;
- **Getting to your board**: the steps from your patch to the board
  (Preview, Graph, Capacity, Connection), each opening to say what comes next.
  Builds tested on real hardware are listed in the
  [beta support matrix](../release/beta-support-matrix.md);
- the expandable **Build tools & port** checklist (helper, engine, toolchain,
  port);
- the user-initiated measured flash/RAM capacity check;
- normal Upload and cancellation;
- re-upload, generated-code view, and `.ino` export;
- Wiring Test and HUB75 topology diagnostics;
- **Share a report…**, to tell us how a build went on your hardware;
- Stream Receiver and Live Stream actions; and
- an embedded console with separate **Output** and **Serial** tabs, verbose
  toolchain output, baud selection, connect/disconnect, and clear controls.

The helper serializes builds. A capacity check requested during another build
is reported as queued, and a running compile can be cancelled before anything
is sent to the board.

For a music-synchronised SD show, add an SD Card and the appropriate audio-output
part first. Upload then packages the selected music/show content and flashes the
player path. A connected Pattern Slideshow uses the show-controller generator; ordinary
graphs use the normal sketch generator. An SD card alone does not select the
player; the qualifying music/show graph also has to exist.

## Support boundary

A board profile or compile target means Studio knows how to describe or build
for that target; it is not evidence that every peripheral and workflow works on
real hardware. Graph Health reports what can be inferred statically. The
[beta support matrix](../release/beta-support-matrix.md) is the authority for
recorded end-to-end combinations.
