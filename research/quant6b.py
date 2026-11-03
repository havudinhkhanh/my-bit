"""6 PHƯƠNG PHÁP ĐỊNH LƯỢNG – phần B: các phương pháp cần nến 5 PHÚT và OPEN INTEREST (dữ liệu "metrics" 5 phút của Binance), ~16 tháng gần nhất.
  P5  VWAP neo theo ngày (reset 00:00 UTC) ± k·σ (σ theo khối lượng) + lọc trạng thái thị trường bằng HMM 2 trạng thái (Hidden Markov Model)
      trên nến 1 giờ của BTC (đi ngang biến động thấp / xu hướng biến động cao), + phân kỳ MFI → đánh ngược về VWAP, chốt ở VWAP
  P6  Thác thanh lý (liquidation cascade) + Open Interest xả: giá −X% trong 1–3 nến 5 phút, OI −Y% đột ngột, nến có râu dưới dài,
      khối lượng > 3× trung bình 20 nến → Long bắt đáy, chốt khi hồi 50% cú sập (và bản gương: Short sau cú bơm ép Short)
  P3b Funding cực âm + OI tăng mạnh mà giá không giảm thêm (hấp thụ lực bán) → Long
Cùng nguyên tắc với phần A (quant6a.py): phí + trượt (+5 bps lúc biến động mạnh), nến đã đóng, vào giá mở nến kế tiếp, chạm cùng nến → tính xấu,
vũ trụ 60 mã/tháng theo khối lượng tháng trước (kể cả mã huỷ niêm yết), walk-forward 6 tháng → 2 tháng, chỉ báo cáo ngoài mẫu.
Chạy: research.yml script=quant6b.py nsym=2000"""
import concurrent.futures as cf
import datetime as dt
import gzip
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
os.environ.setdefault("RS_LOG", "quant6b.log")
os.environ.setdefault("RS_START", "2025-07")
import events as E  # noqa: E402
import round10 as R  # noqa: E402
import quant6a as Q  # noqa: E402

log = E.log
MONTHS = Q.MONTHS
TOPN = int(os.environ.get("Q_TOPN5", "60"))


def fetch5(s, m):
    path = os.path.join(E.CACHE, f"{s}_5m_{m}.pkl")
    if os.path.exists(path):
        return pd.read_pickle(path)
    b = E.get(f"{E.BASE}/monthly/klines/{s}/5m/{s}-5m-{m}.zip")
    d = E.parse(b) if b else None
    if d is not None:
        a = d  # cột: t (phút), o h l c qv tbq
        a.to_pickle(path)
    return d


def fetch_metrics(s, day):
    path = os.path.join(E.CACHE, f"{s}_mt_{day}.pkl")
    if os.path.exists(path):
        return pd.read_pickle(path)
    b = E.get(f"{E.BASE}/daily/metrics/{s}/{s}-metrics-{day}.zip")
    if not b:
        return None
    try:
        z = zipfile.ZipFile(io.BytesIO(b)); raw = z.read(z.namelist()[0]).decode().splitlines()
        rows = [ln.split(",") for ln in raw if ln and ln[0].isdigit()]
        d = pd.DataFrame({"t": (pd.to_datetime([r[0] for r in rows]).values.astype("datetime64[m]").astype(np.int64)), "oi": [float(r[2]) for r in rows]})
    except Exception:  # noqa: BLE001
        return None
    d.to_pickle(path)
    return d


def days_of(months):
    out = []
    for m in months:
        y, mo = map(int, m.split("-")); d = dt.date(y, mo, 1)
        while d.month == mo:
            out.append(d.isoformat()); d += dt.timedelta(days=1)
    return [x for x in out if x < E.TODAY.isoformat()]


