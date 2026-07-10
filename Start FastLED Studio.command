#!/bin/bash
# macOS double-click launcher — opens Terminal and runs the shared start script.
#
# First time only: macOS may block a downloaded .command file. Right-click
# this file, choose "Open", then confirm — after that a normal double-click
# works.
cd "$(dirname "$0")" || exit 1
exec bash ./start.sh
