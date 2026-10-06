import sys
from pathlib import Path

# The helper modules sit directly in backend/, not in a package — make it importable as
# `import app` regardless of where pytest is invoked from.
sys.path.insert(0, str(Path(__file__).resolve().parent))
