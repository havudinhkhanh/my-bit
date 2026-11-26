"""Vòng 24 – LƯỚT GIÂY, RA LỆNH CHỦ ĐỘNG (Jason 26/11/2026): "vào vài giây rồi rút, lời mỗi lệnh ~0,05% tài sản, đánh liên tục, tính cả trượt giá – ra chủ động, không cố định xx giây".
Dữ liệu: TỪNG GIAO DỊCH (aggTrades) Binance futures, 01/2024 → hôm nay: 10 altcoin thanh khoản cao, 1 ngày mỗi tuần + MỌI ngày của 21 ngày gần nhất.
VÀO (theo dòng lệnh chủ động 2 giây vừa qua):
  khối lượng 2 giây ≥ K × trung bình 2 giây của 10 phút trước (K = 5 / 10) · lệch mua/bán ≥ 70% · giá 2 giây đi ≥ X bps (X = 5 / 15)
  mom = đánh THEO chiều dòng lệnh · fade = đánh NGƯỢC · nghỉ 30 giây sau mỗi tín hiệu trên cùng mã
  vào bằng lệnh thị trường sau độ trễ L (150 / 500 ms) ở giá giao dịch kế tiếp · phí taker 5 bps
RA CHỦ ĐỘNG (không giữ cố định – chỉ có trần an toàn 300 giây):
  · chốt khi lời RÒNG (sau phí khứ hồi + trượt) đạt T bps (T = 5 / 10 / 20) – taker: kích hoạt rồi lệnh thị trường sau độ trễ;
    maker: đặt sẵn lệnh chờ ở giá mục tiêu, chỉ khớp khi có giao dịch đi XUYÊN qua giá (phí 2 bps)
  · dòng lệnh đảo chiều: 2 giây vừa đóng lệch ngược ≥ 60% với khối lượng ≥ K/2 × nền → ra (thị trường)
  · cắt lỗ S bps theo giá (S = 20 / 40) → ra (thị trường)
  Trượt thêm mỗi lệnh thị trường: 0 / 5 bps (giá giao dịch đã gồm chênh mua–bán).
Kết quả: research_out/round24.json.gz (tổng theo biến thể × ngày × mã) + r24_result.md (r24_calc.py).
Chạy: python research/round24.py"""
import concurrent.futures as cf
import datetime as dt
import gzip
import io
import itertools
import json
import os
import shutil
import sys
import tempfile
import time
import urllib.request
import zipfile

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
OUT = "research_out"; os.makedirs(OUT, exist_ok=True)
BASE = "https://data.binance.vision/data/futures/um/daily/aggTrades"
SYMS = os.environ.get("R24_SYMS", "SOLUSDT,XRPUSDT,DOGEUSDT,ADAUSDT,AVAXUSDT,LINKUSDT,SUIUSDT,ARBUSDT,NEARUSDT,LTCUSDT").split(",")
START = dt.date.fromisoformat(os.environ.get("R24_START", "2024-01-01"))
TODAY = dt.date.today()
LOGF = open(os.path.join(OUT, "round24.log"), "w")


def log(*a):
    s = " ".join(str(x) for x in a); print(s, flush=True); LOGF.write(s + "\n"); LOGF.flush()


def days():
    last = TODAY - dt.timedelta(days=1)
    out = set()
    d = START
    while d <= last:
        out.add(d); d += dt.timedelta(days=7)
    for k in range(1, 22):
        out.add(TODAY - dt.timedelta(days=k))
    return sorted(out)


KS, XS, DIRS, TS, SS, TPX, LATS, SLIPS = (5, 10), (5, 15), ("mom", "fade"), (5, 10, 20), (20, 40), ("taker", "maker"), (150, 500), (0, 5)
VAR = list(itertools.product(KS, XS, DIRS, TS, SS, TPX, LATS, SLIPS))
FEE_T, FEE_M, MAXH = 5.0, 2.0, 300


