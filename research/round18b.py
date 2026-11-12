"""Vòng 18b – vì sao khớp theo giao dịch thật lời ít hơn mô hình nến ~270 bps/chân ở ngày sập (vòng 18)?
Vòng 18: 95% lệnh bị cắt lỗ đuổi (lời ≥ 150 trả lại 100) trong vòng 5 phút, trung vị 6 giây sau khi khớp → nến 1 phút không thấy
nhịp giật trong phút nên mô hình nến "giữ" được tới cú hồi lớn. Kiểm:
  · giá dùng để đuổi: giá khớp từng giao dịch (vòng 18) / GIÁ GIỮA mua–bán (như bot thật: (bid+ask)/2, dựng từ giao dịch chủ động mua & bán gần nhất)
    / chỉ xét lúc NẾN PHÚT ĐÓNG
  · ngưỡng đuổi 150/100 · 300/150 · 500/200 · không đuổi (giữ 60 phút)
  · mỗi luật so cùng luật trên mô hình nến → mô hình nến lệch ở đâu
  · 2 nhóm ngày: 12 ngày sập lớn (vòng 18) + 40 ngày thường ngẫu nhiên (đối chứng – lệch có phải chỉ ở ngày sập?)
Khớp vào: giao dịch đi xuyên L (như vòng 18) · thoát: kích hoạt → lệnh thị trường sau 1 giây ở giá giao dịch kế tiếp − trượt 20 bps − phí 5.
Chạy: python research/round18b.py"""
import concurrent.futures as cf
import contextlib
import gzip
import io
import json
import os
import sys
import time
import zipfile

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("RS_LOG", "round18b.log")
import round18 as M  # noqa: E402

E, R6 = M.E, M.R6
SLIP = 20.0
RULES = [("đuổi 150/100", 150, 100), ("đuổi 300/150", 300, 150), ("đuổi 500/200", 500, 200), ("giữ 60 phút, không đuổi", 0, 0)]
SER = [("giá khớp", "raw"), ("giá giữa (như bot)", "mid"), ("nến phút đóng", "m1")]


def parse_agg(path, wins):
    z = zipfile.ZipFile(path); nm = z.namelist()[0]
    with z.open(nm) as f:
        head = f.read(64)
    hdr = 0 if head[:1].isalpha() else None
    tt, pp, bb = [], [], []
    lo = min(a for a, _ in wins); hi = max(b for _, b in wins)
    with z.open(nm) as f:
        for ch in pd.read_csv(io.TextIOWrapper(f), header=hdr, usecols=[1, 5, 6], chunksize=4_000_000):
            p = ch.iloc[:, 0].values.astype(np.float64); t = ch.iloc[:, 1].values.astype(np.int64)
            b = ch.iloc[:, 2].astype(str).str.lower().str.startswith("t").values
            if t[0] > 1e14:
                t = t // 1000
            if t[-1] < lo:
                continue
            if t[0] > hi:
                break
            m = np.zeros(len(t), bool)
            for a, c in wins:
                m |= (t >= a) & (t <= c)
            if m.any():
                tt.append(t[m]); pp.append(p[m]); bb.append(b[m])
    if not tt:
        return np.array([], np.int64), np.array([], np.float64)
    # mã hoá cờ "người mua là bên chờ" (giao dịch ở giá BID) vào dấu của giá
    return np.concatenate(tt), np.concatenate(pp) * np.where(np.concatenate(bb), -1.0, 1.0)


M.parse_agg = parse_agg


def series(tt, sp, kind):
    p = np.abs(sp)
    if kind == "raw":
        return tt, p
    if kind == "mid":
        bid = pd.Series(np.where(sp < 0, p, np.nan)).ffill().values; ask = pd.Series(np.where(sp > 0, p, np.nan)).ffill().values
        mid = np.where(np.isfinite(bid) & np.isfinite(ask), (bid + ask) / 2, p)
        return tt, mid
    mn = tt // 60000; last = np.r_[mn[1:] != mn[:-1], True]       # giá cuối mỗi phút, "biết" lúc phút kết thúc
    return (mn[last] + 1) * 60000 - 1, p[last]


