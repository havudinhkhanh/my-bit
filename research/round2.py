"""Vòng 2: (a) bắt cú sập bằng lệnh chờ maker đặt sâu (phí thấp hơn, giá vào tốt hơn) · (b) ăn funding quanh giờ chốt funding.
Dùng lại dữ liệu & bộ đệm của events.py. Chạy: python research/round2.py"""
import concurrent.futures as cf
import io
import json
import math
import os
import sys
import time
import zipfile

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("RS_LOG", "round2.log")
import events as E  # noqa: E402

log = E.log
MAKER = 2.0


def maker_fade(P, Z, V, R, D, H):
    """Sau cú sốc (như shock_fade): đặt lệnh chờ ngược chiều sâu thêm D × độ lớn cú sốc so với giá đóng nến sốc,
    chờ tối đa 5 phút. Khớp khi đáy/đỉnh nến vượt QUA giá chờ (thận trọng: chạm đúng giá chưa tính là khớp).
    Thoát taker sau H phút kể từ lúc khớp. Chi phí: maker 2 + taker 5 + nửa chênh lệch lúc thoát."""
    rows = []
    for s in P.syms:
        f = P.F[s]; r = f["r"]; z = r / f["sd"]
        m = (np.abs(z) >= Z) & (np.abs(r) * 1e4 >= R) & (f["qv"] >= V * f["mq"]) & f["ok"]
        half = 0.5 if P.rank[s] < 10 else 1.5 if P.rank[s] < 50 else 3.0
        for i in E.dedupe(np.flatnonzero(m), 30):
            if i + 7 + H >= P.n:
                continue
            side = -np.sign(r[i]); c0 = f["c"][i]; mv = abs(math.expm1(r[i]))
            L = c0 * (1 - side * D * mv)
            fill = None
            for j in range(i + 1, i + 6):
                if (side > 0 and f["l"][j] < L) or (side < 0 and f["h"][j] > L):
                    fill = j; break
            if fill is None:
                rows.append((s, i, 0, np.nan)); continue
            x = f["o"][min(P.n - 1, fill + 1 + H)]
            rows.append((s, i, 1, side * (x / L - 1) * 1e4 - (MAKER + E.FEE + half)))
    df = pd.DataFrame(rows, columns=["s", "i", "fill", "net"])
    if len(df):
        df["day"] = (P.T[df.i.values] // 1440).astype(int)
    return df


def fund_load(P):
    months = E.MONTHS
    def one(sym, m):
        p = os.path.join(E.CACHE, f"{sym}_fr_{m}.pkl")
        if os.path.exists(p):
            return pd.read_pickle(p)
        b = E.get(f"{E.BASE}/monthly/fundingRate/{sym}/{sym}-fundingRate-{m}.zip")
        if not b:
            return None
        z = zipfile.ZipFile(io.BytesIO(b)); t = z.read(z.namelist()[0]).decode().splitlines()
        rows = [ln.split(",") for ln in t if ln and ln[0].isdigit()]
        if not rows:
            return None
        df = pd.DataFrame({"T": [int(x[0]) // 60000 for x in rows], "f": [float(x[-1]) for x in rows]})
        df.to_pickle(p); return df
    jobs = [(s, m) for s in P.syms for m in months]
    with cf.ThreadPoolExecutor(48) as ex:
        res = list(ex.map(lambda j: (j[0], one(*j)), jobs))
    out = {}
    for s, d in res:
        if d is not None:
            out.setdefault(s, []).append(d)
    return {s: pd.concat(L).drop_duplicates("T").sort_values("T") for s, L in out.items()}


def fund_trades(P, FR, thr, M, N):
    """Funding ≥ thr (theo số thập phân, vd 0.0005 = 0,05%/kỳ): Short trước giờ chốt M phút, giữ qua giờ chốt, thoát sau N phút → nhận funding.
    Funding ≤ −thr: Long, nhận |funding|. Lãi = biến động giá theo chiều lệnh + funding nhận được − chi phí taker khứ hồi."""
    t0 = int(P.T[0]); rows = []
    for s, d in FR.items():
        if s not in P.F:
            continue
        f = P.F[s]; cst = E.cost_of(s, P.rank[s])
        for T, fr in zip(d["T"].values, d["f"].values):
            if abs(fr) < thr:
                continue
            i = int(T) - t0
            a, b = i - M, i + N
            if a < 1 or b >= P.n or not (f["ok"][a] and f["ok"][b]):
                continue
            side = -1 if fr > 0 else 1
            px = side * (f["o"][b] / f["o"][a] - 1) * 1e4
            rows.append((s, a, side, fr * 1e4, px, px + abs(fr) * 1e4 - cst))
    df = pd.DataFrame(rows, columns=["s", "i", "side", "fund", "px", "net"])
    if len(df):
        df["day"] = (P.T[df.i.values] // 1440).astype(int)
    return df


def summ(df, oos0, col="net"):
    out = {}
    for k, d in (("IS", df[df.i < oos0]), ("OOS", df[df.i >= oos0])):
        v = d[col].dropna()
        if len(v) < 2:
            out[k] = dict(n=int(len(v))); continue
        dd = d.loc[v.index].groupby("day")[col].mean()
        t = float(dd.mean() / (dd.std(ddof=1) / math.sqrt(dd.size))) if dd.size > 2 and dd.std(ddof=1) > 0 else 0.0
        out[k] = dict(n=int(len(v)), mean=round(float(v.mean()), 2), med=round(float(v.median()), 2), win=round(float((v > 0).mean() * 100), 1), t_day=round(t, 2), days=int(dd.size))
    return out


if __name__ == "__main__":
    data, vol = E.load_all()
    P = E.Panel(data, vol)
    rep = {"maker_fade": [], "funding": []}
    log("\n== (a) Bắt cú sập bằng lệnh chờ maker đặt sâu")
    res = []
    for Z in (6, 8):
        for R in (80, 150, 300):
            for D in (0.25, 0.5, 1.0):
                for H in (5, 15, 30, 60):
                    df = maker_fade(P, Z, 3, R, D, H)
                    if not len(df):
                        continue
                    sm = summ(df, P.oos0); fr = round(float(df.fill.mean() * 100), 1)
                    res.append(dict(prm=dict(Z=Z, R=R, D=D, H=H), fill=fr, **sm))
    res.sort(key=lambda x: -(x["IS"].get("mean", -99) * min(1, x["IS"].get("n", 0) / 200)))
    for x in res[:10]:
        log(f"  {x['prm']} khớp {x['fill']}% | IS {x['IS']} | OOS {x['OOS']}")
    rep["maker_fade"] = res[:20]
    # funding: IS = các tháng trước, OOS = tháng cuối
    FR = fund_load(P)
    log(f"\n== (b) Ăn funding quanh giờ chốt · có dữ liệu funding {len(FR)} mã")
    last_m = E.MONTHS[-1]
    oosF = int(pd.Timestamp(last_m + "-01", tz="UTC").timestamp() // 60) - int(P.T[0])
    res = []
    for thr in (0.0003, 0.0005, 0.001, 0.002, 0.005):
        for M in (1, 5, 30):
            for N in (1, 5, 30, 120):
                df = fund_trades(P, FR, thr, M, N)
                if len(df) < 20:
                    continue
                sm = summ(df, oosF)
                res.append(dict(prm=dict(thr=thr, M=M, N=N), px=round(float(df.px.mean()), 2), fund=round(float(df.fund.abs().mean()), 2), **sm))
    res.sort(key=lambda x: -(x["IS"].get("mean", -99) * min(1, x["IS"].get("n", 0) / 100)))
    for x in res[:12]:
        log(f"  {x['prm']} giá TB {x['px']} bps · funding TB {x['fund']} bps | IS {x['IS']} | OOS({last_m}) {x['OOS']}")
    rep["funding"] = res[:30]
    json.dump(rep, open(os.path.join(E.OUT, "round2.json"), "w"), ensure_ascii=False, indent=1, default=float)
