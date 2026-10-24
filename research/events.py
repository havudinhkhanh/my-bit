"""Nghiên cứu phương pháp "săn sự kiện" cho bot lướt giây trên nến 1 phút thật của Binance USDⓈ-M futures.

Dữ liệu: data.binance.vision (kho công khai của Binance). Không dùng khoá, không đặt lệnh.
Kiểm chứng: chọn tham số trên giai đoạn IS (trong mẫu), báo cáo trên giai đoạn OOS (ngoài mẫu) – đã trừ phí + trượt giá.
Vào lệnh ở giá MỞ của nến kế tiếp sau nến tín hiệu (không nhìn trước), thoát theo thời gian.

Chạy: python research/events.py  → research_out/report.json, research_out/report.md
"""
import concurrent.futures as cf
import datetime as dt
import io
import json
import math
import os
import re
import sys
import time
import urllib.request
import zipfile

import numpy as np
import pandas as pd

BASE = "https://data.binance.vision/data/futures/um"
S3 = "https://s3-ap-northeast-1.amazonaws.com/data.binance.vision"
OUT = "research_out"
CACHE = os.environ.get("RS_CACHE", "rs_cache")
NSYM = int(os.environ.get("RS_NSYM", "220"))
MONTHS = os.environ.get("RS_MONTHS", "2026-07,2026-08,2026-09").split(",")
OOS_FROM = os.environ.get("RS_OOS", "2026-10-01")
TODAY = dt.date.today()
FEE = 5.0            # bps mỗi chiều (taker VIP0)
HS = [1, 3, 5, 10, 15, 30, 60]
os.makedirs(OUT, exist_ok=True); os.makedirs(CACHE, exist_ok=True)
LOG = open(os.path.join(OUT, os.environ.get("RS_LOG", "research.log")), "w")


def log(*a):
    s = " ".join(str(x) for x in a)
    print(s, flush=True); LOG.write(s + "\n"); LOG.flush()


def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "mybit-research"}), timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(1 + i)
        except Exception:
            time.sleep(1 + i)
    return None


def list_symbols():
    syms, marker = [], ""
    while True:
        x = get(f"{S3}?prefix=data/futures/um/daily/klines/&delimiter=/" + (f"&marker={marker}" if marker else ""))
        if not x:
            break
        t = x.decode()
        ps = re.findall(r"<Prefix>data/futures/um/daily/klines/([A-Z0-9]+)/</Prefix>", t)
        syms += ps
        if "<IsTruncated>true</IsTruncated>" not in t or not ps:
            break
        marker = f"data/futures/um/daily/klines/{ps[-1]}/"
    return sorted({s for s in syms if s.endswith("USDT")})


COLS = ["ot", "o", "h", "l", "c", "v", "ct", "qv", "n", "tbv", "tbq", "ig"]


