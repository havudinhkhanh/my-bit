"""TINH LỌC (refinement) 3 phương pháp có lợi thế gộp ở vòng quant6a – theo yêu cầu anh Jason 03/11/2026. Cùng dữ liệu & nguyên tắc với quant6a.py
(nến 1 giờ 01/2022→, phí + chênh lệch + trượt 14–19 bps/vòng, funding thật, nến đã đóng, vào giá mở nến kế tiếp, walk-forward 6 → 2 tháng).
  R1  Cặp coin O-U: CHỈ ghép trong 15 coin khối lượng lớn nhất tháng trước; vào khi |Z| > 2,8 (và 3,0) VÀ độ lệch chuẩn spread σ > 1,2%
      (bản so sánh 0,8% / 1,5%), cắt |Z| > 3,5 (và 4,5 – vì vào ở 2,8 thì 3,5 rất gần). Bản cố định β và bản Kalman.
  R2  Connors RSI(2) CHỈ LONG trên rổ coin lớn: (a) 10 coin lớn cố định BTC ETH BNB SOL XRP DOGE ADA AVAX LINK LTC – có thiên lệch chọn nhẹ (đều là coin
      còn sống tới nay); (b) 10 coin khối lượng lớn nhất tháng trước (không thiên lệch). Giá > EMA200, RSI(2) < 5 (bản so sánh < 10); có/không ADX < 30,
      có/không Keltner; thoát SMA5 / EMA10; không cắt lỗ / cắt 2,5 ATR; khung H1 / H4.
  R3  Funding cực âm → Long + lọc cấu trúc: nến H4 vừa đóng nằm TRÊN SMA(20) H4 (giá giữ nền). Bản so sánh: không lọc / lọc 8 giờ không giảm (vòng trước).
Báo cáo: walk-forward ngoài mẫu + biến thể đúng như anh đề xuất trên toàn giai đoạn + RIÊNG 2025–2026.
Chạy: research.yml script=quant6r.py nsym=2000"""
import gzip
import json
import math
import os
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("RS_LOG", "quant6r.log")
os.environ.setdefault("RS_START", "2022-01")
import events as E  # noqa: E402
import quant6a as Q  # noqa: E402

log = E.log
MONTHS = Q.MONTHS
MAJ = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "LTCUSDT"]


