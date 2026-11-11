"""Vòng 16 – VÀO lệnh Bắt râu sập theo hình dạng đường giá + bộ đặc trưng toán / hình học (Jason 11/11/2026: thêm phương pháp hình học, vi phân, tích phân).
Hiện tại bot đặt lệnh chờ ở độ sâu cố định (1,25× / 1,5× cú sốc). Vòng này thử:
  (1) "Đáy cong": không đoán độ sâu – chờ giá ĐÃ quay đầu rồi mới vào. Khớp parabol trượt w phút lên giá đóng sau cú sốc; khi đạo hàm bậc 1 đổi sang dương
      (theo chiều hồi) và đạo hàm bậc 2 > 0 (đáy đã cong lên), và giá từng đi xa thêm ≥ d × cú sốc → vào thị trường ở giá mở nến kế. Thoát như hiện tại (tr150, 60 phút).
      c{w}_{d}: w ∈ 3, 5 phút · d ∈ 0 (không cần đi thêm), 0,5, 1,0, 1,25.
  (2) Đặc trưng ghi kèm mỗi cú sốc để xét làm bộ lọc (phân tích ở r16_calc.py):
      vr  – tỷ số phương sai Lo–MacKinlay (q = 10) của 240 phút trước: < 1 = thị trường đang dao động quanh trung bình, > 1 = đang có xu hướng
      er  – hệ số hiệu quả Kaufman 60 phút (hình học: quãng đường thẳng / quãng đường thực đi)
      hl  – chu kỳ bán rã Ornstein–Uhlenbeck (phút) ước lượng AR(1) trên 240 phút trước
      tb  – tỷ lệ khối lượng MUA chủ động trong nến sốc (hấp thụ: nến giảm mạnh mà mua chủ động cao)
      imp – "xung lượng" = tích phân |lợi suất| × khối lượng tương đối trong 5 phút trước nến sốc (cú sốc đến đột ngột hay dồn dần)
Chạy: python research/round16.py"""
import concurrent.futures as cf
import gzip
import json
import math
import os
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("RS_LOG", "round16.log")
os.environ.setdefault("RS_NOCACHE", "1")
import events as E  # noqa: E402
import round6 as R6  # noqa: E402
import round8 as R8  # noqa: E402
import round15 as R15  # noqa: E402  (deriv, sg; cũng gắn R6.sim mới – kiểu "R" vẫn như cũ)

DS = (1.25, 1.5); W = 8; HMAX = 120; WC = 20          # WC: chờ đáy cong tối đa 20 phút sau cú sốc
CW, CD = (3, 5), (0.0, 0.5, 1.0, 1.25)
EXIT = ("R", (150, 100))


def feats(c, r, qv, tbq, mq, i):
    lr = r[i - 240:i]; out = {}
    try:
        v1 = lr.var(); q = 10; rq = np.add.reduceat(lr, np.arange(0, 240, q)); out["vr"] = round(float(rq.var() / (q * v1)), 3) if v1 > 0 else None
        seg = c[i - 61:i]; path = np.abs(np.diff(seg)).sum(); out["er"] = round(float(abs(seg[-1] - seg[0]) / path), 3) if path > 0 else None
        x = np.log(c[i - 240:i]); x = x - x.mean(); den = (x[:-1] ** 2).sum(); phi = float((x[:-1] * x[1:]).sum() / den) if den > 0 else 1.0
        out["hl"] = round(-math.log(2) / math.log(phi), 1) if 0 < phi < 0.9999 else None
        out["tb"] = round(float(tbq[i] / qv[i]), 3) if qv[i] > 0 else None
        out["imp"] = round(float((np.abs(r[i - 5:i]) * 1e4 * (qv[i - 5:i] / mq[i] if mq[i] > 0 else 0)).sum()), 1)
    except Exception:  # noqa: BLE001
        pass
    return out


