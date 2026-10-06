# Your first project

Start with a small pattern in the browser, then configure the hardware when
you are ready to upload. Previewing does not require a connected board.

## Choose a starter

Choose **Start with Juggle**, or open **Start** and choose a guided patch.
Juggle starts with two nodes and a wire. On the **Graph** tab, read the flow
from the pattern source to the **LED output**.

Change the pattern's speed, count or colours and watch the preview follow.
The optional First project guide reads progress from the project itself:
you can close it, reopen it, or complete steps without keeping it open.

## Choose your board and LEDs

Open **Hardware**, select the board and choose its family and exact physical
profile. Select the LED output and set the fixture type, dimensions or count,
chipset, colour order and data pin to match your hardware.

Use the [hardware workbench guide](../user/hardware-workbench.md) for parts,
pins, controls and displays. The [support matrix](../release/beta-support-matrix.md)
identifies the exact combinations with recorded hardware validation; other
configurations remain experimental.

## Check readiness

Open **Upload** and resolve the issues reported by **Graph Health**.
Use **Check capacity** to compile for the selected board without flashing it.
A passing preview alone does not prove that the firmware fits the board.

Compilation requires the [local upload helper](upload-helper.md). The
**Build tools & port** section shows its status and the selected serial port.

## Upload

Connect the board over USB, choose its port on **Upload**, then press
**Upload**. Read the Output/Serial console for progress and failures.

If you are staying in the browser, you can keep editing and previewing,
save the project, view generated code or export an `.ino` without uploading.
Disk-backed sync and native file dialogs require the helper.

For more examples and node reference pages, open **Help** in the app.
