"""Tiện ích Cloudflare cho GitHub Actions.

  python scripts/cloudflare.py kv             -> in CF_KV_NAMESPACE_ID=... (tạo KV 'mybit' nếu chưa có)
  python scripts/cloudflare.py d1             -> in D1_DATABASE_ID=... (tạo D1 'mybit' nếu chưa có; cần quyền D1 Edit)
  python scripts/cloudflare.py wrangler-toml  -> in nội dung wrangler.toml để deploy Pages + Functions
"""
from __future__ import annotations

import json
import os
import sys

import requests

API = "https://api.cloudflare.com/client/v4"
TITLE = "mybit"


def _h():
    return {"Authorization": f"Bearer {os.environ['CF_API_TOKEN']}", "Content-Type": "application/json"}


def kv_id() -> str:
    acc = os.environ["CF_ACCOUNT_ID"]
    r = requests.get(f"{API}/accounts/{acc}/storage/kv/namespaces", headers=_h(), params={"per_page": 100}, timeout=20)
    r.raise_for_status()
    for ns in r.json()["result"]:
        if ns["title"] == TITLE:
            return ns["id"]
    r = requests.post(f"{API}/accounts/{acc}/storage/kv/namespaces", headers=_h(),
                      data=json.dumps({"title": TITLE}), timeout=20)
    r.raise_for_status()
    return r.json()["result"]["id"]


def d1_id() -> str | None:
    """Tìm (hoặc tạo) cơ sở dữ liệu D1 'mybit'. Token thiếu quyền D1 → None (trang chạy chế độ một chủ sở hữu)."""
    acc = os.environ["CF_ACCOUNT_ID"]
    try:
        r = requests.get(f"{API}/accounts/{acc}/d1/database", headers=_h(), params={"name": TITLE, "per_page": 50}, timeout=20)
        j = r.json()
        if not j.get("success"):
            print(f"D1: token chưa có quyền D1 ({j.get('errors')}) – giữ chế độ một chủ sở hữu", file=sys.stderr)
            return None
        for db in j.get("result") or []:
            if db.get("name") == TITLE:
                return db["uuid"]
        r = requests.post(f"{API}/accounts/{acc}/d1/database", headers=_h(), data=json.dumps({"name": TITLE}), timeout=30)
        j = r.json()
        if j.get("success"):
            print("D1: đã tạo cơ sở dữ liệu 'mybit'", file=sys.stderr)
            return j["result"]["uuid"]
        print(f"D1: không tạo được ({j.get('errors')})", file=sys.stderr)
    except Exception as e:  # noqa: BLE001
        print(f"D1 lỗi: {e}", file=sys.stderr)
    return None


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "kv":
        print(f"CF_KV_NAMESPACE_ID={kv_id()}")
    elif cmd == "d1":
        i = d1_id()
        if i:
            print(f"D1_DATABASE_ID={i}")
    elif cmd == "wrangler-toml":
        ns = os.environ.get("CF_KV_NAMESPACE_ID") or kv_id()
        owner = os.environ.get("OWNER_EMAIL", "")
        repo = os.environ.get("GH_REPO", "")
        print(f'''name = "my-bit"
pages_build_output_dir = "site"
compatibility_date = "2024-09-23"

[[kv_namespaces]]
binding = "MYBIT_KV"
id = "{ns}"

[vars]
OWNER_EMAIL = "{owner}"
GH_REPO = "{repo}"
''' + (f'''
[[d1_databases]]
binding = "DB"
database_name = "{TITLE}"
database_id = "{os.environ["D1_DATABASE_ID"]}"
''' if os.environ.get("D1_DATABASE_ID") else ""))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
