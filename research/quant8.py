"""Vòng 8 định lượng – đánh giá 4 phương pháp Jason gửi (gợi ý của Gemini), trên dữ liệu thật Binance, đã trừ phí + chênh lệch + trượt giá.
  A1  Funding Rate Carry / Cash-and-Carry: mua SPOT + bán khống PERP 1x cùng lượng coin (trung tính giá) → ăn funding. Mỗi ngày 00:00 UTC xếp hạng
      coin theo funding 3 ngày qua (quy năm), giữ tối đa N cặp có funding ≥ ngưỡng vào; thoát khi funding 3 ngày < ngưỡng ra. Lãi = funding nhận +
      chênh lệch spot/perp thay đổi − phí 4 chân (spot 7,5 + perp 4,5 bps mỗi chân + chênh lệch giá mua bán + trượt). Vốn mỗi cặp = 2 × giá trị
      1 chân (tiền mua spot + ký quỹ perp 1x). Có đếm số lần phải cân lại ký quỹ (giá chạy ±40%) và số lần giá vọt ≥ +80% trong 1 ngày (nguy cơ
      thanh lý chân perp 1x nếu không cân kịp).
  A2  Post-Listing Basis Decay: coin mới lên futures (nến đầu tiên ≥ 30 ngày sau BTC), perp đắt hơn spot ≥ ngưỡng → bán perp + mua spot (trung tính),
      chờ chênh lệch co lại; so với bán khống perp trần (không phòng hộ). Phí coin mới cao hơn (chênh lệch 5 bps mỗi bên).
  B1  Breakout + CVD + OI (nến 5 phút, 60 coin/tháng): giá phá đỉnh/đáy N nến (lần đầu) – lọc theo dòng lệnh chủ động 30 phút (CVD từ taker-buy)
      và Open Interest 30 phút tăng; so với phá vỡ trần (không lọc) để xem CVD/OI có thêm giá trị không, và phá vỡ "giả" (CVD ngược chiều → đánh ngược).
  B2  Dynamic ATR Grid (lưới hai chiều quanh giá, khoảng cách = k × ATR 5 phút, N mức mỗi bên, lệnh giới hạn phí maker 2 bps, phải xuyên qua mức
      1 bps mới tính khớp; giá vượt mức cuối 2 khoảng → cắt hết bằng lệnh thị trường; tự đặt lại tâm + khoảng cách mỗi ngày khi không giữ hàng;
      tuỳ chọn tạm dừng khi xu hướng mạnh – hệ số hiệu quả 12 giờ > 0,3). 20 coin lớn nhất mỗi tháng.
Q8=A (mặc định, nến 1 giờ từ RS_START=2022-01) hoặc Q8=B (nến 5 phút, nên RS_START=2024-01).
Chạy: research.yml script=quant8.py nsym=2000 env="Q8=A"  rồi  env="Q8=B;RS_START=2024-01"
"""
import concurrent.futures as cf
import gzip
import json
import math
import os
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
PART = os.environ.get("Q8", "A").upper()
os.environ.setdefault("RS_LOG", f"quant8{PART.lower()}.log")
os.environ.setdefault("RS_START", "2022-01")
import events as E  # noqa: E402
import round10 as R  # noqa: E402
import quant6a as Q  # noqa: E402

log = E.log
MONTHS = Q.MONTHS
SPOT = "https://data.binance.vision/data/spot"
FS, FP = 7.5, 4.5          # phí taker spot (có BNB) / perp (có BNB), bps


# ---------------------------------------------------------------------------- dữ liệu spot 1 giờ
def fetch_spot1h(ss, m):
    path = os.path.join(E.CACHE, f"{ss}_sp1h_{m}.pkl")
    if os.path.exists(path):
        d = pd.read_pickle(path)
        return d if len(d) else None
    b = E.get(f"{SPOT}/monthly/klines/{ss}/1h/{ss}-1h-{m}.zip")
    d = E.parse(b) if b else None
    (d if d is not None else pd.DataFrame()).to_pickle(path)
    return d


def spot_cands(s):
    out = []
    for pre, mul in (("1000000", 1e6), ("1000", 1e3), ("1M", 1e6)):
        if s.startswith(pre) and len(s) > len(pre) + 4:
            out.append((s[len(pre):], mul))
    return out + [(s, 1.0)]


