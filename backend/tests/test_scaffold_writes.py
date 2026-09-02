"""The fbuild project scaffold must not touch files it isn't changing.

fbuild decides what to recompile from mtimes, so a write that replaces a file
with its own bytes is a rebuild nobody asked for: on an ESP32-S3 re-upload of
an unchanged design it recompiled the sketch, relinked, and rebuilt every
FastLED object including a patched header.
"""
import app


def test_write_if_changed_leaves_an_identical_file_alone(tmp_path):
    target = tmp_path / "main.ino"
    target.write_text("void setup() {}\n", encoding="utf-8")
    before = target.stat().st_mtime_ns

    assert app._write_if_changed(target, "void setup() {}\n") is False
    assert target.stat().st_mtime_ns == before


def test_write_if_changed_writes_when_the_content_differs(tmp_path):
    target = tmp_path / "main.ino"
    target.write_text("void setup() {}\n", encoding="utf-8")

    assert app._write_if_changed(target, "void loop() {}\n") is True
    assert target.read_text(encoding="utf-8") == "void loop() {}\n"


def test_write_if_changed_creates_a_missing_file(tmp_path):
    target = tmp_path / "new" / "main.ino"
    target.parent.mkdir()

    assert app._write_if_changed(target, "fresh\n") is True
    assert target.read_text(encoding="utf-8") == "fresh\n"


def test_re_writing_the_same_sketch_does_not_touch_main_ino(tmp_path, monkeypatch):
    src = tmp_path / "src"
    src.mkdir()
    monkeypatch.setattr(app, "_FBUILD_SRC_DIR", src)
    ino = "#include <FastLED.h>\nvoid setup() {}\nvoid loop() {}\n"

    app._write_fbuild_main(ino)
    before = (src / "main.ino").stat().st_mtime_ns
    app._write_fbuild_main(ino)

    assert (src / "main.ino").stat().st_mtime_ns == before
    # A real edit still lands, or the board would keep running the old design.
    app._write_fbuild_main(ino + "// changed\n")
    assert (src / "main.ino").read_text(encoding="utf-8").endswith("// changed\n")


def test_patching_an_already_patched_fastled_touches_nothing(tmp_path, monkeypatch):
    # The patcher runs once per helper process against a tree that is almost
    # always already patched -- the second run must be a no-op on disk.
    lib = tmp_path / "FastLED"
    monkeypatch.setattr(app, "_FBUILD_LIB_DIR", lib)
    sources = {
        "src/platforms/arm/samd/isr_samd.hpp":
            "PORT_PMUX_PMUXO_A PORT_PMUX_PMUXE_A NVIC_DisableIRQ(EIC_IRQn)\n",
        "src/platforms/arduino/audio_input.hpp":
            "#elif FL_HAS_INCLUDE(<I2S.h>)\n#include <I2S.h>\n",
        "src/platforms/spi_device_proxy.h":
            "#elif defined(FL_IS_SAM) || defined(FL_IS_SAMD)\n",
        "src/platforms/spi_output_template.h":
            "#elif defined(FL_IS_SAM) || defined(FL_IS_SAMD)\n",
    }
    for relative, text in sources.items():
        path = lib / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    app._patch_fastled_samd51_build()
    patched = {
        relative: ((lib / relative).stat().st_mtime_ns,
                   (lib / relative).read_text(encoding="utf-8"))
        for relative in sources
    }
    # The first pass has to have done something, or the second proving nothing
    # changed would prove nothing at all.
    for relative, text in sources.items():
        assert patched[relative][1] != text, relative

    app._patch_fastled_samd51_build()
    for relative, (mtime, text) in patched.items():
        assert (lib / relative).stat().st_mtime_ns == mtime, relative
        assert (lib / relative).read_text(encoding="utf-8") == text, relative


def test_the_sketch_workspace_is_the_same_directory_every_build(tmp_path, monkeypatch):
    # arduino-cli keys its build cache on a hash of the sketch path, so the
    # path has to be stable across builds or every compile is a cache miss.
    monkeypatch.setattr(app, "_SKETCH_DIR_ROOT", tmp_path / "sketches")
    ino = "void setup() {}\n"

    with app._sketch_workspace("fastled_pattern", ino) as first:
        assert (first / "fastled_pattern.ino").read_text(encoding="utf-8") == ino
        written = (first / "fastled_pattern.ino").stat().st_mtime_ns
    with app._sketch_workspace("fastled_pattern", ino) as second:
        assert second == first
        # Unchanged source must not be touched either, or arduino-cli rebuilds
        # the sketch object it just cached.
        assert (second / "fastled_pattern.ino").stat().st_mtime_ns == written

    # The directory outlives the build: deleting it would strand the cache.
    assert first.exists()


def test_a_changed_sketch_still_reaches_the_workspace(tmp_path, monkeypatch):
    monkeypatch.setattr(app, "_SKETCH_DIR_ROOT", tmp_path / "sketches")
    with app._sketch_workspace("fastled_pattern", "void setup() {}\n"):
        pass
    with app._sketch_workspace("fastled_pattern", "void loop() {}\n") as sketch_dir:
        assert (sketch_dir / "fastled_pattern.ino").read_text(encoding="utf-8") == "void loop() {}\n"


def test_two_sketch_names_get_their_own_workspace(tmp_path, monkeypatch):
    # A player and an ordinary sketch are different programs; sharing one
    # directory would make each build evict the other's cache.
    monkeypatch.setattr(app, "_SKETCH_DIR_ROOT", tmp_path / "sketches")
    with app._sketch_workspace("fastled_pattern", "a\n") as one:
        with app._sketch_workspace("player", "b\n") as two:
            assert one != two
            assert (two / "player.ino").read_text(encoding="utf-8") == "b\n"


def test_a_concurrent_build_gets_a_private_directory(tmp_path, monkeypatch):
    # Two builds writing different sketches into one directory would flash a
    # binary built from the other one's source, so the second falls back to a
    # throwaway directory rather than sharing or waiting.
    monkeypatch.setattr(app, "_SKETCH_DIR_ROOT", tmp_path / "sketches")
    with app._sketch_workspace("fastled_pattern", "first\n") as held:
        with app._sketch_workspace("fastled_pattern", "second\n") as fallback:
            assert fallback != held
            assert (fallback / "fastled_pattern.ino").read_text(encoding="utf-8") == "second\n"
            # The held workspace keeps the sketch actually being built.
            assert (held / "fastled_pattern.ino").read_text(encoding="utf-8") == "first\n"
            private_root = fallback.parent
        # A fallback owns its directory and takes it away with it.
        assert not private_root.exists()
    # The shared one is reusable again once released.
    with app._sketch_workspace("fastled_pattern", "third\n") as again:
        assert again == held
