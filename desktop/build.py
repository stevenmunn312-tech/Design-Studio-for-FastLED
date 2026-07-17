"""Build a portable, self-contained FastLED Studio desktop bundle."""
from __future__ import annotations

import argparse
import importlib.metadata
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BUILD_ROOT = ROOT / ".desktop-build"
RELEASE_ROOT = ROOT / "release" / "desktop"
APP_NAME = "FastLED Studio"


def run(args: list[str], *, cwd: Path = ROOT) -> None:
    print("+", subprocess.list2cmdline(args))
    subprocess.run(args, cwd=cwd, check=True)


def require_executable(name: str) -> str:
    """Return an executable path that subprocess can launch on every host OS."""
    executable = shutil.which(name)
    if not executable:
        raise SystemExit(f"{name} is missing from PATH")
    return executable


def require_packager() -> None:
    try:
        import PyInstaller  # noqa: F401
    except ImportError as exc:
        raise SystemExit(
            "PyInstaller is not installed. Run: "
            "python -m pip install -r backend/requirements-packaging.txt -c backend/constraints.txt"
        ) from exc


def executable_name(name: str) -> str:
    return f"{name}.exe" if os.name == "nt" else name


def pyinstaller_base() -> list[str]:
    return [sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--log-level", "WARN"]


def build_frontend(skip: bool) -> None:
    if not skip:
        # CreateProcess does not apply PATHEXT when given a bare command, so
        # resolve npm to npm.cmd explicitly on Windows before launching it.
        run([require_executable("npm"), "run", "build"])
    if not (ROOT / "dist" / "index.html").is_file():
        raise SystemExit("dist/index.html is missing; run npm run build first")


def build_launcher() -> Path:
    app_dir = RELEASE_ROOT / APP_NAME
    run([
        *pyinstaller_base(),
        "--onedir",
        "--console",
        "--name", APP_NAME,
        "--distpath", str(RELEASE_ROOT),
        "--workpath", str(BUILD_ROOT / "launcher-work"),
        "--specpath", str(BUILD_ROOT / "spec"),
        "--paths", str(ROOT / "backend"),
        "--add-data", f"{ROOT / 'dist'}{os.pathsep}web",
        "--add-data", f"{ROOT / 'package.json'}{os.pathsep}.",
        "--hidden-import", "app",
        "--collect-all", "uvicorn",
        "--collect-all", "multipart",
        "--exclude-module", "pytest",
        "--exclude-module", "httpx",
        str(ROOT / "desktop" / "launcher.py"),
    ])
    return app_dir


def build_esptool() -> Path:
    tool_dist = BUILD_ROOT / "tool-dist"
    run([
        *pyinstaller_base(),
        "--onefile",
        "--console",
        "--name", "esptool",
        "--distpath", str(tool_dist),
        "--workpath", str(BUILD_ROOT / "esptool-work"),
        "--specpath", str(BUILD_ROOT / "spec"),
        "--collect-all", "esptool",
        str(ROOT / "desktop" / "esptool_entry.py"),
    ])
    return tool_dist / executable_name("esptool")


def locate_fbuild_tool(name: str) -> Path:
    found = shutil.which(executable_name(name)) or shutil.which(name)
    if not found:
        candidate = Path(sys.executable).resolve().parent / executable_name(name)
        if candidate.is_file():
            return candidate
        raise SystemExit(f"{name} is missing; install backend/requirements.txt before packaging")
    return Path(found).resolve()


def install_bundle_files(app_dir: Path, esptool: Path) -> None:
    tools = app_dir / "tools"
    tools.mkdir(parents=True, exist_ok=True)
    for name in ("fbuild", "fbuild-daemon"):
        source = locate_fbuild_tool(name)
        shutil.copy2(source, tools / executable_name(name))
    shutil.copy2(esptool, tools / executable_name("esptool"))
    for name in ("LICENSE", "THIRD_PARTY_NOTICES.md"):
        shutil.copy2(ROOT / name, app_dir / name)
    shutil.copy2(ROOT / "desktop" / "BUNDLE_README.txt", app_dir / "README.txt")
    install_dependency_notices(app_dir)


def install_dependency_notices(app_dir: Path) -> None:
    """Copy the runtime license files supplied by the frozen dependencies."""
    notice_dir = app_dir / "third-party-licenses"
    notice_dir.mkdir(parents=True, exist_ok=True)
    packages = {
        "fastapi": ("MIT", "https://github.com/fastapi/fastapi"),
        "uvicorn": ("BSD-3-Clause", "https://github.com/encode/uvicorn"),
        "python-multipart": ("Apache-2.0", "https://github.com/Kludex/python-multipart"),
        "pyserial": ("BSD-3-Clause", "https://github.com/pyserial/pyserial"),
        "fbuild": ("BSD-3-Clause", "https://github.com/FastLED/fbuild"),
        "esptool": ("GPL-2.0-or-later", "https://github.com/espressif/esptool"),
        "pyinstaller": ("GPL-2.0-or-later with bootloader exception", "https://pyinstaller.org"),
    }
    manifest = ["Runtime dependency licenses", "===========================", ""]
    for package, (license_name, source_url) in packages.items():
        dist = importlib.metadata.distribution(package)
        manifest.append(f"{package} {dist.version} — {license_name} — {source_url}")
        for item in dist.files or ():
            lower = item.name.lower()
            if not any(token in lower for token in ("license", "copying", "notice")):
                continue
            source = Path(dist.locate_file(item))
            if source.is_file():
                destination = notice_dir / f"{package}-{item.name}"
                if not destination.exists():
                    shutil.copy2(source, destination)
    manifest.extend([
        "",
        "The fbuild wheel declares BSD-3-Clause but does not currently ship a",
        "standalone license file; its upstream license declaration is linked above.",
        "The pyserial BSD notice is recorded in the repository's THIRD_PARTY_NOTICES.md.",
    ])
    (notice_dir / "README.txt").write_text("\n".join(manifest) + "\n", encoding="utf-8")


def check_tool(tool: Path, version_args: tuple[str, ...] = ("--version",)) -> None:
    result = subprocess.run([str(tool), *version_args], capture_output=True, text=True, timeout=20)
    if result.returncode != 0:
        raise SystemExit(f"Bundled tool failed: {tool}\n{result.stdout}\n{result.stderr}")


def smoke_test(app_dir: Path) -> None:
    launcher = app_dir / executable_name(APP_NAME)
    tools = app_dir / "tools"
    expected_version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    check_tool(tools / executable_name("fbuild"))
    check_tool(tools / executable_name("esptool"), ("version",))

    port = 18080
    with tempfile.TemporaryDirectory(prefix="fls-desktop-smoke-") as data_dir:
        env = {
            **os.environ,
            "FLS_DESKTOP_PORT": str(port),
            "FLS_NO_BROWSER": "1",
            "FLS_DATA_DIR": data_dir,
        }
        process = subprocess.Popen(
            [str(launcher)], cwd=app_dir, env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )
        try:
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    output = process.stdout.read() if process.stdout else ""
                    raise SystemExit(f"Packaged launcher exited during smoke test:\n{output}")
                try:
                    with urllib.request.urlopen(
                        f"http://localhost:{port}/api/desktop/status", timeout=0.5,
                    ) as response:
                        status = json.loads(response.read().decode("utf-8"))
                    with urllib.request.urlopen(f"http://localhost:{port}/", timeout=0.5) as response:
                        page = response.read().decode("utf-8")
                        coop = response.headers.get("Cross-Origin-Opener-Policy")
                        coep = response.headers.get("Cross-Origin-Embedder-Policy")
                    with urllib.request.urlopen(f"http://localhost:{port}/api/health", timeout=0.5) as response:
                        health = json.loads(response.read().decode("utf-8"))
                    if (
                        status.get("desktop") is True
                        and status.get("version") == expected_version
                        and "FastLED Studio" in page
                        and coop == "same-origin"
                        and coep == "credentialless"
                        and health.get("fbuild") is True
                        and health.get("engine") == "fbuild"
                    ):
                        return
                except (OSError, ValueError):
                    time.sleep(0.2)
            raise SystemExit("Packaged launcher did not become ready within 30 seconds")
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()


def archive_bundle(app_dir: Path) -> Path:
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    system = {"Windows": "windows", "Darwin": "macos", "Linux": "linux"}.get(platform.system(), platform.system().lower())
    arch = platform.machine().lower().replace("amd64", "x86_64")
    base = RELEASE_ROOT / f"FastLED-Studio-{version}-{system}-{arch}"
    fmt = "zip" if os.name == "nt" else "gztar"
    archive = Path(shutil.make_archive(str(base), fmt, root_dir=RELEASE_ROOT, base_dir=app_dir.name))
    print(f"Created {archive}")
    return archive


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-frontend", action="store_true", help="reuse the existing dist/ build")
    parser.add_argument("--skip-smoke", action="store_true", help="do not launch-test the frozen bundle")
    parser.add_argument("--no-archive", action="store_true", help="leave the bundle as a folder only")
    args = parser.parse_args()

    require_packager()
    build_frontend(args.skip_frontend)
    RELEASE_ROOT.mkdir(parents=True, exist_ok=True)
    BUILD_ROOT.mkdir(parents=True, exist_ok=True)
    app_dir = build_launcher()
    esptool = build_esptool()
    install_bundle_files(app_dir, esptool)
    if not args.skip_smoke:
        smoke_test(app_dir)
    if not args.no_archive:
        archive_bundle(app_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
