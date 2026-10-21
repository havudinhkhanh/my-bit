"""Tối ưu tệp tĩnh trước khi đăng lên Cloudflare Pages.

1. Thu gọn (minify) app.js, glossary.js, app.css bằng esbuild – lỗi thì giữ nguyên bản gốc.
2. Gắn dấu phiên bản (?v=<băm nội dung>) vào các tệp trong index.html để trình duyệt lưu đệm lâu dài
   (site/_headers đặt immutable cho các tệp này; app.js đi qua middleware nên được đặt ở functions/_middleware.js).
Chỉ chạy trong GitHub Actions trên bản checkout – không sửa mã nguồn trong kho.
"""
from __future__ import annotations

import hashlib
import re
import shutil
import subprocess
import sys
from pathlib import Path

SITE = Path(sys.argv[1] if len(sys.argv) > 1 else "site")
ESBUILD = "esbuild@0.24.0"


def minify(path: Path, loader: str) -> None:
    out = path.with_name(path.stem + ".min" + path.suffix)
    try:
        r = subprocess.run(["npx", "--yes", ESBUILD, str(path), "--minify", "--target=es2020,chrome100,safari15",
                            "--legal-comments=none", "--charset=utf8", f"--outfile={out}", "--log-level=warning"],
                           capture_output=True, text=True, errors="replace", timeout=240)
        if r.returncode != 0 or not out.exists() or out.stat().st_size < 0.2 * path.stat().st_size:
            print(f"bỏ qua thu gọn {path.name}: {r.stderr[-400:]}")
            out.unlink(missing_ok=True)
            return
        if loader == "js":   # kiểm tra cú pháp bản thu gọn trước khi thay
            chk = subprocess.run(["node", "--check", str(out)], capture_output=True, text=True, errors="replace", timeout=60)
            if chk.returncode != 0:
                print(f"bản thu gọn {path.name} lỗi cú pháp – giữ bản gốc: {chk.stderr[-300:]}")
                out.unlink(missing_ok=True)
                return
        before, after = path.stat().st_size, out.stat().st_size
        shutil.move(out, path)
        print(f"thu gọn {path.name}: {before // 1024} KB → {after // 1024} KB")
    except Exception as e:  # noqa: BLE001
        print(f"bỏ qua thu gọn {path.name}: {e}")
        out.unlink(missing_ok=True)


def stamp_file(idx: Path) -> str:
    html = idx.read_text(encoding="utf-8")

    def rep(m: re.Match) -> str:
        attr, src = m.group(1), m.group(2)
        f = SITE / src
        if not f.exists():
            return m.group(0)
        h = hashlib.sha1(f.read_bytes()).hexdigest()[:10]
        return f'{attr}="{src}?v={h}"'

    html = re.sub(r'(src|href)="((?:vendor/[^"?]+|app\.js|glossary\.js|app\.css))"', rep, html)
    idx.write_text(html, encoding="utf-8")
    print(f"gắn phiên bản {idx.name}:", ", ".join(re.findall(r'"([^"]+\?v=[0-9a-f]+)"', html)))
    return html


def stamp() -> None:
    html = stamp_file(SITE / "index.html")
    if (SITE / "login.html").exists():
        lg = stamp_file(SITE / "login.html")
        if 'href="app.css"' in lg:
            return
    # chỉ khi đã gắn phiên bản mới cho trình duyệt giữ lâu (không thì người dùng có thể kẹt bản CSS cũ)
    if "app.css?v=" in html:
        (SITE / "_headers").write_text("\n".join(f"{p}\n  Cache-Control: public, max-age=31536000, immutable"
                                                 for p in ("/vendor/*", "/app.css", "/glossary.js")) + "\n", encoding="utf-8")


if __name__ == "__main__":
    for name, loader in (("app.js", "js"), ("glossary.js", "js"), ("app.css", "css")):
        if (SITE / name).exists():
            minify(SITE / name, loader)
    stamp()