def leg(tt, sp, side, T, L, rule, kind, market=False):
    p = np.abs(sp); tp = ((T + 1) * 60 + M.LAT_IN) * 1000; k0 = int(np.searchsorted(tt, tp))
    if k0 >= len(tt):
        return None
    if market:
        k = k0; pin = p[k0]; fin = 5.0 + SLIP
    else:
        kend = int(np.searchsorted(tt, (T + 1 + M.W) * 60 * 1000))
        if kend <= k0:
            return None
        x = side * (p[k0:kend] / L - 1) * 1e4; hit = np.flatnonzero(x < -1e-9)
        if not len(hit):
            return None
        k = k0 + int(hit[0])
        pin, fin = (p[k0], 5.0) if k == k0 else (L, R6.IN_M)
    tf = tt[k]; tend = tf + M.HOLD * 1000
    # cắt lỗ thảm hoạ trên giá khớp
    kH = int(np.searchsorted(tt, tend)); pr = side * (p[k + 1:kH + 1] / pin - 1) * 1e4
    cat = np.flatnonzero(pr <= -R6.CAT); te = tt[k + 1 + int(cat[0])] if len(cat) else None
    _, tra, trg = rule
    if tra > 0 and not market:     # bot thật không đuổi lệnh "mua ngay"
        st, sx = series(tt, sp, kind)
        a, b = int(np.searchsorted(st, tf, "right")), int(np.searchsorted(st, tend))
        pn = side * (sx[a:b] / pin - 1) * 1e4
        if len(pn):
            cm = np.maximum.accumulate(pn); trgi = np.flatnonzero((cm >= tra) & (pn <= cm - trg))
            if len(trgi):
                t2 = st[a + int(trgi[0])]; te = t2 if te is None else min(te, t2)
    if te is None:
        te = tend
    ke = min(int(np.searchsorted(tt, te + M.LAT_OUT * 1000)), len(tt) - 1)
    return dict(v=round(float(side * (p[ke] / pin - 1) * 1e4 - fin - 5.0 - SLIP), 1), ex=round(float((tt[ke] - tf) / 60000), 2))


