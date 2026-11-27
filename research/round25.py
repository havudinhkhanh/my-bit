"""Vòng 25 – Jason (27/11/2026): "kiểm chứng cắt lỗ đuổi so với giữ hết giờ trên dữ liệu dài hơn".
Bối cảnh: từ 07/11 sàn thử Bắt râu sập vô tình chỉ đóng "hết giờ" (lỗi chế độ chỉ nhận giá khớp), tiền thật vẫn cắt lỗ đuổi 150/100 theo giá cuối phút.
So 23 lệnh khớp cả hai: tiền thật +246 bps/lệnh, sàn thử giữ hết giờ +407 bps/lệnh. Vòng 19/23 (01/2025 → 24/11/2026): giữ 60 phút lời hơn từng chân
(+115 so với +98 bps) nhưng danh mục sụt 30% và có ngày −22% (đuổi lời: sụt 16%, ngày tệ −4%) → đã giữ cắt lỗ đuổi.
Vòng này: thêm TOÀN BỘ 2024 (cú sốc dựng lại từ nến 1 phút như vòng 22) + các ngày 25–26/11/2026, chạy lại mọi chân theo TỪNG GIAO DỊCH THẬT (aggTrades),
giá xét = giá cuối mỗi phút (đúng chế độ bot đang chạy, hk_trm = 1). Luật thoát:
  giữ 60 phút                       – không đuổi lời, chỉ cắt lỗ thảm hoạ −3.500 bps
  đuổi 150/100 (đang chạy)          – lời ≥ 150 bps → đóng khi trả lại 100 từ đỉnh
  đuổi 300/150 · đuổi 500/200       – đuổi rộng hơn
  đuổi 150/100 từ phút 30           – nửa giờ đầu giữ nguyên (nhịp giật sau cú sốc), từ phút 30 mới cho đuổi lời đóng (đỉnh tính từ lúc khớp)
  hoà vốn sau +300                  – đã lời ≥ 300 bps mà lùi về ≤ +30 thì đóng; còn lại giữ hết giờ
  giữ 60 + cắt lỗ 1.000 / 2.000     – giữ hết giờ nhưng cắt khi lỗ ≥ 10% / 20% (giá cuối phút)
Chân "mua ngay" (tháo chạy) không đuổi lời (như bot) – vẫn áp dụng cắt lỗ cứng. Thoát: lệnh thị trường 1 giây sau, phí 5 bps, trượt thêm 0 / 10 / 20.
Danh mục như bot (7,5%/cú, tối đa 9 lệnh, dừng ngày −3%). Báo cáo: từng chân, chênh lệch CẶP so với luật đang chạy (tin cậy theo ngày), danh mục,
chọn trên 2024–2025 → kiểm 2026, những ngày tệ nhất, tháng 11/2026 & 3 tuần gần nhất.
Chạy: python research/round25.py  (env tuỳ chọn R25_FROM=2024-01) · kết quả research_out/r25_result.md + round25.json.gz"""
import concurrent.futures as cf
import contextlib
import gc
import gzip
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
os.environ.setdefault("RS_LOG", "round25.log")
os.environ.setdefault("RS_START", os.environ.get("R25_FROM", "2024-01"))
os.environ.setdefault("RS_NOCACHE", "1")          # năm 2024 không ghi bộ đệm (đỡ đầy đĩa máy chạy) – đọc lại bộ đệm cũ nếu có
OUT = "research_out"
os.makedirs(OUT, exist_ok=True)
EVF = os.path.join(OUT, "round25_ev.json.gz")
os.environ["R18_SRC"] = EVF

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import events as E  # noqa: E402
import round6 as R6  # noqa: E402
import round22 as R22  # noqa: E402
import round19 as R  # noqa: E402

M = R.M
log = E.log
DAYS0 = list(R6.DAYS)          # các ngày của tháng đang chạy (detect() ghi đè R6.DAYS)
OLD = os.path.join(HERE, "data", "round22.json.gz")     # cú sốc 01/2025 → 24/11/2026 (vòng 22, cùng bộ lọc)
SLIPS = (0, 10, 20)
CUR = "đuổi 150/100 (đang chạy)"
HOLD = "giữ 60 phút"
RULES = [HOLD, CUR, "đuổi 300/150", "đuổi 500/200", "đuổi 150/100 từ phút 30", "hoà vốn sau +300", "giữ 60 + cắt lỗ 1.000", "giữ 60 + cắt lỗ 2.000"]
HALVES = ("2024H1", "2024H2", "2025H1", "2025H2", "2026H1", "2026H2")


