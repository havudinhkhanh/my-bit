"""Vòng 14 – lệnh Bắt râu sập "rớt thẳng" (không phải quét thanh lý: giá không hồi, cứ thế đi tiếp – vd. UAI 08/11/2026). Jason hỏi: làm gì để tránh?
Bộ lọc TRƯỚC khi vào (cú sốc khác trong 24h, 24h đi ngược, dao động, khối lượng, coin vừa lỗ…) đã thử trên round13.json.gz: không cái nào tăng lợi nhuận
(lệnh rớt thẳng lúc vào trông giống lệnh hồi). Vòng này thử thoát SỚM SAU khi vào, khi giá không hồi như một cú quét thanh lý:
  Q(m, x): sau m phút mà còn lỗ ≥ x bps → đóng ở giá mở nến phút m (lệnh thị trường); không thì như hiện tại (60 phút + cắt lỗ đuổi tr150).
  N(m, y): sau m phút mà CHƯA LẦN NÀO lời ≥ y bps (không hồi) → đóng ở phút m.
  E(m, x): cắt lỗ x bps chỉ trong m phút đầu (cú rớt tiếp ngay sau khi khớp).
Chỉ tính 2 mức chờ bot đang dùng (1,25× / 1,5×) + vào ngay. Phân tích danh mục: research/r14_exit.py.
Chạy: python research/round14.py"""
import concurrent.futures as cf
import gzip
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("RS_LOG", "round14.log")
os.environ.setdefault("RS_NOCACHE", "1")
import events as E  # noqa: E402
import round6 as R6  # noqa: E402
import round8 as R8  # noqa: E402

_sim0 = R6.sim


def sim(kind, prm, fav, adv, o_end, o_all, L, side, c0):
    if kind not in ("Q", "N", "E"):
        return _sim0(kind, prm, fav, adv, o_end, o_all, L, side, c0)
    m, x = prm; peak = 0.0; A, G = 150, 100
    for k in range(60):
        a, f = adv[k], fav[k]
        if a <= -R6.CAT:
            return -R6.CAT - R6.IN_M - R6.OUT_S, "S"
        if kind == "E" and k < m and a <= -x:
            return -x - R6.IN_M - R6.OUT_S, "E"
        if peak >= A and a <= peak - G:
            return peak - G - R6.IN_M - R6.OUT_S, "R"
        peak = max(peak, f)
        if k == m - 1:
            if kind == "Q" and o_all[m] <= -x:
                return o_all[m] - R6.IN_M - R6.OUT_T, "Q"
            if kind == "N" and peak < x:
                return o_all[m] - R6.IN_M - R6.OUT_T, "N"
    return o_all[60] - R6.IN_M - R6.OUT_T, "T"


R6.sim = sim
R8.DS = (1.25, 1.5)
R8.RULES = [("tr150", "R", (150, 100))] + [(f"q{m}_{x}", "Q", (m, x)) for m in (5, 10, 15, 20, 30) for x in (200, 400, 700, 1000, 1500)] \
    + [(f"n{m}_{y}", "N", (m, y)) for m in (5, 10, 15, 20, 30) for y in (50, 100, 200)] + [(f"e{m}_{x}", "E", (m, x)) for m in (3, 5, 10) for x in (500, 800, 1200, 2000)]

if __name__ == "__main__":
    t00 = time.time()
    syms = E.list_symbols()
    E.log(f"{len(syms)} mã · {R6.MONTHS[0]} → {R6.MONTHS[-1]} + {len(R6.DAYS)} ngày tháng này · {len(R8.RULES)} cách thoát")
    evs = []
    with cf.ThreadPoolExecutor(32) as ex:
        for k, out in enumerate(ex.map(R8.process, syms)):
            evs += out
            if k % 100 == 0:
                E.log(f"  … {k}/{len(syms)} mã, {len(evs)} cú sốc, {time.time() - t00:.0f}s")
    with gzip.open(os.path.join(E.OUT, "round14.json.gz"), "wt") as f:
        json.dump(evs, f, ensure_ascii=False, default=float)
    E.log(f"{len(evs)} cú sốc · có khớp {sum(1 for e in evs if e['res'])} · {time.time() - t00:.0f}s")
    os.system(f"{sys.executable} {os.path.join(os.path.dirname(__file__), 'r14_exit.py')} {os.path.join(E.OUT, 'round14.json.gz')} > {os.path.join(E.OUT, 'r14_result.md')} 2>&1")