def load(sym, d):
    url = f"{BASE}/{sym}/{sym}-aggTrades-{d}.zip"
    with tempfile.NamedTemporaryFile(suffix=".zip", dir=os.environ.get("RUNNER_TEMP")) as tf:
        for k in range(4):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "mybit-research"}), timeout=180) as r:
                    tf.seek(0); tf.truncate(); shutil.copyfileobj(r, tf, 1 << 20); break
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    return None
                time.sleep(2 + k)
            except Exception:  # noqa: BLE001
                time.sleep(2 + k)
        else:
            return None
        tf.flush()
        z = zipfile.ZipFile(tf.name); nm = z.namelist()[0]
        with z.open(nm) as f:
            head = f.read(64)
        hdr = 0 if head[:1].isalpha() else None
        with z.open(nm) as f:
            df = pd.read_csv(io.TextIOWrapper(f), header=hdr, usecols=[1, 2, 5, 6])
    p = df.iloc[:, 0].values.astype(np.float64); q = df.iloc[:, 1].values.astype(np.float64); t = df.iloc[:, 2].values.astype(np.int64)
    m = df.iloc[:, 3].astype(str).str.lower().str.startswith("t").values      # True = bên mua là maker → giao dịch BÁN chủ động
    if len(t) and t[0] > 1e14:
        t = t // 1000
    o = np.argsort(t, kind="stable")
    return t[o], p[o], q[o] * p[o], m[o]


