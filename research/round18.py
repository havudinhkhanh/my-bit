"""Vòng 18 – KHỚP LỆNH THEO TỪNG GIAO DỊCH (aggTrades) ở các ngày cả nhóm sập lớn nhất (Jason 12/11/2026).
Vòng 17/18a dùng nến 1 phút: không biết trong 1 phút lệnh nào khớp trước, giá chốt lời/cắt lỗ giả định cứng (trượt 23 bps).
Ở đây với 10 ngày lệnh "cả nhóm" lời nhiều nhất + đêm 10–11/10/2025 (giờ VN), tải aggTrades từng coin và chạy lại từng lệnh:
  · đặt lệnh chờ 2 giây sau khi nến sốc đóng (giá L như bot: c0 · (1 − chiều · D · |cú sốc|)), hết hạn sau 8 phút
  · KHỚP chỉ khi có giao dịch ĐI XUYÊN qua L (mua: giá < L) – đi xuyên nghĩa là mọi lệnh chờ ở L đã bị ăn hết, kể cả lệnh của mình;
    chạm đúng L mà không xuyên thì coi như KHÔNG khớp (bảo thủ). Biến thể "xuyên 5 bps" = giống mô hình nến
  · nếu lúc đặt giá đã vượt L → khớp ngay như lệnh thị trường ở giá giao dịch đầu tiên (phí taker)
  · thoát: đuổi lời ≥ 150 trả lại 100 · cắt lỗ thảm hoạ −3.500 · hết 60 phút — kích hoạt theo giá giao dịch thật,
    lệnh đóng chạy sau 1 giây ở giá giao dịch kế tiếp + trượt thêm 0 / 20 / 50 bps + phí 5 bps
Rồi thay kết quả những ngày này vào danh mục (vòng 18a) và tính lại: hiện tại vs ×1,5 / ×2 khi cả nhóm sập; thứ tự khớp trong phút = thứ tự thật.
Chạy: python research/round18.py   (đầu vào research/data/round17.json.gz · kết quả research_out/round18.json.gz + r18_result.md)"""
import concurrent.futures as cf
import functools
import gzip
import io
import json
import math
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
os.environ.setdefault("RS_LOG", "round18.log")
os.environ.setdefault("RS_NOCACHE", "1")
import events as E  # noqa: E402
import round6 as R6  # noqa: E402
import round8 as R8  # noqa: E402
import round15 as R15  # noqa: E402,F401

SRC = os.environ.get("R18_SRC", os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "round17.json.gz"))
SZ, CAP, W, FAR, HMAX = 0.075, 9, 8, ("1.25", "1.5"), 120
LAT_IN, LAT_OUT, HOLD = 2.0, 1.0, 3600.0
SCN = [("xuyên L · trượt 0", 0, 0, LAT_IN), ("xuyên L · trượt 20", 0, 20, LAT_IN), ("xuyên L · trượt 50", 0, 50, LAT_IN),
       ("xuyên 5 bps · trượt 20", 5, 20, LAT_IN), ("xuyên L · trượt 20 · đặt trễ 10 giây", 0, 20, 10.0)]
MAIN = "xuyên L · trượt 20"


# ---------------------------------------------------------------- dữ liệu
def load_events():
    D = pd.DataFrame(json.load(gzip.open(SRC, "rt"))).sort_values("T").reset_index(drop=True)
    D["ts"] = pd.to_datetime(D["T"] * 60, unit="s", utc=True); vn = D.ts + pd.Timedelta(hours=7)
    D["vnday"] = vn.dt.strftime("%Y-%m-%d"); D["half"] = D.ts.dt.year.astype(str) + np.where(D.ts.dt.month <= 6, "H1", "H2")
    for c in ("p1_dn", "brd"):
        if c not in D:
            D[c] = np.nan
    F = (D.R >= 300) & (D.z >= 4) & (D.vx >= 8) & (D.prior6 == 0) & (D.r4h > -1000) & ((D.side > 0) | (D.r15 <= 100))
    D["grp"] = (D.p1_dn >= 0.6) | (D.brd >= 0.1)
    return D[F].reset_index(drop=True), pd.date_range(vn.min().normalize(), vn.max().normalize(), freq="D").strftime("%Y-%m-%d")


