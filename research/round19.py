"""Vòng 19 – CHẠY LẠI TOÀN BỘ (01/2025 → nay) theo từng giao dịch thật (aggTrades) để chọn luật thoát (Jason 12/11/2026).
Vòng 18/18b: mô hình nến 1 phút thổi phồng luật "đuổi lời 150/100" vì không thấy nhịp giật trong phút; bot thật xét giá từng giây.
Mọi cú sốc qua lọc chính của bot mà giá nến chạm giá đặt L (hoặc có chân "mua ngay") → tải aggTrades, chạy từng chân với:
  Giá dùng để đuổi lời:
    · "như bot"   – giá giữa (bid+ask)/2 dựng từ giao dịch chủ động mua & bán gần nhất (bỏ nếu 1 phía cũ > 2 giây → dùng giá khớp),
                    lấy mẫu mỗi 2 giây, chỉ bắt đầu theo dõi 4 giây sau khi khớp (bot hỏi trạng thái lệnh ~4 giây/lần)
    · "nến phút đóng" – chỉ xét giá cuối mỗi phút
    · "mỗi giao dịch" – tham chiếu (khắt khe nhất)
  Luật: đuổi 150/100 · 300/150 · 500/200 · giữ 30 phút · giữ 60 phút (không đuổi)
  Chân "mua ngay" (tháo chạy) không đuổi lời (như bot thật); khi chân này khớp, bot thật tắt đuổi lời cả cú → biến thể "như bot + tắt khi có mua ngay".
  Thoát: kích hoạt → lệnh thị trường 1 giây sau ở giá giao dịch kế tiếp · phí 5 · trượt thêm 0 / 10 / 20 bps (giá giao dịch đã gồm chênh mua–bán).
  Cắt lỗ thảm hoạ −3.500 bps theo giá khớp.
Danh mục như vòng 18a (7,5%/cú, tối đa 9 lệnh, dừng ngày −3%); chọn luật trên 2025, kiểm 2026 H1 / H2; khoảng tin cậy theo NGÀY (bootstrap theo ngày).
Chạy: python research/round19.py   (đầu vào research/data/round17.json.gz · kết quả research_out/round19.json.gz + r19_result.md)"""
import concurrent.futures as cf
import contextlib
import gzip
import json
import os
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("RS_LOG", "round19.log")
import round18 as M  # noqa: E402
import round18b as MB  # noqa: E402,F401  (gắn parse_agg có cờ bên mua/bán vào M)

E, R6 = M.E, M.R6
SLIPS = (0, 10, 20)
TR_RULES = [(150, 100), (300, 150), (500, 200)]
SERIES = ("bot", "m1", "raw")
RN = {"bot": "như bot", "m1": "nến phút đóng", "raw": "mỗi giao dịch"}


def rule_names():
    out = []
    for s in SERIES:
        for a, g in TR_RULES:
            if s == "raw" and a != 150:
                continue
            out.append(f"đuổi {a}/{g} · {RN[s]}")
    out += ["đuổi 150/100 · như bot + tắt khi có mua ngay", "giữ 30 phút", "giữ 60 phút"]
    return out


RULES = rule_names()


def mk_series(tt, sp, tf):
    p = np.abs(sp)
    isb = sp < 0
    tb = pd.Series(np.where(isb, tt, np.nan)).ffill().values; ta = pd.Series(np.where(~isb, tt, np.nan)).ffill().values
    bid = pd.Series(np.where(isb, p, np.nan)).ffill().values; ask = pd.Series(np.where(~isb, p, np.nan)).ffill().values
    fresh = np.isfinite(tb) & np.isfinite(ta) & (tt - np.nan_to_num(tb) <= 2000) & (tt - np.nan_to_num(ta) <= 2000)
    mid = np.where(fresh, (bid + ask) / 2, p)
    g = np.arange(tf + 4000, tf + M.HOLD * 1000, 2000)
    ix = np.searchsorted(tt, g, "right") - 1; ok = ix >= 0
    bot = (g[ok], mid[ix[ok]])
    mn = tt // 60000; last = np.r_[mn[1:] != mn[:-1], True]
    m1 = ((mn[last] + 1) * 60000 - 1, p[last])
    return dict(bot=bot, m1=m1, raw=(tt, p))


