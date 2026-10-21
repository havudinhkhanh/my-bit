from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("MYBIT_DATA", ROOT / "data"))
SITE_DIR = Path(os.environ.get("MYBIT_SITE", ROOT / "site"))
OUT_DIR = SITE_DIR / "data"


@lru_cache(maxsize=1)
def load() -> dict:
    with open(ROOT / "config.yaml", encoding="utf-8") as f:
        cfg = yaml.safe_load(f) or {}
    return cfg


def get(path: str, default=None):
    node = load()
    for key in path.split("."):
        if not isinstance(node, dict) or key not in node:
            return default
        node = node[key]
    return node