def per_symbol(job):
    s, evs = job
    try:
        wins = [((T + 1) * 60 * 1000, (T + 2 + M.W + 62) * 60 * 1000) for _, T, _, _, _ in evs]
        days = sorted({M.utc(m) for a, b in wins for m in (a // 60000, b // 60000)})
        TT, PP = [], []
        for d in days:
            x = M.agg_file(s, d, wins)
            if x is None:
                return s, {}, f"thiếu aggTrades {d}"
            TT.append(x[0]); PP.append(x[1])
        tt = np.concatenate(TT); pp = np.concatenate(PP); o = np.argsort(tt, kind="stable"); tt, pp = tt[o], pp[o]
        out = {}
        for k, T, side, r15, Ls in evs:
            a, b = (T + 1) * 60 * 1000, (T + 2 + M.W + 62) * 60 * 1000
            i0, i1 = np.searchsorted(tt, a), np.searchsorted(tt, b, "right"); t_, p_ = tt[i0:i1], pp[i0:i1]
            R = {}
            for rn, *_ in RULES:
                for sn, kind in SER:
                    if rn.startswith("giữ") and kind != "raw":
                        continue
                    rr = {D: v for D, L in Ls.items() if (v := leg(t_, p_, side, T, L, next(x for x in RULES if x[0] == rn), kind))}
                    if side > 0 and r15 <= -300 and (v := leg(t_, p_, side, T, None, next(x for x in RULES if x[0] == rn), kind, market=True)):
                        rr["0.0"] = v
                    R[f"{rn} · {sn}"] = rr
            out[k] = R
        return s, out, ""
    except Exception as e:  # noqa: BLE001
        return s, {}, f"lỗi {type(e).__name__}: {str(e)[:120]}"


def kprep(ev):
    """kết quả mô hình nến cho từng luật (để so cùng luật)"""
    p = M.prep(ev)
    if not p:
        return None
    d = M.kwin(ev["s"], int(ev["T"])); side = int(ev["side"])
    cf_ = d.c.ffill(); o = d.o.fillna(cf_).values; h = d.h.fillna(cf_).values; l = d.l.fillna(cf_).values; c = cf_.values
    i = int(ev["T"] - d.index[0]); kr = {}
    for D, L in p["L"].items():
        if D not in p["kres"]:
            continue
        j = i + p["kres"][D]["f"]
        seg_h, seg_l = h[j + 1:j + 1 + M.HMAX], l[j + 1:j + 1 + M.HMAX]
        pn = lambda px: side * (px / L - 1) * 1e4  # noqa: E731
        fav = pn(seg_h) if side > 0 else pn(seg_l); adv = pn(seg_l) if side > 0 else pn(seg_h); o_all = pn(o[j + 1:j + 2 + M.HMAX])
        kr[D] = {}
        for rn, tra, trg in RULES:
            kind, prm = ("T", 60) if tra == 0 else ("R", (tra, trg))
            kr[D][rn] = round(float(R6.sim(kind, prm, fav, adv, None, o_all, L, side, c[i])[0]), 1)
    p["kr"] = kr
    return p


if __name__ == "__main__":
    t00 = time.time()
    B, ALLD = M.load_events(); B["k"] = np.arange(len(B))
    G = B[B.grp].copy(); G["pnl"] = [sum(x * s for x, s, _, _ in M.legs(r.res, r.side, r.r15, 1)) / 1e4 for r in G.itertuples(index=False)]
    top = G.groupby("vnday").pnl.sum().sort_values(ascending=False)
    CRASH = list(top.index[:10]) + ["2025-10-10", "2025-10-11"]
    rng = np.random.default_rng(18)
    pool = sorted(set(B.vnday) - set(CRASH)); CTRL = sorted(rng.choice(pool, 40, replace=False).tolist())
    S = B[B.vnday.isin(CRASH + CTRL)]
    E.log(f"{len(S)} cú sốc · {len(CRASH)} ngày sập + {len(CTRL)} ngày thường")
    recs = S.to_dict("records")
    with cf.ThreadPoolExecutor(32) as ex:
        P = {p["k"]: p for p in ex.map(kprep, recs) if p}
    jobs = {}
    for r in recs:
        p = P.get(r["k"])
        if p and p["need"]:
            jobs.setdefault(r["s"], []).append((r["k"], int(r["T"]), int(r["side"]), r["r15"], p["L"]))
    E.log(f"cần aggTrades {sum(len(v) for v in jobs.values())} cú sốc / {len(jobs)} mã · {time.time() - t00:.0f}s")
    TR = {}; miss = []
    with cf.ProcessPoolExecutor(6) as ex:
        for j, (s, out, err) in enumerate(ex.map(per_symbol, sorted(jobs.items(), key=lambda x: -len(x[1])))):
            TR.update(out); miss += [f"{s}: {err}"] if err else []
            if j % 50 == 0:
                E.log(f"  … {j}/{len(jobs)} mã · {time.time() - t00:.0f}s")
    E.log(f"xong aggTrades {len(TR)} · thiếu {len(miss)} · {time.time() - t00:.0f}s")
    with gzip.open(os.path.join(E.OUT, "round18b.json.gz"), "wt") as f:
        json.dump(dict(crash=CRASH, ctrl=CTRL, kr={str(k): v.get("kr") for k, v in P.items()}, tr={str(k): v for k, v in TR.items()}, miss=miss), f, default=float)
    with open(os.path.join(E.OUT, "r18b_result.md"), "w") as f, contextlib.redirect_stdout(f):
        print(f"# Vòng 18b – luật thoát trên giá thật vs mô hình nến\n\n{len(CRASH)} ngày sập lớn + {len(CTRL)} ngày thường ngẫu nhiên · "
              f"{len(TR)} cú sốc chạy theo giao dịch (thiếu {len(miss)} mã) · thoát trượt {SLIP:.0f} bps + phí 5\n")
        print("Chỉ tính chân lệnh chờ 1,25× / 1,5× khớp ở CẢ mô hình nến và giao dịch thật. bps ròng / chân.\n")
        keys = [f"{rn} · {sn}" for rn, *_ in RULES for sn, kind in SER if not (rn.startswith("giữ") and kind != "raw")]
        for setn, days in (("12 NGÀY SẬP LỚN", CRASH), ("40 NGÀY THƯỜNG", CTRL)):
            sub = S[S.vnday.isin(days)]
            print(f"## {setn}\n")
            print("| Luật thoát · giá dùng để đuổi | Nhóm | Số chân | Nến 1 phút (TB) | Giao dịch thật (TB) | Trung vị thật | Lời | Thoát sau (trung vị phút) |\n|---|---|---|---|---|---|---|---|")
            for key in keys:
                rn = key.split(" · ")[0]
                for g, lab in ((None, "tất cả"), (True, "cả nhóm"), (False, "một mình")):
                    kv, tv, ex = [], [], []
                    for r in (sub if g is None else sub[sub.grp == g]).itertuples():
                        if r.k not in TR or not P.get(r.k, {}).get("kr"):
                            continue
                        for D in M.FAR:
                            a = P[r.k]["kr"].get(D, {}).get(rn); b = TR[r.k][key].get(D)
                            if a is not None and b and P[r.k]["kres"][D]["f"] <= M.W:
                                kv.append(a); tv.append(b["v"]); ex.append(b["ex"])
                    if kv:
                        kv, tv = np.array(kv), np.array(tv)
                        print(f"| {key} | {lab} | {len(tv)} | {kv.mean():+.0f} | {tv.mean():+.0f} | {np.median(tv):+.0f} | {(tv > 0).mean() * 100:.0f}% | {np.median(ex):.1f} |")
            print()
        print("Chi phí: mô hình nến trừ 2 + 28 bps (đuổi/cắt) hoặc 2 + 18 (hết giờ) · giao dịch thật trừ 2 (5 nếu khớp ngay) + 5 + 20 trượt, giá thoát là giao dịch thật 1 giây sau.\n")
        print("Thiếu dữ liệu: " + "; ".join(miss[:20]))
