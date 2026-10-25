"""Kiếm lời từ TƯƠNG QUAN – kiểm chứng trước khi đưa vào bot lướt giây.

Hai họ phương pháp trung tính thị trường, trên nến 1 phút Binance futures (IS: tháng 7–9, OOS: tháng 10, đã trừ phí cả 2 chân):
 (A) Cặp coin: 2 coin chạy cùng nhịp (tương quan cao 7 ngày trước) mà chênh lệch giá (spread) lệch xa trung bình 4 giờ → bán coin đắt, mua coin rẻ,
     thoát khi spread về trung bình hoặc hết giờ.
 (B) Lệch nhịp với BTC (phần dư): coin chạy khác hẳn mức "nên chạy" theo BTC (β × BTC) trong 15–60 phút → đánh coin quay về,
     phòng hộ β × BTC ở chân kia (chỉ còn rủi ro riêng của coin).
Vào ở giá mở nến kế tiếp, không nhìn trước; β, tương quan, trung bình, độ lệch đều chỉ dùng dữ liệu TRƯỚC thời điểm vào.
Chạy: python research/pairs.py
"""
import datetime as dt
import math
import os
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("RS_LOG", "pairs.log")
os.environ.setdefault("RS_NSYM", "120")
import events as E  # noqa: E402

log = E.log
FEE = 5.0


def leg_cost(rank):          # bps khứ hồi 1 chân taker: 2 × phí + 2 × nửa chênh lệch + trượt 1 bps mỗi chiều
    half = 0.5 if rank < 10 else 1.5 if rank < 50 else 3.0
    return 2 * FEE + 2 * half + 2


def summ(net, days, oos):
    out = {}
    for k, m in (("IS", ~oos), ("OOS", oos)):
        v = net[m]; d = days[m]
        if len(v) < 5:
            out[k] = dict(n=int(len(v))); continue
        s = pd.Series(v).groupby(d).mean()
        t = float(s.mean() / (s.std(ddof=1) / math.sqrt(len(s)))) if len(s) > 2 and s.std(ddof=1) > 0 else 0.0
        out[k] = dict(n=int(len(v)), per_day=round(len(v) / max(1, len(np.unique(d))), 1), mean=round(float(v.mean()), 2), med=round(float(np.median(v)), 2),
                      win=round(float((v > 0).mean() * 100), 1), t_day=round(t, 2), days=int(len(s)))
    return out