# ---------------------------------------------------------------- 1) cú sốc: 2024 + các ngày sau vòng 22
def detect(months, days):
    R6.MONTHS, R6.DAYS = months, days
    R22.new_methods = lambda *a, **k: []          # chỉ cần phần A (cú sốc Bắt râu sập)
    syms = E.list_symbols(); ev = []; t0 = time.time()
    log(f"dựng cú sốc: {len(syms)} mã · {months[:1]}…{months[-1:]} + {len(days)} ngày")
    with cf.ThreadPoolExecutor(32) as ex:
        for k, (a, _) in enumerate(ex.map(R22.process_both, syms)):
            ev += a
            if k % 100 == 0:
                log(f"  … {k}/{len(syms)} mã · {len(ev)} cú sốc · {time.time() - t0:.0f}s")
    return ev


def build_events():
    old = json.load(gzip.open(OLD, "rt")); tmax = max(e["T"] for e in old)
    yr = [m for m in R6.months_from(os.environ["RS_START"]) if m < "2025-01"]
    new = detect(yr, []) if yr else []
    tail = detect([], DAYS0)        # tháng đang chạy (theo ngày) – lấy phần sau vòng 22
    seen = {(e["s"], e["T"]) for e in old}
    add = [e for e in tail if e["T"] > tmax and (e["s"], e["T"]) not in seen]
    ev = new + old + add
    log(f"cú sốc: 2024 {len(new)} · vòng 22 {len(old)} · mới sau {time.strftime('%d/%m %H:%M', time.gmtime(tmax * 60))} UTC {len(add)} → {len(ev)}")
    with gzip.open(EVF, "wt") as f:
        json.dump(ev, f, default=float)
    return len(new), len(old), len(add)


