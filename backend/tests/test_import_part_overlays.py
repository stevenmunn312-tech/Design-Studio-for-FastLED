"""The part importer's overlay merge: measured facts stay measured.

`import-part-assets.py` merges each part's repository overlay
(`src/build/parts/overlays/<part-id>.json`) over the measured facts of its
`part.json`. These tests cover the rules; the Vitest suite validates the
generated manifests against the app's own schema.
"""
import importlib.util
import json
import sys
from pathlib import Path

import pytest

pytest.importorskip("PIL")

_ROOT = Path(__file__).resolve().parents[2]
_ASSETS = _ROOT / "scripts" / "assets"


@pytest.fixture(scope="module")
def importer():
    sys.path.insert(0, str(_ASSETS))
    try:
        spec = importlib.util.spec_from_file_location("import_part_assets", _ASSETS / "import-part-assets.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.remove(str(_ASSETS))


@pytest.fixture(scope="module")
def vocabulary(importer):
    return importer.load_vocabulary()


CATEGORY_IDS = {"distance-ultrasonic", "inputs"}


def entry():
    return {
        "partId": "hc-sr04-ultrasonic-module",
        "label": "HC-SR04 ultrasonic",
        "category": "input-control",
        "dimensionsMm": {"width": 45.0, "height": 20.0},
        "distanceSensor": {"device": "HC-SR04", "interface": "Trig/Echo pulse"},
    }


def overlay(**extra):
    base = {
        "revision": 1,
        "partTypes": ["DistanceInput"],
        "categories": ["distance-ultrasonic"],
        "verification": "reviewed",
        "sources": [{"facts": ["dimensionsMm"], "ref": "https://example.invalid/hcsr04.pdf"}],
        "interfaces": ["pulse-ranging"],
        "copy": {"summary": "Ultrasonic ranging", "wiringNote": "Power VCC from 5 V."},
    }
    base.update(extra)
    return base


def merge(importer, vocabulary, part=None, ov=None):
    return importer.merge_overlay(part or entry(), ov if ov is not None else overlay(), CATEGORY_IDS, vocabulary)


def test_merge_keeps_measured_facts_and_adds_the_manifest_fields(importer, vocabulary):
    merged = merge(importer, vocabulary)
    assert merged["manifestVersion"] == 1
    assert merged["dimensionsMm"] == {"width": 45.0, "height": 20.0}
    assert merged["distanceSensor"]["interface"] == "Trig/Echo pulse"
    assert merged["partTypes"] == ["DistanceInput"]
    assert merged["categories"] == ["distance-ultrasonic"]
    assert merged["verification"] == "reviewed"
    assert merged["interfaces"] == ["pulse-ranging"]
    assert merged["copy"]["summary"] == "Ultrasonic ranging"


def test_merge_does_not_mutate_its_inputs(importer, vocabulary):
    part, ov = entry(), overlay()
    merge(importer, vocabulary, part, ov)
    assert part == entry()
    assert ov == overlay()


def test_a_part_with_no_overlay_is_refused(importer, vocabulary):
    with pytest.raises(importer.OverlayError, match="no overlay"):
        importer.merge_overlay(entry(), None, CATEGORY_IDS, vocabulary)


@pytest.mark.parametrize("field", ["dimensionsMm", "label", "render", "pinLabelsLeftToRight", "distanceSensor"])
def test_an_overlay_may_not_override_a_measured_field(importer, vocabulary, field):
    with pytest.raises(importer.OverlayError, match="measured fact"):
        merge(importer, vocabulary, ov=overlay(**{field: {"width": 1}}))


def test_an_overlay_naming_an_unknown_field_is_refused(importer, vocabulary):
    with pytest.raises(importer.OverlayError, match="unknown field 'wireColour'"):
        merge(importer, vocabulary, ov=overlay(wireColour=[]))


@pytest.mark.parametrize("field", ["revision", "partTypes", "categories", "verification", "sources"])
def test_an_overlay_must_carry_the_required_fields(importer, vocabulary, field):
    ov = overlay()
    del ov[field]
    with pytest.raises(importer.OverlayError, match=f"missing '{field}'"):
        merge(importer, vocabulary, ov=ov)


def test_unknown_words_are_refused(importer, vocabulary):
    with pytest.raises(importer.OverlayError, match="part type 'CanBusInterface'"):
        merge(importer, vocabulary, ov=overlay(partTypes=["CanBusInterface"]))
    with pytest.raises(importer.OverlayError, match="interface 'i3c'"):
        merge(importer, vocabulary, ov=overlay(interfaces=["i3c"]))
    with pytest.raises(importer.OverlayError, match="verification"):
        merge(importer, vocabulary, ov=overlay(verification="certified"))
    with pytest.raises(importer.OverlayError, match="category 'lasers'"):
        merge(importer, vocabulary, ov=overlay(categories=["lasers"]))


def test_sources_need_facts_and_a_reference(importer, vocabulary):
    with pytest.raises(importer.OverlayError, match="exactly facts and ref"):
        merge(importer, vocabulary, ov=overlay(sources=[{"ref": "https://example.invalid"}]))
    with pytest.raises(importer.OverlayError, match="facts must be"):
        merge(importer, vocabulary, ov=overlay(sources=[{"facts": [], "ref": "https://example.invalid"}]))


def test_copy_is_plain_bounded_text(importer, vocabulary):
    with pytest.raises(importer.OverlayError, match="copy names unknown field"):
        merge(importer, vocabulary, ov=overlay(copy={"title": "x"}))
    with pytest.raises(importer.OverlayError, match="at most 300"):
        merge(importer, vocabulary, ov=overlay(copy={"summary": "x" * 301}))


def test_the_vocabulary_is_read_from_the_apps_own_files(vocabulary):
    assert {"i2c", "pulse-ranging", "two-wire-clk-dio"} <= vocabulary["interfaces"]
    assert vocabulary["verification"] == {"drafted", "reviewed", "bench"}
    assert {"DistanceInput", "MatrixOutput", "PowerAmplifier"} <= vocabulary["partTypes"]


def _tree(*nodes):
    return [{"id": i, "label": i.title(), "order": n, "parent": p} for n, (i, p) in enumerate(nodes, 1)]


def test_a_valid_category_tree_passes(importer):
    importer.validate_categories(_tree(("distance", None), ("ultrasonic", "distance")))


def test_a_category_parent_must_exist_and_may_not_cycle(importer):
    with pytest.raises(importer.OverlayError, match="parent 'missing'"):
        importer.validate_categories(_tree(("a", "missing")))
    with pytest.raises(importer.OverlayError, match="cycle"):
        importer.validate_categories(_tree(("a", "b"), ("b", "a")))


def test_category_ids_are_unique_lowercase_hyphen_words(importer):
    with pytest.raises(importer.OverlayError, match="duplicate"):
        importer.validate_categories(_tree(("a", None), ("a", None)))
    with pytest.raises(importer.OverlayError, match="lowercase"):
        importer.validate_categories(_tree(("Bad Id", None)))


def test_an_alias_may_not_shadow_a_live_category(importer):
    tree = _tree(("a", None), ("b", None))
    tree[1]["aliases"] = ["a"]
    with pytest.raises(importer.OverlayError, match="alias"):
        importer.validate_categories(tree)


def test_the_committed_overlays_and_tree_pass_every_rule(importer, vocabulary):
    """Every overlay on disk is well formed against the real tree and vocabulary."""
    categories = importer.load_categories()
    ids = {c["id"] for c in categories}
    for part_id in sorted(importer.overlay_part_ids()):
        part = {"partId": part_id, "label": part_id, "dimensionsMm": {"width": 1.0, "height": 1.0}}
        merged = importer.merge_overlay(part, importer.load_overlay(part_id), ids, vocabulary)
        assert merged["partId"] == part_id
    # A raw read of the tree file is what the app generates its module from.
    assert json.loads(importer.CATEGORIES_FILE.read_text(encoding="utf-8"))


def drawn_part():
    part = entry()
    part["pinLabelsLeftToRight"] = ["VCC", "Trig", "Echo", "GND"]
    part["render"] = {"file": "parts/x.webp", "widthPx": 560, "heightPx": 260}
    return part


def pads(**changes):
    points = [
        {"label": label, "xPx": 234.3 + 30.5 * index, "yPx": 226}
        for index, label in enumerate(["VCC", "Trig", "Echo", "GND"])
    ]
    points[0].update(changes)
    return points


def test_drawing_facts_are_merged_into_the_manifest(importer, vocabulary):
    ov = overlay(pads=pads(), padHoleRadiusPx=6, supplyRail="v5", powerPadLabel="vcc")
    merged = merge(importer, vocabulary, drawn_part(), ov)
    assert merged["pads"][0] == {"label": "VCC", "xPx": 234.3, "yPx": 226}
    assert merged["padHoleRadiusPx"] == 6
    assert merged["supplyRail"] == "v5"
    assert merged["powerPadLabel"] == "vcc"


@pytest.mark.parametrize("bad", [
    {"pads": pads(xPx=561)},  # outside the render
    {"pads": pads(yPx=-1)},
    {"pads": pads(label="Gnd")},  # not the pin label at that position
    {"pads": pads()[:3]},  # fewer points than pin labels
    {"pads": [{"label": "VCC", "xPx": 1}]},
    {"padHoleRadiusPx": 0},
    {"padHoleRadiusPx": True},
    {"supplyRail": "v48"},
    {"powerPadLabel": "VIN"},  # the part prints no VIN
    {"converterPadsMm": {"IN+": [1, 1]}},  # needs all four pads
    {"converterPadsMm": {"IN+": [1, 1], "IN-": [1, 2], "OUT+": [3, 1], "OUT-": [3, "x"]}},
])
def test_drawing_facts_that_break_a_rule_stop_the_import(importer, vocabulary, bad):
    with pytest.raises(importer.OverlayError):
        merge(importer, vocabulary, drawn_part(), overlay(**bad))


def shifter_part():
    return {
        "partId": "test-level-shifter",
        "label": "Test level shifter",
        "category": "support",
        "dimensionsMm": {"width": 10.0, "height": 20.0},
        "render": {"file": "x.webp", "widthPx": 400, "heightPx": 654},
    }


def shifter_pads():
    left = [("/OE1", 71.5), ("A1", 156.5), ("Y1", 241.5), ("GND", 326.5)]
    right = [("VCC", 71.5), ("/OE2", 156.5), ("A2", 241.5), ("Y2", 326.5)]
    return ([{"label": name, "xPx": 9.6, "yPx": y} for name, y in left]
            + [{"label": name, "xPx": 390.4, "yPx": y} for name, y in right])


def shifter_block(**changes):
    block = {
        "device": "TEST125", "packageName": "DIP-8", "channels": 2,
        "supplyMinV": 4.5, "supplyMaxV": 5.5, "inputHighMinV": 2,
        "channelPads": [{"in": "A1", "out": "Y1", "oe": "/OE1"}, {"in": "A2", "out": "Y2", "oe": "/OE2"}],
        "vccPad": "VCC", "gndPad": "GND",
    }
    block.update(changes)
    return block


def shifter_overlay(**changes):
    return overlay(partTypes=["MatrixOutput"], pads=shifter_pads(), levelShifter=shifter_block(**changes))


def test_a_level_shifter_block_is_merged_with_its_pads(importer, vocabulary):
    merged = merge(importer, vocabulary, shifter_part(), shifter_overlay())
    assert merged["levelShifter"]["channels"] == 2
    assert merged["levelShifter"]["channelPads"][1] == {"in": "A2", "out": "Y2", "oe": "/OE2"}
    assert len(merged["pads"]) == 8


@pytest.mark.parametrize("bad", [
    {"vccPad": "VDD"},  # not a measured pad
    {"channels": 3},  # three channels, two sets of pads
    {"channels": 5, "channelPads": shifter_block()["channelPads"] * 3},  # more than the sheet routes
    {"channelPads": [{"in": "A1", "out": "Y1"}, {"in": "A2", "out": "Y2", "oe": "/OE2"}]},
    {"supplyMinV": 6},  # above the maximum
    {"inputHighMinV": 0},
    {"device": ""},
    {"unknown": 1},
])
def test_a_level_shifter_block_that_breaks_a_rule_stops_the_import(importer, vocabulary, bad):
    with pytest.raises(importer.OverlayError):
        merge(importer, vocabulary, shifter_part(), shifter_overlay(**bad))


def test_a_level_shifter_block_needs_pads_to_name(importer, vocabulary):
    ov = overlay(partTypes=["MatrixOutput"], levelShifter=shifter_block())
    with pytest.raises(importer.OverlayError):
        merge(importer, vocabulary, shifter_part(), ov)