def process(s):
    try:
        d = R6.load(s)
    except Exception:  # noqa: BLE001
        return []
    if d is None or len(d) < 3000:
        return []
    cf_ = d.c.ffill(); c = cf_.values; o = d.o.fillna(cf_).values; h = d.h.fillna(cf_).values; l = d.l.fillna(cf_).values
    qv = d.qv.fillna(0).values; tbq = d.tbq.fillna(0).values; ok = d.c.notna().values; t0 = int(d.index[0]); n = len(d)
    r = np.diff(np.log(c), prepend=np.log(c[0]))
    sd = pd.Series(r).rolling(60, min_periods=40).std().shift(1).values
    mq = pd.Series(qv).rolling(60, min_periods=40).median().shift(1).values
    q24 = pd.Series(qv).rolling(1440, min_periods=600).sum().shift(1).values
    z = np.abs(r) / sd
    base = (z >= 4) & (np.abs(r) * 1e4 >= 300) & ok & (q24 >= 2e6)
    raw8 = np.flatnonzero(base & (qv >= 8 * mq))
    out = []
    for i in E.dedupe(np.flatnonzero(base & (qv >= 3 * mq)), 30):
        if i < 1440 or i + 2 + WC + HMAX >= n:
            continue
        side = -1 if r[i] > 0 else 1; c0 = c[i]; mv = abs(math.expm1(r[i]))
        rec = dict(s=s, T=int(t0 + i), side=side, R=round(float(abs(r[i]) * 1e4)), z=round(float(z[i]), 1), vx=round(float(qv[i] / mq[i]), 1) if mq[i] > 0 else None,
                   prior6=int(((raw8 < i) & (raw8 >= i - 360)).sum()), r15=round(float(side * (c[i - 1] / c[i - 16] - 1) * 1e4)),
                   r4h=round(float(side * (c0 / c[i - 240] - 1) * 1e4)), res={})
        rec.update(feats(c, r, qv, tbq, mq, i))

        def run(L, fill, taker):
            seg_h, seg_l = h[fill + 1:fill + 1 + HMAX], l[fill + 1:fill + 1 + HMAX]
            pn = lambda px: side * (px / L - 1) * 1e4  # noqa: E731
            fav = pn(seg_h) if side > 0 else pn(seg_l); adv = pn(seg_l) if side > 0 else pn(seg_h)
            o_all = pn(o[fill + 1:fill + 2 + HMAX])
            return dict(tr150=round(float(R6.sim(EXIT[0], EXIT[1], fav, adv, None, o_all, L, side, c0)[0]) - (R8.IN_T - R6.IN_M if taker else 0), 1), f=int(fill - i))

        rec["res"]["0.0"] = run(o[i + 1], i, True)
        for D in DS:
            L = c0 * (1 - side * D * mv); Lt = L * (1 - side * R6.THR / 1e4)
            for j in range(i + 1, i + 1 + W):
                if (side > 0 and l[j] < Lt) or (side < 0 and h[j] > Lt):
                    rec["res"][str(D)] = run(L, j, False); break
        # đáy cong: đường p(j) = mức hồi (bps, dương = có lợi cho lệnh) của giá đóng so với giá đóng nến sốc
        p = side * (c[i:i + WC + 1] / c0 - 1) * 1e4
        ext = side * ((np.minimum.accumulate(l[i:i + WC + 1]) if side > 0 else np.maximum.accumulate(h[i:i + WC + 1])) / c0 - 1) * 1e4      # điểm xa nhất đã tới (âm = đi tiếp ngược lệnh)
        for w in CW:
            v, a = R15.deriv(p, w)
            for dmin in CD:
                for j in range(w - 1, WC):
                    if v[j] > 0 and a[j] > 0 and ext[j] <= -dmin * mv * 1e4 and (j == w - 1 or not (v[j - 1] > 0)):
                        x = run(o[i + j + 1], i + j, True); x["dp"] = round(float(side * (o[i + j + 1] / c0 - 1) * 1e4)); rec["res"][f"c{w}_{dmin}"] = x; break
        out.append(rec)
    return out


if __name__ == "__main__":
    t00 = time.time()
    syms = E.list_symbols()
    E.log(f"{len(syms)} mã · {R6.MONTHS[0]} → {R6.MONTHS[-1]} + {len(R6.DAYS)} ngày tháng này")
    evs = []
    with cf.ThreadPoolExecutor(32) as ex:
        for k, out in enumerate(ex.map(process, syms)):
            evs += out
            if k % 100 == 0:
                E.log(f"  … {k}/{len(syms)} mã, {len(evs)} cú sốc, {time.time() - t00:.0f}s")
    with gzip.open(os.path.join(E.OUT, "round16.json.gz"), "wt") as f:
        json.dump(evs, f, ensure_ascii=False, default=float)
    E.log(f"{len(evs)} cú sốc · {time.time() - t00:.0f}s")
    os.system(f"{sys.executable} {os.path.join(os.path.dirname(__file__), 'r16_calc.py')} {os.path.join(E.OUT, 'round16.json.gz')} > {os.path.join(E.OUT, 'r16_result.md')} 2>&1")
