#!/usr/bin/env python3
"""My-Bit – phân tích crypto spot & futures (chỉ phân tích + cảnh báo, không đặt lệnh).

  python run.py all       # tải dữ liệu + phân tích + xuất web
  python run.py update    # chỉ tải dữ liệu  (--quick: bỏ phần nặng – cung, mở khoá, phí)
  python run.py build     # chỉ phân tích & xuất web từ dữ liệu đã có
  python run.py serve     # mở web trên máy: http://localhost:8000
"""
from __future__ import annotations

import argparse
import logging


def main() -> None:
    ap = argparse.ArgumentParser(description="My-Bit")
    ap.add_argument("cmd", choices=["all", "update", "build", "serve", "probe"])
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--notify", action="store_true")
    ap.add_argument("--port", type=int, default=8000)
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s", datefmt="%H:%M:%S")
    for n in ("urllib3", "requests"):
        logging.getLogger(n).setLevel(logging.WARNING)
    if a.cmd == "probe":
        from app.data import probe
        probe.run()
        return
    if a.cmd in ("all", "update"):
        from app.data import update
        rep = update.run(full=not a.quick)
        bad = [k for k, v in rep["steps"].items() if not v.get("ok")]
        print(f"\nTải dữ liệu xong. Bước lỗi: {bad or 'không'}")
    if a.cmd in ("all", "build"):
        from app import build
        build.run(notify=a.notify)
    if a.cmd == "serve":
        import functools
        import http.server
        from app.config import SITE_DIR
        h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(SITE_DIR))
        print(f"http://localhost:{a.port}")
        http.server.ThreadingHTTPServer(("", a.port), h).serve_forever()


if __name__ == "__main__":
    main()