def legrun(tt, sp, side, T, L, market=False):
    """1 chân · trả {luật: (bps ròng khi trượt 0, phút giữ)} + giây khớp"""
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
        pin, fin = (p[k0], 5.0) if k == k0 else (L, R6.IN_M)
    tf = int(tt[k])
    kH = int(np.searchsorted(tt, tf + M.HOLD * 1000)); pr = side * (p[k + 1:kH + 1] / pin - 1) * 1e4
    cat = np.flatnonzero(pr <= -R6.CAT); tcat = int(tt[k + 1 + int(cat[0])]) if len(cat) else None
    S = mk_series(tt, sp, tf)

    def ex_at(te):
        ke = min(int(np.searchsorted(tt, te + M.LAT_OUT * 1000)), len(tt) - 1)
        return round(float(side * (p[ke] / pin - 1) * 1e4 - fin - 5.0), 1), round(float((tt[ke] - tf) / 60000), 3)

    def first(te, t2):
        return t2 if te is None else te if t2 is None else min(te, t2)

    out = {}
    trail = {}
    for s in SERIES:
        st, sx = S[s]
        a, b = int(np.searchsorted(st, tf, "right")), int(np.searchsorted(st, tf + M.HOLD * 1000))
        pn = side * (sx[a:b] / pin - 1) * 1e4
        cm = np.maximum.accumulate(pn) if len(pn) else pn
        for A, G in TR_RULES:
            if s == "raw" and A != 150:
                continue
            t2 = None
            if not market and len(pn):
                hit = np.flatnonzero((cm >= A) & (pn <= cm - G))
                t2 = int(st[a + int(hit[0])]) if len(hit) else None
            trail[(s, A)] = t2
            out[f"đuổi {A}/{G} · {RN[s]}"] = ex_at(first(tcat, t2) or tf + int(M.HOLD * 1000))
    out["giữ 30 phút"] = ex_at(first(tcat, None) if tcat and tcat < tf + 1800000 else tf + 1800000)
    out["giữ 60 phút"] = ex_at(first(tcat, None) or tf + int(M.HOLD * 1000))
    out["đuổi 150/100 · như bot + tắt khi có mua ngay"] = out["đuổi 150/100 · như bot"]     # sửa ở cấp cú sốc
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
            R = {}
            for D, L in Ls.items():
                v = legrun(t_, p_, side, T, L)
                if v:
                    R[D] = v
            if side > 0 and r15 <= -300:
                v = legrun(t_, p_, side, T, None, market=True)
                if v:
                    R["0.0"] = v
                    for D in M.FAR:        # bot thật: chân mua ngay đã khớp → không đuổi lời cả cú
                        if D in R:
                            R[D]["r"]["đuổi 150/100 · như bot + tắt khi có mua ngay"] = R[D]["r"]["giữ 60 phút"]
            out[k] = R
        return s, out, ""
    except Exception as e:  # noqa: BLE001
        return s, {}, f"lỗi {type(e).__name__}: {str(e)[:120]}"


def res_for(TR, rule, slip):
    """chuyển kết quả 1 luật + 1 mức trượt sang dạng res của vòng 17/18 (tr150, f, fs)"""
    out = {}
    for k, R in TR.items():
        out[k] = {D: dict(tr150=v["r"][rule][0] - slip * (2 if v["mk"] else 1), f=v["f"], fs=v["fs"]) for D, v in R.items()}
    return out


def boot_day(vals, days, n=2000, seed=0):
    df = pd.DataFrame(dict(v=vals, d=days)); g = df.groupby("d").v.agg(["sum", "count"])
    if len(g) < 3:
        return np.nan, np.nan
    rng = np.random.default_rng(seed); S, C = g["sum"].values, g["count"].values
    idx = rng.integers(0, len(g), (n, len(g))); m = S[idx].sum(1) / C[idx].sum(1)
    return np.percentile(m, 2.5), np.percentile(m, 97.5)


