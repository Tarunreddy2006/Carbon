"""
biochar/backend/models.py
──────────────────────────────────────────────────────────────────────────────
Shim and re-export module forwarding to the modular domain package under
biochar/backend/models/.
──────────────────────────────────────────────────────────────────────────────
"""

import os

# Ensure Python treats this module location as a package path pointing to models/
__path__ = [os.path.join(os.path.dirname(__file__), "models")]

# Re-export all models and compatibility aliases from biochar.backend.models.__init__
from biochar.backend.models.__init__ import *
from biochar.backend.models.__init__ import __all__
