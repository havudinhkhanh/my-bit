"""6 PHƯƠNG PHÁP ĐỊNH LƯỢNG (anh Jason đưa) – phần A: các phương pháp chạy trên nến 1 GIỜ, dữ liệu 01/2022 → tháng trước.
  P1  Cặp coin Ornstein-Uhlenbeck (pairs): mỗi tháng chọn cặp đồng tích hợp (Engle-Granger/ADF), chu kỳ bán rã 2–72 giờ,
      vào khi |Z| > ngưỡng, chốt |Z| < 0,5, cắt |Z| > 3,5 (2 bản: hệ số phòng vệ cố định theo tháng chọn cặp / Kalman cập nhật liên tục)
  P2  Connors RSI(2) pullback: H1 và H4, giá > EMA200, ADX14 < 30, RSI2 < 10 (hoặc 5), đóng dưới Keltner(20, 2 ATR) → Long; thoát đóng cửa > SMA5 / EMA10
  P3  Funding đảo chiều: funding rơi vào 5% thấp nhất của chính coin đó trong 90 ngày (và âm) → Long (bản có lọc "giá không giảm thêm")
      – phần có Open Interest nằm ở quant6b.py (dữ liệu OI chỉ tải được 12 tháng)
  P4  Toby Crabel ORB + NR7: hôm qua là ngày hẹp nhất 7 ngày (hoặc độ rộng Bollinger thấp nhất 30 ngày) → đặt chờ mua O+Stretch / bán O−Stretch,
      chốt 0,5–1 ATR, cắt ở phía đối diện, hết ngày đóng
NGUYÊN TẮC (guardrails): trừ phí taker + chênh lệch + trượt giá mỗi vòng (≥ 14 bps, coin nhỏ ~19 bps; cặp coin trừ cả 2 chân) + funding thật khi giữ qua kỳ chốt;
chỉ dùng nến ĐÃ ĐÓNG, vào ở giá MỞ nến kế tiếp; khớp lệnh chờ / chốt / cắt trong cùng 1 nến → tính trường hợp XẤU;
vũ trụ coin mỗi tháng = 100 mã khối lượng lớn nhất THÁNG TRƯỚC, kể cả mã đã huỷ niêm yết (không thiên lệch sống sót);
WALK-FORWARD: chọn tham số trên 6 tháng (trong mẫu) → chạy mù 2 tháng kế tiếp (ngoài mẫu), trượt dần; chỉ báo cáo phần NGOÀI MẪU.
Chạy: research.yml script=quant6a.py nsym=2000"""
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
os.environ.setdefault("RS_LOG", "quant6a.log")
os.environ.setdefault("RS_START", "2022-01")
import events as E  # noqa: E402
import round10 as R  # noqa: E402

log = E.log
TOPN = int(os.environ.get("Q_TOPN", "100"))
MONTHS = R.MONTHS