# ---------------------------------------------------------------------------- HMM 2 trạng thái (Gaussian, chéo) – Baum-Welch có chuẩn hoá
def hmm_fit(X, it=60, seed=0):
    n, k = X.shape
    r = np.random.default_rng(seed)
    q = np.quantile(X[:, 0], [0.3, 0.7])
    mu = np.array([X[X[:, 0] <= q[0]].mean(0), X[X[:, 0] >= q[1]].mean(0)]); var = np.array([X.var(0), X.var(0)]) + 1e-6
    A = np.array([[0.98, 0.02], [0.02, 0.98]]); pi = np.array([0.5, 0.5])
    for _ in range(it):
        B = np.exp(-0.5 * (((X[:, None, :] - mu[None]) ** 2) / var[None] + np.log(2 * np.pi * var[None])).sum(-1)) + 1e-300
        al = np.zeros((n, 2)); c = np.zeros(n)
        al[0] = pi * B[0]; c[0] = al[0].sum(); al[0] /= c[0]
        for t in range(1, n):
            al[t] = (al[t - 1] @ A) * B[t]; c[t] = al[t].sum(); al[t] /= c[t]
        be = np.ones((n, 2))
        for t in range(n - 2, -1, -1):
            be[t] = (A @ (B[t + 1] * be[t + 1])) / c[t + 1]
        g = al * be; g /= g.sum(1, keepdims=True)
        xi = (al[:-1, :, None] * A[None] * (B[1:] * be[1:])[:, None, :]) / c[1:, None, None]
        A = xi.sum(0) / xi.sum(0).sum(1, keepdims=True); pi = g[0]
        mu = (g.T @ X) / g.sum(0)[:, None]
        var = np.array([(g[:, s, None] * (X - mu[s]) ** 2).sum(0) / g[:, s].sum() for s in range(2)]) + 1e-6
    lo = int(np.argmin(mu[:, 0]))          # trạng thái biến động thấp = "đi ngang"
    return dict(A=A, mu=mu, var=var, pi=pi, lo=lo)


def hmm_filter(X, P):
    """xác suất (chỉ dùng dữ liệu tới giờ t – lọc tiến, không nhìn trước) đang ở trạng thái biến động thấp"""
    A, mu, var = P["A"], P["mu"], P["var"]
    B = np.exp(-0.5 * (((X[:, None, :] - mu[None]) ** 2) / var[None] + np.log(2 * np.pi * var[None])).sum(-1)) + 1e-300
    al = P["pi"] * B[0]; al /= al.sum(); out = np.zeros(len(X)); out[0] = al[P["lo"]]
    for t in range(1, len(X)):
        al = (al @ A) * B[t]; al /= al.sum(); out[t] = al[P["lo"]]
    return out


def btc_regime(H0, n):
    """mỗi giờ: xác suất BTC đang 'đi ngang biến động thấp'. Mô hình học trên 6 tháng trước mỗi cửa sổ 2 tháng (walk-forward)."""
    d = R.load1h("BTCUSDT")
    c = d.c.reindex(np.arange(H0, H0 + n)).ffill().values
    lr = np.diff(np.log(c), prepend=np.nan)
    rv = pd.Series(lr).rolling(24).std().values
    tr = np.abs(pd.Series(np.log(c)).diff(24).values) / (rv * math.sqrt(24) + 1e-9)
    X = np.column_stack([np.log(rv + 1e-6), tr])
    ok = np.isfinite(X).all(1)
    p = np.full(n, np.nan)
    for k in range(6, len(MONTHS), 2):
        a = Q.month_hours(MONTHS[k - 6])[0] - H0; b = Q.month_hours(MONTHS[k])[0] - H0; e = Q.month_hours(MONTHS[min(len(MONTHS) - 1, k + 1)])[1] - H0
        tr_ = np.arange(a, b); tr_ = tr_[ok[tr_]]
        if len(tr_) < 500:
            continue
        mu0, sd0 = X[tr_].mean(0), X[tr_].std(0) + 1e-9
        P = hmm_fit((X[tr_] - mu0) / sd0)
        rr = np.arange(b - 48, min(n, e)); rr = rr[ok[rr]]
        pr = hmm_filter((X[rr] - mu0) / sd0, P)
        p[rr[rr >= b]] = pr[rr >= b]
    return p


