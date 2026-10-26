"""The arduino-cli sketch folder every compile-fixture runner builds in.

arduino-cli caches library objects per sketch path, and wipes them when a
build on that path changes board options. So every fixture for one exact FQBN
shares one folder, whichever runner builds it, and two FQBNs never share one:
the compile matrix orders its legs by FQBN so each folder's cache is filled
once and then reused.
"""
import hashlib


def fixture_workspace_name(fqbn: str) -> str:
    board = "".join(ch for ch in fqbn.split(":")[2] if ch.isalnum())
    return f"fixture_{board}_{hashlib.sha256(fqbn.encode('utf-8')).hexdigest()[:8]}"