def spot_series(s, months, perp_c=None):
    """giá đóng spot theo giờ tuyệt đối (đã nhân hệ số 1000…), kiểm tra khớp với perp (trung vị |chênh| < 3%)"""
    for ss, mul in spot_cands(s):
        L = [fetch_spot1h(ss, m) for m in months]
        L = [d for d in L if d is not None and len(d)]
        if not L:
            continue
        d = pd.concat(L).drop_duplicates("t").sort_values("t")
        ser = pd.Series(d.c.values * mul, index=(d.t.values // 60).astype(np.int64))
        if perp_c is not None:
            jn = pd.concat([perp_c, ser], axis=1, join="inner").dropna()
            if len(jn) < 24 or float(np.median(np.abs(jn.iloc[:, 0] / jn.iloc[:, 1] - 1))) > 0.03:
                continue
        return ser, ss
    return None, None


# ---------------------------------------------------------------------------- tiện ích chuỗi lợi suất ngày
def dstats(r):
    r = pd.Series(r).dropna()
    if len(r) < 30:
        return dict(n=len(r))
    yrs = len(r) / 365
    eq = (1 + r).cumprod(); tot = float(eq.iloc[-1] - 1)
    dd = float((1 - eq / eq.cummax()).max())
    sh = float(r.mean() / r.std() * math.sqrt(365)) if r.std() > 0 else 0.0
    by = {}
    for y, g in r.groupby(pd.to_datetime(r.index * 86400, unit="s").year):
        by[int(y)] = round(float((1 + g).prod() - 1) * 100, 1)
    return dict(days=len(r), tot=round(tot * 100, 1), ann=round(((1 + tot) ** (1 / yrs) - 1) * 100 if tot > -1 else -100, 1), dd=round(dd * 100, 1), sh=round(sh, 2), years=by)


def wf_days(D):
    """D: DataFrame (ngày tuyệt đối × biến thể) lợi suất ngày. Chọn biến thể lãi kép tốt nhất 6 tháng → chạy mù 2 tháng sau."""
    mon = pd.to_datetime(D.index * 86400, unit="s").to_period("M")
    ms = sorted(set(mon)); out = []; picks = []
    for k in range(6, len(ms), 2):
        IS = D[(mon >= ms[k - 6]) & (mon < ms[k])]; OS = D[(mon >= ms[k]) & (mon <= ms[min(len(ms) - 1, k + 1)])]
        sc = (1 + IS.fillna(0)).prod() - 1
        best = sc.idxmax()
        picks.append(f"{ms[k]}: {best} ({sc[best] * 100:+.1f}%)")
        out.append(OS[best] if sc[best] > 0 else OS[best] * 0)
    return (pd.concat(out) if out else pd.Series(dtype=float)), picks


def fmt(st):
    if not st.get("tot") and st.get("tot") != 0:
        return f"(quá ít ngày: {st.get('n')})"
    return f"tổng {st['tot']:+.1f}% · {st['ann']:+.1f}%/năm · sụt tối đa {st['dd']:.1f}% · Sharpe {st['sh']:.2f} · theo năm {st['years']}"


# ============================================================================ A1 · funding carry
def a1_carry(H0, n, keep, S, M, UNI, RK, F, SP):
    st = (24 - H0 % 24) % 24; nd = (n - st - 25) // 24
    C = M["c"].astype(np.float64); Hh = M["h"].astype(np.float64)
    F64 = np.nan_to_num(F.astype(np.float64))
    Fc = np.vstack([np.zeros((1, F.shape[1])), np.cumsum(F64, axis=0)])
    K = len(keep)
    hours = [st + 24 * d for d in range(1, nd)]
    mon = {h: Q.month_of(h, H0) for h in hours}
    elig = {}
    for h in hours:
        L = UNI.get(mon[h])
        if not L or h < 72 + 1:
            continue
        apr = (Fc[h + 1] - Fc[h + 1 - 72]) * 365 / 3
        ok = np.isfinite(C[h - 1]) & np.isfinite(SP[h - 1]) & np.isfinite(SP[h - 72]) & (SP[h - 1] > 0)
        elig[h] = (apr, ok, {S[s]: RK[mon[h]][s] for s in L})

    def half(rk):
        return 0.5 if rk < 10 else 1.5 if rk < 50 else 3.0

    def legcost(rk):          # vào (hoặc ra) 1 cặp: 2 chân, bps của giá trị 1 chân
        return FS + FP + 2 * half(rk) + 2.0

    def run(N, thr_in, thr_out, fixed=None, guard=False):
        held = {}          # j → dict(rk, h0, ref)
        R_ = {}; ent = 0; reb = 0; spike = 0; hold_days = []; capt = []; badd = []
        for h in hours:
            if h not in elig:
                continue
            apr, ok, uni = elig[h]
            day_pnl = 0.0
            # thoát (ở giá đóng giờ h-1 = 00:00)
            for j in list(held):
                p = held[j]
                bad = not (np.isfinite(C[h - 1, j]) and np.isfinite(SP[h - 1, j]))
                div = (not bad) and abs(C[h - 1, j] / SP[h - 1, j] - 1) > 0.03
                if bad or (fixed is None and apr[j] < thr_out) or (guard and div):
                    day_pnl -= legcost(p["rk"]) / 1e4
                    hold_days.append((h - p["h0"]) / 24); del held[j]
            # vào
            if fixed is not None:
                want = [j for j in fixed if ok[j] and j not in held and not (guard and abs(C[h - 1, j] / SP[h - 1, j] - 1) > 0.03)]
            else:
                cand = sorted((j for j in uni if ok[j] and apr[j] >= thr_in and j not in held and not (guard and abs(C[h - 1, j] / SP[h - 1, j] - 1) > 0.03)), key=lambda j: -apr[j])
                want = cand[:max(0, N - len(held))]
            for j in want:
                rk = uni.get(j, 0)
                held[j] = dict(rk=rk, h0=h, ref=C[h - 1, j]); ent += 1
                day_pnl -= legcost(rk) / 1e4
            # lãi/lỗ trong ngày cho mỗi cặp (1 đơn vị giá trị chân, lượng coin cố định theo giá lúc vào)
            for j, p in held.items():
                s0, s1, p0, p1 = SP[h - 1, j], SP[h + 23, j], C[h - 1, j], C[h + 23, j]
                if not (np.isfinite(s1) and np.isfinite(p1) and s0 > 0):
                    continue
                fr = F64[h + 1:h + 25, j]; px = C[h:h + 24, j]
                fund = float(np.nansum(fr * px)) / s0
                ctb = ((s1 - s0) - (p1 - p0)) / s0 + fund
                day_pnl += ctb
                if ctb < -0.03:
                    badd.append((keep[j], Q.month_of(h, H0), (h + H0) // 24, round(float(s0), 6), round(float(s1), 6), round(float(p0), 6), round(float(p1), 6), round(fund * 100, 2), round(ctb * 100, 1)))
                capt.append(float(fr.sum()) * 365)
                if np.nanmax(Hh[h:h + 24, j]) >= p["ref"] * 1.8:
                    spike += 1
                if abs(p1 / p["ref"] - 1) > 0.4:
                    reb += 1; p["ref"] = p1; day_pnl -= 0.4 * legcost(p["rk"]) / 1e4
            R_[(h + H0) // 24] = day_pnl / (2 * (N if fixed is None else len(fixed)))
        return pd.Series(R_), dict(entries=ent, rebal=reb, spike80=spike, hold_med=round(float(np.median(hold_days)), 1) if hold_days else None,
                                   apr_capt=round(float(np.mean(capt)) * 100, 1) if capt else None, slots=N if fixed is None else len(fixed), bad=badd)

    D = {}; info = {}; txt = []
    for name, fx in (("BTC luôn giữ", ["BTCUSDT"]), ("ETH luôn giữ", ["ETHUSDT"]), ("BTC+ETH luôn giữ", ["BTCUSDT", "ETHUSDT"])):
        fx = [S[s] for s in fx if s in S]
        if not fx:
            continue
        r, inf = run(len(fx), 0, -9, fixed=fx); D[name] = r; info[name] = inf
    for N in (1, 3, 5, 10):
        for ti in (0.10, 0.20, 0.40, 0.80):
            for to_ in (ti / 2, 0.0):
                for gd in (False, True):
                    k = f"N{N}|vào≥{ti * 100:.0f}%|ra<{to_ * 100:.0f}%{'|chặn lệch>3%' if gd else ''}"
                    r, inf = run(N, ti, to_, guard=gd); D[k] = r; info[k] = inf
    DF = pd.DataFrame(D).sort_index()
    rows = []
    for k in DF.columns:
        s_ = dstats(DF[k]); rows.append((k, s_, info[k]))
    rows.sort(key=lambda x: -(x[1].get("ann") or -999))
    txt.append("\n==================== A1 · Funding carry (mua spot + bán perp 1x)")
    txt.append(f"  Phí: spot {FS} + perp {FP} bps mỗi chân + chênh lệch (0,5/1,5/3 bps theo hạng) + trượt 1 bps mỗi chân, cả lúc vào và ra. Lợi nhuận tính trên TỔNG vốn (spot + ký quỹ perp).")
    for k, s_, inf in rows:
        txt.append(f"  {k:<26} {fmt(s_)} · lượt vào {inf['entries']} · giữ TB(trung vị) {inf['hold_med']} ngày · funding thu quy năm {inf['apr_capt']}% · cân ký quỹ {inf['rebal']} · ngày vọt ≥80% {inf['spike80']}")
    allbad = sorted({b for k in info for b in info[k]['bad']}, key=lambda b: b[-1])
    txt.append(f"  Ngày-cặp lỗ > 3% giá trị chân (gộp mọi biến thể, {len(allbad)} trường hợp) – tệ nhất: " + " | ".join(f"{b[0]} {pd.Timestamp(b[2] * 86400, unit='s').date()} spot {b[3]}→{b[4]} perp {b[5]}→{b[6]} funding {b[7]}% = {b[8]}%" for b in allbad[:25]))
    for k in info:
        info[k].pop('bad', None)
    wfr, picks = wf_days(DF[[c for c in DF.columns if c.startswith("N") and 'chặn' not in c]])
    sw = dstats(wfr)
    txt.append(f"  WALK-FORWARD (chọn biến thể tốt nhất 6 tháng → chạy mù 2 tháng): {fmt(sw)}")
    txt.append("  Lựa chọn: " + " | ".join(picks[-10:]))
    # funding trung bình theo năm (BTC, ETH, trung vị top 100)
    yy = {}
    for h in hours[::24]:
        if h in elig:
            apr, ok, uni = elig[h]; y = Q.month_of(h, H0)[:4]
            yy.setdefault(y, []).append(float(np.median([apr[j] for j in uni])))
    txt.append("  Funding quy năm (trung vị top 100, lấy mẫu): " + " · ".join(f"{y}: {np.mean(v) * 100:.1f}%" for y, v in sorted(yy.items())))
    return dict(rows=[dict(k=k, **s_, **inf) for k, s_, inf in rows], wf=sw, picks=picks), "\n".join(txt)


# ============================================================================ A2 · post-listing basis decay
def a2_listing(syms, H0):
    b0 = R.load1h("BTCUSDT"); LF = int(b0.index[0])
    lst = []

    def first_of(s):
        d = R.load1h(s)
        if d is None or d.c.notna().sum() < 48:
            return s, None
        d = d[d.c.notna()]
        return s, d
    with cf.ThreadPoolExecutor(32) as ex:
        for s, d in ex.map(first_of, syms):
            if d is not None and int(d.index[0]) >= LF + 24 * 30:
                lst.append((s, d))
    log(f"  A2: {len(lst)} mã mới niêm yết futures")
    H = 24 * 14
    rows, curve, meta = [], [], dict(listed=len(lst), with_spot=0, spot_before=0, neg=0)

    def one(item):
        s, d = item
        h0 = int(d.index[0]); m0 = pd.Timestamp(h0 * 3_600_000_000_000).strftime("%Y-%m")
        m1 = pd.Timestamp((h0 + H) * 3_600_000_000_000).strftime("%Y-%m")
        mm = sorted({m0, m1})
        pc = d.c.loc[h0:h0 + H]
        sp, ss = spot_series(s, mm, pc)
        fr = {}
        for m in mm:
            for T, f in (R.fund_month(s, m) or []):
                fr[T] = f / 1e6
        return s, d, h0, sp, fr
    with cf.ThreadPoolExecutor(32) as ex:
        res = list(ex.map(one, lst))
    cost_pair = 2 * (FS + FP + 2 * 5 + 2 * 3)          # vào + ra, 2 chân, coin mới
    cost_short = 2 * (FP + 5 + 3)
    for s, d, h0, sp, fr in res:
        if sp is None:
            continue
        meta["with_spot"] += 1
        if int(sp.index[0]) < h0:
            meta["spot_before"] += 1
        idx = np.arange(h0, h0 + H)
        P = d.c.reindex(idx).values.astype(np.float64); Ph = d.h.reindex(idx).values.astype(np.float64)
        SPv = sp.reindex(idx).values.astype(np.float64)
        FR = np.array([fr.get(int(x), 0.0) for x in idx])
        b = P / SPv - 1
        curve.append([b[k] if k < H else np.nan for k in (0, 1, 3, 6, 12, 24, 48, 72, 168)] + [float(FR[:72].sum() * 365 / 3)])
        if np.nanmin(b[:24]) < -0.01:
            meta["neg"] += 1
        y = pd.Timestamp(h0 * 3_600_000_000_000).year
        for k0 in (0, 1, 6, 24):
            for thr in (0.005, 0.01, 0.02, 0.04):
                hit = np.flatnonzero((np.arange(H) >= k0) & (b >= thr))
                if not len(hit) or hit[0] + 1 >= H - 1:
                    continue
                e = hit[0] + 1          # vào ở giá đóng giờ kế tiếp
                if not (np.isfinite(P[e]) and np.isfinite(SPv[e])):
                    continue
                for xf in (0.25, 0.0):
                    for mh in (72, 168):
                        last = min(H - 1, e + mh)
                        x = last
                        for k in range(e + 1, last + 1):
                            if np.isfinite(b[k]) and b[k] <= thr * xf:
                                x = k; break
                        while x > e and not (np.isfinite(P[x]) and np.isfinite(SPv[x])):
                            x -= 1
                        if x <= e:
                            continue
                        s0, s1, p0, p1 = SPv[e], SPv[x], P[e], P[x]
                        fund = float(np.nansum(FR[e + 1:x + 1] * P[e:x])) / s0
                        hed = ((s1 - s0) - (p1 - p0)) / s0 + fund
                        sh = -(p1 / p0 - 1) + float(np.nansum(FR[e + 1:x + 1]))
                        mx = float(np.nanmax(Ph[e:x + 1]) / p0 - 1)
                        rows.append(dict(p=f"sau{k0}g|b≥{thr * 100:.1f}%|ra≤{thr * xf * 100:.2f}%|tối đa{mh}g", s=s, y=y, b0=round(b[hit[0]] * 1e4, 1),
                                         hed=round(hed * 1e4 - cost_pair, 1), short=round(sh * 1e4 - cost_short, 1), hrs=int(x - e), up=round(mx * 100, 1)))
    df = pd.DataFrame(rows)
    cv = np.array(curve, dtype=np.float64)
    txt = ["\n==================== A2 · Post-listing basis decay (coin mới lên futures)",
           f"  {meta['listed']} mã mới · có spot Binance khớp giá: {meta['with_spot']} (spot có trước perp: {meta['spot_before']}) · perp rẻ hơn spot > 1% trong 24 giờ đầu: {meta['neg']} mã",
           f"  Phí cặp (vào + ra, 4 lệnh, coin mới): {cost_pair:.0f} bps · phí bán khống perp trần: {cost_short:.0f} bps"]
    if len(cv):
        lab = ["giờ0", "1", "3", "6", "12", "24", "48", "72", "168"]
        txt.append("  Chênh perp/spot (bps) trung vị theo giờ sau niêm yết: " + " · ".join(f"{l}: {np.nanmedian(cv[:, i]) * 1e4:+.0f}" for i, l in enumerate(lab))
                   + f" · % mã chênh ≥ 0,5% lúc giờ 1: {np.nanmean(cv[:, 1] >= 0.005) * 100:.0f}% · funding 3 ngày đầu quy năm (trung vị): {np.nanmedian(cv[:, -1]) * 100:.0f}%")
    out = []
    if len(df):
        g = df.groupby("p").agg(n=("hed", "size"), hed=("hed", "mean"), hmed=("hed", "median"), hwin=("hed", lambda z: (z > 0).mean() * 100),
                                sh=("short", "mean"), smed=("short", "median"), swin=("short", lambda z: (z > 0).mean() * 100), hrs=("hrs", "median"),
                                up30=("up", lambda z: (z >= 30).mean() * 100)).sort_values("hed", ascending=False)
        txt.append("  biến thể (≥ 15 lệnh) · n · PHÒNG HỘ: TB / trung vị / thắng% · BÁN KHỐNG TRẦN: TB / trung vị / thắng% · giữ (giờ) · % lệnh giá vọt ≥30% lúc giữ")
        for p, r in g[g.n >= 15].head(20).iterrows():
            txt.append(f"    {p:<40} {int(r.n):>4} · {r.hed:+7.1f} / {r.hmed:+6.1f} / {r.hwin:4.0f}% · {r.sh:+7.1f} / {r.smed:+6.1f} / {r.swin:4.0f}% · {r.hrs:>4.0f}g · {r.up30:3.0f}%")
        best = g[g.n >= 15].index[0] if (g.n >= 15).any() else None
        if best:
            bb = df[df.p == best]
            txt.append(f"  Biến thể đứng đầu theo năm (phòng hộ, TB bps · số lệnh): " + " · ".join(f"{y}: {x.hed.mean():+.0f} ({len(x)})" for y, x in bb.groupby("y")))
        out = g.reset_index().to_dict("records")
    return dict(meta=meta, rows=out), "\n".join(txt)


# ============================================================================ B1 · breakout + CVD + OI
def b1_cvd(H0, n5, keep, S, M, OI, TB, UNI, RK, F):
    import quant6b as B
    cols = {k: [] for k in ("p", "s", "side", "t", "t2", "g", "c", "f")}

    def roll(x, w, fn):
        return getattr(pd.Series(x).rolling(w, min_periods=w), fn)().values
    for s, spans in B.spans_of(UNI, RK, H0).items():
        j = S[s]
        o, h, l, c = (M[k][:, j].astype(np.float64) for k in ("o", "h", "l", "c"))
        qv = M["qv"][:, j].astype(np.float64); tb = TB[:, j].astype(np.float64); oi = OI[:, j].astype(np.float64)
        dl = 2 * tb - qv
        with np.errstate(all="ignore"):
            cv6 = roll(dl, 6, "sum") / roll(qv, 6, "sum")
            oi6 = oi / np.roll(oi, 6) - 1
        for N in (48, 144):
            hh = np.roll(roll(h, N, "max"), 1); ll = np.roll(roll(l, N, "min"), 1)
            with np.errstate(invalid="ignore"):
                up = (c > hh) & ~(np.roll(c, 1) > np.roll(hh, 1))
                dn = (c < ll) & ~(np.roll(c, 1) < np.roll(ll, 1))
            for a, b, rk in spans:
                idx = np.flatnonzero((up | dn)[a:b]) + a
                busy = {}
                for i in idx:
                    if i + 40 >= n5 or i < N + 10:
                        continue
                    side = 1 if up[i] else -1
                    cs = side * cv6[i]; os_ = oi6[i]
                    if not np.isfinite(cs):
                        continue
                    tags = [("none", side)]
                    for ct in (0.05, 0.15):
                        if cs >= ct:
                            tags.append((f"cvd≥{ct}", side))
                        if cs <= -ct:
                            tags.append((f"giả·cvd≤-{ct}→ngược", -side))
                    if np.isfinite(os_):
                        for ot in (0.0, 0.01):
                            if os_ >= ot:
                                tags.append((f"oi≥{ot * 100:.0f}%", side))
                        if cs >= 0.05 and os_ >= 0.0:
                            tags.append(("cvd≥0.05+oi↑", side))
                        if cs >= 0.15 and os_ >= 0.01:
                            tags.append(("cvd≥0.15+oi≥1%", side))
                    for tg, sd in tags:
                        for Hd in (12, 36):
                            key = f"N{N}|{tg}|h{Hd * 5}"
                            if busy.get(key, -1) >= i:
                                continue
                            e, x = o[i + 1], o[i + 1 + Hd]
                            if not (e > 0 and x > 0):
                                continue
                            busy[key] = i + Hd
                            cols["p"].append(key); cols["s"].append(s); cols["side"].append(sd); cols["t"].append(int((i + 1) // 12)); cols["t2"].append(int((i + 1 + Hd) // 12))
                            cols["g"].append(round(sd * (x / e - 1) * 1e4, 2)); cols["c"].append(round(Q.cost(rk) + 2, 2)); cols["f"].append(round(B.fund5(F, j, sd, i + 1, i + 1 + Hd), 2))
    df = pd.DataFrame(cols); df["st"] = "B1"
    log(f"  B1: {len(df)} lệnh")
    r, tx = Q.report("B1 · Breakout + CVD + OI (5 phút)", df, H0, "N48|cvd≥0.05+oi↑|h60", "Vào lệnh thị trường nến kế tiếp, phí taker + chênh lệch + 5 bps trượt; giữ 1 giờ / 3 giờ.")
    df["net"] = df.g - df.c + df.f
    g = df.groupby("p").net.agg(["count", "mean"])
    gg = df.assign(win=df.net > 0).groupby("p").agg(n=("net", "size"), mean=("net", "mean"), gross=("g", "mean"), win=("win", "mean"))
    tx += "\n  ▸ So sánh trực tiếp (toàn giai đoạn, TB ròng bps/lệnh · gộp trước phí · thắng%):"
    for N in (48, 144):
        for Hd in (60, 180):
            sel = gg[[p.startswith(f"N{N}|") and p.endswith(f"|h{Hd}") for p in gg.index]].sort_values("mean", ascending=False)
            tx += f"\n    N{N} giữ {Hd} phút: " + " | ".join(f"{p.split('|')[1]} {int(x.n)} lệnh {x['mean']:+.1f} (gộp {x.gross:+.1f}, {x.win * 100:.0f}%)" for p, x in sel.iterrows())
    del g
    return r, tx


# ============================================================================ B2 · dynamic ATR grid
def b2_grid(H0, n5, keep, S, M, UNI, RK, F):
    import numba
    import quant6b as B

    @numba.njit(cache=False)
    def sim(o, h, l, c, atr, er, fr, k, N, ermax, pen, fm, ft, slip):
        n = len(c); eq = np.full(n, np.nan); cash = 0.0; L = 0; q = 0.0; ctr = 0.0; sp = 0.0; act = False; tact = 0
        fills = 0; stops = 0; last = np.nan; gross_fee = 0.0
        pts = np.zeros(4)
        for i in range(n):
            if not (o[i] > 0 and h[i] > 0 and l[i] > 0 and c[i] > 0):
                eq[i] = cash + (-L) * q * (last if last > 0 else 0.0)
                continue
            pos = -L
            if fr[i] != 0.0 and pos != 0:
                cash -= pos * q * o[i] * fr[i]
            if act and L == 0 and (i - tact > 288 or (ermax < 1.0 and i > 0 and er[i - 1] > ermax)):
                act = False
            if not act:
                if i > 0 and atr[i - 1] > 0 and (ermax >= 1.0 or er[i - 1] <= ermax):
                    ctr = o[i]; sp = k * atr[i - 1]; q = 1.0 / ctr; L = 0; act = True; tact = i
                else:
                    eq[i] = cash + pos * q * c[i]; last = c[i]
                    continue
            pts[0] = o[i]
            if c[i] >= o[i]:
                pts[1] = l[i]; pts[2] = h[i]
            else:
                pts[1] = h[i]; pts[2] = l[i]
            pts[3] = c[i]
            stopped = False
            for sgi in range(3):
                b = pts[sgi + 1]
                if b < pts[sgi]:
                    while L > -N:
                        lv = ctr + (L - 1) * sp
                        if b <= lv * (1 - pen):
                            cash -= q * lv; cash -= fm * q * lv; gross_fee += fm * q * lv; L -= 1; fills += 1
                        else:
                            break
                    if L == -N and b <= ctr - (N + 2) * sp:
                        px = (ctr - (N + 2) * sp) * (1 - slip)
                        cash += N * q * px - ft * N * q * px; L = 0; act = False; stops += 1; stopped = True
                        break
                else:
                    while L < N:
                        lv = ctr + (L + 1) * sp
                        if b >= lv * (1 + pen):
                            cash += q * lv; cash -= fm * q * lv; gross_fee += fm * q * lv; L += 1; fills += 1
                        else:
                            break
                    if L == N and b >= ctr + (N + 2) * sp:
                        px = (ctr + (N + 2) * sp) * (1 + slip)
                        cash -= N * q * px + ft * N * q * px; L = 0; act = False; stops += 1; stopped = True
                        break
            pos = -L
            eq[i] = cash + pos * q * c[i]; last = c[i]
        pos = -L
        if pos != 0 and last > 0:
            cash += pos * q * last - ft * abs(pos) * q * last
        if n:
            eq[n - 1] = cash
        return eq, fills, stops, gross_fee

    T0d = H0 * 12          # chỉ số nến 5 phút tuyệt đối của nến đầu
    # khoảng liên tục mà coin nằm trong top 20
    spans = {}
    for s, L in B.spans_of(UNI, RK, H0).items():
        for a, b, rk in sorted(L):
            if rk >= 20:
                continue
            if spans.get(s) and spans[s][-1][1] == a:
                spans[s][-1][1] = b
            else:
                spans.setdefault(s, []).append([a, b])
    Fr5 = {}
    VAR = [(k, N, em) for k in (1.0, 2.0, 4.0, 8.0) for N in (5, 10) for em in (1.0, 0.3)]
    D = {f"k{k}|N{N}|{'lọc xu hướng' if em < 1 else 'luôn chạy'}": {} for k, N, em in VAR}
    G = {kk: [0, 0, 0.0, 0.0] for kk in D}          # khớp, cắt, phí maker, số ngày-coin
    per = {}
    for s, sl in spans.items():
        j = S[s]
        o, h, l, c = (M[f][:, j].astype(np.float64) for f in ("o", "h", "l", "c"))
        pc = np.roll(c, 1)
        tr = np.nanmax(np.vstack([h - l, np.abs(h - pc), np.abs(l - pc)]), axis=0)
        atr = Q.wilder(np.nan_to_num(tr), 48)
        dc = np.abs(np.diff(c, prepend=np.nan))
        er = np.abs(c - np.roll(c, 144)) / pd.Series(dc).rolling(144, min_periods=144).sum().values
        er = np.nan_to_num(er, nan=1.0, posinf=1.0)
        fr = np.zeros(n5)
        fh = np.nan_to_num(F[:, j].astype(np.float64))
        ii = np.arange(0, n5, 12); fr[ii] = fh[ii // 12][:len(ii)]
        for a, b in sl:
            for (k, N, em), kk in zip(VAR, D):
                eq, fl, stp, fee = sim(o[a:b], h[a:b], l[a:b], c[a:b], atr[a:b], er[a:b], fr[a:b], k, N, em, 1e-4, 2e-4, 5e-4, 3e-4)
                eq = pd.Series(eq).ffill().fillna(0).values
                day = (np.arange(a, b) + T0d) // 288
                last = pd.Series(eq).groupby(day).last()
                dr = last.diff(); dr.iloc[0] = last.iloc[0]
                dr = dr / N          # vốn = N đơn vị (mỗi đơn vị 1) → lợi suất theo vốn chưa đòn bẩy
                for d_, v in dr.items():
                    D[kk].setdefault(int(d_), []).append(float(v))
                G[kk][0] += fl; G[kk][1] += stp; G[kk][2] += fee / N; G[kk][3] += len(dr)
                per.setdefault(kk, {}).setdefault(s, []).append(float(eq[-1] / N))
        log(f"  B2 {s}: xong")
    DF = pd.DataFrame({kk: pd.Series({d_: np.mean(v) for d_, v in dd.items()}) for kk, dd in D.items()}).sort_index()
    txt = ["\n==================== B2 · Dynamic ATR Grid (20 coin lớn/tháng, 5 phút)",
           "  Lệnh giới hạn phí maker 2 bps, phải xuyên qua mức 1 bps mới khớp; cắt khi vượt mức cuối 2 khoảng (taker 5 + trượt 3 bps). Lợi suất trên vốn chưa đòn bẩy (vị thế tối đa = vốn)."]
    rows = []
    for kk in DF.columns:
        s_ = dstats(DF[kk]); g_ = G[kk]
        rows.append((kk, s_, g_))
    rows.sort(key=lambda x: -(x[1].get("ann") or -999))
    for kk, s_, g_ in rows:
        txt.append(f"  {kk:<26} {fmt(s_)} · khớp/ngày-coin {g_[0] / max(1, g_[3]):.1f} · lần cắt {g_[1]} · phí maker đã trả {g_[2] / max(1, g_[3]) * 365 * 100:.1f}%/năm")
    best = rows[0][0]
    pp = sorted(((s, sum(v) * 100) for s, v in per[best].items()), key=lambda x: -x[1])
    txt.append(f"  {best} theo coin (tổng % các đoạn): " + " · ".join(f"{s} {v:+.0f}%" for s, v in pp[:8]) + " … " + " · ".join(f"{s} {v:+.0f}%" for s, v in pp[-6:]))
    wfr, picks = wf_days(DF)
    txt.append(f"  WALK-FORWARD: {fmt(dstats(wfr))}")
    txt.append("  Lựa chọn: " + " | ".join(picks[-8:]))
    return dict(rows=[dict(k=k, **s_, fills=g_[0], stops=g_[1]) for k, s_, g_ in rows], wf=dstats(wfr), picks=picks), "\n".join(txt)


def load_spot(H0, n, keep, S):
    SP = np.full((n, len(keep)), np.nan, dtype=np.float32)

    def ld(s):
        d = R.load1h(s)
        pc = pd.Series(d.c.values, index=d.index.values) if d is not None else None
        return s, spot_series(s, MONTHS, pc)[0]
    okn = 0
    with cf.ThreadPoolExecutor(32) as ex:
        for s, ser in ex.map(ld, keep):
            if ser is None:
                continue
            okn += 1
            i = ser.index.values - H0; ok = (i >= 0) & (i < n)
            SP[i[ok], S[s]] = ser.values[ok]
    log(f"spot: {okn}/{len(keep)} mã có cặp spot khớp · ")
    return SP


# ============================================================================
if __name__ == "__main__":
    t00 = time.time()
    syms = E.list_symbols()
    res, txt = {}, [f"Vòng 8 – 4 phương pháp (Gemini) · phần {PART} · {MONTHS[0]} → {MONTHS[-1]} · {time.strftime('%Y-%m-%d %H:%M')} UTC"]

    def go(name, fn):
        t1 = time.time()
        try:
            r, tx = fn()
        except Exception as e:  # noqa: BLE001
            import traceback
            log(f"LỖI {name}: {e}\n{traceback.format_exc()}"); return
        res[name] = r; txt.append(tx); log(tx); log(f"  ({time.time() - t1:.0f}s)")
        with open(os.path.join(E.OUT, f"quant8{PART.lower()}.txt"), "w") as f:
            f.write("\n".join(txt))
        with open(os.path.join(E.OUT, f"quant8{PART.lower()}.json"), "w") as f:
            json.dump(res, f, ensure_ascii=False, default=str)

    if PART == "A":
        log(f"{len(syms)} mã · nến 1 giờ")
        H0, n, keep, S, M, UNI, RK = Q.build(syms)
        F = Q.load_funding(keep, H0, n)
        SP = load_spot(H0, n, keep, S)
        go("A1", lambda: a1_carry(H0, n, keep, S, M, UNI, RK, F, SP))
        go("A2", lambda: a2_listing(syms, H0))
    else:
        import quant6b as B
        H0, n, n5, keep, S, M, OI, UNI, RK = B.build5(syms)
        T0 = H0 * 60
        TB = np.full((n5, len(keep)), np.nan, dtype=np.float32)
        jobs = [(s, m) for s in keep for m in MONTHS]
        with cf.ThreadPoolExecutor(48) as ex:
            for (s, m), d in zip(jobs, ex.map(lambda jb: B.fetch5(*jb), jobs)):
                if d is None:
                    continue
                i = ((d.t.values - T0) // 5).astype(np.int64); ok = (i >= 0) & (i < n5)
                TB[i[ok], S[s]] = d.tbq.values[ok]
        F = Q.load_funding(keep, H0, n)
        go("B2", lambda: b2_grid(H0, n5, keep, S, M, UNI, RK, F))
        go("B1", lambda: b1_cvd(H0, n5, keep, S, M, OI, TB, UNI, RK, F))
        if os.environ.get("Q8_A1"):          # chẩn đoán lại A1 (nến 1 giờ từ RS_START) cùng lần chạy
            del M, OI, TB
            H0, n, keep, S, M, UNI, RK = Q.build(syms)
            F = Q.load_funding(keep, H0, n)
            SP = load_spot(H0, n, keep, S)
            go("A1", lambda: a1_carry(H0, n, keep, S, M, UNI, RK, F, SP))
    log(f"xong · {time.time() - t00:.0f}s")