def legs(res, side, r15, k):
    L = [(res[D]["tr150"], SZ / 2 * k, res[D]["f"], res[D].get("fs", 0)) for D in FAR if D in res and res[D]["f"] <= W]
    if side > 0 and r15 <= -300 and "0.0" in res:
        L.append((res["0.0"]["tr150"], 0.02 * k, 0, res["0.0"].get("fs", 0)))
    return L


def utc(tmin):
    return time.strftime("%Y-%m-%d", time.gmtime(tmin * 60))


@functools.lru_cache(maxsize=None)
def kday(s, d):
    return E.fetch(s, "daily", d)


def kwin(s, T):
    ds = sorted({utc(T - 2), utc(T + HMAX + W + 5)})
    L = [kday(s, d) for d in ds]
    L = [x for x in L if x is not None and len(x)]
    if not L:
        return None
    d = pd.concat(L).drop_duplicates("t").sort_values("t").set_index("t")
    return d.reindex(np.arange(int(d.index.min()), int(d.index.max()) + 1))


def prep(ev):
    """dựng lại giá L từ nến (như vòng 17) + kiểm lại kết quả mô hình nến · trả về những gì cần tải aggTrades"""
    s, T, side = ev["s"], int(ev["T"]), int(ev["side"])
    d = kwin(s, T)
    if d is None or T not in d.index or T - 1 not in d.index:
        return None
    cf_ = d.c.ffill(); c = cf_.values; o = d.o.fillna(cf_).values; h = d.h.fillna(cf_).values; l = d.l.fillna(cf_).values
    i = int(T - d.index[0]); n = len(c)
    if i + 2 + HMAX >= n or i < 1:
        return None
    r = math.log(c[i] / c[i - 1]); c0 = c[i]; mv = abs(math.expm1(r))
    out = dict(k=ev["k"], c0=c0, Rk=round(abs(r) * 1e4), L={}, kres={}, need=False)

    def run(L, fill, taker):
        seg_h, seg_l = h[fill + 1:fill + 1 + HMAX], l[fill + 1:fill + 1 + HMAX]
        pn = lambda px: side * (px / L - 1) * 1e4  # noqa: E731
        fav = pn(seg_h) if side > 0 else pn(seg_l); adv = pn(seg_l) if side > 0 else pn(seg_h)
        o_all = pn(o[fill + 1:fill + 2 + HMAX])
        return dict(tr150=round(float(R6.sim("R", (150, 100), fav, adv, None, o_all, L, side, c0)[0]) - (R8.IN_T - R6.IN_M if taker else 0), 1), f=int(fill - i))

    out["kres"]["0.0"] = run(o[i + 1], i, True)
    for D in (1.25, 1.5):
        L = c0 * (1 - side * D * mv); Lt = L * (1 - side * R6.THR / 1e4); out["L"][str(D)] = L
        lo, hi = l[i + 1:i + 1 + W], h[i + 1:i + 1 + W]
        if (side > 0 and lo.min() < L) or (side < 0 and hi.max() > L):
            out["need"] = True
        for j in range(i + 1, i + 1 + W):
            if (side > 0 and l[j] < Lt) or (side < 0 and h[j] > Lt):
                out["kres"][str(D)] = run(L, j, False); break
    if side > 0 and ev["r15"] <= -300:
        out["need"] = True
    return out


def agg_file(s, d, wins):
    """tải aggTrades 1 ngày, chỉ giữ giao dịch nằm trong các khung [a, b] (ms) · trả (t ms, giá)"""
    url = f"{E.BASE}/daily/aggTrades/{s}/{s}-aggTrades-{d}.zip"
    with tempfile.NamedTemporaryFile(suffix=".zip", dir=os.environ.get("RUNNER_TEMP")) as tf:
        ok = False
        for k in range(4):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "mybit-research"}), timeout=120) as r:
                    tf.seek(0); tf.truncate(); shutil.copyfileobj(r, tf, 1 << 20); ok = True; break
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    return None
                time.sleep(2 + k)
            except Exception:  # noqa: BLE001
                time.sleep(2 + k)
        if not ok:
            return None
        tf.flush()
        return parse_agg(tf.name, wins)