def run(job):
    sym, d = job
    try:
        x = load(sym, d)
    except Exception as e:  # noqa: BLE001
        return sym, str(d), None, f"lỗi {type(e).__name__}"
    if x is None or len(x[0]) < 1000:
        return sym, str(d), None, "không có dữ liệu"
    t, p, qv, sell = x
    s0 = int(t[0] // 1000); sec = (t // 1000 - s0).astype(np.int64); N = int(sec[-1]) + 1
    buy = np.bincount(sec, weights=np.where(sell, 0.0, qv), minlength=N); sl = np.bincount(sec, weights=np.where(sell, qv, 0.0), minlength=N)
    lastp = np.full(N, np.nan); lastp[sec] = p; lastp = pd.Series(lastp).ffill().values
    v2 = buy + sl; v2 = v2 + np.r_[0, v2[:-1]]; b2 = buy + np.r_[0, buy[:-1]]; s2 = sl + np.r_[0, sl[:-1]]
    imb = np.where(v2 > 0, (b2 - s2) / np.where(v2 > 0, v2, 1), 0.0)
    cs = np.r_[0, np.cumsum(buy + sl)]; base = np.full(N, np.nan); i = np.arange(N); ok = i >= 602
    base[ok] = (cs[i[ok] - 1] - cs[i[ok] - 601]) / 600 * 2       # trung bình 2 giây của 10 phút trước (không gồm 2 giây tín hiệu)
    dp = np.full(N, np.nan); dp[2:] = (lastp[2:] / lastp[:-2] - 1) * 1e4
    agg = {}
    REV = {(K, sd): np.flatnonzero((v2 >= K / 2 * base) & (imb * sd <= -0.6)) for K in KS for sd in (1, -1)}
    for K, X in itertools.product(KS, XS):
        sig = np.flatnonzero(ok & (v2 >= K * base) & (np.abs(imb) >= 0.7) & (np.abs(dp) >= X) & (np.sign(imb) == np.sign(dp)))
        last = -10**9; S = []
        for j in sig:
            if j - last >= 30 and j < N - MAXH - 5:
                S.append(j); last = j
        for j in S:
            fl = 1 if imb[j] > 0 else -1
            for L in LATS:
                te = (s0 + j + 1) * 1000 + L; k0 = int(np.searchsorted(t, te))
                if k0 >= len(t):
                    continue
                k1 = int(np.searchsorted(t, te + MAXH * 1000)); seg_t, seg_p = t[k0:k1], p[k0:k1]
                if len(seg_p) < 2:
                    continue
                # dòng lệnh đảo chiều: mốc giây kết thúc (ms) của các cửa sổ 2 giây lệch ngược ≥ 60%, khối lượng ≥ K/2 × nền
                for D in DIRS:
                    sd = fl if D == "mom" else -fl
                    R_ = REV[(K, sd)]; q_ = int(np.searchsorted(R_, j + 2))
                    t_rev = (s0 + R_[q_] + 1) * 1000 if q_ < len(R_) and R_[q_] <= j + 1 + MAXH else None
                    e = seg_p[0]; pr = sd * (seg_p / e - 1) * 1e4
                    rmx = np.maximum.accumulate(pr); rmn = -np.minimum.accumulate(pr)      # đều không giảm → tìm lần chạm đầu bằng searchsorted
                    def first_ge(arr, v):
                        k = int(np.searchsorted(arr, v, "left")); return k if k < len(arr) else None
                    for T, Sx, TP, sp in itertools.product(TS, SS, TPX, SLIPS):
                        cost_in = FEE_T + sp
                        if TP == "taker":
                            g = T + cost_in + FEE_T + sp; ktp = first_ge(rmx, g)
                        else:
                            g = T + cost_in + FEE_M; ktp = first_ge(rmx, g + 0.5)      # phải đi XUYÊN giá đặt
                        ksl = first_ge(rmn, Sx)
                        cand = []      # cùng thời điểm: coi như cắt lỗ / đảo chiều đến trước chốt lời (thận trọng)
                        if ktp is not None: cand.append((seg_t[ktp], 2, "tp"))
                        if ksl is not None: cand.append((seg_t[ksl], 0, "sl"))
                        if t_rev is not None and t_rev >= seg_t[0]: cand.append((t_rev, 1, "rv"))
                        tx, _, why = min(cand) if cand else (seg_t[-1], 3, "max")
                        if why == "tp" and TP == "maker":
                            net = g - cost_in - FEE_M
                        else:
                            kx = min(int(np.searchsorted(seg_t, tx + L)), len(seg_p) - 1)
                            net = pr[kx] - cost_in - FEE_T - sp
                        key = (K, X, D, T, Sx, TP, L, sp)
                        a = agg.setdefault(key, [0, 0.0, 0.0, 0, 0.0, {"tp": 0, "sl": 0, "rv": 0, "max": 0}])
                        a[0] += 1; a[1] += net; a[2] += net * net; a[3] += net > 0; a[4] += (tx - seg_t[0]) / 1000; a[5][why] += 1
    return sym, str(d), {"|".join(map(str, k)): [int(v[0]), round(float(v[1]), 2), round(float(v[2]), 1), int(v[3]), round(float(v[4]), 1), {a: int(b) for a, b in v[5].items()}] for k, v in agg.items()}, ""


if __name__ == "__main__":
    t00 = time.time(); D = days(); jobs = [(s, d) for d in D for s in SYMS]
    log(f"{len(SYMS)} mã × {len(D)} ngày = {len(jobs)} tệp aggTrades · {len(VAR)} biến thể · {START} → {TODAY}")
    res = []; miss = 0
    with cf.ProcessPoolExecutor(int(os.environ.get("R24_PROC", "4"))) as ex:
        for n, (s, d, a, err) in enumerate(ex.map(run, jobs)):
            if a is None:
                miss += 1
            else:
                res.append(dict(s=s, d=d, a=a))
            if n % 50 == 0:
                log(f"  … {n}/{len(jobs)} tệp · thiếu {miss} · {time.time() - t00:.0f}s")
    with gzip.open(os.path.join(OUT, "round24.json.gz"), "wt") as f:
        json.dump(res, f)
    log(f"xong {len(res)} tệp · thiếu {miss} · {time.time() - t00:.0f}s")
    os.system(f"{sys.executable} {os.path.join(os.path.dirname(os.path.abspath(__file__)), 'r24_calc.py')} {os.path.join(OUT, 'round24.json.gz')} > {os.path.join(OUT, 'r24_result.md')} 2>&1")
