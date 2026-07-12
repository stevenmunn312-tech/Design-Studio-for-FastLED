import sys
from pathlib import Path

# app.py sits directly in backend/, not a package — make it importable as
# `import app` regardless of where pytest is invoked from.
sys.path.insert(0, str(Path(__file__).resolve().parent))