def main():
    data, vol = E.load_all()
    P = E.Panel(data, vol)
    syms = P.syms; n = P.n
    C = np.vstack([P.F[s]["c"] for s in syms]).astype(np.float64)
    O = np.vstack([P.F[s]["o"] for s in syms]).astype(np.float64)
    OK = np.vstack([P.F[s]["ok"] for s in syms])
    L = np.log(C); R = np.diff(L, axis=1, prepend=L[:, :1]); R[~OK] = 0
    ib = syms.index("BTCUSDT")
    day = (P.T // 1440).astype(int)
    rank = {i: i for i in range(len(syms))}
    oos0 = P.oos0
    rep = {"B": [], "A": []}

    # ------------------------------------------------------------------ (B) lệch nhịp với BTC
    log("\n== (B) Lệch nhịp với BTC (phần dư), phòng hộ β × BTC")
    W = 1440
    rb = R[ib]
    cb = np.cumsum(rb)
    res_rows = {}
    for i, s in enumerate(syms):
        if i == ib:
            continue
        ra = R[i]
        # β trượt 1 ngày (chỉ dữ liệu trước)
        cov = pd.Series(ra * rb).rolling(W, min_periods=600).mean() - pd.Series(ra).rolling(W, min_periods=600).mean() * pd.Series(rb).rolling(W, min_periods=600).mean()
        var = pd.Series(rb).rolling(W, min_periods=600).var(ddof=0)
        beta = (cov / var).clip(-1, 4).shift(1).values
        e = ra - np.nan_to_num(beta) * rb
        ce = np.cumsum(e)
        res_rows[i] = (beta, e, ce)
    for LB in (15, 60):
        Zs = {}
        for i, (beta, e, ce) in res_rows.items():
            RL = ce - np.roll(ce, LB); RL[:LB] = np.nan
            sd = pd.Series(e).rolling(W, min_periods=600).std().shift(1).values * math.sqrt(LB)
            Zs[i] = RL / sd
        for Z in (2.5, 3.5, 5.0):
            for H in (15, 30, 60, 120):
                for fade in (True, False):
                    nets, gs, ds, oo = [], [], [], []
                    for i, (beta, e, ce) in res_rows.items():
                        z = Zs[i]
                        m = (np.abs(z) >= Z) & OK[i] & np.isfinite(beta)
                        idx = E.dedupe(np.flatnonzero(m), H)
                        idx = idx[idx + 1 + H < n]
                        if not len(idx):
                            continue
                        side = -np.sign(z[idx]) if fade else np.sign(z[idx])
                        b = beta[idx]
                        ga = (O[i, idx + 1 + H] / O[i, idx + 1] - 1) * 1e4
                        gb = (O[ib, idx + 1 + H] / O[ib, idx + 1] - 1) * 1e4
                        gross = side * (ga - b * gb)
                        cost = leg_cost(rank[i]) + np.abs(b) * leg_cost(0)
                        nets.append(gross - cost); gs.append(gross); ds.append(day[idx]); oo.append(idx >= oos0)
                    if not nets:
                        continue
                    net = np.concatenate(nets); d = np.concatenate(ds); o = np.concatenate(oo)
                    sm = summ(net, d, o)
                    rep["B"].append(dict(prm=dict(LB=LB, Z=Z, H=H, fade=fade), gross=round(float(np.concatenate(gs).mean()), 2), **sm))
    rep["B"].sort(key=lambda x: -x["IS"].get("mean", -999))
    for x in rep["B"][:8]:
        log(f"  {x['prm']} gộp TB {x['gross']} bps | IS {x['IS']} | OOS {x['OOS']}")

    # ------------------------------------------------------------------ (A) cặp coin
    log("\n== (A) Cặp coin cùng nhịp – spread lệch xa trung bình 4 giờ")
    top = list(range(min(60, len(syms))))
    WK = 7 * 1440
    starts = list(range(WK, n - 1440, 1440))          # mỗi ngày chọn lại 25 cặp tương quan cao nhất theo 7 ngày TRƯỚC
    trades = {}
    for st in starts:
        seg = R[top, st - WK:st]
        okc = OK[top, st - WK:st].mean(axis=1) > 0.9
        cm = np.corrcoef(seg)
        pairs = []
        for a in range(len(top)):
            for b in range(a + 1, len(top)):
                if okc[a] and okc[b] and top[a] != ib and top[b] != ib and np.isfinite(cm[a, b]):
                    pairs.append((cm[a, b], top[a], top[b]))
        pairs.sort(reverse=True)
        for rho, a, b in pairs[:25]:
            ra, rbb = R[a, st - WK:st], R[b, st - WK:st]
            beta = float(np.cov(ra, rbb)[0, 1] / np.var(rbb)) if np.var(rbb) > 0 else 1.0
            beta = min(3, max(0.3, beta))
            lo, hi = st - 240, st + 1440
            spr = L[a, lo:hi] - beta * L[b, lo:hi]
            mu = pd.Series(spr).rolling(240, min_periods=200).mean().shift(1).values
            sd = pd.Series(spr).rolling(240, min_periods=200).std().shift(1).values
            z = (spr - mu) / sd
            for Z in (2.5, 3.5):
                for H in (30, 60, 240):
                    key = (Z, H)
                    j, last = 240, -10**9
                    zz = z
                    cand = np.flatnonzero((np.abs(zz) >= Z) & np.isfinite(zz))
                    cand = cand[cand >= 240]
                    for j in cand:
                        if j - last < H:
                            continue
                        t0 = lo + j
                        if t0 + 2 + H >= n or not (OK[a, t0] and OK[b, t0]):
                            continue
                        side = -np.sign(zz[j])           # spread cao → bán a, mua b
                        # thoát: spread qua trung bình (z đổi dấu) hoặc hết H phút
                        seg_z = zz[j + 1:j + 1 + H]
                        cross = np.flatnonzero(np.sign(seg_z) != np.sign(zz[j]))
                        k = int(cross[0]) + 1 if cross.size else H
                        e0, e1 = t0 + 1, t0 + 1 + k
                        ga = (O[a, e1] / O[a, e0] - 1) * 1e4; gb = (O[b, e1] / O[b, e0] - 1) * 1e4
                        gross = side * (ga - beta * gb)
                        cost = leg_cost(a) + beta * leg_cost(b)
                        trades.setdefault(key, []).append((gross - cost, gross, day[t0], t0 >= oos0, k, rho))
                        last = j
    for key, T in sorted(trades.items()):
        A = np.array([t[0] for t in T]); d = np.array([t[2] for t in T]); o = np.array([t[3] for t in T])
        sm = summ(A, d, o)
        g = np.array([t[1] for t in T]); hold = np.array([t[4] for t in T])
        rep["A"].append(dict(prm=dict(Z=key[0], H=key[1]), gross=round(float(g.mean()), 2), hold=round(float(hold.mean()), 1), **sm))
        log(f"  z≥{key[0]} giữ ≤{key[1]}p | gộp TB {g.mean():.1f} bps · giữ TB {hold.mean():.0f}p | IS {sm['IS']} | OOS {sm['OOS']}")
    import json
    json.dump(rep, open(os.path.join(E.OUT, "pairs.json"), "w"), ensure_ascii=False, default=float)


if __name__ == "__main__":
    t0 = time.time(); main(); log(f"xong {time.time() - t0:.0f}s")
