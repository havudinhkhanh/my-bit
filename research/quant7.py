"""Vòng 7 định lượng – tìm phương pháp ĐÁNH NHANH, KHỚP CHẮC (vào bằng lệnh thị trường, giữ 15–120 phút) chưa từng kiểm chứng ở MyBit.
Nến 5 phút Binance futures 07/2025 → tháng trước, 60 mã/tháng theo khối lượng tháng trước (kể cả mã huỷ niêm yết); phí taker + chênh lệch + trượt
14–19 bps/vòng (+5 bps cho lúc biến động mạnh); nến đã đóng, vào giá mở nến kế tiếp; walk-forward 6 → 2 tháng, chỉ báo cáo ngoài mẫu.
  K1  Chênh lệch giá hợp đồng – giá chỉ số (premium / basis) lệch cực đoan: perp đắt / rẻ bất thường so với giá spot (z > k của 24 giờ trước,
      |premium| > ngưỡng) → đánh ngược trên perp (phe đòn bẩy đẩy quá tay, kinh doanh chênh lệch sẽ kéo về). Dữ liệu premiumIndexKlines 5 phút.
  K2  Cú sốc 5 phút trên 20 coin LỚN (khác Bắt râu sập: nến 5 phút, coin lớn, vào ngay bằng lệnh thị trường → luôn khớp): |lợi suất 5 phút| > k·σ
      và > 1%, khối lượng > 3× → đánh ngược (fade) hoặc đi theo (follow), giữ 15 / 30 / 60 phút.
  K3  Giờ mở phiên (Á 00:00, Âu 07:00/08:00, Mỹ 13:30 UTC) trên BTC / ETH / SOL: 30 phút đầu đi > 0,3% → đi theo / đánh ngược, giữ 30 phút – 2 giờ.
Chạy: research.yml script=quant7.py nsym=2000"""
import concurrent.futures as cf
import gzip
import io
import json
import os
import sys
import time
import zipfile

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("RS_LOG", "quant7.log")
os.environ.setdefault("RS_START", "2025-07")
os.environ.setdefault("Q_NOOI", "1")
import events as E  # noqa: E402
import quant6a as Q  # noqa: E402
import quant6b as B  # noqa: E402

log = E.log
MONTHS = Q.MONTHS


def fetch_prem(s, m):
    path = os.path.join(E.CACHE, f"{s}_pi5_{m}.pkl")
    if os.path.exists(path):
        return pd.read_pickle(path)
    b = E.get(f"{E.BASE}/monthly/premiumIndexKlines/{s}/5m/{s}-5m-{m}.zip")
    d = E.parse(b) if b else None
    if d is not None:
        d.to_pickle(path)
    return d