# ---------------------------------------------------------------------------- dữ liệu → ma trận giờ × mã
def month_hours(m):
    y, mo = map(int, m.split("-"))
    a = int(pd.Timestamp(year=y, month=mo, day=1).value // 3_600_000_000_000)
    b = int((pd.Timestamp(year=y, month=mo, day=1) + pd.offsets.MonthBegin(1)).value // 3_600_000_000_000)
    return a, b


def build(syms):
    H0, H1 = month_hours(MONTHS[0])[0], month_hours(MONTHS[-1])[1]
    n = H1 - H0
    t0 = time.time()
    MB = [month_hours(m) for m in MONTHS]

    def mvol(s):
        d = R.load1h(s)
        if d is None or d.c.notna().sum() < 24 * 30:
            return s, None
        idx = d.index.values; q = d.qv.values
        return s, {m: float(np.nansum(q[(idx >= a) & (idx < b)])) for m, (a, b) in zip(MONTHS, MB) if ((idx >= a) & (idx < b)).any()}
    MV = {}
    with cf.ThreadPoolExecutor(32) as ex:
        for k, (s, v) in enumerate(ex.map(mvol, syms)):
            for m, q in (v or {}).items():
                MV.setdefault(m, {})[s] = q
            if k % 200 == 0:
                log(f"  nến 1 giờ {k}/{len(syms)} mã · {time.time() - t0:.0f}s")
    UNI = {}
    for j, m in enumerate(MONTHS):
        if j == 0:
            continue
        prev = MV.get(MONTHS[j - 1], {})
        UNI[m] = [s for s, _ in sorted(prev.items(), key=lambda x: -x[1])[:TOPN]]
    keep = sorted({s for L in UNI.values() for s in L} | {"BTCUSDT"})
    S = {s: i for i, s in enumerate(keep)}
    M = {f: np.full((n, len(keep)), np.nan, dtype=np.float32) for f in ("o", "h", "l", "c", "qv")}
    for s in keep:
        d = R.load1h(s)
        if d is None:
            continue
        idx = d.index.values.astype(np.int64) - H0
        ok = (idx >= 0) & (idx < n)
        for f in M:
            M[f][idx[ok], S[s]] = d[f].values[ok]
    RK = {}      # hạng khối lượng tháng trước (để tính chi phí)
    for m, L in UNI.items():
        RK[m] = {s: r for r, s in enumerate(L)}
    log(f"ma trận {n} giờ × {len(keep)} mã (hợp của các vũ trụ tháng) · {time.time() - t0:.0f}s")
    return H0, n, keep, S, M, UNI, RK


def load_funding(keep, H0, n):
    jobs = [(s, m) for s in keep for m in MONTHS]
    F = np.zeros((n, len(keep)), dtype=np.float32)
    FS = {}      # mã → [(giờ tương đối, tỉ lệ)]
    with cf.ThreadPoolExecutor(64) as ex:
        for (s, m), v in zip(jobs, ex.map(lambda j: R.fund_month(*j), jobs)):
            if v:
                FS.setdefault(s, []).extend(v)
    j = {s: i for i, s in enumerate(keep)}
    for s, L in FS.items():
        for T, f in sorted(set(L)):
            h = T - H0
            if 0 <= h < n:
                F[h, j[s]] = f / 1e6      # tỉ lệ (vd 0,0001 = 0,01%)
    log(f"funding: {len(FS)} mã")
    return F


# ---------------------------------------------------------------------------- tiện ích
def month_of(h, H0):
    return pd.Timestamp((h + H0) * 3_600_000_000_000).strftime("%Y-%m")


def cost(rank):
    return E.cost_of("", 999 if rank is None else rank)


def fund_bps(F, j, side, h1, h2):
    """funding nhận/trả (bps của giá trị lệnh) khi giữ từ giá mở giờ h1 tới giá mở giờ h2 (kỳ chốt trong [h1, h2))"""
    if h2 <= h1:
        return 0.0
    return float(-side * np.nansum(F[h1:h2, j]) * 1e4)


def ema(x, n):
    return pd.Series(x).ewm(span=n, adjust=False, min_periods=n).mean().values


def wilder(x, n):
    return pd.Series(x).ewm(alpha=1 / n, adjust=False, min_periods=n).mean().values


def rsi(c, n):
    d = np.diff(c, prepend=np.nan)
    up = wilder(np.where(d > 0, d, 0.0), n); dn = wilder(np.where(d < 0, -d, 0.0), n)
    with np.errstate(divide="ignore", invalid="ignore"):
        rs = up / dn
    return np.where(dn == 0, 100.0, 100 - 100 / (1 + rs))


def atr(h, l, c, n):
    pc = np.roll(c, 1); pc[0] = np.nan
    tr = np.nanmax(np.vstack([h - l, np.abs(h - pc), np.abs(l - pc)]), axis=0)
    return wilder(tr, n)


def adx(h, l, c, n):
    up = np.diff(h, prepend=np.nan); dn = -np.diff(l, prepend=np.nan)
    pdm = np.where((up > dn) & (up > 0), up, 0.0); mdm = np.where((dn > up) & (dn > 0), dn, 0.0)
    a = atr(h, l, c, n)
    with np.errstate(divide="ignore", invalid="ignore"):
        pdi = 100 * wilder(pdm, n) / a; mdi = 100 * wilder(mdm, n) / a
        dx = 100 * np.abs(pdi - mdi) / (pdi + mdi)
    return wilder(np.nan_to_num(dx, nan=0.0), n)


# ---------------------------------------------------------------------------- P1 · cặp coin O-U
def adf_t(x):
    """thống kê t của ADF (1 trễ, có hằng số) – Engle-Granger 2 biến: < −3,34 ≈ 5%"""
    dx = np.diff(x); y = dx[1:]; X = np.column_stack([np.ones(len(y)), x[1:-1], dx[:-1]])
    try:
        b, res, *_ = np.linalg.lstsq(X, y, rcond=None)
        e = y - X @ b; s2 = e @ e / (len(y) - 3); cov = s2 * np.linalg.inv(X.T @ X)
        return b[1] / math.sqrt(cov[1, 1])
    except Exception:  # noqa: BLE001
        return 0.0


def half_life(x):
    y = np.diff(x); X = np.column_stack([np.ones(len(y)), x[:-1]])
    b = np.linalg.lstsq(X, y, rcond=None)[0][1]
    return -math.log(2) / math.log(1 + b) if -1 < b < 0 else 1e9


def p1_pairs(H0, n, keep, S, M, UNI, RK, F):
    out = []
    LC = np.log(M["c"].astype(np.float64)); LO = np.log(M["o"].astype(np.float64))
    FORM = 24 * 30
    for m in MONTHS[1:]:
        a, b = month_hours(m); a -= H0; b -= H0
        if a < FORM or b > n:
            continue
        U = [s for s in UNI[m][:60] if s in S]
        J = [S[s] for s in U]
        W = LC[a - FORM:a][:, J]
        okc = np.isfinite(W).all(axis=0)
        J = [j for j, k in zip(J, okc) if k]
        if len(J) < 10:
            continue
        W = LC[a - FORM:a][:, J]; R1 = np.diff(W, axis=0)
        C = np.corrcoef(R1.T)
        cand = []
        for x in range(len(J)):
            for y in range(x + 1, len(J)):
                if C[x, y] < 0.75:
                    continue
                A, B = W[:, x], W[:, y]
                beta, alpha = np.polyfit(B, A, 1)
                if not (0.2 < beta < 5):
                    continue
                e = A - beta * B - alpha
                t = adf_t(e)
                if t > -3.34:
                    continue
                hl = half_life(e)
                if not (2 <= hl <= 72):
                    continue
                cand.append((t, J[x], J[y], beta, alpha, hl, float(np.std(e))))
        cand.sort()
        rk = RK[m]
        for t, ja, jb, beta, alpha, hl, sd0 in cand[:20]:
            sa, sb = keep[ja], keep[jb]
            ca, cb = cost(rk.get(sa)), cost(rk.get(sb))
            pc = (ca + beta * cb) / (1 + beta)          # chi phí khứ hồi theo tổng giá trị 2 chân
            A = LC[:b, ja]; B = LC[:b, jb]; OA = LO[:b, ja]; OB = LO[:b, jb]
            win = int(min(240, max(24, 5 * hl)))
            # bản cố định: spread theo β tháng chọn cặp, trung bình / độ lệch trượt (win giờ, nến đã đóng)
            sp = A - beta * B
            mu = pd.Series(sp).rolling(win, min_periods=win).mean().values; sd = pd.Series(sp).rolling(win, min_periods=win).std().values
            Zs = (sp - mu) / sd
            # bản Kalman: β, α cập nhật mỗi giờ (delta 1e-6, chậm), Z = sai số dự báo / độ lệch chuẩn trượt của chính sai số đó (win giờ TRƯỚC)
            Ek = np.full(b, np.nan); BK = np.full(b, np.nan)
            th = np.array([beta, alpha]); P = np.eye(2) * 1e-3; Vw = 1e-6 / (1 - 1e-6) * np.eye(2); Ve = sd0 ** 2
            for h in range(a - FORM, b):
                if not (np.isfinite(A[h]) and np.isfinite(B[h])):
                    continue
                x = np.array([B[h], 1.0]); P = P + Vw
                yh = x @ th; Q = x @ P @ x + Ve; err = A[h] - yh
                Ek[h] = err; BK[h] = th[0]
                K = P @ x / Q; th = th + K * err; P = P - np.outer(K, x) @ P
            Zk = Ek / pd.Series(Ek).rolling(win, min_periods=win // 2).std().shift(1).values
            for mode, Z in (("fix", Zs), ("kal", Zk)):
                for zin in (1.5, 2.0, 2.5):
                    pos = 0; h0 = 0; bet = beta
                    for h in range(a, b - 1):
                        z = Z[h]
                        if not np.isfinite(z):
                            continue
                        if pos == 0:
                            if abs(z) > zin and abs(z) < 3.5 and h < b - 24:
                                pos = -1 if z > 0 else 1; h0 = h + 1; bet = beta if mode == "fix" else max(0.2, min(5.0, BK[h]))
                            continue
                        why = "X" if abs(z) < 0.5 else "SL" if abs(z) > 3.5 else "T" if h + 1 - h0 >= max(24, int(10 * hl)) or h >= b - 2 else None
                        if why:
                            h1 = h + 1
                            ra = OA[h1] - OA[h0]; rb = OB[h1] - OB[h0]
                            if not (np.isfinite(ra) and np.isfinite(rb)):
                                pos = 0; continue
                            g = pos * (ra - bet * rb) / (1 + bet) * 1e4
                            fu = (fund_bps(F, ja, pos, h0, h1) + bet * fund_bps(F, jb, -pos, h0, h1)) / (1 + bet)
                            out.append(dict(st="P1", p=f"{mode}|z{zin}", s=f"{sa}/{sb}", side=pos, t=int(h0), t2=int(h1), g=round(g, 2), c=round(pc, 2), f=round(fu, 2), why=why))
                            pos = 0
        log(f"  P1 {m}: {len(cand)} cặp đạt, dùng {min(20, len(cand))} · {len(out)} lệnh")
    return out


# ---------------------------------------------------------------------------- P2 · Connors RSI(2)
def agg4(M, j, H0, n):
    """nến 4 giờ (mốc 00/04/08/... UTC) từ nến 1 giờ của mã j → (chỉ số giờ ĐÓNG của nến 4h, o, h, l, c)"""
    st = (4 - (H0 % 4)) % 4
    k = (n - st) // 4
    if k < 10:
        return None
    sl = slice(st, st + 4 * k)
    o = M["o"][sl, j].reshape(k, 4)[:, 0].astype(np.float64); c = M["c"][sl, j].reshape(k, 4)[:, 3].astype(np.float64)
    h = np.nanmax(M["h"][sl, j].reshape(k, 4), axis=1).astype(np.float64); l = np.nanmin(M["l"][sl, j].reshape(k, 4), axis=1).astype(np.float64)
    close_h = st + 4 * np.arange(k) + 3
    return close_h, o, h, l, c


def p2_rsi2(H0, n, keep, S, M, UNI, RK, F):
    out = []
    inuni = {}
    for m, L in UNI.items():
        a, b = month_hours(m)
        for s in L:
            inuni.setdefault(s, []).append((a - H0, b - H0, RK[m][s]))
    for s, spans in inuni.items():
        j = S[s]
        for tf in ("H1", "H4"):
            if tf == "H1":
                ch = np.arange(n); o = M["o"][:, j].astype(np.float64); h = M["h"][:, j].astype(np.float64); l = M["l"][:, j].astype(np.float64); c = M["c"][:, j].astype(np.float64)
            else:
                g = agg4(M, j, H0, n)
                if g is None:
                    continue
                ch, o, h, l, c = g
            ok = np.isfinite(c) & np.isfinite(o)
            if ok.sum() < 300:
                continue
            cf_ = pd.Series(c).ffill().values
            e200 = ema(cf_, 200); a14 = adx(h, l, cf_, 14); r2 = rsi(cf_, 2); e20 = ema(cf_, 20); at20 = atr(h, l, cf_, 20)
            s5 = pd.Series(cf_).rolling(5).mean().values; e10 = ema(cf_, 10); at14 = atr(h, l, cf_, 14)
            kel = e20 - 2 * at20
            oh = ch - (3 if tf == "H4" else 0)          # giờ MỞ của từng nến
            for side in (1, -1):
                trend = (cf_ > e200) if side > 0 else (cf_ < e200)
                band = (cf_ < kel) if side > 0 else (cf_ > e20 + 2 * at20)
                base = ok & trend & (a14 < 30) & ((r2 < 10) if side > 0 else (r2 > 90))
                for ex in ("sma5", "ema10"):
                    tgt = s5 if ex == "sma5" else e10
                    for sl in (2.5, None):
                        X = {}
                        for i in np.flatnonzero(base):
                            if i + 2 >= len(c):
                                continue
                            hh = int(oh[i + 1])
                            sp = next(((a, b, r) for a, b, r in spans if a <= hh < b), None)
                            e = o[i + 1]
                            if sp is None or not (e > 0):
                                continue
                            stp = e - side * sl * at14[i] if sl else None
                            x = None; why = "T"; k = i + 1
                            for k in range(i + 1, min(len(c) - 1, i + 1 + (240 if tf == "H1" else 60))):
                                if stp is not None and ((side > 0 and l[k] <= stp) or (side < 0 and h[k] >= stp)):
                                    x = min(stp, o[k]) if side > 0 else max(stp, o[k]); why = "SL"; break
                                if (side > 0 and c[k] > tgt[k]) or (side < 0 and c[k] < tgt[k]):
                                    k = k + 1; x = o[k]; why = "X"; break
                            if x is None:
                                x = o[k]
                            if not (x > 0):
                                continue
                            h1 = int(oh[k]) + (1 if why == "SL" else 0)
                            X[i] = (k, hh, h1, side * (x / e - 1) * 1e4, cost(sp[2]), fund_bps(F, j, side, hh, h1), why)
                        for lvl in (10, 5):
                            for kf in ("kel", "nokel"):
                                busy = -1
                                for i, (k, hh, h1, gb, cc, fu, why) in X.items():
                                    if i <= busy or not ((r2[i] < lvl) if side > 0 else (r2[i] > 100 - lvl)) or (kf == "kel" and not band[i]):
                                        continue
                                    busy = k
                                    out.append(dict(st="P2", p=f"{tf}|{'L' if side > 0 else 'S'}|r{lvl}|{kf}|{ex}|sl{sl}", s=s, side=side, t=hh, t2=h1, g=round(gb, 2), c=round(cc, 2), f=round(fu, 2), why=why))
    log(f"  P2: {len(out)} lệnh (mọi biến thể)")
    return out


# ---------------------------------------------------------------------------- P3 · funding đảo chiều (không OI)
def p3_funding(H0, n, keep, S, M, UNI, RK, F):
    out = []
    for m, L in UNI.items():
        a, b = month_hours(m); a -= H0; b -= H0
        for s in L:
            j = S[s]
            fj = F[:, j]
            T = np.flatnonzero(fj[max(0, a - 24 * 95):b] != 0) + max(0, a - 24 * 95)
            if len(T) < 100:
                continue
            fv = fj[T].astype(np.float64)
            o = M["o"][:, j]; c = M["c"][:, j]; h = M["h"][:, j]; l = M["l"][:, j]
            last = -10**9
            for q, t in enumerate(T):
                if t < a or t >= b - 1:
                    continue
                hist = fv[(T >= t - 24 * 90) & (T < t)]
                if len(hist) < 150 or fv[q] >= 0:
                    continue
                pct = (hist < fv[q]).mean()
                if pct > 0.05:
                    continue
                if t - last < 24:
                    continue
                last = t
                i = t + 1
                e = float(o[i]) if i < n else np.nan
                if not (e > 0):
                    continue
                r8 = float(c[t] / c[t - 8] - 1) if t >= 8 and c[t - 8] > 0 else np.nan      # c[t]: nến đã đóng ngay lúc chốt (giờ t kết thúc lúc t+1)
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
                        out.append(dict(st="P3", p=f"h{hold}|sl{sl}|{'abs' if r8 >= 0 else 'fall'}", s=s, side=1, t=int(i), t2=int(k2), g=round((x / e - 1) * 1e4, 2),
                                        c=round(cost(RK[m][s]), 2), f=round(fund_bps(F, j, 1, i, k2), 2), why=why, fr=round(float(fv[q]) * 1e4, 2), r8=round(r8 * 1e4, 1) if np.isfinite(r8) else None))
    log(f"  P3: {len(out)} lệnh")
    return out


# ---------------------------------------------------------------------------- P4 · ORB + NR7
def p4_orb(H0, n, keep, S, M, UNI, RK, F):
    out = []
    st = (24 - (H0 % 24)) % 24          # giờ đầu tiên là 00:00 UTC
    nd = (n - st) // 24
    inuni = {}
    for m, Lm in UNI.items():
        a, b = month_hours(m)
        for s in Lm:
            inuni.setdefault(s, []).append((a - H0, b - H0, RK[m][s]))
    sl_ = slice(st, st + 24 * nd)
    for s, spans in inuni.items():
        j = S[s]
        O = M["o"][sl_, j].reshape(nd, 24).astype(np.float64); Hh = M["h"][sl_, j].reshape(nd, 24).astype(np.float64)
        Ll = M["l"][sl_, j].reshape(nd, 24).astype(np.float64); Cc = M["c"][sl_, j].reshape(nd, 24).astype(np.float64)
        with np.errstate(all="ignore"), __import__("warnings").catch_warnings():
            __import__("warnings").simplefilter("ignore")
            do, dh, dl, dc = O[:, 0], np.nanmax(Hh, axis=1), np.nanmin(Ll, axis=1), Cc[:, -1]
            rng = dh - dl
            nr7 = rng <= pd.Series(rng).rolling(7, min_periods=7).min().values
            bw = (pd.Series(dc).rolling(20).std() * 4 / pd.Series(dc).rolling(20).mean()).values
            bwlow = bw <= pd.Series(bw).rolling(30, min_periods=30).min().values
            stretch = pd.Series(np.minimum(dh - do, do - dl)).rolling(10, min_periods=10).mean().values
            pc = np.roll(dc, 1); pc[0] = np.nan
            tr = np.nanmax(np.vstack([dh - dl, np.abs(dh - pc), np.abs(dl - pc)]), axis=0)
            a14 = wilder(tr, 14)
        for a, b, rkk in spans:
            for d in range(max(31, (a - st) // 24), min(nd, (b - st) // 24)):
                p = d - 1
                if not (stretch[p] > 0 and a14[p] > 0 and do[d] > 0 and np.isfinite(Hh[d]).all()):
                    continue
                for flt, sel in (("nr7", nr7[p]), ("bb30", bwlow[p]), ("both", nr7[p] and bwlow[p])):
                    if not sel:
                        continue
                    up, dn = do[d] + stretch[p], do[d] - stretch[p]
                    side = 0; e = None; hi0 = 0
                    for hr in range(24):
                        hit_u, hit_d = Hh[d, hr] >= up, Ll[d, hr] <= dn
                        if hit_u and hit_d:
                            side = 9; hi0 = hr; break          # cùng 1 giờ chạm cả 2 mức → không biết thứ tự: tính kiểu xấu
                        if hit_u or hit_d:
                            side = 1 if hit_u else -1; e = max(up, O[d, hr]) if hit_u else min(dn, O[d, hr]); hi0 = hr; break
                    if side == 0:
                        continue
                    h0 = st + 24 * d + hi0
                    for tp in (0.5, 1.0):
                        if side == 9:
                            out.append(dict(st="P4", p=f"{flt}|tp{tp}", s=s, side=1, t=int(h0), t2=int(h0 + 1), g=round(-2 * stretch[p] / do[d] * 1e4, 2), c=round(cost(rkk) + 2, 2), f=0.0, why="AMB"))
                            continue
                        tgt = e + side * tp * a14[p]; stp = dn if side > 0 else up
                        x = None; why = "T"
                        for hr in range(hi0, 24):          # nến vào lệnh cũng xét: chạm cả cắt & chốt → tính cắt
                            sl_hit = (Ll[d, hr] <= stp) if side > 0 else (Hh[d, hr] >= stp)
                            tp_hit = (Hh[d, hr] >= tgt) if side > 0 else (Ll[d, hr] <= tgt)
                            if sl_hit:
                                x = stp; why = "SL"; break
                            if tp_hit:
                                x = tgt; why = "TP"; break
                        if x is None:
                            x = Cc[d, -1]
                        # lệnh chờ dừng khớp kiểu taker: +2 bps trượt
                        out.append(dict(st="P4", p=f"{flt}|tp{tp}", s=s, side=side, t=int(h0), t2=int(st + 24 * d + 24), g=round(side * (x / e - 1) * 1e4, 2), c=round(cost(rkk) + 2, 2),
                                        f=round(fund_bps(F, j, side, h0 + 1, st + 24 * d + 24), 2), why=why))
    log(f"  P4: {len(out)} lệnh")
    return out


# ---------------------------------------------------------------------------- walk-forward + báo cáo
def mi(t, H0):
    ts = pd.Timestamp((t + H0) * 3_600_000_000_000)
    return (ts.year - int(MONTHS[0][:4])) * 12 + ts.month - int(MONTHS[0][5:])


def wf(df, H0, minn=30, default=None):
    """chọn biến thể tốt nhất (TB lãi ròng/lệnh) trên 6 tháng → chạy mù 2 tháng kế tiếp; trả (lệnh ngoài mẫu, lựa chọn mỗi cửa sổ)"""
    df = df.copy(); df["m"] = [mi(t, H0) for t in df.t]
    df["net"] = df.g - df.c + df.f
    OO, picks = [], []
    M = len(MONTHS)
    for k in range(7, M, 2):
        IS = df[(df.m >= k - 6) & (df.m < k)]; OS = df[(df.m >= k) & (df.m < k + 2)]
        g = IS.groupby("p").net.agg(["mean", "count"])
        g = g[g["count"] >= minn]
        few = False
        if len(g):
            best = g["mean"].idxmax(); bm = float(g.loc[best, "mean"])
        else:          # mẫu trong 6 tháng quá ít để chọn → dùng tham số gốc của phương pháp, vẫn đánh (chưa có bằng chứng ngược lại)
            best, few = default, True
            d0 = IS[IS.p == default]; bm = float(d0.net.mean()) if len(d0) >= 10 else 1.0
        picks.append(dict(win=f"{MONTHS[k - 6]}..{MONTHS[k - 1]} → {MONTHS[k]}{'..' + MONTHS[min(M - 1, k + 1)] if k + 1 < M else ''}", pick=best, is_mean=round(bm, 1),
                          is_n=int(g.loc[best, "count"]) if best in g.index else int((IS.p == default).sum()), trade=bool(bm > 0), few=few))
        if best is not None and bm > 0:          # trong mẫu còn lỗ sau phí → cửa sổ đó KHÔNG đánh
            OO.append(OS[OS.p == best])
    return (pd.concat(OO) if OO else df.iloc[:0]), picks


def stats(x, H0, label):
    if not len(x):
        return dict(label=label, n=0)
    x = x.sort_values("t")
    net = x.net.values
    day = (x.t.values + H0) // 24
    dsum = pd.Series(net).groupby(day).sum()
    tstat = float(dsum.mean() / (dsum.std(ddof=1) / math.sqrt(len(dsum)))) if len(dsum) > 2 and dsum.std(ddof=1) > 0 else 0.0
    eq = np.cumsum(net * 0.1) / 1e4          # mỗi lệnh 10% vốn (cộng dồn, không lãi kép)
    dd = float(np.max(np.maximum.accumulate(np.concatenate([[0], eq])) - np.concatenate([[0], eq])))
    yrs = max(1 / 12, (x.t.max() - x.t.min()) / 24 / 365)
    by = x.assign(y=[pd.Timestamp((t + H0) * 3_600_000_000_000).year for t in x.t]).groupby("y").net.agg(["count", "mean"])
    return dict(label=label, n=int(len(x)), per_yr=round(len(x) / yrs, 0), win=round(float((net > 0).mean() * 100), 1), win_gross=round(float((x.g.values > 0).mean() * 100), 1),
                mean=round(float(net.mean()), 1), med=round(float(np.median(net)), 1), gross=round(float(x.g.mean()), 1), cost=round(float(x.c.mean()), 1), fund=round(float(x.f.mean()), 1),
                t=round(tstat, 2), ret10=round(float(eq[-1] * 100 / yrs), 1), dd10=round(dd * 100, 1),
                years={int(y): [int(r["count"]), round(float(r["mean"]), 1)] for y, r in by.iterrows()})


def report(name, rows, H0, default, note=""):
    df = pd.DataFrame(rows)
    if not len(df):
        return dict(name=name, note="không có lệnh"), ""
    df["net"] = df.g - df.c + df.f
    full = df.groupby("p").apply(lambda g: pd.Series(dict(n=len(g), win=round((g.net > 0).mean() * 100, 1), mean=round(g.net.mean(), 1), gross=round(g.g.mean(), 1))), include_groups=False).sort_values("mean", ascending=False)
    oos, picks = wf(df, H0, default=default)
    sd = stats(df[df.p == default].assign(net=lambda z: z.g - z.c + z.f), H0, f"mặc định ({default}), toàn giai đoạn") if default in set(df.p) else dict(n=0)
    so = stats(oos, H0, "WALK-FORWARD ngoài mẫu")
    txt = [f"\n==================== {name}", note]
    for s_ in (sd, so):
        if s_.get("n"):
            txt.append(f"  {s_['label']}: {s_['n']} lệnh ({s_['per_yr']:.0f}/năm) · thắng {s_['win']}% (trước phí {s_['win_gross']}%) · TB ròng {s_['mean']:+.1f} bps/lệnh "
                       f"(gộp {s_['gross']:+.1f} − phí {s_['cost']:.1f} + funding {s_['fund']:+.1f}) · trung vị {s_['med']:+.1f} · t {s_['t']:+.2f} · mỗi lệnh 10% vốn ≈ {s_['ret10']:+.1f}%/năm, sụt {s_['dd10']:.1f}% · theo năm {s_['years']}")
        else:
            txt.append(f"  {s_.get('label', '?')}: không có lệnh")
    txt.append("  10 biến thể tốt nhất (toàn giai đoạn, CHỈ để tham khảo – có thiên lệch chọn):")
    for p, r in full.head(10).iterrows():
        txt.append(f"    {p:<42} {int(r.n):>6} lệnh · thắng {r.win:>5.1f}% · TB ròng {r['mean']:+7.1f} · gộp {r.gross:+7.1f}")
    txt.append("  Lựa chọn từng cửa sổ: " + " | ".join(f"{p['win']}: {p['pick']} ({p['is_mean']}, {p['is_n']} lệnh{', mẫu ít → tham số gốc' if p.get('few') else ''}){'' if p['trade'] else ' – KHÔNG ĐÁNH'}" for p in picks[-8:]))
    return dict(name=name, default=sd, wf=so, picks=picks, top=full.head(15).reset_index().to_dict("records")), "\n".join(txt)


if __name__ == "__main__":
    t00 = time.time()
    syms = E.list_symbols()
    log(f"{len(syms)} mã futures USDT · {MONTHS[0]} → {MONTHS[-1]}")
    H0, n, keep, S, M, UNI, RK = build(syms)
    F = load_funding(keep, H0, n)
    res, txt = {}, [f"Kiểm chứng 6 phương pháp – phần A (nến 1 giờ) · {MONTHS[0]} → {MONTHS[-1]} · vũ trụ {TOPN} mã/tháng theo khối lượng tháng trước (kể cả mã đã huỷ niêm yết) · {time.strftime('%Y-%m-%d %H:%M')} UTC"]
    jobs = [("P1 · Cặp coin Ornstein-Uhlenbeck", p1_pairs, "kal|z2.0", "Chọn cặp mỗi tháng trên 30 ngày trước: tương quan ≥ 0,75, ADF < −3,34, bán rã 2–72 giờ, tối đa 20 cặp. Chi phí = 2 chân."),
            ("P2 · Connors RSI(2)", p2_rsi2, "H1|L|r10|kel|sma5|slNone", "Biến thể: khung H1/H4 · Long/Short (S = gương, không có trong sách) · RSI2 < 10/5 · có/không Keltner · thoát SMA5/EMA10 · cắt lỗ 2,5 ATR / không."),
            ("P3 · Funding cực âm → Long", p3_funding, "h24|slNone|abs", "abs = 8 giờ trước kỳ chốt giá không giảm (hấp thụ lực bán), fall = vẫn đang giảm. Chưa có lọc Open Interest (xem phần B)."),
            ("P4 · ORB + NR7 (Crabel)", p4_orb, "nr7|tp0.5", "Nến 1 giờ trong ngày: cùng 1 giờ chạm cả 2 mức chờ → tính lỗ 2× stretch; chạm cắt & chốt cùng giờ → tính cắt.")]
    for name, fn, dflt, note in jobs:
        t1 = time.time()
        try:
            rows = fn(H0, n, keep, S, M, UNI, RK, F)
        except Exception as e:  # noqa: BLE001
            import traceback
            log(f"LỖI {name}: {e}\n{traceback.format_exc()}"); continue
        r, tx = report(name, rows, H0, dflt, note)
        res[name] = r; txt.append(tx); log(tx); log(f"  ({time.time() - t1:.0f}s)")
        with gzip.open(os.path.join(E.OUT, f"q6a_{fn.__name__}.json.gz"), "wt") as f:
            json.dump(rows, f, separators=(",", ":"))
    with open(os.path.join(E.OUT, "quant6a.txt"), "w") as f:
        f.write("\n".join(txt))
    with open(os.path.join(E.OUT, "quant6a.json"), "w") as f:
        json.dump(res, f, ensure_ascii=False, default=str)
    log(f"xong · {time.time() - t00:.0f}s")
