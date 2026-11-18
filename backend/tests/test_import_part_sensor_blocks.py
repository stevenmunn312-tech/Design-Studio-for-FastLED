"""The part importer's validation of the generic sensor blocks.

`import-part-assets.py` lives beside the Blender asset tooling, not in the
helper, and has a hyphen in its name, so it is loaded by path. It needs Pillow
only to encode renders; these tests never touch one.

The rules here mirror `digitalSensorSpecIssue`, `analogSensorSpecIssue` and
`calibrationCurveIssue` in the app (src/state/peripherals); the Vitest suite
holds the other half.
"""
import importlib.util
import sys
from pathlib import Path

import pytest

pytest.importorskip("PIL")

_ASSETS = Path(__file__).resolve().parents[2] / "scripts" / "assets"


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


DIGITAL = {"activeLevel": "low", "pullUp": "internal", "debounceMs": 20, "activeLabel": "Magnet near", "idleLabel": "Magnet away"}
ANALOG = {
    "unit": "%", "supplyVolts": 3.3, "adcRange": {"minVolts": 0, "maxVolts": 3.3},
    "curve": [{"volts": 1.2, "value": 100}, {"volts": 2.8, "value": 0}], "outputMin": 0, "outputMax": 100,
}


def test_a_valid_digital_block_is_carried_through(importer):
    assert importer.digital_sensor_block("p", {**DIGITAL, "supplyVolts": 5, "extra": "dropped"}) == {**DIGITAL, "supplyVolts": 5}


@pytest.mark.parametrize("change", [
    {"activeLevel": "middle"},
    {"pullUp": "pulldown"},
    {"activeLevel": "high", "pullUp": "internal"},
    {"debounceMs": -1},
    {"debounceMs": 1.5},
    {"debounceMs": 5000},
    {"debounceMs": True},
    {"supplyVolts": 0},
    {"supplyVolts": 13},
    {"activeLabel": ""},
    {"idleLabel": "x" * 25},
    {"idleLabel": "two\nlines"},
])
def test_a_digital_block_that_breaks_a_rule_is_refused(importer, change, capsys):
    assert importer.digital_sensor_block("p", {**DIGITAL, **change}) is None
    assert "digitalSensor block" in capsys.readouterr().err


def test_a_valid_analog_block_is_carried_through(importer):
    assert importer.analog_sensor_block("p", {**ANALOG, "decimals": 1, "extra": "dropped"}) == {**ANALOG, "decimals": 1}


@pytest.mark.parametrize("change", [
    {"unit": ""},
    {"unit": "far too long"},
    {"supplyVolts": 20},
    {"adcRange": {"minVolts": 2, "maxVolts": 1}},
    {"adcRange": {"minVolts": 0, "maxVolts": 9}},
    {"curve": [{"volts": 0, "value": 0}]},
    {"curve": [{"volts": 1, "value": 0}, {"volts": 1, "value": 5}]},
    {"curve": [{"volts": 0, "value": 0}, {"volts": 1, "value": 5}, {"volts": 2, "value": 1}]},
    {"curve": [{"volts": 0, "value": 3}, {"volts": 1, "value": 3}]},
    {"curve": [{"volts": 0, "value": 0}, {"volts": 1, "value": float("nan")}]},
    {"curve": [{"volts": 0, "value": 0}, {"volts": 1, "value": 1e12}]},
    {"outputMax": 0},
    {"decimals": 9},
])
def test_an_analog_block_that_breaks_a_rule_is_refused(importer, change, capsys):
    assert importer.analog_sensor_block("p", {**ANALOG, **change}) is None
    assert "analogSensor block" in capsys.readouterr().err