def k1_premium(H0, n5, keep, S, M, UNI, RK, F):
    T0 = H0 * 60; PI = np.full((n5, len(keep)), np.nan, dtype=np.float32)
    jobs = [(s, m) for s in keep for m in MONTHS]
    with cf.ThreadPoolExecutor(48) as ex:
        for (s, m), d in zip(jobs, ex.map(lambda j: fetch_prem(*j), jobs)):
            if d is None:
                continue
            i = ((d.t.values - T0) // 5).astype(np.int64); ok = (i >= 0) & (i < n5)
            PI[i[ok], S[s]] = d.c.values[ok]
    log(f"  premium: {np.isfinite(PI).mean() * 100:.0f}% ô có số")
    out = []
    for s, spans in B.spans_of(UNI, RK, H0).items():
        j = S[s]; p = PI[:, j].astype(np.float64); o = M["o"][:, j].astype(np.float64)
        if np.isfinite(p).sum() < 5000:
            continue
        mu = pd.Series(p).rolling(288, min_periods=200).mean().shift(1).values; sd = pd.Series(p).rolling(288, min_periods=200).std().shift(1).values
        z = (p - mu) / sd
        for a, b, rk in spans:
            for k in (3.0, 4.0, 6.0):
                for thr in (0.001, 0.002, 0.004):
                    sig = (np.abs(z) > k) & (np.abs(p) > thr)
                    idx = np.flatnonzero(sig[a:b]) + a
                    for hold in (3, 6, 12, 24):
                        busy = -1
                        for i in idx:
                            if i <= busy or i + hold + 1 >= n5:
                                continue
                            e, x = o[i + 1], o[i + 1 + hold]
                            if not (e > 0 and x > 0):
                                continue
                            side = -1 if p[i] > 0 else 1; busy = i + hold
                            out.append(dict(st="K1", p=f"k{k}|p{thr * 100:.1f}|h{hold * 5}", s=s, side=side, t=int((i + 1) // 12), t2=int((i + 1 + hold) // 12),
                                            g=round(side * (x / e - 1) * 1e4, 2), c=round(Q.cost(rk) + 3, 2), f=round(B.fund5(F, j, side, i + 1, i + 1 + hold), 2), why="T"))
    log(f"  K1: {len(out)} lệnh")
    return out


def k2_shock(H0, n5, keep, S, M, UNI, RK, F):
    out = []
    for s, spans in B.spans_of(UNI, RK, H0).items():
        j = S[s]; o, c, v = (M[f][:, j].astype(np.float64) for f in ("o", "c", "qv"))
        r = c / np.roll(c, 1) - 1; r[0] = np.nan
        sd = pd.Series(r).rolling(288, min_periods=200).std().shift(1).values; v20 = pd.Series(v).rolling(20, min_periods=15).mean().shift(1).values
        for a, b, rk in spans:
            if rk >= 20:
                continue
            for k in (4.0, 6.0):
                sig = (np.abs(r) > k * sd) & (np.abs(r) > 0.01) & (v > 3 * v20)
                idx = np.flatnonzero(sig[a:b]) + a
                for mode in ("fade", "follow"):
                    for hold in (3, 6, 12):
                        busy = -1
                        for i in idx:
                            if i <= busy or i + hold + 1 >= n5:
                                continue
                            e, x = o[i + 1], o[i + 1 + hold]
                            if not (e > 0 and x > 0):
                                continue
                            side = (-1 if r[i] > 0 else 1) * (1 if mode == "fade" else -1); busy = i + hold
                            out.append(dict(st="K2", p=f"{mode}|k{k}|h{hold * 5}", s=s, side=side, t=int((i + 1) // 12), t2=int((i + 1 + hold) // 12),
                                            g=round(side * (x / e - 1) * 1e4, 2), c=round(Q.cost(rk) + 5, 2), f=round(B.fund5(F, j, side, i + 1, i + 1 + hold), 2), why="T"))
    log(f"  K2: {len(out)} lệnh")
    return out


def k3_session(H0, n5, keep, S, M, UNI, RK, F):
    out = []
    T0 = H0 * 60
    opens = {"asia00": 0, "eu07": 7 * 60, "eu08": 8 * 60, "us1330": 13 * 60 + 30}
    for s in ("BTCUSDT", "ETHUSDT", "SOLUSDT"):
        if s not in S:
            continue
        j = S[s]; o, c = M["o"][:, j].astype(np.float64), M["c"][:, j].astype(np.float64)
        nd = n5 // 288
        for d in range(1, nd - 1):
            for nm, mins in opens.items():
                i0 = d * 288 + mins // 5          # nến 5 phút mở phiên (giờ UTC; T0 là 00:00 UTC đầu tháng)
                if i0 + 6 + 24 >= n5 or not (o[i0] > 0 and c[i0 + 5] > 0):
                    continue
                r30 = c[i0 + 5] / o[i0] - 1
                if abs(r30) < 0.003:
                    continue
                for mode in ("follow", "fade"):
                    side = (1 if r30 > 0 else -1) * (1 if mode == "follow" else -1)
                    for hold in (6, 12, 24):
                        e, x = o[i0 + 6], o[i0 + 6 + hold]
                        if not (e > 0 and x > 0):
                            continue
                        out.append(dict(st="K3", p=f"{nm}|{mode}|h{hold * 5}", s=s, side=side, t=int((i0 + 6) // 12), t2=int((i0 + 6 + hold) // 12),
                                        g=round(side * (x / e - 1) * 1e4, 2), c=14.0, f=0.0, why="T"))
    log(f"  K3: {len(out)} lệnh")
    return out


if __name__ == "__main__":
    t00 = time.time()
    syms = E.list_symbols()
    log(f"{len(syms)} mã · {MONTHS[0]} → {MONTHS[-1]} · nến 5 phút")
    H0, n, n5, keep, S, M, OI, UNI, RK = B.build5(syms)
    F = Q.load_funding(keep, H0, n)
    res, txt = {}, [f"Vòng 7 – đánh nhanh, khớp chắc · {MONTHS[0]} → {MONTHS[-1]} · {time.strftime('%Y-%m-%d %H:%M')} UTC"]
    jobs = [("K1 · Premium perp-spot lệch cực đoan → đánh ngược", lambda: k1_premium(H0, n5, keep, S, M, UNI, RK, F), "k4.0|p0.2|h30", "Vào lệnh thị trường; +3 bps trượt."),
            ("K2 · Cú sốc 5 phút trên 20 coin lớn", lambda: k2_shock(H0, n5, keep, S, M, UNI, RK, F), "fade|k4.0|h30", "Vào lệnh thị trường ở nến kế tiếp; +5 bps trượt."),
            ("K3 · Giờ mở phiên BTC/ETH/SOL", lambda: k3_session(H0, n5, keep, S, M, UNI, RK, F), "us1330|follow|h60", "Phí cố định 14 bps (coin lớn).")]
    for name, fn, dflt, note in jobs:
        t1 = time.time()
        try:
            rows = fn()
            r, tx = Q.report(name, rows, H0, dflt, note)
            df = pd.DataFrame(rows); df["net"] = df.g - df.c + df.f; df["y"] = [pd.Timestamp((t + H0) * 3_600_000_000_000).year for t in df.t]
            g = df.groupby("p").net.agg(["count", "mean"]); g = g[g["count"] >= 50]
            tx += "\n  ▸ Mọi biến thể ≥ 50 lệnh (toàn giai đoạn): " + " | ".join(f"{p} {int(x['count'])} lệnh {x['mean']:+.1f}" for p, x in g.sort_values("mean", ascending=False).iterrows())
        except Exception as e:  # noqa: BLE001
            import traceback
            log(f"LỖI {name}: {e}\n{traceback.format_exc()}"); continue
        res[name] = r; txt.append(tx); log(tx); log(f"  ({time.time() - t1:.0f}s)")
        with gzip.open(os.path.join(E.OUT, f"q7_{name.split(' ')[0]}.json.gz"), "wt") as f:
            json.dump(rows, f, separators=(",", ":"))
    with open(os.path.join(E.OUT, "quant7.txt"), "w") as f:
        f.write("\n".join(txt))
    with open(os.path.join(E.OUT, "quant7.json"), "w") as f:
        json.dump(res, f, ensure_ascii=False, default=str)
    log(f"xong · {time.time() - t00:.0f}s")
