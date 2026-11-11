"""Vòng 17 – ĐỒNG NHỊP (Jason 12/11/2026): cú sập của 1 coin có kèm các coin "cùng nhịp" hay không → râu sập HỒI hay RƠI LUÔN.
Ý tưởng: coin B vừa sập. Nhìn các coin chạy cùng nhịp với B (tương quan lợi suất 1 phút / 5 phút trước đó) và coin "đi trước" B vài phút:
  · B sập MỘT MÌNH (nhóm & BTC bình thường) → thường là thanh lý riêng → hay hồi (đúng kiểu râu bot bắt)
  · cả nhóm cùng sập / coin đi trước đã sập và vẫn RƠI TIẾP (không thành râu) → dòng tiền rút khỏi nhóm → dễ rơi luôn
Mọi đặc trưng chỉ dùng dữ liệu TỚI HẾT phút nến sốc (lúc bot quyết định đặt lệnh chờ) – không nhìn trước.

Pass 1: tải nến 1 phút mọi coin futures USDT (01/2025 → nay), ghi lợi suất 1 phút (bps, float16) vào ma trận chung + tìm cú sốc & kết quả lệnh Bắt râu sập (như vòng 16).
Pass 2: với mỗi cú sốc qua lọc chính của bot:
  p1_* – 10 coin tương quan cao nhất theo lợi suất 1 PHÚT, 2 ngày trước (2.880 nến)
  p5_* – 10 coin tương quan cao nhất theo lợi suất 5 PHÚT, 7 ngày trước (2.016 nến)
     _c  tương quan TB của nhóm · _m1 trung vị lợi suất phút sốc (theo chiều lệnh, âm = cũng sập) · _m5 trung vị 5 phút gần nhất · _dn tỷ lệ coin trong nhóm cũng sập ≥ max(50 bps, ¼ cú sốc)
  ld_* – coin "đi trước": trong 10 coin p1 + BTC + ETH, cặp (coin, trễ k = 1–5 phút) có tương quan trễ cao nhất với B
     _r tương quan trễ · _r0 tương quan cùng phút · _k số phút đi trước · _sh lợi suất của nó ở phút tương ứng (g − k, âm = nó cũng đã sập)
     _ret lợi suất của nó k phút SAU đó (g − k + 1 … g): dương = nó đã bật lại (thành râu), âm = rơi tiếp
  btc1, btc5, eth1 – BTC / ETH phút sốc & 5 phút (theo chiều lệnh) · brd – tỷ lệ mọi coin cùng sập ≥ 1% trong phút đó · mkt1 – trung vị cả thị trường
Chạy: python research/round17.py   (kết quả: research_out/round17.json.gz + r17_result.md)"""
import concurrent.futures as cf
import datetime as dt
import gzip
import json
import math
import os
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("RS_LOG", "round17.log")
os.environ.setdefault("RS_NOCACHE", "1")
import events as E  # noqa: E402
import round6 as R6  # noqa: E402
import round8 as R8  # noqa: E402
import round15 as R15  # noqa: E402,F401  (gắn R6.sim mới – giống vòng 16)

DS = (1.25, 1.5); W = 8; HMAX = 120
EXIT = ("R", (150, 100))
L1, L5, K, LAGS = 2880, 2016, 10, (1, 2, 3, 4, 5)
STABLE = {"USDCUSDT", "FDUSDUSDT", "TUSDUSDT", "BUSDUSDT", "USDPUSDT", "DAIUSDT", "EURUSDT", "AEURUSDT", "USDEUSDT", "XUSDUSDT", "BFUSDUSDT"}