def parse_agg(path, wins):
    z = zipfile.ZipFile(path); nm = z.namelist()[0]
    with z.open(nm) as f:
        head = f.read(64)
    hdr = 0 if head[:1].isalpha() else None
    tt, pp = [], []
    lo = min(a for a, _ in wins); hi = max(b for _, b in wins)
    with z.open(nm) as f:
        for ch in pd.read_csv(io.TextIOWrapper(f), header=hdr, usecols=[1, 5], chunksize=4_000_000):
            p = ch.iloc[:, 0].values.astype(np.float64); t = ch.iloc[:, 1].values.astype(np.int64)
            if t[0] > 1e14:
                t = t // 1000          # micro giây → mili giây
            if t[-1] < lo:
                continue
            if t[0] > hi:
                break
            m = np.zeros(len(t), bool)
            for a, b in wins:
                m |= (t >= a) & (t <= b)
            if m.any():
                tt.append(t[m]); pp.append(p[m])
    if not tt:
        return np.array([], np.int64), np.array([], np.float64)
    return np.concatenate(tt), np.concatenate(pp)


def tsim(tt, pp, side, T, L, thr, slip, lat, market=False):
    """1 chân lệnh trên chuỗi giao dịch thật · trả dict(tr150 bps ròng, f phút khớp − phút sốc, fs giây trong phút khớp) hoặc None"""
    tp = ((T + 1) * 60 + lat) * 1000; k0 = int(np.searchsorted(tt, tp))
    if k0 >= len(tt):
        return None
    if market:
        k = k0; pin = pp[k0]; fin = 5.0 + slip
    else:
        kend = int(np.searchsorted(tt, (T + 1 + W) * 60 * 1000))
        if kend <= k0:
            return None
        x = side * (pp[k0:kend] / L - 1) * 1e4
        hit = np.flatnonzero(x < -thr - 1e-9)
        if not len(hit):
            return None
        k = k0 + int(hit[0])
        if k == k0 and x[0] < -1e-9:      # đặt lệnh khi giá đã vượt L → khớp ngay ở giá thị trường, phí taker
            pin = pp[k0]; fin = 5.0
        else:
            pin = L; fin = R6.IN_M
    tf = tt[k]; kH = int(np.searchsorted(tt, tf + HOLD * 1000))
    pn = side * (pp[k + 1:kH + 1] / pin - 1) * 1e4
    e = None
    if len(pn):
        cm = np.maximum.accumulate(pn)
        trg = np.flatnonzero(((cm >= 150) & (pn <= cm - 100)) | (pn <= -R6.CAT))
        if len(trg):
            e = k + 1 + int(trg[0])
    if e is None:
        e = min(kH, len(tt) - 1)
    ke = int(np.searchsorted(tt, tt[e] + LAT_OUT * 1000)); ke = min(ke, len(tt) - 1)
    gross = side * (pp[ke] / pin - 1) * 1e4
    return dict(tr150=round(float(gross - fin - 5.0 - slip), 1), f=int(tf // 60000 - T), fs=round(float(tf % 60000 / 1000), 2),
                ex=round(float((tt[ke] - tf) / 60000), 1))


def per_symbol(job):
    s, evs = job        # evs: [(k, T, side, r15, L{D:px})]
    try:
        wins = [((T + 1) * 60 * 1000, (T + 2 + W + 62) * 60 * 1000) for _, T, _, _, _ in evs]
        days = sorted({utc(m) for a, b in wins for m in (a // 60000, b // 60000)})
        TT, PP = [], []
        for d in days:
            x = agg_file(s, d, wins)
            if x is None:
                return s, {}, f"thiếu aggTrades {d}"
            TT.append(x[0]); PP.append(x[1])
        tt = np.concatenate(TT); pp = np.concatenate(PP); o = np.argsort(tt, kind="stable"); tt, pp = tt[o], pp[o]
        out = {}
        for k, T, side, r15, Ls in evs:
            a, b = (T + 1) * 60 * 1000, (T + 2 + W + 62) * 60 * 1000
            i0, i1 = np.searchsorted(tt, a), np.searchsorted(tt, b, "right"); t_, p_ = tt[i0:i1], pp[i0:i1]
            R = {}
            for nm, thr, slip, lat in SCN:
                rr = {}
                for D, L in Ls.items():
                    v = tsim(t_, p_, side, T, L, thr, slip, lat)
                    if v:
                        rr[D] = v
                if side > 0 and r15 <= -300:
                    v = tsim(t_, p_, side, T, None, thr, slip, lat, market=True)
                    if v:
                        rr["0.0"] = v
                R[nm] = rr
            out[k] = dict(res=R, ntr=int(i1 - i0))
        return s, out, ""
    except Exception as e:  # noqa: BLE001
        return s, {}, f"lỗi {type(e).__name__}: {str(e)[:120]}"


# ---------------------------------------------------------------- danh mục (như vòng 18a, thêm thứ tự khớp thật)
def sim(D, RES, ALLD, kg=1.0, ks=1.0, per_min=99, gmax=99, seed=0):
    rng = np.random.default_rng(seed)
    key = np.array([(min((x[2] * 60 + x[3] for x in legs(RES[k], sd, r15, 1)), default=600) + 1e-3 * rng.random()) if k in RES.real else 600 * rng.random()
                    for k, sd, r15 in zip(D.k, D.side, D.r15)])
    D = D.assign(_r=key).sort_values(["T", "_r"])
    eq = peak = 1.0; dd = 0.0; op = []; day = None; day0 = 1.0; paused = False; hv = {}; dayp = {}; lastT = None; nmin = 0; n = 0; exp = 0.0
    for r in D.itertuples(index=False):
        t = r.T; st = []
        for x in sorted(op):
            tc, p, hf, d_, g = x
            if tc <= t:
                eq *= 1 + p; peak = max(peak, eq); dd = max(dd, 1 - eq / peak); hv[hf] = hv.get(hf, 1) * (1 + p); dayp[d_] = dayp.get(d_, 1) * (1 + p)
            else:
                st.append(x)
        op = st
        if r.vnday != day:
            day = r.vnday; day0 = eq; paused = False
        if not paused and (eq / day0 - 1) * 100 <= -3:
            paused = True
        if t != lastT:
            lastT = t; nmin = 0
        if paused or len(op) >= CAP or nmin >= per_min:
            continue
        if r.grp and sum(1 for x in op if x[4]) >= gmax:
            continue
        L = legs(RES[r.k], r.side, r.r15, kg if r.grp else ks)
        if not L:
            continue
        nmin += 1; n += 1; p = sum(x / 1e4 * s for x, s, _, _ in L); exp += sum(s for _, s, _, _ in L)
        op.append((t + max(f for _, _, f, _ in L) + 61, p, r.half, r.vnday, bool(r.grp)))
    for (tc, p, hf, d_, g) in op:
        eq *= 1 + p; hv[hf] = hv.get(hf, 1) * (1 + p); dayp[d_] = dayp.get(d_, 1) * (1 + p)
    dr = np.array([dayp.get(d, 1) - 1 for d in ALLD])
    sh = dr.mean() / dr.std() * np.sqrt(365) if dr.std() > 0 else 0
    return dict(tot=(eq - 1) * 100, dd=dd * 100, wday=dr.min() * 100, sh=sh, n=n, exp=exp, dayp={d: (v - 1) * 100 for d, v in dayp.items()})


class Res(dict):
    real = set()


def report(B, ALLD, DAYS, TR, P):
    pr = print
    pr(f"# Vòng 18 – khớp lệnh theo từng giao dịch thật ở {len(DAYS)} ngày sập lớn (giờ VN)\n")
    pr("Ngày: " + ", ".join(DAYS) + "\n")
    S = B[B.vnday.isin(DAYS)]
    got = S[S.k.isin(TR.keys())]
    pr(f"{len(S)} cú sốc qua lọc trong các ngày này · {int(S.grp.sum())} 'cả nhóm' · cần dữ liệu giao dịch {sum(1 for k in S.k if P.get(k, {}).get('need'))} · "
       f"đã chạy theo giao dịch {len(got)} (thiếu {sum(1 for k in S.k if P.get(k, {}).get('need') and k not in TR)})\n")
    ok = [k for k in S.k if k in P]
    m = sum(1 for k in ok if all(abs(P[k]["kres"].get(D, {}).get("tr150", 1e9) - B.res[B.k == k].iloc[0].get(D, {}).get("tr150", 1e9)) < 0.6 for D in FAR + ("0.0",)))
    pr(f"Kiểm dựng lại giá từ nến: {m}/{len(ok)} cú sốc ra đúng kết quả mô hình nến của vòng 17.\n")

    pr("## 1. Từng chân lệnh chờ (1,25× và 1,5×) – mô hình nến vs giao dịch thật\n")
    pr("| Cách khớp | Nhóm | Số chân khớp | Lời TB/chân (bps) | Trung vị | Tỷ lệ lời | Chân lỗ ≤ −300 |\n|---|---|---|---|---|---|---|")

    def legrows(nm, getres):
        for g, lab in ((True, "cả nhóm sập"), (False, "sập một mình")):
            v = []
            for r in S[S.grp == g].itertuples():
                res = getres(r)
                if res is None:
                    continue
                v += [res[D]["tr150"] for D in FAR if D in res and res[D]["f"] <= W]
            v = np.array(v)
            if len(v):
                pr(f"| {nm} | {lab} | {len(v)} | {v.mean():+.0f} | {np.median(v):+.0f} | {(v > 0).mean() * 100:.0f}% | {(v <= -300).sum()} |")
    legrows("nến 1 phút (vòng 17)", lambda r: r.res)
    for nm, *_ in SCN:
        legrows(nm, lambda r, nm=nm: TR[r.k]["res"][nm] if r.k in TR else ({} if not P.get(r.k, {}).get("need") and r.k in P else None))
    pr("\n(Chân 'sập một mình' / 'cả nhóm' ở các ngày này; cú sốc không cần dữ liệu giao dịch = giá không chạm L → 0 chân.)\n")

    # chênh lệch từng chân cùng cú sốc
    dv = []
    for r in S.itertuples():
        if r.k not in TR:
            continue
        for D in FAR:
            a = r.res.get(D); b = TR[r.k]["res"][MAIN].get(D)
            if a and b and a["f"] <= W and b["f"] <= W:
                dv.append(b["tr150"] - a["tr150"])
    dv = np.array(dv)
    if len(dv):
        pr(f"Cùng chân, khớp cả hai cách ({len(dv)} chân): giao dịch thật ({MAIN}) − nến = TB {dv.mean():+.0f} bps · trung vị {np.median(dv):+.0f} · 10% tệ nhất ≤ {np.percentile(dv, 10):+.0f}\n")

    pr("## 2. Danh mục cả giai đoạn (thay các ngày trên bằng kết quả theo giao dịch; thứ tự khớp trong phút = thứ tự thật) – trung vị 20 lần (tệ nhất)\n")
    VARS = [("HIỆN TẠI", dict()), ("×1,5 khi cả nhóm sập", dict(kg=1.5)), ("×1,5 · có chặn (≤3 lệnh/phút, ≤5 cả nhóm)", dict(kg=1.5, per_min=3, gmax=5)),
            ("×2 khi cả nhóm sập", dict(kg=2.0))]
    srcs = [("nến 1 phút", None)] + [(nm, nm) for nm, *_ in SCN if nm != "xuyên L · trượt 20 · đặt trễ 10 giây"]
    pr("| Dữ liệu các ngày sập | Cách | Lợi nhuận | Sụt tối đa | Ngày tệ | Sharpe | Lời/lỗ cộng của các ngày sập (điểm %) |\n|---|---|---|---|---|---|---|")
    base = {}
    for sn, sc in srcs:
        RES = Res({r.k: r.res for r in B.itertuples()})
        Res.real = set()
        if sc:
            for k, v in TR.items():
                RES[k] = v["res"][sc]
            Res.real = set(TR.keys())
            for k in S.k:
                if k in P and not P[k]["need"]:
                    RES[k] = {}
        for vn, kw in VARS:
            X = [sim(B, RES, ALLD, seed=s, **kw) for s in range(20)]
            a = lambda q: np.array([x[q] for x in X])  # noqa: E731
            dsum = np.median([sum(x["dayp"].get(d, 0) for d in DAYS) for x in X])
            base[(sn, vn)] = np.median(a("tot"))
            pr(f"| {sn} | {vn} | {np.median(a('tot')):+.0f}% ({a('tot').min():+.0f}%) | {np.median(a('dd')):.1f}% ({a('dd').max():.1f}%) | "
               f"{np.median(a('wday')):.1f}% ({a('wday').min():.1f}%) | {np.median(a('sh')):.2f} | {dsum:+.1f} |")
    pr("\n## 3. Phần lợi thêm của ×1,5 / ×2 so với HIỆN TẠI\n")
    pr("| Dữ liệu các ngày sập | ×1,5 | ×1,5 có chặn | ×2 |\n|---|---|---|---|")
    for sn, _ in srcs:
        b0 = base[(sn, "HIỆN TẠI")]
        pr(f"| {sn} | {base[(sn, '×1,5 khi cả nhóm sập')] - b0:+.0f} | {base[(sn, '×1,5 · có chặn (≤3 lệnh/phút, ≤5 cả nhóm)')] - b0:+.0f} | {base[(sn, '×2 khi cả nhóm sập')] - b0:+.0f} |")

    pr(f"\n## 4. Từng ngày sập – lời/lỗ cả ngày của danh mục HIỆN TẠI (seed 0)\n")
    pr("| Ngày | Lệnh cả nhóm | Nến 1 phút | " + " | ".join(nm for nm, *_ in SCN[:4]) + " |\n|---|---|---|" + "---|" * 4)
    per = {}
    for sn, sc in [("nến", None)] + [(nm, nm) for nm, *_ in SCN[:4]]:
        RES = Res({r.k: r.res for r in B.itertuples()}); Res.real = set()
        if sc:
            for k, v in TR.items():
                RES[k] = v["res"][sc]
            Res.real = set(TR.keys())
            for k in S.k:
                if k in P and not P[k]["need"]:
                    RES[k] = {}
        per[sn] = sim(B, RES, ALLD, seed=0)["dayp"]
    for d in DAYS:
        pr(f"| {d} | {int(S[S.vnday == d].grp.sum())} | {per['nến'].get(d, 0):+.2f}% | " + " | ".join(f"{per[nm].get(d, 0):+.2f}%" for nm, *_ in SCN[:4]) + " |")


if __name__ == "__main__":
    t00 = time.time()
    B, ALLD = load_events()
    B["k"] = np.arange(len(B))
    G = B[B.grp].copy(); G["pnl"] = [sum(x * s for x, s, _, _ in legs(r.res, r.side, r.r15, 1)) / 1e4 for r in G.itertuples(index=False)]
    top = G.groupby("vnday").pnl.sum().sort_values(ascending=False)
    DAYS = list(top.index[:10]); DAYS += [d for d in ("2025-10-10", "2025-10-11") if d not in DAYS]
    S = B[B.vnday.isin(DAYS)]
    E.log(f"{len(B)} cú sốc qua lọc · {len(S)} trong {len(DAYS)} ngày: {DAYS}")
    recs = S.to_dict("records")
    with cf.ThreadPoolExecutor(32) as ex:
        P = {p["k"]: p for p in ex.map(prep, recs) if p}
    E.log(f"dựng lại từ nến: {len(P)}/{len(S)} · cần aggTrades {sum(1 for p in P.values() if p['need'])} · {time.time() - t00:.0f}s")
    jobs = {}
    for r in recs:
        p = P.get(r["k"])
        if p and p["need"]:
            jobs.setdefault(r["s"], []).append((r["k"], int(r["T"]), int(r["side"]), r["r15"], p["L"]))
    TR = {}; miss = []
    with cf.ProcessPoolExecutor(int(os.environ.get("R18_PROC", "6"))) as ex:
        for j, (s, out, err) in enumerate(ex.map(per_symbol, sorted(jobs.items(), key=lambda x: -len(x[1])))):
            TR.update(out)
            if err:
                miss.append(f"{s}: {err}")
            if j % 25 == 0:
                E.log(f"  … {j}/{len(jobs)} mã · {len(TR)} cú sốc · {time.time() - t00:.0f}s")
    E.log(f"aggTrades xong: {len(TR)} cú sốc · thiếu {len(miss)} mã · {time.time() - t00:.0f}s")
    for x in miss[:30]:
        E.log("   ", x)
    with gzip.open(os.path.join(E.OUT, "round18.json.gz"), "wt") as f:
        json.dump(dict(days=DAYS, prep={str(k): v for k, v in P.items()}, tr={str(k): v for k, v in TR.items()}, miss=miss), f, default=float)
    import contextlib
    with open(os.path.join(E.OUT, "r18_result.md"), "w") as f, contextlib.redirect_stdout(f):
        report(B, ALLD, DAYS, TR, P)
    E.log(f"xong · {time.time() - t00:.0f}s")