# ---------------------------------------------------------------------------- dữ liệu
def build5(syms):
    t0 = time.time()
    MB = [Q.month_hours(m) for m in MONTHS]
    MV = {}

    def mvol(s):
        d = R.load1h(s)
        if d is None:
            return s, None
        idx = d.index.values; q = d.qv.values
        return s, {m: float(np.nansum(q[(idx >= a) & (idx < b)])) for m, (a, b) in zip(MONTHS, MB) if ((idx >= a) & (idx < b)).any()}
    with cf.ThreadPoolExecutor(32) as ex:
        for s, v in ex.map(mvol, syms):
            for m, q in (v or {}).items():
                MV.setdefault(m, {})[s] = q
    UNI, RK = {}, {}
    for j, m in enumerate(MONTHS[1:], 1):
        prev = MV.get(MONTHS[j - 1], {})
        UNI[m] = [s for s, _ in sorted(prev.items(), key=lambda x: -x[1])[:TOPN]]; RK[m] = {s: r for r, s in enumerate(UNI[m])}
    keep = sorted({s for L in UNI.values() for s in L} | {"BTCUSDT"})
    log(f"vũ trụ 5 phút: {len(keep)} mã · {time.time() - t0:.0f}s")
    H0 = MB[0][0]; n = MB[-1][1] - H0; n5 = n * 12; T0 = H0 * 60
    S = {s: i for i, s in enumerate(keep)}
    M = {f: np.full((n5, len(keep)), np.nan, dtype=np.float32) for f in ("o", "h", "l", "c", "qv")}
    OI = np.full((n5, len(keep)), np.nan, dtype=np.float32)
    jobs = [(s, m) for s in keep for m in MONTHS]
    with cf.ThreadPoolExecutor(48) as ex:
        for (s, m), d in zip(jobs, ex.map(lambda j: fetch5(*j), jobs)):
            if d is None:
                continue
            i = ((d.t.values - T0) // 5).astype(np.int64); ok = (i >= 0) & (i < n5)
            for f in M:
                M[f][i[ok], S[s]] = d[f].values[ok]
    log(f"nến 5 phút xong · {time.time() - t0:.0f}s")
    dj = [(s, d) for s in keep for d in days_of(MONTHS)]
    done = 0
    with cf.ThreadPoolExecutor(64) as ex:
        for (s, day), d in zip(dj, ex.map(lambda j: fetch_metrics(*j), dj)):
            done += 1
            if done % 5000 == 0:
                log(f"  OI {done}/{len(dj)} tệp · {time.time() - t0:.0f}s")
            if d is None or not len(d):
                continue
            # ảnh chụp OI lúc create_time = giá trị tại thời điểm ĐÓNG của nến 5 phút bắt đầu trước đó 5 phút
            i = ((d.t.values - T0) // 5 - 1).astype(np.int64); ok = (i >= 0) & (i < n5)
            OI[i[ok], S[s]] = d.oi.values[ok]
    log(f"OI xong · {np.isfinite(OI).mean() * 100:.0f}% ô có số · {time.time() - t0:.0f}s")
    return H0, n, n5, keep, S, M, OI, UNI, RK


def spans_of(UNI, RK, H0):
    sp = {}
    for m, L in UNI.items():
        a, b = Q.month_hours(m)
        for s in L:
            sp.setdefault(s, []).append(((a - H0) * 12, (b - H0) * 12, RK[m][s]))
    return sp


def fund5(F, j, side, i1, i2):
    return Q.fund_bps(F, j, side, i1 // 12 + (1 if i1 % 12 else 0), i2 // 12 + (1 if i2 % 12 else 0))


# ---------------------------------------------------------------------------- P6 · thác thanh lý
def p6_liq(H0, n5, keep, S, M, OI, UNI, RK, F):
    out = []
    for s, spans in spans_of(UNI, RK, H0).items():
        j = S[s]
        o, h, l, c, v = (M[f][:, j].astype(np.float64) for f in ("o", "h", "l", "c", "qv")); oi = OI[:, j].astype(np.float64)
        if np.isfinite(c).sum() < 5000:
            continue
        v20 = pd.Series(v).rolling(20, min_periods=15).mean().shift(1).values
        oimax = pd.Series(oi).rolling(4, min_periods=2).max().shift(1).values       # OI cao nhất 3 nến trước + nến hiện tại (đã đóng)
        hi3 = pd.Series(h).rolling(3, min_periods=1).max().values; lo3 = pd.Series(l).rolling(3, min_periods=1).min().values
        c3 = pd.Series(c).shift(3).values
        rng = h - l
        for a, b, rk in spans:
            for side in (1, -1):
                r3 = c / c3 - 1
                doi = oi / oimax - 1          # cả 2 chiều: OI giảm = vị thế bị đóng / thanh lý
                wick = ((np.minimum(o, c) - l) if side > 0 else (h - np.maximum(o, c))) / np.where(rng > 0, rng, np.nan)
                for X in (0.03, 0.05):
                    for Y in (0.03, 0.05):
                        sig = ((side * r3) <= -X) & (doi <= -Y) & (wick >= 0.4) & (v > 3 * v20)
                        idx = np.flatnonzero(sig[a:b]) + a
                        for hold in (12, 48):
                            busy = -1
                            for i in idx:
                                if i <= busy or i + 2 >= len(c):
                                    continue
                                e = o[i + 1]
                                if not (e > 0):
                                    continue
                                pk, lw = (hi3[i], lo3[i]) if side > 0 else (lo3[i], hi3[i])   # đỉnh trước cú sập / đáy cú sập (long); gương với short
                                tgt = lw + 0.5 * (pk - lw)
                                stp = lw - 0.5 * (pk - lw)
                                x = None; why = "T"; k = i + 1
                                for k in range(i + 1, min(len(c) - 1, i + 1 + hold)):
                                    if (side > 0 and l[k] <= stp) or (side < 0 and h[k] >= stp):
                                        x = stp if (side > 0 and o[k] > stp) or (side < 0 and o[k] < stp) else o[k]; why = "SL"; break
                                    if (side > 0 and h[k] >= tgt) or (side < 0 and l[k] <= tgt):
                                        x = max(tgt, o[k]) if side > 0 else min(tgt, o[k]); why = "TP"; break
                                if x is None:
                                    k = min(len(c) - 1, i + 1 + hold); x = o[k]
                                if not (x > 0):
                                    continue
                                busy = k
                                out.append(dict(st="P6", p=f"{'L' if side > 0 else 'S'}|x{int(X * 100)}|oi{int(Y * 100)}|h{hold}", s=s, side=side, t=int((i + 1) // 12), t2=int(k // 12),
                                                g=round(side * (x / e - 1) * 1e4, 2), c=round(Q.cost(rk) + 5, 2), f=round(fund5(F, j, side, i + 1, k), 2), why=why))
    log(f"  P6: {len(out)} lệnh")
    return out


# ---------------------------------------------------------------------------- P5 · VWAP ± kσ + HMM
def mfi(h, l, c, v, n=14):
    tp = (h + l + c) / 3; mf = tp * v; d = np.diff(tp, prepend=np.nan)
    pos = pd.Series(np.where(d > 0, mf, 0.0)).rolling(n).sum().values; neg = pd.Series(np.where(d < 0, mf, 0.0)).rolling(n).sum().values
    with np.errstate(divide="ignore", invalid="ignore"):
        return 100 - 100 / (1 + pos / neg)


def p5_vwap(H0, n5, keep, S, M, OI, UNI, RK, F, REG):
    out = []
    day = np.arange(n5) // 288
    for s, spans in spans_of(UNI, RK, H0).items():
        j = S[s]
        o, h, l, c, v = (M[f][:, j].astype(np.float64) for f in ("o", "h", "l", "c", "qv"))
        if np.isfinite(c).sum() < 5000:
            continue
        tp = (h + l + c) / 3; vq = np.nan_to_num(v)
        g = pd.DataFrame({"d": day, "pv": tp * vq, "v": vq, "p2v": tp * tp * vq})
        cs = g.groupby("d")[["pv", "v", "p2v"]].cumsum()
        with np.errstate(divide="ignore", invalid="ignore"):
            vw = (cs.pv / cs.v).values; sd = np.sqrt(np.maximum(0, (cs.p2v / cs.v).values - vw * vw))
        mf = mfi(h, l, c, vq)
        lo12 = pd.Series(l).rolling(12).min().values; hi12 = pd.Series(h).rolling(12).max().values
        mfmin = pd.Series(mf).rolling(12).min().shift(1).values; mfmax = pd.Series(mf).rolling(12).max().shift(1).values
        bar = np.arange(n5) % 288
        reg = REG[np.minimum(len(REG) - 1, np.arange(n5) // 12)]
        for a, b, rk in spans:
            for k in (2.0, 2.5, 3.0):
                for side in (1, -1):
                    band = (c < vw - k * sd) if side > 0 else (c > vw + k * sd)
                    div = ((l <= lo12) & (mf > mfmin)) if side > 0 else ((h >= hi12) & (mf < mfmax))
                    base = band & (bar >= 12) & (bar < 276) & (sd > 0)
                    for flt in ("none", "hmm", "mfi", "hmm+mfi"):
                        sig = base & ((reg > 0.7) if "hmm" in flt else True) & (div if "mfi" in flt else True)
                        busy = -1
                        for i in np.flatnonzero(sig[a:b]) + a:
                            if i <= busy or i + 2 >= n5:
                                continue
                            e = o[i + 1]
                            if not (e > 0):
                                continue
                            stp = vw[i] - side * (k + 1.5) * sd[i]
                            dend = (i // 288 + 1) * 288 - 1
                            x = None; why = "T"; kk = i + 1
                            for kk in range(i + 1, min(n5 - 1, dend)):
                                if (side > 0 and l[kk] <= stp) or (side < 0 and h[kk] >= stp):
                                    x = min(stp, o[kk]) if side > 0 else max(stp, o[kk]); why = "SL"; break
                                tg = vw[kk - 1]          # chốt ở VWAP (giá trị lúc nến trước đóng – đặt lệnh chờ trước)
                                if (side > 0 and h[kk] >= tg) or (side < 0 and l[kk] <= tg):
                                    x = max(tg, o[kk]) if side > 0 else min(tg, o[kk]); why = "TP"; break
                            if x is None:
                                kk = min(n5 - 1, dend); x = o[kk] if o[kk] > 0 else c[kk - 1]
                            if not (x > 0):
                                continue
                            busy = kk
                            out.append(dict(st="P5", p=f"{'L' if side > 0 else 'S'}|k{k}|{flt}", s=s, side=side, t=int((i + 1) // 12), t2=int(kk // 12),
                                            g=round(side * (x / e - 1) * 1e4, 2), c=round(Q.cost(rk) - 3, 2), f=round(fund5(F, j, side, i + 1, kk), 2), why=why))
    log(f"  P5: {len(out)} lệnh (chốt bằng lệnh chờ ở VWAP: chi phí −3 bps so với taker 2 chiều)")
    return out


# ---------------------------------------------------------------------------- P3b · funding cực âm + OI tăng
def p3b(H0, n5, keep, S, M, OI, UNI, RK, F):
    out = []
    n = n5 // 12
    for m, L in UNI.items():
        a, b = Q.month_hours(m); a -= H0; b -= H0
        for s in L:
            j = S[s]; fj = F[:, j]
            T = np.flatnonzero(fj[max(0, a - 24 * 95):b] != 0) + max(0, a - 24 * 95); fv = fj[T].astype(np.float64)
            c5 = M["c"][:, j]; o5 = M["o"][:, j]; oi = OI[:, j]
            for q, t in enumerate(T):
                if t < a or t >= b - 1 or fv[q] >= 0:
                    continue
                hist = fv[(T >= t - 24 * 90) & (T < t)]
                if len(hist) < 150 or (hist < fv[q]).mean() > 0.05:
                    continue
                i5 = t * 12 - 1          # nến 5 phút đóng đúng lúc chốt funding
                if i5 < 96 or i5 + 2 >= n5:
                    continue
                o8 = oi[i5 - 96] if np.isfinite(oi[i5 - 96]) else np.nan
                d_oi = float(oi[i5] / o8 - 1) if o8 and o8 > 0 and np.isfinite(oi[i5]) else np.nan
                r8 = float(c5[i5] / c5[i5 - 96] - 1) if c5[i5 - 96] > 0 else np.nan
                if not (np.isfinite(d_oi) and np.isfinite(r8)):
                    continue
                e = float(o5[i5 + 1])
                if not (e > 0):
                    continue
                for thr in (0.0, 0.05, 0.10):
                    if d_oi < thr or r8 < -0.01:
                        continue
                    for hold in (8, 24, 72):
                        k = min(n5 - 1, i5 + 1 + hold * 12); x = float(o5[k])
                        if not (x > 0):
                            continue
                        out.append(dict(st="P3b", p=f"oi{int(thr * 100)}|h{hold}", s=s, side=1, t=int(t), t2=int(k // 12), g=round((x / e - 1) * 1e4, 2), c=round(Q.cost(RK[m][s]), 2),
                                        f=round(Q.fund_bps(F, j, 1, t + 1, k // 12), 2), why="T", doi=round(d_oi * 100, 1), r8=round(r8 * 1e4, 0)))
    log(f"  P3b: {len(out)} lệnh")
    return out


if __name__ == "__main__":
    t00 = time.time()
    syms = E.list_symbols()
    log(f"{len(syms)} mã · {MONTHS[0]} → {MONTHS[-1]} · nến 5 phút + OI")
    H0, n, n5, keep, S, M, OI, UNI, RK = build5(syms)
    F = Q.load_funding(keep, H0, n)
    REG = btc_regime(H0, n)
    log(f"HMM: {np.nanmean(REG > 0.7) * 100:.0f}% số giờ BTC 'đi ngang' (p > 0,7)")
    res, txt = {}, [f"Kiểm chứng 6 phương pháp – phần B (nến 5 phút + Open Interest) · {MONTHS[0]} → {MONTHS[-1]} · vũ trụ {TOPN} mã/tháng · {time.strftime('%Y-%m-%d %H:%M')} UTC"]
    jobs = [("P6 · Thác thanh lý + OI xả", lambda: p6_liq(H0, n5, keep, S, M, OI, UNI, RK, F), "L|x3|oi5|h12",
             "Tín hiệu ở nến 5 phút ĐÃ ĐÓNG: 3 nến −X%, OI −Y% so với cao nhất 3 nến trước, râu ≥ 40% thân nến, khối lượng > 3× TB 20 nến. Chốt hồi 50%, cắt dưới đáy 50% cú sập, giữ tối đa 1 / 4 giờ. +5 bps trượt."),
            ("P5 · VWAP ngày ± kσ + HMM + MFI", lambda: p5_vwap(H0, n5, keep, S, M, OI, UNI, RK, F, REG), "L|k2.5|hmm+mfi",
             "Vào khi đóng ngoài dải, chốt chạm VWAP, cắt k+1,5σ, hết ngày đóng. HMM học trên BTC 1 giờ, 6 tháng trước mỗi cửa sổ."),
            ("P3b · Funding cực âm + OI tăng, giá không giảm", lambda: p3b(H0, n5, keep, S, M, OI, UNI, RK, F), "oi5|h24", "OI 8 giờ ≥ +0/5/10%, giá 8 giờ ≥ −1%.")]
    for name, fn, dflt, note in jobs:
        t1 = time.time()
        try:
            rows = fn()
        except Exception as e:  # noqa: BLE001
            import traceback
            log(f"LỖI {name}: {e}\n{traceback.format_exc()}"); continue
        r, tx = Q.report(name, rows, H0, dflt, note)
        res[name] = r; txt.append(tx); log(tx); log(f"  ({time.time() - t1:.0f}s)")
        with gzip.open(os.path.join(E.OUT, f"q6b_{name.split(' ')[0]}.json.gz"), "wt") as f:
            json.dump(rows, f, separators=(",", ":"))
    with open(os.path.join(E.OUT, "quant6b.txt"), "w") as f:
        f.write("\n".join(txt))
    with open(os.path.join(E.OUT, "quant6b.json"), "w") as f:
        json.dump(res, f, ensure_ascii=False, default=str)
    log(f"xong · {time.time() - t00:.0f}s")