def parse(zbytes):
    z = zipfile.ZipFile(io.BytesIO(zbytes))
    raw = z.read(z.namelist()[0]).decode()
    lines = [ln for ln in raw.splitlines() if ln and ln[0].isdigit()]
    if not lines:
        return None
    a = np.array([ln.split(",")[:11] for ln in lines], dtype=np.float64)
    ts = a[:, 0]
    if ts[0] > 1e14:
        ts = ts / 1000
    return pd.DataFrame({"t": (ts // 60000).astype(np.int64), "o": a[:, 1], "h": a[:, 2], "l": a[:, 3], "c": a[:, 4], "qv": a[:, 7], "tbq": a[:, 10]})


def fetch(sym, kind, key):
    path = os.path.join(CACHE, f"{sym}_{key}.pkl")
    if os.path.exists(path):
        return pd.read_pickle(path)
    url = f"{BASE}/{kind}/klines/{sym}/1m/{sym}-1m-{key}.zip"
    b = get(url)
    df = parse(b) if b else None
    if df is not None and not os.environ.get("RS_NOCACHE"):
        df.to_pickle(path)
    return df


def days_oos():
    d = dt.date.fromisoformat(OOS_FROM)
    out = []
    while d < TODAY:
        out.append(d.isoformat()); d += dt.timedelta(days=1)
    return out


def load_all():
    syms = list_symbols()
    log("Số mã futures USDT trên kho dữ liệu:", len(syms))
    if not syms:
        raise SystemExit("Không đọc được danh sách mã từ data.binance.vision")
    # xếp hạng theo khối lượng 1 ngày gần đây
    probe_day = (TODAY - dt.timedelta(days=3)).isoformat()
    with cf.ThreadPoolExecutor(48) as ex:
        dd = dict(zip(syms, ex.map(lambda s: fetch(s, "daily", probe_day), syms)))
    vol = {s: float(d.qv.sum()) for s, d in dd.items() if d is not None and len(d) > 1000}
    top = [s for s, _ in sorted(vol.items(), key=lambda x: -x[1])[:NSYM]]
    if "BTCUSDT" not in top:
        top = ["BTCUSDT"] + top[:-1]
    log(f"Chọn {len(top)} mã khối lượng lớn nhất ngày {probe_day}; mã cuối: {top[-1]} ≈ {vol.get(top[-1], 0) / 1e6:.1f} triệu USD/ngày")
    jobs = [(s, "monthly", m) for s in top for m in MONTHS] + [(s, "daily", d) for s in top for d in days_oos()]
    t0 = time.time()
    with cf.ThreadPoolExecutor(48) as ex:
        res = list(ex.map(lambda j: (j[0], fetch(*j)), jobs))
    log(f"Tải {len(jobs)} tệp trong {time.time() - t0:.0f}s")
    by = {}
    for s, d in res:
        if d is not None:
            by.setdefault(s, []).append(d)
    data = {}
    for s, L in by.items():
        d = pd.concat(L).drop_duplicates("t").sort_values("t").set_index("t")
        data[s] = d
    return data, vol


# ---------------------------------------------------------------------------- tiện ích
def cost_of(sym, rank):
    """chi phí khứ hồi (bps): 2 × phí taker + 2 × nửa chênh lệch + trượt giá lúc biến động mạnh"""
    half = 0.5 if rank < 10 else 1.5 if rank < 50 else 3.0
    return 2 * FEE + 2 * half + 3.0


def fwd(o, idx, side, H):
    """lãi gộp (bps) vào ở o[idx+1], ra ở o[idx+1+H]"""
    e = o[idx + 1]; x = o[idx + 1 + H]
    return side * (x / e - 1) * 1e4


def dedupe(idx, gap):
    out, last = [], -10**9
    for i in idx:
        if i - last >= gap:
            out.append(i); last = i
    return np.array(out, dtype=np.int64)


class Panel:
    def __init__(self, data, vol):
        tmin = min(int(d.index.min()) for d in data.values()); tmax = max(int(d.index.max()) for d in data.values())
        self.T = np.arange(tmin, tmax + 1)
        self.syms = [s for s, _ in sorted(((s, vol.get(s, 0)) for s in data), key=lambda x: -x[1])]
        self.rank = {s: i for i, s in enumerate(self.syms)}
        self.F = {}
        for s in self.syms:
            d = data[s].reindex(self.T)
            c = d.c.ffill()
            o = d.o.fillna(c)
            r = np.log(c).diff()
            sd = r.rolling(60, min_periods=40).std().shift(1)
            mq = d.qv.rolling(60, min_periods=40).median().shift(1)
            hh = d.h.rolling(120, min_periods=100).max().shift(1)
            ll = d.l.rolling(120, min_periods=100).min().shift(1)
            self.F[s] = dict(o=o.values, c=c.values, h=d.h.values, l=d.l.values, qv=d.qv.fillna(0).values, tb=(d.tbq / d.qv).values,
                             r=r.values, sd=sd.values, mq=mq.values, hh=hh.values, ll=ll.values, ok=d.c.notna().values)
        self.oos0 = int(dt.datetime.fromisoformat(OOS_FROM).replace(tzinfo=dt.timezone.utc).timestamp() // 60) - tmin
        self.n = len(self.T)
        log(f"Bảng dữ liệu: {len(self.syms)} mã × {self.n} phút ({self.n / 1440:.0f} ngày); OOS từ {OOS_FROM}")


# ---------------------------------------------------------------------------- các phương pháp → danh sách sự kiện (mã, chỉ số phút, chiều)
def ev_shock(P, Z, V, R, fade):
    """Cú sốc 1 phút: |lợi suất| ≥ Z × độ lệch chuẩn 60 phút, ≥ R bps, khối lượng ≥ V × trung vị 60 phút.
    fade=True: đánh ngược (bắt nhịp bật lại sau quét thanh lý); False: đánh theo."""
    out = []
    for s in P.syms:
        f = P.F[s]; r = f["r"]; z = r / f["sd"]
        m = (np.abs(z) >= Z) & (np.abs(r) * 1e4 >= R) & (f["qv"] >= V * f["mq"]) & f["ok"]
        idx = dedupe(np.flatnonzero(m), 30)
        for i in idx:
            side = -np.sign(r[i]) if fade else np.sign(r[i])
            out.append((s, i, side))
    return out


def ev_break(P, V, TB, fade):
    """Phá đỉnh/đáy 120 phút kèm khối lượng ≥ V × trung vị và lực mua/bán chủ động ≥ TB."""
    out = []
    for s in P.syms:
        f = P.F[s]
        up = (f["c"] > f["hh"]) & (f["qv"] >= V * f["mq"]) & (f["tb"] >= TB)
        dn = (f["c"] < f["ll"]) & (f["qv"] >= V * f["mq"]) & (f["tb"] <= 1 - TB)
        for m, sd in ((up, 1), (dn, -1)):
            for i in dedupe(np.flatnonzero(m & f["ok"]), 60):
                out.append((s, i, -sd if fade else sd))
    return out


def ev_leadlag(P, Z, R, LAG):
    """BTC chạy mạnh trong 1 phút (≥ Z σ và ≥ R bps); coin chưa chạy theo (< LAG × mức BTC) → đánh coin theo chiều BTC."""
    b = P.F["BTCUSDT"]; rb = b["r"]; zb = rb / b["sd"]
    trig = np.flatnonzero((np.abs(zb) >= Z) & (np.abs(rb) * 1e4 >= R) & b["ok"])
    trig = dedupe(trig, 15)
    out = []
    for s in P.syms:
        if s == "BTCUSDT":
            continue
        f = P.F[s]
        for i in trig:
            if not f["ok"][i] or i + 62 >= P.n:
                continue
            ra = f["r"][i]
            if np.sign(ra) == np.sign(rb[i]) and abs(ra) >= LAG * abs(rb[i]):
                continue
            out.append((s, i, np.sign(rb[i])))
    return out


def ev_xrev(P, K, LB, fade=True):
    """Mỗi giờ: xếp hạng lợi suất LB phút; K mã giảm mạnh nhất → Long, K mã tăng mạnh nhất → Short (fade); ngược lại = đà."""
    out = []
    C = np.vstack([P.F[s]["c"] for s in P.syms]); OK = np.vstack([P.F[s]["ok"] for s in P.syms])
    for i in range(LB + 1, P.n - 62, 60):
        ret = C[:, i] / C[:, i - LB] - 1
        ret[~OK[:, i] | ~np.isfinite(ret)] = np.nan
        v = np.flatnonzero(np.isfinite(ret))
        if len(v) < 4 * K:
            continue
        o = v[np.argsort(ret[v])]
        for j in o[:K]:
            out.append((P.syms[j], i, 1 if fade else -1))
        for j in o[-K:]:
            out.append((P.syms[j], i, -1 if fade else 1))
    return out


FAMS = {
    "shock_fade": ("Bắt nhịp bật lại sau cú sập/quét thanh lý 1 phút", ev_shock,
                   [dict(Z=Z, V=V, R=R, fade=True) for Z in (4, 6, 8) for V in (3, 6, 12) for R in (40, 80, 150)]),
    "shock_follow": ("Đánh theo cú sốc 1 phút", ev_shock,
                     [dict(Z=Z, V=V, R=R, fade=False) for Z in (4, 6, 8) for V in (3, 6, 12) for R in (40, 80, 150)]),
    "breakout": ("Phá đỉnh/đáy 2 giờ kèm khối lượng", ev_break,
                 [dict(V=V, TB=TB, fade=False) for V in (2, 4, 8) for TB in (0.55, 0.65, 0.75)]),
    "breakout_fade": ("Phá đỉnh/đáy giả (đánh ngược)", ev_break,
                      [dict(V=V, TB=TB, fade=True) for V in (2, 4, 8) for TB in (0.55, 0.65, 0.75)]),
    "leadlag": ("BTC dẫn – coin chạy theo", ev_leadlag,
                [dict(Z=Z, R=R, LAG=LAG) for Z in (3, 4, 6) for R in (20, 40, 80) for LAG in (0.3, 0.6)]),
    "xrev": ("Đảo chiều chéo mỗi giờ (mua mã giảm mạnh nhất, bán mã tăng mạnh nhất)", ev_xrev,
             [dict(K=K, LB=LB, fade=True) for K in (3, 6) for LB in (30, 60, 240)]),
    "xmom": ("Đà chéo mỗi giờ (mua mã tăng mạnh nhất, bán mã giảm mạnh nhất)", ev_xrev,
             [dict(K=K, LB=LB, fade=False) for K in (3, 6) for LB in (30, 60, 240)]),
}


def evaluate(P, evs):
    """→ DataFrame: mỗi sự kiện × mỗi H: lãi ròng bps, ngày, IS/OOS"""
    rows = []
    for s, i, side in evs:
        f = P.F[s]; o = f["o"]
        if i + 1 + max(HS) >= P.n or not np.isfinite(o[i + 1]):
            continue
        cst = cost_of(s, P.rank[s])
        g = [fwd(o, i, side, H) for H in HS]
        rows.append((s, i, side, cst, *g))
    df = pd.DataFrame(rows, columns=["s", "i", "side", "cost"] + [f"g{H}" for H in HS])
    if len(df):
        df["day"] = (P.T[df.i.values] // 1440).astype(int)
        df["oos"] = df.i >= P.oos0
    return df


def stats(df, H):
    if not len(df):
        return dict(n=0)
    net = df[f"g{H}"] - df["cost"]
    net = net[np.isfinite(net)]
    if len(net) < 2:
        return dict(n=int(len(net)))
    d = df.loc[net.index].assign(net=net).groupby("day").net.mean()       # gộp theo ngày → t-stat không bị thổi phồng khi nhiều mã cùng nổ 1 lúc
    days = int(d.size)
    t_day = float(d.mean() / (d.std(ddof=1) / math.sqrt(days))) if days > 2 and d.std(ddof=1) > 0 else 0.0
    return dict(n=int(len(net)), per_day=round(len(net) / max(1, days), 2), days=days, mean=round(float(net.mean()), 2), med=round(float(net.median()), 2),
                gross=round(float(df.loc[net.index, f"g{H}"].mean()), 2), cost=round(float(df.loc[net.index, "cost"].mean()), 2),
                win=round(float((net > 0).mean() * 100), 1), t_day=round(t_day, 2), pos_days=round(float((d > 0).mean() * 100), 1))


def main():
    data, vol = load_all()
    P = Panel(data, vol)
    rep = {"at": dt.datetime.utcnow().isoformat(), "nsym": len(P.syms), "days": round(P.n / 1440), "oos_from": OOS_FROM, "fee_bps_side": FEE, "families": {}}
    for k, (name, fn, grid) in FAMS.items():
        t0 = time.time(); best = []
        for prm in grid:
            df = evaluate(P, fn(P, **prm))
            if not len(df):
                continue
            IS, OS = df[~df.oos], df[df.oos]
            for H in HS:
                si = stats(IS, H)
                if si.get("n", 0) < 60:
                    continue
                best.append(dict(prm=prm, H=H, IS=si, OOS=stats(OS, H)))
        best.sort(key=lambda x: -(x["IS"]["mean"] * min(1, x["IS"]["n"] / 300)))      # xếp theo IS (ưu tiên đủ mẫu)
        top = best[:8]
        rep["families"][k] = dict(name=name, tested=len(best), top=top)
        log(f"\n== {k}: {name} · {len(best)} tổ hợp · {time.time() - t0:.0f}s")
        for b in top[:5]:
            log(f"  {b['prm']} H={b['H']}m | IS n={b['IS']['n']} ({b['IS']['per_day']}/ngày) ròng {b['IS']['mean']} bps t={b['IS']['t_day']} | "
                f"OOS n={b['OOS'].get('n')} ròng {b['OOS'].get('mean')} bps gộp {b['OOS'].get('gross')} thắng {b['OOS'].get('win')}% t={b['OOS'].get('t_day')} ngày dương {b['OOS'].get('pos_days')}%")
    json.dump(rep, open(os.path.join(OUT, "report.json"), "w"), ensure_ascii=False, indent=1, default=float)


if __name__ == "__main__":
    main()