def report(B, ALLD, P, TR, miss, t_run):
    pr = print
    need = [k for k, p in P.items() if p["need"]]
    pr(f"# Vòng 19 – toàn bộ {B.ts.min():%d/%m/%Y} → {B.ts.max():%d/%m/%Y} theo từng giao dịch thật\n")
    pr(f"{len(B)} cú sốc qua lọc · {len(need)} cần dữ liệu giao dịch (nến chạm giá đặt hoặc có chân mua ngay) · chạy được {len(TR)} · thiếu dữ liệu {len(need) - len(TR)} "
       f"({len(miss)} mã) · {t_run / 60:.0f} phút\n")
    pr("Thoát: lệnh thị trường 1 giây sau khi kích hoạt, giá giao dịch kế tiếp, phí 5 bps, trượt thêm 0/10/20. Lệnh chờ: khớp khi có giao dịch đi xuyên giá đặt.\n")
    pr("Đơn giản hoá: mỗi chân tính riêng (bot thật gộp 2 chân thành 1 vị thế giá trung bình).\n")
    # ---- từng chân
    BK = B.set_index("k")
    rows = []
    for k, R in TR.items():
        r = BK.loc[k]
        for D, v in R.items():
            if D == "0.0" or v["f"] > M.W:
                continue
            rows.append(dict(k=k, D=D, d=r.vnday, h=r.half, g=bool(r.grp), **{f"x{i}": v["r"][ru][0] for i, ru in enumerate(RULES)},
                             **{f"e{i}": v["r"][ru][1] for i, ru in enumerate(RULES)}, kl=P[k]["kres"].get(D, {}).get("tr150", np.nan)))
    L = pd.DataFrame(rows)
    pr(f"## 1. Từng chân lệnh chờ ({len(L)} chân, {L.d.nunique()} ngày) – bps ròng/chân, trượt thêm 10 bps · khoảng tin cậy 95% theo ngày\n")
    pr("| Luật thoát | TB | Khoảng tin cậy | Trung vị | Lời | Thoát < 5 giây | 2025 H1 | 2025 H2 | 2026 H1 | 2026 H2 | Sập một mình | Cả nhóm |\n|---|---|---|---|---|---|---|---|---|---|---|---|")
    kl = L.kl.values; km = np.isfinite(kl)
    lo, hi = boot_day(kl[km], L.d.values[km])
    pr(f"| (mô hình nến 1 phút, vòng 17 – đuổi 150/100) | {np.nanmean(kl):+.0f} | {lo:+.0f} … {hi:+.0f} | {np.nanmedian(kl):+.0f} | {(kl > 0).mean() * 100:.0f}% | – | "
       + " | ".join(f"{L[L.h == h].kl.mean():+.0f}" for h in ("2025H1", "2025H2", "2026H1", "2026H2")) + f" | {L[~L.g].kl.mean():+.0f} | {L[L.g].kl.mean():+.0f} |")
    for i, ru in enumerate(RULES):
        x = L[f"x{i}"].values - 10; lo, hi = boot_day(x, L.d.values)
        pr(f"| {ru} | {x.mean():+.0f} | {lo:+.0f} … {hi:+.0f} | {np.median(x):+.0f} | {(x > 0).mean() * 100:.0f}% | {(L[f'e{i}'] < 5 / 60).mean() * 100:.0f}% | "
           + " | ".join(f"{(L[L.h == h][f'x{i}'] - 10).mean():+.0f}" for h in ("2025H1", "2025H2", "2026H1", "2026H2")) + f" | {(L[~L.g][f'x{i}'] - 10).mean():+.0f} | {(L[L.g][f'x{i}'] - 10).mean():+.0f} |")
    # ---- danh mục
    pr("\n## 2. Danh mục (7,5%/cú · tối đa 9 lệnh · dừng ngày −3%) – thứ tự khớp thật\n")
    pr("| Luật thoát | Trượt | Lợi nhuận | Sụt tối đa | Ngày tệ | Sharpe | 2025 H1 | 2025 H2 | 2026 H1 | 2026 H2 |\n|---|---|---|---|---|---|---|---|---|---|")
    base = M.Res({r.k: r.res for r in B.itertuples()}); M.Res.real = set()
    x = M.sim(B, base, ALLD); hh = halves(B, x)
    pr(f"| (mô hình nến 1 phút) | – | {x['tot']:+.0f}% | {x['dd']:.1f}% | {x['wday']:.1f}% | {x['sh']:.2f} | " + " | ".join(f"{v:+.0f}%" for v in hh) + " |")
    PF = {}
    for ru in RULES:
        for sl in SLIPS:
            RES = M.Res({r.k: {} for r in B.itertuples()}); RES.update(res_for(TR, ru, sl)); M.Res.real = set(TR.keys())
            x = M.sim(B, RES, ALLD); hh = halves(B, x); PF[(ru, sl)] = (x, hh)
            pr(f"| {ru} | {sl} | {x['tot']:+.0f}% | {x['dd']:.1f}% | {x['wday']:.1f}% | {x['sh']:.2f} | " + " | ".join(f"{v:+.0f}%" for v in hh) + " |")
    # ---- chọn trên 2025, kiểm 2026
    pr("\n## 3. Chọn luật trên 2025 → kiểm trên 2026 (trượt 10 bps)\n")
    sc = {ru: (1 + PF[(ru, 10)][1][0] / 100) * (1 + PF[(ru, 10)][1][1] / 100) - 1 for ru in RULES}
    best = max(sc, key=sc.get)
    for ru in sorted(RULES, key=lambda r: -sc[r]):
        x, hh = PF[(ru, 10)]
        ok = all(v > 0 for v in hh)
        pr(f"- {'**' if ru == best else ''}{ru}{'**' if ru == best else ''}: 2025 {sc[ru] * 100:+.0f}% → 2026 H1 {hh[2]:+.0f}% · H2 {hh[3]:+.0f}% · {'✅ cả 4 nửa năm dương' if ok else '❌ có nửa năm âm'}")
    xb, hb = PF[(best, 10)]
    pr(f"\nLuật tốt nhất trên 2025: **{best}** → 2026: H1 {hb[2]:+.0f}%, H2 {hb[3]:+.0f}%.")
    xc, hc = PF[("đuổi 150/100 · như bot + tắt khi có mua ngay", 10)]
    pr(f"Luật bot đang chạy (đuổi 150/100 như bot): cả giai đoạn {xc['tot']:+.0f}% · sụt {xc['dd']:.1f}% · nửa năm " + " / ".join(f"{v:+.0f}%" for v in hc) + ".")


