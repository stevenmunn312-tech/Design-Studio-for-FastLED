"""PyInstaller entry point for the esptool executable bundled beside fbuild."""

from esptool import _main


if __name__ == "__main__":
    _main()