y0, m0 = map(int, R6.START.split("-"))
G0 = int(dt.datetime(y0, m0, 1, tzinfo=dt.timezone.utc).timestamp() // 60)
NG = (int(time.time() // 60) + 1440 - G0) // 5 * 5
SYMS = [s for s in E.list_symbols() if s not in STABLE]
NS = len(SYMS); IDX = {s: i for i, s in enumerate(SYMS)}
M1 = np.full((NS, NG), np.nan, dtype=np.float16)       # lợi suất 1 phút (bps); NaN = không có nến
BTC, ETH = IDX.get("BTCUSDT"), IDX.get("ETHUSDT")


def process(s):
    si = IDX[s]
    try:
        d = R6.load(s)
    except Exception:  # noqa: BLE001
        return []
    if d is None or len(d) < 3000:
        return []
    cf_ = d.c.ffill(); c = cf_.values; o = d.o.fillna(cf_).values; h = d.h.fillna(cf_).values; l = d.l.fillna(cf_).values
    qv = d.qv.fillna(0).values; ok = d.c.notna().values; t0 = int(d.index[0]); n = len(d)
    r = np.diff(np.log(c), prepend=np.log(c[0]))
    # ghi vào ma trận chung (chỉ phút có nến thật)
    off = t0 - G0; a = max(0, -off); b = min(n, NG - off)
    if b > a:
        rb = (r * 1e4).astype(np.float32); rb[~ok] = np.nan; rb = np.clip(rb, -60000, 60000)
        M1[si, off + a:off + b] = rb[a:b].astype(np.float16)
    sd = pd.Series(r).rolling(60, min_periods=40).std().shift(1).values
    mq = pd.Series(qv).rolling(60, min_periods=40).median().shift(1).values
    q24 = pd.Series(qv).rolling(1440, min_periods=600).sum().shift(1).values
    z = np.abs(r) / sd
    base = (z >= 4) & (np.abs(r) * 1e4 >= 300) & ok & (q24 >= 2e6)
    raw8 = np.flatnonzero(base & (qv >= 8 * mq))
    out = []
    for i in E.dedupe(np.flatnonzero(base & (qv >= 3 * mq)), 30):
        if i < 1440 or i + 2 + HMAX >= n:
            continue
        vx = qv[i] / mq[i] if mq[i] > 0 else 0; p6 = int(((raw8 < i) & (raw8 >= i - 360)).sum())
        if vx < 8 or p6:            # chỉ cú sốc qua lọc chính của bot (khối lượng ≥ 8×, không có sốc khác 6 giờ trước)
            continue
        g = t0 + i - G0
        if g < L5 * 5 + 10 or g >= NG:      # đủ 7 ngày dữ liệu trước cho tương quan 5 phút
            continue
        side = -1 if r[i] > 0 else 1; c0 = c[i]; mv = abs(math.expm1(r[i]))
        rec = dict(s=s, si=si, g=int(g), T=int(t0 + i), side=side, R=round(float(abs(r[i]) * 1e4)), z=round(float(z[i]), 1), vx=round(float(vx), 1), prior6=p6,
                   r15=round(float(side * (c[i - 1] / c[i - 16] - 1) * 1e4)), r4h=round(float(side * (c0 / c[i - 240] - 1) * 1e4)), res={})

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
        out.append(rec)
    return out


def corr_rows(V, b):
    """tương quan của mọi hàng V với hàng b (V đã thay NaN = 0)"""
    Y = V - V.mean(1, keepdims=True); x = Y[b]
    den = np.sqrt((Y * Y).sum(1) * float(x @ x)) + 1e-9
    return (Y @ x) / den


def feats(ev):
    g, b, side, R = ev["g"], ev["si"], ev["side"], ev["R"]
    out = {}
    try:
        W1 = M1[:, g - L1:g].astype(np.float32); cov1 = 1 - np.isnan(W1).mean(1); V1 = np.nan_to_num(W1)
        c1 = corr_rows(V1, b); c1[cov1 < 0.8] = -9; c1[b] = -9; c1[~np.isfinite(c1)] = -9
        P1 = [j for j in np.argsort(-c1)[:K] if c1[j] > -1]
        b5 = g // 5
        W5 = np.nan_to_num(M1[:, (b5 - L5) * 5:b5 * 5].astype(np.float32)).reshape(NS, L5, 5).sum(2)
        cov5 = 1 - np.isnan(M1[:, (b5 - L5) * 5:b5 * 5:5].astype(np.float32)).mean(1)
        c5 = corr_rows(W5, b); c5[cov5 < 0.8] = -9; c5[b] = -9; c5[~np.isfinite(c5)] = -9
        P5 = [j for j in np.argsort(-c5)[:K] if c5[j] > -1]
        thr = -max(50.0, 0.25 * R)
        now = M1[:, g].astype(np.float32) * side
        last5 = np.nansum(M1[:, g - 4:g + 1].astype(np.float32), 1) * side
        for nm, P, cc in (("p1", P1, c1), ("p5", P5, c5)):
            if not P:
                continue
            a = now[P]; a = a[np.isfinite(a)]
            out[f"{nm}_c"] = round(float(np.mean(cc[P])), 3)
            if len(a):
                out[f"{nm}_m1"] = round(float(np.median(a)), 1); out[f"{nm}_dn"] = round(float((a <= thr).mean()), 2)
            out[f"{nm}_m5"] = round(float(np.median(last5[P])), 1)
            out[f"{nm}_top"] = SYMS[P[0]]
        # coin đi trước: tương quan trễ k phút (nó ở t − k ↔ B ở t) cao nhất trong nhóm p1 + BTC + ETH
        cand = list(dict.fromkeys(P1 + [x for x in (BTC, ETH) if x is not None and x != b]))
        x = V1[b] - V1[b].mean(); best = None
        for j in cand:
            y = V1[j] - V1[j].mean()
            r0 = float(x @ y / (math.sqrt(float(x @ x) * float(y @ y)) + 1e-9))
            for k in LAGS:
                xa, ya = x[k:], y[:-k]
                rk = float(xa @ ya / (math.sqrt(float(xa @ xa) * float(ya @ ya)) + 1e-9))
                if best is None or rk > best[0]:
                    best = (rk, j, k, r0)
        if best:
            rk, j, k, r0 = best
            out.update(ld_r=round(rk, 3), ld_r0=round(r0, 3), ld_k=k, ld=SYMS[j],
                       ld_sh=round(float(side * np.nan_to_num(M1[j, g - k].astype(np.float32))), 1),
                       ld_ret=round(float(side * np.nansum(M1[j, g - k + 1:g + 1].astype(np.float32))), 1))
        for nm, j in (("btc", BTC), ("eth", ETH)):
            if j is None or j == b:
                continue
            out[f"{nm}1"] = round(float(np.nan_to_num(now[j])), 1)
            if nm == "btc":
                out["btc5"] = round(float(last5[j]), 1)
        col = now.copy(); col[b] = np.nan; v = col[np.isfinite(col)]
        if len(v) > 20:
            out["brd"] = round(float((v <= -100).mean()), 3); out["mkt1"] = round(float(np.median(v)), 1)
    except Exception as e:  # noqa: BLE001
        out["err"] = str(e)[:80]
    return out


if __name__ == "__main__":
    t00 = time.time()
    E.log(f"{NS} mã · {R6.MONTHS[0]} → {R6.MONTHS[-1]} + {len(R6.DAYS)} ngày tháng này · ma trận {NS}×{NG} ({M1.nbytes / 1e9:.2f} GB)")
    evs = []
    with cf.ThreadPoolExecutor(24) as ex:
        for k, out in enumerate(ex.map(process, SYMS)):
            evs += out
            if k % 100 == 0:
                E.log(f"  … {k}/{NS} mã, {len(evs)} cú sốc, {time.time() - t00:.0f}s")
    E.log(f"pass 1 xong: {len(evs)} cú sốc qua lọc chính · {time.time() - t00:.0f}s · tính đặc trưng đồng nhịp…")
    with cf.ThreadPoolExecutor(4) as ex:
        for k, (ev, ft) in enumerate(zip(evs, ex.map(feats, evs))):
            ev.update(ft)
            if k % 2000 == 0:
                E.log(f"  … đặc trưng {k}/{len(evs)}, {time.time() - t00:.0f}s")
    with gzip.open(os.path.join(E.OUT, "round17.json.gz"), "wt") as f:
        json.dump(evs, f, ensure_ascii=False, default=float)
    E.log(f"{len(evs)} cú sốc · {time.time() - t00:.0f}s")
    os.system(f"{sys.executable} {os.path.join(os.path.dirname(__file__), 'r17_calc.py')} {os.path.join(E.OUT, 'round17.json.gz')} > {os.path.join(E.OUT, 'r17_result.md')} 2>&1")
