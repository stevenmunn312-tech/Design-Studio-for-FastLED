"""fbuild's ESP32 RAM figure loses the placeholder section it should not count."""

import struct

import firmware
import toolchain

FQBN = "esp32:esp32:esp32s3"


def _elf(sections: dict[str, int]) -> bytes:
    names = b"\0" + b"".join(name.encode() + b"\0" for name in sections) + b".shstrtab\0"
    headers = [struct.pack("<10I", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)]
    offset = 1
    for name, size in sections.items():
        headers.append(struct.pack("<10I", offset, 8, 3, 0, 0, size, 0, 0, 4, 0))
        offset += len(name) + 1
    names_at = 52
    headers.append(struct.pack("<10I", offset, 3, 0, 0, names_at, len(names), 0, 0, 1, 0))
    shoff = names_at + len(names)
    ident = b"\x7fELF\x01\x01\x01" + bytes(9)
    head = ident + struct.pack("<HHIIIIIHHHHHH", 2, 94, 1, 0, 0, shoff, 0, 52, 0, 0, 40, len(headers), len(headers) - 1)
    return head + names + b"".join(headers)


def _project(tmp_path, monkeypatch, sections):
    monkeypatch.setattr(toolchain, "_FBUILD_PROJECT_DIR", tmp_path)
    release = tmp_path / ".fbuild" / "build" / toolchain._fbuild_env_for_fqbn(FQBN) / "release"
    release.mkdir(parents=True)
    (release / "firmware.elf").write_bytes(_elf(sections))


def _sizes(used):
    return {"flash": None, "ram": {"usedBytes": used, "limitBytes": 327680, "percent": round(used * 100 / 327680)}}


S3 = {".dram0.dummy": 50432, ".dram0.data": 14824, ".dram0.bss": 8448, ".flash.text": 192756}


def test_elf_section_sizes_reads_names_and_sizes(tmp_path):
    path = tmp_path / "firmware.elf"
    path.write_bytes(_elf(S3))
    assert firmware._elf32_section_sizes(path)[".dram0.dummy"] == 50432
    assert firmware._elf32_section_sizes(tmp_path / "missing.elf") == {}
    path.write_bytes(b"not an elf")
    assert firmware._elf32_section_sizes(path) == {}


def test_the_placeholder_leaves_the_ram_figure(tmp_path, monkeypatch):
    _project(tmp_path, monkeypatch, S3)
    # The printed line: 71.98KB, a few bytes off the exact 73,704.
    corrected = firmware._without_ram_placeholder(_sizes(73708), FQBN, None, False)
    assert corrected["ram"] == {"usedBytes": 23272, "limitBytes": 327680, "percent": 7}


def test_a_figure_that_does_not_count_the_placeholder_is_left_alone(tmp_path, monkeypatch):
    _project(tmp_path, monkeypatch, S3)
    sizes = _sizes(23272)
    assert firmware._without_ram_placeholder(sizes, FQBN, None, False) == sizes


def test_an_image_without_the_placeholder_is_left_alone(tmp_path, monkeypatch):
    _project(tmp_path, monkeypatch, {".data": 100, ".bss": 200})
    sizes = _sizes(300)
    assert firmware._without_ram_placeholder(sizes, FQBN, None, False) == sizes
    assert firmware._without_ram_placeholder({"flash": None, "ram": None}, FQBN, None, False) == {"flash": None, "ram": None}
