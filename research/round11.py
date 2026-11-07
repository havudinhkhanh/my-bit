"""Vòng 11 – Bắt râu sập: CHỜ GẦN HƠN (khớp nhiều hơn, lời/lệnh ít hơn) + LÃI GỘP có tốt hơn chờ xa (ít khớp) không?
Dùng lại vòng 8 (lưới độ sâu D = 0 (vào ngay), 0,5 … 2,0 × độ lớn cú sốc, chờ tối đa 20 phút), thêm cách thoát đang chạy:
giữ 60 phút + cắt lỗ đuổi (lời ≥ 150 bps thì đóng khi trả lại 100 bps) = "tr150". Mô phỏng danh mục có lãi gộp: research/r11_port.py.
Chạy: python research/round11.py"""
import concurrent.futures as cf
import gzip
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("RS_LOG", "round11.log")
os.environ.setdefault("RS_NOCACHE", "1")
import events as E  # noqa: E402
import round6 as R6  # noqa: E402
import round8 as R8  # noqa: E402

R8.RULES = [("t60", "T", 60), ("tr150", "R", (150, 100))]

if __name__ == "__main__":
    t00 = time.time()
    syms = E.list_symbols()
    E.log(f"{len(syms)} mã · {R6.MONTHS[0]} → {R6.MONTHS[-1]} + {len(R6.DAYS)} ngày tháng này")
    evs = []
    with cf.ThreadPoolExecutor(32) as ex:
        for k, out in enumerate(ex.map(R8.process, syms)):
            evs += out
            if k % 100 == 0:
                E.log(f"  … {k}/{len(syms)} mã, {len(evs)} cú sốc, {time.time() - t00:.0f}s")
    with gzip.open(os.path.join(E.OUT, "round11.json.gz"), "wt") as f:
        json.dump(evs, f, ensure_ascii=False, default=float)
    E.log(f"{len(evs)} cú sốc · có khớp {sum(1 for e in evs if e['res'])} · {time.time() - t00:.0f}s")