# ---------------------------------------------------------------- 2) từng chân theo giao dịch thật (giá cuối mỗi phút như bot)
def legrun(tt, sp, side, T, L, market=False):
    p = np.abs(sp); tp = ((T + 1) * 60 + M.LAT_IN) * 1000; k0 = int(np.searchsorted(tt, tp))
    if k0 >= len(tt):
        return None
    if market:
        k = k0; pin = p[k0]; fin = 5.0
    else:
        kend = int(np.searchsorted(tt, (T + 1 + M.W) * 60 * 1000))
        if kend <= k0:
            return None
        x = side * (p[k0:kend] / L - 1) * 1e4; hit = np.flatnonzero(x < -1e-9)
        if not len(hit):
            return None
        k = k0 + int(hit[0])
        pin, fin = (p[k0], 5.0) if k == k0 else (L, R.R6.IN_M)
    tf = int(tt[k]); tend = tf + int(M.HOLD * 1000)
    kH = int(np.searchsorted(tt, tend)); pr = side * (p[k + 1:kH + 1] / pin - 1) * 1e4
    cat = np.flatnonzero(pr <= -R.R6.CAT); tcat = int(tt[k + 1 + int(cat[0])]) if len(cat) else None
    st, sx = R.mk_series(tt, sp, tf)["m1"]
    a, b = int(np.searchsorted(st, tf, "right")), int(np.searchsorted(st, tend))
    ts_, pn = st[a:b], side * (sx[a:b] / pin - 1) * 1e4
    cm = np.maximum.accumulate(pn) if len(pn) else pn

    def ex_at(te):
        ke = min(int(np.searchsorted(tt, te + M.LAT_OUT * 1000)), len(tt) - 1)
        return round(float(side * (p[ke] / pin - 1) * 1e4 - fin - 5.0), 1), round(float((tt[ke] - tf) / 60000), 3)

    def when(mask):
        h = np.flatnonzero(mask) if len(pn) else []
        return int(ts_[int(h[0])]) if len(h) else None

    def end(t2):
        c = [x for x in (tcat, t2) if x is not None]
        return ex_at(min(c) if c else tend)

    tr = (lambda m: None) if market else when     # chân mua ngay: bot không đuổi lời
    out = {HOLD: end(None),
           CUR: end(tr((cm >= 150) & (pn <= cm - 100))),
           "đuổi 300/150": end(tr((cm >= 300) & (pn <= cm - 150))),
           "đuổi 500/200": end(tr((cm >= 500) & (pn <= cm - 200))),
           "đuổi 150/100 từ phút 30": end(tr((cm >= 150) & (pn <= cm - 100) & (ts_ >= tf + 1800000))),
           "hoà vốn sau +300": end(tr((cm >= 300) & (pn <= 30))),
           "giữ 60 + cắt lỗ 1.000": end(when(pn <= -1000)),
           "giữ 60 + cắt lỗ 2.000": end(when(pn <= -2000))}
    return dict(r=out, f=int(tf // 60000 - T), fs=round(float(tf % 60000 / 1000), 2), mk=market)


def per_symbol(job):
    s, evs = job
    try:
        wins = [((T + 1) * 60 * 1000, (T + 2 + M.W + 62) * 60 * 1000) for _, T, _, _, _ in evs]
        days = sorted({M.utc(m) for a, b in wins for m in (a // 60000, b // 60000)})
        TT, PP = [], []
        for d in days:
            x = M.agg_file(s, d, [w for w in wins if M.utc(w[0] // 60000) == d or M.utc(w[1] // 60000) == d])
            if x is None:
                return s, {}, f"thiếu aggTrades {d}"
            TT.append(x[0]); PP.append(x[1])
        tt = np.concatenate(TT); pp = np.concatenate(PP); o = np.argsort(tt, kind="stable"); tt, pp = tt[o], pp[o]
        out = {}
        for k, T, side, r15, Ls in evs:
            a, b = (T + 1) * 60 * 1000, (T + 2 + M.W + 62) * 60 * 1000
            i0, i1 = np.searchsorted(tt, a), np.searchsorted(tt, b, "right"); t_, p_ = tt[i0:i1], pp[i0:i1]
            Rr = {}
            for D, L in Ls.items():
                v = legrun(t_, p_, side, T, L)
                if v:
                    Rr[D] = v
            if side > 0 and r15 <= -300:
                v = legrun(t_, p_, side, T, None, market=True)
                if v:
                    Rr["0.0"] = v
            out[k] = Rr
        return s, out, ""
    except Exception as e:  # noqa: BLE001
        return s, {}, f"lỗi {type(e).__name__}: {str(e)[:120]}"


# ---------------------------------------------------------------- 3) báo cáo
def boot(vals, days, n=2000, seed=0):
    return R.boot_day(np.asarray(vals, float), np.asarray(days), n, seed)


def yearly(x):
    hv = {}
    for d, v in x["dayp"].items():
        hv[d[:4]] = hv.get(d[:4], 1) * (1 + v / 100)
    return {y: (v - 1) * 100 for y, v in hv.items()}


def halfret(x):
    hv = {}
    for d, v in x["dayp"].items():
        h = f"{d[:4]}{'H1' if int(d[5:7]) <= 6 else 'H2'}"; hv[h] = hv.get(h, 1) * (1 + v / 100)
    return [(hv.get(h, 1) - 1) * 100 for h in HALVES]


def report(B, ALLD, TR, miss, nev, t_run):
    pr = print
    pr(f"# Vòng 25 – cắt lỗ đuổi so với giữ hết giờ · {B.ts.min():%d/%m/%Y} → {B.ts.max():%d/%m/%Y} · theo từng giao dịch thật\n")
    pr(f"Cú sốc: 2024 dựng mới {nev[0]} · vòng 22 (01/2025 → 24/11/2026) {nev[1]} · sau 24/11 {nev[2]} → qua bộ lọc bot {len(B)} · chạy được {len(TR)} cú sốc"
       f" · thiếu dữ liệu {len(miss)} mã · {t_run / 60:.0f} phút\n")
    pr("Giá xét đuổi lời / cắt lỗ = giá cuối mỗi phút (bot đang chạy hk_trm = 1). Thoát: lệnh thị trường 1 giây sau, phí 5 bps + trượt thêm. Mỗi chân tính riêng.\n")
    BK = B.set_index("k"); rows = []
    for k, Rr in TR.items():
        r = BK.loc[k]
        for D, v in Rr.items():
            if D == "0.0" or v["f"] > M.W:
                continue
            rows.append(dict(k=k, d=r.vnday, h=r.half, **{ru: v["r"][ru][0] - 10 for ru in RULES}, **{ru + "_m": v["r"][ru][1] for ru in RULES}))
    L = pd.DataFrame(rows); L["dt"] = pd.to_datetime(L.d); last = L.dt.max()
    rec = L.dt > last - pd.Timedelta(days=21); nov = L.d.str.startswith("2026-11")
    pr(f"## 1. Từng chân lệnh chờ – bps ròng / chân, trượt thêm 10 ({len(L)} chân, {L.d.nunique()} ngày)\n")
    pr("| Luật thoát | TB | Tin cậy 95% (theo ngày) | Trung vị | Lời | Giữ TB (phút) | " + " | ".join(HALVES) + " | 11/2026 | 3 tuần |\n|---|---|---|---|---|---|" + "---|" * (len(HALVES) + 2))
    for ru in RULES:
        x = L[ru].values; lo, hi = boot(x, L.d.values)
        pr(f"| {ru} | {x.mean():+.0f} | {lo:+.0f} … {hi:+.0f} | {np.median(x):+.0f} | {(x > 0).mean() * 100:.0f}% | {L[ru + '_m'].mean():.0f} | "
           + " | ".join(f"{L[L.h == h][ru].mean():+.0f}" for h in HALVES) + f" | {L[nov][ru].mean():+.0f} | {L[rec][ru].mean():+.0f} |")
    pr(f"\nSố chân: " + " · ".join(f"{h}: {(L.h == h).sum()}" for h in HALVES) + f" · 11/2026: {nov.sum()} · 3 tuần: {rec.sum()}\n")
    pr(f"## 2. Chênh lệch CẶP so với luật đang chạy ({CUR}) – cùng chân, bps / chân\n")
    pr("| Luật thoát | Chênh TB | Tin cậy 95% | Hơn ở bao nhiêu chân | Nửa năm hơn | " + " | ".join(HALVES) + " | 11/2026 |\n|---|---|---|---|---|" + "---|" * (len(HALVES) + 1))
    for ru in RULES:
        if ru == CUR:
            continue
        d = L[ru] - L[CUR]; lo, hi = boot(d.values, L.d.values); hv = [d[L.h == h].mean() for h in HALVES]
        pr(f"| {ru} | {d.mean():+.0f} | {lo:+.0f} … {hi:+.0f} | {(d > 0).mean() * 100:.0f}% (kém {(d < 0).mean() * 100:.0f}%) | {sum(v > 0 for v in hv if np.isfinite(v))}/{sum(np.isfinite(v) for v in hv)} | "
           + " | ".join(f"{v:+.0f}" for v in hv) + f" | {d[nov].mean():+.0f} |")
    pr("\n## 3. Danh mục (7,5%/cú · tối đa 9 lệnh · dừng ngày −3%) – thứ tự khớp thật\n")
    pr("| Luật thoát | Trượt | Lợi nhuận | Sụt tối đa | Ngày tệ | Sharpe | Lợi nhuận / sụt | " + " | ".join(HALVES) + " |\n|---|---|---|---|---|---|---|" + "---|" * len(HALVES))
    PF = {}
    for ru in RULES:
        for sl in SLIPS:
            RES = M.Res({r.k: {} for r in B.itertuples()}); RES.update(R.res_for(TR, ru, sl)); M.Res.real = set(TR.keys())
            x = M.sim(B, RES, ALLD); hh = halfret(x); PF[(ru, sl)] = x
            yrs = max(1e-9, len(ALLD) / 365); ann = ((1 + x["tot"] / 100) ** (1 / yrs) - 1) * 100
            pr(f"| {ru} | {sl} | {x['tot']:+.0f}% | {x['dd']:.1f}% | {x['wday']:.1f}% | {x['sh']:.2f} | {ann / max(x['dd'], 1e-9):.2f} | " + " | ".join(f"{v:+.0f}%" for v in hh) + " |")
    pr("\n## 4. Chọn trên 2024–2025 → kiểm trên 2026 (danh mục, trượt 10)\n")
    sc = {}
    for ru in RULES:
        y = yearly(PF[(ru, 10)]); sc[ru] = ((1 + y.get("2024", 0) / 100) * (1 + y.get("2025", 0) / 100) - 1) * 100
    best = max(sc, key=sc.get)
    pr("| Luật | 2024–2025 | Sụt 2024–2025 (cả kỳ) | 2026 | Thứ hạng 2024–25 | Thứ hạng 2026 |\n|---|---|---|---|---|---|")
    r26 = {ru: yearly(PF[(ru, 10)]).get("2026", 0) for ru in RULES}
    o1 = sorted(RULES, key=lambda r: -sc[r]); o2 = sorted(RULES, key=lambda r: -r26[r])
    for ru in o1:
        pr(f"| {'**' + ru + '**' if ru == best else ru} | {sc[ru]:+.0f}% | {PF[(ru, 10)]['dd']:.1f}% | {r26[ru]:+.0f}% | {o1.index(ru) + 1} | {o2.index(ru) + 1} |")
    pr(f"\nTốt nhất trên 2024–2025: **{best}** → 2026 {r26[best]:+.0f}% (luật đang chạy: 2026 {r26[CUR]:+.0f}%).\n")
    pr("## 5. Những ngày tệ nhất (danh mục, trượt 10) – % tài sản trong ngày\n")
    dp = {ru: PF[(ru, 10)]["dayp"] for ru in RULES}
    worst = sorted(set(sorted(dp[HOLD], key=lambda d: dp[HOLD][d])[:6]) | set(sorted(dp[CUR], key=lambda d: dp[CUR][d])[:4]))
    pr("| Ngày (giờ VN) | " + " | ".join(RULES) + " |\n|---|" + "---|" * len(RULES))
    for d in sorted(worst, key=lambda d: dp[HOLD].get(d, 0)):
        pr(f"| {d} | " + " | ".join(f"{dp[ru].get(d, 0):+.1f}%" for ru in RULES) + " |")
    pr("\n## 6. Tháng gần đây – bps ròng / chân (trượt 10)\n")
    L["mo"] = L.dt.dt.to_period("M").astype(str); mos = [m for m in sorted(L.mo.unique()) if m >= "2026-06"]
    pr("| Luật | " + " | ".join(mos) + " |\n|---|" + "---|" * len(mos))
    for ru in RULES:
        g = L.groupby("mo")[ru].mean(); pr(f"| {ru} | " + " | ".join(f"{g.get(m, np.nan):+.0f}" for m in mos) + " |")
    pr("\n| Số chân | " + " | ".join(str((L.mo == m).sum()) for m in mos) + " |")
    if miss:
        pr("\nThiếu dữ liệu: " + "; ".join(miss[:20]))
    json.dump(dict(rules=RULES, cur=CUR, best=best, pf={f"{ru}|{sl}": {k: v for k, v in x.items() if k != "dayp"} for (ru, sl), x in PF.items()},
                   leg={ru: dict(mean=float(L[ru].mean()), d=float((L[ru] - L[CUR]).mean())) for ru in RULES}), open(os.path.join(OUT, "r25_summary.json"), "w"), ensure_ascii=False, default=float)


if __name__ == "__main__":
    t00 = time.time()
    nev = build_events(); gc.collect()
    B, ALLD = M.load_events(); B = B.sort_values(["T", "s"], kind="mergesort").reset_index(drop=True); B["k"] = np.arange(len(B))
    recs = B.to_dict("records")
    log(f"{len(B)} cú sốc qua lọc · {len(RULES)} luật · dựng lại giá đặt từ nến…")
    with cf.ThreadPoolExecutor(48) as ex:
        P = {p["k"]: p for p in ex.map(M.prep, recs) if p}
    M.kday.cache_clear(); gc.collect()
    jobs = {}
    for r in recs:
        p = P.get(r["k"])
        if p and p["need"]:
            jobs.setdefault(r["s"], []).append((r["k"], int(r["T"]), int(r["side"]), r["r15"], p["L"]))
    log(f"dựng lại {len(P)}/{len(B)} · cần aggTrades {sum(len(v) for v in jobs.values())} cú sốc / {len(jobs)} mã · {time.time() - t00:.0f}s")
    TR = {}; miss = []
    with cf.ProcessPoolExecutor(int(os.environ.get("R19_PROC", "8"))) as ex:
        for j, (s, out, err) in enumerate(ex.map(per_symbol, sorted(jobs.items(), key=lambda x: -len(x[1])))):
            TR.update(out); miss += [f"{s}: {err}"] if err else []
            if j % 50 == 0:
                log(f"  … {j}/{len(jobs)} mã · {len(TR)} cú sốc · {time.time() - t00:.0f}s")
    t_run = time.time() - t00
    log(f"aggTrades xong: {len(TR)} · thiếu {len(miss)} mã · {t_run:.0f}s")
    with gzip.open(os.path.join(OUT, "round25.json.gz"), "wt") as f:
        json.dump(dict(rules=RULES, tr={str(k): v for k, v in TR.items()}, miss=miss), f, default=float)
    with open(os.path.join(OUT, "r25_result.md"), "w") as f, contextlib.redirect_stdout(f):
        report(B, ALLD, TR, miss, nev, t_run)
    log(f"xong · {time.time() - t00:.0f}s")
