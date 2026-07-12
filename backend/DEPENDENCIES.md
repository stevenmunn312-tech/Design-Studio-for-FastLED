# Backend Python Dependencies

The FastLED Studio helper now has two layers of dependency control:

- `requirements.txt` / `requirements-dev.txt`: the direct dependencies we intentionally use.
- `constraints.txt`: the fully pinned transitive resolution verified in CI.

## Install

Production helper:

```bash
pip install -r backend/requirements.txt -c backend/constraints.txt
```

Backend tests:

```bash
pip install -r backend/requirements-dev.txt -c backend/constraints.txt
pytest backend/tests
```

## Update Procedure

1. Edit the direct dependency pins in `requirements.txt` and/or `requirements-dev.txt`.
2. Re-resolve the full graph from a clean interpreter:

```bash
python -m pip install --ignore-installed --dry-run --report backend/deps-report.json -r backend/requirements.txt -r backend/requirements-dev.txt
```

3. Copy the resolved versions from that report into `backend/constraints.txt`.
4. Verify the pinned set locally in a fresh virtual environment:

```bash
python -m venv .venv-backend-check
.venv-backend-check/bin/pip install -r backend/requirements.txt -r backend/requirements-dev.txt -c backend/constraints.txt
.venv-backend-check/bin/pytest backend/tests
```

On Windows, use the matching `Scripts\\pip.exe` / `Scripts\\pytest.exe` paths.

5. Confirm CI passes, especially the cross-platform `backend-install` job.

## Why Both Files Exist

The direct requirement files stay readable for humans and code review, while
`constraints.txt` locks the whole graph so fresh Windows, macOS, and Linux
installs all resolve to the same tested versions.