# ---------------------------------------------------------------------------- R1 · cặp coin trong top 15, ngưỡng cao + σ spread tối thiểu
def r1_pairs(H0, n, keep, S, M, UNI, RK, F):
    out = []
    LC = np.log(M["c"].astype(np.float64)); LO = np.log(M["o"].astype(np.float64))
    FORM = 24 * 30; npair = 0
    for m in MONTHS[1:]:
        a, b = Q.month_hours(m); a -= H0; b -= H0
        if a < FORM or b > n:
            continue
        J = [S[s] for s in UNI[m][:15] if s in S]
        W = LC[a - FORM:a][:, J]; ok = np.isfinite(W).all(axis=0); J = [j for j, k in zip(J, ok) if k]
        if len(J) < 4:
            continue
        W = LC[a - FORM:a][:, J]; C = np.corrcoef(np.diff(W, axis=0).T)
        cand = []
        for x in range(len(J)):
            for y in range(x + 1, len(J)):
                if C[x, y] < 0.75:
                    continue
                A, B = W[:, x], W[:, y]
                beta, alpha = np.polyfit(B, A, 1)
                if not (0.2 < beta < 5):
                    continue
                e = A - beta * B - alpha; t = Q.adf_t(e)
                if t > -3.34:
                    continue
                hl = Q.half_life(e)
                if not (2 <= hl <= 72):
                    continue
                cand.append((t, J[x], J[y], beta, alpha, hl, float(np.std(e))))
        cand.sort(); npair += len(cand)
        rk = RK[m]
        for t, ja, jb, beta, alpha, hl, sd0 in cand:
            sa, sb = keep[ja], keep[jb]
            pc = (Q.cost(rk.get(sa)) + beta * Q.cost(rk.get(sb))) / (1 + beta)
            A = LC[:b, ja]; B = LC[:b, jb]; OA = LO[:b, ja]; OB = LO[:b, jb]
            win = int(min(240, max(24, 5 * hl)))
            sp = A - beta * B
            mu = pd.Series(sp).rolling(win, min_periods=win).mean().values; sdf = pd.Series(sp).rolling(win, min_periods=win).std().values
            Zs = (sp - mu) / sdf
            Ek = np.full(b, np.nan); BK = np.full(b, np.nan)
            th = np.array([beta, alpha]); P = np.eye(2) * 1e-3; Vw = 1e-6 / (1 - 1e-6) * np.eye(2); Ve = sd0 ** 2
            for h in range(a - FORM, b):
                if not (np.isfinite(A[h]) and np.isfinite(B[h])):
                    continue
                xv = np.array([B[h], 1.0]); P = P + Vw
                Qv = xv @ P @ xv + Ve; err = A[h] - xv @ th
                Ek[h] = err; BK[h] = th[0]
                K = P @ xv / Qv; th = th + K * err; P = P - np.outer(K, xv) @ P
            sdk = pd.Series(Ek).rolling(win, min_periods=win // 2).std().shift(1).values
            Zk = Ek / sdk
            for mode, Z, SD in (("fix", Zs, sdf), ("kal", Zk, sdk)):
                for zin in (2.0, 2.8, 3.0):
                    for smin in (0.0, 0.008, 0.012, 0.015):
                        if zin == 2.0 and smin:          # bản đối chứng: ngưỡng cũ, không lọc σ
                            continue
                        for stp in (3.5, 4.5):
                            if stp <= zin + 0.3:
                                continue
                            pos = 0; h0 = 0; bet = beta; s0 = 0.0
                            for h in range(a, b - 1):
                                z = Z[h]
                                if not np.isfinite(z):
                                    continue
                                if pos == 0:
                                    if abs(z) > zin and abs(z) < stp and h < b - 24 and SD[h] > smin:
                                        pos = -1 if z > 0 else 1; h0 = h + 1; bet = beta if mode == "fix" else max(0.2, min(5.0, BK[h])); s0 = SD[h]
                                    continue
                                why = "X" if abs(z) < 0.5 else "SL" if abs(z) > stp else "T" if h + 1 - h0 >= max(24, int(10 * hl)) or h >= b - 2 else None
                                if why:
                                    h1 = h + 1; ra = OA[h1] - OA[h0]; rb = OB[h1] - OB[h0]
                                    if np.isfinite(ra) and np.isfinite(rb):
                                        g = pos * (ra - bet * rb) / (1 + bet) * 1e4
                                        fu = (Q.fund_bps(F, ja, pos, h0, h1) + bet * Q.fund_bps(F, jb, -pos, h0, h1)) / (1 + bet)
                                        out.append(dict(st="R1", p=f"{mode}|z{zin}|s{smin * 100:.1f}|st{stp}", s=f"{sa}/{sb}", side=pos, t=int(h0), t2=int(h1), g=round(g, 2), c=round(pc, 2), f=round(fu, 2), why=why, sd=round(s0 * 1e4, 1)))
                                    pos = 0
    log(f"  R1: {npair} cặp-tháng đạt (trong top 15) · {len(out)} lệnh mọi biến thể")
    return out


# ---------------------------------------------------------------------------- R2 · RSI(2) chỉ Long, coin lớn
def r2_rsi2(H0, n, keep, S, M, UNI, RK, F):
    out = []
    spans = {}          # mã → [(giờ đầu, giờ cuối, hạng, rổ)]
    for m in MONTHS[1:]:
        a, b = Q.month_hours(m)
        top10 = UNI[m][:10]
        for s in set(MAJ) | set(top10):
            if s not in S:
                continue
            rk = RK[m].get(s, 5)
            for basket, inb in (("MAJ", s in MAJ), ("T10", s in top10)):
                if inb:
                    spans.setdefault((s, basket), []).append((a - H0, b - H0, min(rk, 49)))
    for (s, basket), sp_ in spans.items():
        j = S[s]
        for tf in ("H1", "H4"):
            if tf == "H1":
                ch = np.arange(n); o, h, l, c = (M[f][:, j].astype(np.float64) for f in ("o", "h", "l", "c"))
            else:
                g = Q.agg4(M, j, H0, n)
                if g is None:
                    continue
                ch, o, h, l, c = g
            ok = np.isfinite(c) & np.isfinite(o)
            if ok.sum() < 300:
                continue
            cf_ = pd.Series(c).ffill().values
            e200 = Q.ema(cf_, 200); a14 = Q.adx(h, l, cf_, 14); r2 = Q.rsi(cf_, 2); e20 = Q.ema(cf_, 20); at20 = Q.atr(h, l, cf_, 20)
            s5 = pd.Series(cf_).rolling(5).mean().values; e10 = Q.ema(cf_, 10); at14 = Q.atr(h, l, cf_, 14)
            oh = ch - (3 if tf == "H4" else 0)
            base = ok & (cf_ > e200) & (r2 < 10)
            for ex in ("sma5", "ema10"):
                tgt = s5 if ex == "sma5" else e10
                for sl in (2.5, None):
                    X = {}
                    for i in np.flatnonzero(base):
                        if i + 2 >= len(c):
                            continue
                        hh = int(oh[i + 1]); spn = next(((a, b, r) for a, b, r in sp_ if a <= hh < b), None); e = o[i + 1]
                        if spn is None or not (e > 0):
                            continue
                        stp = e - sl * at14[i] if sl else None
                        x = None; why = "T"; k = i + 1
                        for k in range(i + 1, min(len(c) - 1, i + 1 + (240 if tf == "H1" else 60))):
                            if stp is not None and l[k] <= stp:
                                x = min(stp, o[k]); why = "SL"; break
                            if c[k] > tgt[k]:
                                k = k + 1; x = o[k]; why = "X"; break
                        if x is None:
                            x = o[k]
                        if not (x > 0):
                            continue
                        h1 = int(oh[k]) + (1 if why == "SL" else 0)
                        X[i] = (k, hh, h1, (x / e - 1) * 1e4, Q.cost(spn[2]), Q.fund_bps(F, j, 1, hh, h1), why)
                    for lvl in (5, 10):
                        for af in ("adx", "noadx"):
                            for kf in ("kel", "nokel"):
                                busy = -1
                                for i, (k, hh, h1, gb, cc, fu, why) in X.items():
                                    if i <= busy or not (r2[i] < lvl) or (af == "adx" and not a14[i] < 30) or (kf == "kel" and not cf_[i] < e20[i] - 2 * at20[i]):
                                        continue
                                    busy = k
                                    out.append(dict(st="R2", p=f"{basket}|{tf}|r{lvl}|{af}|{kf}|{ex}|sl{sl}", s=s, side=1, t=hh, t2=h1, g=round(gb, 2), c=round(cc, 2), f=round(fu, 2), why=why))
    log(f"  R2: {len(out)} lệnh mọi biến thể")
    return out


# ---------------------------------------------------------------------------- R3 · funding cực âm + giá trên SMA20 H4
def r3_funding(H0, n, keep, S, M, UNI, RK, F):
    out = []
    for m, L in UNI.items():
        a, b = Q.month_hours(m); a -= H0; b -= H0
        for s in L:
            j = S[s]; fj = F[:, j]
            T = np.flatnonzero(fj[max(0, a - 24 * 95):b] != 0) + max(0, a - 24 * 95)
            if len(T) < 100:
                continue
            fv = fj[T].astype(np.float64); o = M["o"][:, j]; c = M["c"][:, j]; l = M["l"][:, j]
            last = -10**9
            for q, t in enumerate(T):
                if t < a or t >= b - 1 or fv[q] >= 0:
                    continue
                hist = fv[(T >= t - 24 * 90) & (T < t)]
                if len(hist) < 150 or (hist < fv[q]).mean() > 0.05 or t - last < 24:
                    continue
                i = t + 1
                e = float(o[i]) if i < n else np.nan
                if not (e > 0):
                    continue
                last = t
                # nến H4 đã đóng gần nhất trước lúc vào: giờ cuối e4 thoả (giờ tuyệt đối + 1) chia hết cho 4
                e4 = i - 1
                while e4 >= 0 and (e4 + 1 + H0) % 4:
                    e4 -= 1
                cl4 = np.array([c[e4 - 4 * k] for k in range(20)]) if e4 - 76 >= 0 else None
                sma = float(np.mean(cl4)) if cl4 is not None and np.isfinite(cl4).all() else np.nan
                above = bool(np.isfinite(sma) and c[e4] > sma)
                r8 = float(c[t] / c[t - 8] - 1) if t >= 8 and c[t - 8] > 0 else np.nan
                ab = bool(np.isfinite(r8) and r8 >= 0)
                for flt, okf in (("none", True), ("sma20", above), ("abs", ab), ("sma20+abs", above and ab)):
                    if not okf:
                        continue
                    for hold in (8, 24, 72):
                        for sl in (0.05, None):
                            x = None; why = "T"
                            for k in range(i, min(n - 1, i + hold)):
                                if sl and l[k] > 0 and l[k] <= e * (1 - sl):
                                    x = min(e * (1 - sl), float(o[k])); why = "SL"; break
                            k2 = min(n - 1, i + hold)
                            if x is None:
                                x = float(o[k2])
                            if not (x > 0):
                                continue
                            out.append(dict(st="R3", p=f"h{hold}|sl{sl}|{flt}", s=s, side=1, t=int(i), t2=int(k2), g=round((x / e - 1) * 1e4, 2), c=round(Q.cost(RK[m][s]), 2),
                                            f=round(Q.fund_bps(F, j, 1, i, k2), 2), why=why))
    log(f"  R3: {len(out)} lệnh mọi biến thể")
    return out


# ---------------------------------------------------------------------------- báo cáo thêm: riêng 2025–2026, các biến thể anh đề xuất
def yr(df, H0):
    return np.array([pd.Timestamp((t + H0) * 3_600_000_000_000).year for t in df.t])


def line(x, H0, label):
    s = Q.stats(x, H0, label)
    if not s.get("n"):
        return f"    {label}: không có lệnh"
    return (f"    {label}: {s['n']} lệnh ({s['per_yr']:.0f}/năm) · thắng {s['win']}% · TB ròng {s['mean']:+.1f} bps (gộp {s['gross']:+.1f} − phí {s['cost']:.1f} + funding {s['fund']:+.1f})"
            f" · trung vị {s['med']:+.1f} · t {s['t']:+.2f} · 10%/lệnh ≈ {s['ret10']:+.1f}%/năm, sụt {s['dd10']:.1f}% · {s['years']}")


def extra(rows, H0, focus, oos):
    df = pd.DataFrame(rows); df["net"] = df.g - df.c + df.f; df["y"] = yr(df, H0)
    txt = ["  ▸ Biến thể anh đề xuất / so sánh (toàn giai đoạn · riêng 2025–2026):"]
    for p in focus:
        x = df[df.p == p]
        txt.append(line(x, H0, f"{p} – toàn bộ")); txt.append(line(x[x.y >= 2025], H0, f"{p} – 2025–26"))
    if len(oos):
        o = oos.copy(); o["y"] = yr(o, H0)
        txt.append(line(o[o.y >= 2025], H0, "WALK-FORWARD ngoài mẫu – riêng 2025–26"))
    g = df[df.y >= 2025].groupby("p").net.agg(["count", "mean", lambda v: (v > 0).mean() * 100])
    g.columns = ["n", "mean", "win"]; g = g[g.n >= 30].sort_values("mean", ascending=False).head(8)
    txt.append("  ▸ 8 biến thể tốt nhất RIÊNG 2025–26 (tham khảo, có thiên lệch chọn): " + " | ".join(f"{p} {int(r.n)} lệnh {r['mean']:+.1f} bps thắng {r.win:.0f}%" for p, r in g.iterrows()))
    return "\n".join(txt)


if __name__ == "__main__":
    t00 = time.time()
    syms = E.list_symbols()
    log(f"{len(syms)} mã · {MONTHS[0]} → {MONTHS[-1]}")
    H0, n, keep, S, M, UNI, RK = Q.build(syms)
    F = Q.load_funding(keep, H0, n)
    res, txt = {}, [f"TINH LỌC 3 phương pháp · {MONTHS[0]} → {MONTHS[-1]} · {time.strftime('%Y-%m-%d %H:%M')} UTC"]
    jobs = [("R1 · Cặp coin O-U – top 15, |Z| > 2,8, σ spread > 1,2%", r1_pairs, "fix|z2.8|s1.2|st3.5",
             ["fix|z2.8|s1.2|st3.5", "fix|z2.8|s1.2|st4.5", "kal|z2.8|s1.2|st3.5", "kal|z2.8|s1.2|st4.5", "fix|z3.0|s1.2|st4.5", "fix|z2.0|s0.0|st3.5", "kal|z2.0|s0.0|st3.5"]),
            ("R2 · RSI(2) chỉ Long – coin lớn", r2_rsi2, "MAJ|H1|r5|noadx|nokel|sma5|slNone",
             ["MAJ|H1|r5|noadx|nokel|sma5|slNone", "MAJ|H4|r5|noadx|nokel|sma5|slNone", "MAJ|H1|r5|adx|kel|sma5|slNone", "MAJ|H1|r5|noadx|nokel|ema10|slNone", "MAJ|H1|r5|noadx|nokel|sma5|sl2.5",
              "T10|H1|r5|noadx|nokel|sma5|slNone", "T10|H4|r5|noadx|nokel|sma5|slNone"]),
            ("R3 · Funding cực âm → Long + giá trên SMA20 H4", r3_funding, "h24|slNone|sma20",
             ["h24|slNone|sma20", "h72|slNone|sma20", "h8|slNone|sma20", "h24|sl0.05|sma20", "h24|slNone|sma20+abs", "h24|slNone|none", "h72|slNone|abs"])]
    for name, fn, dflt, focus in jobs:
        t1 = time.time()
        try:
            rows = fn(H0, n, keep, S, M, UNI, RK, F)
            r, tx = Q.report(name, rows, H0, dflt)
            df = pd.DataFrame(rows); df["net"] = df.g - df.c + df.f
            oos, _ = Q.wf(df, H0, default=dflt)
            tx += "\n" + extra(rows, H0, focus, oos)
        except Exception as e:  # noqa: BLE001
            import traceback
            log(f"LỖI {name}: {e}\n{traceback.format_exc()}"); continue
        res[name] = r; txt.append(tx); log(tx); log(f"  ({time.time() - t1:.0f}s)")
        with gzip.open(os.path.join(E.OUT, f"q6r_{fn.__name__}.json.gz"), "wt") as f:
            json.dump(rows, f, separators=(",", ":"))
    with open(os.path.join(E.OUT, "quant6r.txt"), "w") as f:
        f.write("\n".join(txt))
    with open(os.path.join(E.OUT, "quant6r.json"), "w") as f:
        json.dump(res, f, ensure_ascii=False, default=str)
    log(f"xong · {time.time() - t00:.0f}s")