def halves(B, x):
    hv = {}
    for d, v in x["dayp"].items():
        y, m = int(d[:4]), int(d[5:7]); h = f"{y}{'H1' if m <= 6 else 'H2'}"
        hv[h] = hv.get(h, 1) * (1 + v / 100)
    return [(hv.get(h, 1) - 1) * 100 for h in ("2025H1", "2025H2", "2026H1", "2026H2")]


if __name__ == "__main__":
    t00 = time.time()
    B, ALLD = M.load_events(); B["k"] = np.arange(len(B))
    recs = B.to_dict("records")
    E.log(f"{len(B)} cú sốc qua lọc · dựng lại giá đặt từ nến…")
    with cf.ThreadPoolExecutor(48) as ex:
        P = {p["k"]: p for p in ex.map(M.prep, recs) if p}
    jobs = {}
    for r in recs:
        p = P.get(r["k"])
        if p and p["need"]:
            jobs.setdefault(r["s"], []).append((r["k"], int(r["T"]), int(r["side"]), r["r15"], p["L"]))
    E.log(f"dựng lại {len(P)}/{len(B)} · cần aggTrades {sum(len(v) for v in jobs.values())} cú sốc / {len(jobs)} mã · {time.time() - t00:.0f}s")
    TR = {}; miss = []
    with cf.ProcessPoolExecutor(int(os.environ.get("R19_PROC", "8"))) as ex:
        for j, (s, out, err) in enumerate(ex.map(per_symbol, sorted(jobs.items(), key=lambda x: -len(x[1])))):
            TR.update(out); miss += [f"{s}: {err}"] if err else []
            if j % 50 == 0:
                E.log(f"  … {j}/{len(jobs)} mã · {len(TR)} cú sốc · {time.time() - t00:.0f}s")
    t_run = time.time() - t00
    E.log(f"aggTrades xong: {len(TR)} · thiếu {len(miss)} mã · {t_run:.0f}s")
    with gzip.open(os.path.join(E.OUT, "round19.json.gz"), "wt") as f:
        json.dump(dict(rules=RULES, kres={str(k): p["kres"] for k, p in P.items() if p["need"]}, tr={str(k): v for k, v in TR.items()}, miss=miss), f, default=float)
    with open(os.path.join(E.OUT, "r19_result.md"), "w") as f, contextlib.redirect_stdout(f):
        report(B, ALLD, P, TR, miss, t_run)
    E.log(f"xong · {time.time() - t00:.0f}s")
