"""Cơ hội giao dịch "nếu vào bây giờ": điểm vào, cắt lỗ, 2 mục tiêu giá và THỜI GIAN kỳ vọng – lấy từ kiểm chứng lịch sử.

Mỗi kiểu thiết lập (setup) được quét trên toàn bộ lịch sử của mọi coin (không nhìn trước tương lai), ghi lại:
xác suất chạm mục tiêu 1 trước cắt lỗ, số ngày/giờ để chạm mục tiêu 1/2, lợi nhuận trung bình tính theo R (1R = khoảng cắt lỗ).
Khi một coin vừa xuất hiện thiết lập, hệ thống gắn các số liệu lịch sử đó: "vào giá X, cắt lỗ Y, kỳ vọng chạm Z sau ~N ngày (xác suất p%)".

Kiểu thiết lập (Long; Short đối xứng):
  pullback  – xu hướng tăng, giá hồi về vùng Fibonacci 0,382–0,70 của sóng tăng gần nhất → mục tiêu: đỉnh cũ, Fib mở rộng 1,618
  breakout  – phá đỉnh 55 nến với khối lượng ≥ 1,5× trung bình → mục tiêu 1,5R / 3R
  oversold  – trên MA200 nhưng RSI < 32 (bán quá mức trong xu hướng tăng) → mục tiêu EMA20 / đỉnh sóng gần nhất
"""
from __future__ import annotations

import math
from datetime import timedelta

import numpy as np
import pandas as pd

from . import indicators as ind
from . import levels as lv

FEE = 0.0005
SLIP = 0.0005
NAMES = {"pullback_up": "Hồi về vùng Fibonacci trong xu hướng tăng", "pullback_dn": "Hồi lên vùng Fibonacci trong xu hướng giảm",
         "breakout_up": "Phá đỉnh 55 nến có khối lượng", "breakout_dn": "Thủng đáy 55 nến có khối lượng",
         "oversold_up": "Bán quá mức trong xu hướng tăng (bật lại)", "overbought_dn": "Mua quá mức trong xu hướng giảm (quay đầu)",
         "smc_sweep_up": "SMC: quét thanh khoản đáy + CHoCH/BOS tăng", "smc_sweep_dn": "SMC: quét thanh khoản đỉnh + CHoCH/BOS giảm",
         "smc_ob_up": "SMC: hồi về Order Block mua", "smc_ob_dn": "SMC: hồi về Order Block bán"}


def _f(x, nd=2):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return None if (math.isnan(x) or math.isinf(x)) else round(x, nd)


def detect(df: pd.DataFrame, tf: str) -> list[dict]:
    """Mọi lần xuất hiện thiết lập trong lịch sử (chỉ dùng dữ liệu tới nến đó). Trả list {i, setup, side, e, s, t1, t2}."""
    n = len(df)
    if n < 120:
        return []
    c, h, l, v = df["close"].values, df["high"].values, df["low"].values, df["volume"].values
    cs = df["close"]
    e20, e50 = ind.ema(cs, 20).values, ind.ema(cs, 50).values
    slow = (ind.sma(cs, 200) if tf == "d" else ind.ema(cs, 100)).values
    rsi = ind.rsi(cs, 14).values
    atr = ind.atr(df, 14).values
    vma = pd.Series(v).rolling(20).mean().values
    hh = pd.Series(h).rolling(55).max().shift(1).values
    ll = pd.Series(l).rolling(55).min().shift(1).values
    pv = lv.pivots(df, 2.5 if tf == "d" else 3.0)
    # dòng tiền chủ động 7 nến (mua − bán chủ động / khối lượng) – chỉ có với nến Binance
    mf = np.zeros(n)
    if "taker_buy_q" in df and "qvol" in df and df["taker_buy_q"].notna().sum() > 50:
        q = df["qvol"].fillna(0)
        dl = (2 * df["taker_buy_q"].fillna(0) - q).rolling(7).sum() / q.rolling(7).sum().replace(0, np.nan)
        mf = np.sign(np.nan_to_num(dl.values, nan=0.0) * (np.abs(np.nan_to_num(dl.values)) > 0.01))
    out, last = [], {}
    k = 0                       # con trỏ: các đỉnh/đáy đã xác nhận trước nến i
    conf = []
    for i in range(60, n):
        while k < len(pv) and pv[k][3] <= i:
            conf.append(pv[k])
            k += 1
        a = atr[i]
        if not (a > 0) or np.isnan(slow[i]):
            continue
        up = e20[i] > e50[i] and c[i] > slow[i]
        dn = e20[i] < e50[i] and c[i] < slow[i]
        cand = []
        if len(conf) >= 2:
            p0, p1 = conf[-2], conf[-1]
            if up and p0[2] == -1 and p1[2] == 1:
                L, H = p0[1], p1[1]
                rng = H - L
                r = (H - c[i]) / rng if rng > 0 else 0
                if 0.382 <= r <= 0.70 and c[i] > L and rsi[i] < 58:
                    s = min(H - 0.886 * rng, c[i] - a) - 0.2 * a
                    cand.append(("pullback_up", 1, s, H, L + 1.618 * rng))
            if dn and p0[2] == 1 and p1[2] == -1:
                H, L = p0[1], p1[1]
                rng = H - L
                r = (c[i] - L) / rng if rng > 0 else 0
                if 0.382 <= r <= 0.70 and c[i] < H and rsi[i] > 42:
                    s = max(L + 0.886 * rng, c[i] + a) + 0.2 * a
                    cand.append(("pullback_dn", -1, s, L, H - 1.618 * rng))
        if vma[i] > 0 and v[i] >= 1.5 * vma[i]:
            if c[i] > hh[i] and e20[i] > e50[i]:
                s = c[i] - 2 * a
                R = c[i] - s
                cand.append(("breakout_up", 1, s, c[i] + 1.5 * R, c[i] + 3 * R))
            if c[i] < ll[i] and e20[i] < e50[i]:
                s = c[i] + 2 * a
                R = s - c[i]
                cand.append(("breakout_dn", -1, s, c[i] - 1.5 * R, c[i] - 3 * R))
        if c[i] > slow[i] and rsi[i] < 32 and e20[i] > c[i] + 0.5 * a:
            s = c[i] - 2 * a
            hi = max([p[1] for p in conf[-3:] if p[2] == 1] or [c[i] + 3 * (c[i] - s)])
            cand.append(("oversold_up", 1, s, e20[i], max(hi, e20[i] + a)))
        if c[i] < slow[i] and rsi[i] > 68 and e20[i] < c[i] - 0.5 * a:
            s = c[i] + 2 * a
            lo = min([p[1] for p in conf[-3:] if p[2] == -1] or [c[i] - 3 * (s - c[i])])
            cand.append(("overbought_dn", -1, s, e20[i], min(lo, e20[i] - a)))
        for name, side, s, t1, t2 in cand:
            if i - last.get(name, -99) < 5:
                continue
            e = c[i]
            if side == 1 and not (s < e < t1 <= t2):
                continue
            if side == -1 and not (s > e > t1 >= t2 > 0):
                continue
            last[name] = i
            out.append({"i": i, "setup": name, "side": side, "e": float(e), "s": float(s), "t1": float(t1), "t2": float(t2), "mf": int(mf[i] * side)})
    # thiết lập Smart Money (SMC)
    from . import smc
    for g in smc.signals(df, 3):
        g["mf"] = int(mf[g["i"]] * g["side"])
        out.append(g)
    out.sort(key=lambda g: g["i"])
    return out


def simulate(df: pd.DataFrame, sigs: list[dict], horizon: int = 60) -> list[dict]:
    """Kết quả từng tín hiệu: chốt 50% ở mục tiêu 1 (dời cắt lỗ về giá vào), 50% ở mục tiêu 2; hết hạn → đóng theo giá."""
    h, l, c = df["high"].values, df["low"].values, df["close"].values
    n = len(c)
    res = []
    for g in sigs:
        i, sd, e, s, t1, t2 = g["i"], g["side"], g["e"], g["s"], g["t1"], g["t2"]
        if i + 1 >= n:
            continue
        risk = abs(e - s)
        r1, r2 = abs(t1 - e) / risk, abs(t2 - e) / risk
        cost = 2 * (FEE + SLIP) * e / risk
        stop, hit1, d1, d2, R = s, False, None, None, None
        last_j = min(n - 1, i + horizon)
        if g.get("fill") and ((sd == 1 and l[i] <= s) or (sd == -1 and h[i] >= s)):
            # lệnh chờ khớp và chạm cắt lỗ ngay trong cùng nến → tính lỗ (không loại bỏ)
            res.append({**g, "hit1": False, "d1": None, "d2": None, "R": -1.0 - cost, "r1": r1, "r2": r2, "t": df["date"].iloc[i]})
            continue
        for j in range(i + 1, last_j + 1):
            lo_hit = l[j] <= stop if sd == 1 else h[j] >= stop
            if lo_hit:
                R = (0.5 * r1 if hit1 else -1.0)
                break
            if not hit1 and (h[j] >= t1 if sd == 1 else l[j] <= t1):
                hit1, d1, stop = True, j - i, e
            if hit1 and (h[j] >= t2 if sd == 1 else l[j] <= t2):
                d2 = j - i
                R = 0.5 * r1 + 0.5 * r2
                break
        open_ = R is None
        if open_:
            if last_j < i + horizon:          # chưa đủ thời gian quan sát (tín hiệu gần đây) → bỏ khỏi thống kê
                continue
            mtm = (c[last_j] - e) / risk * sd
            R = 0.5 * r1 + 0.5 * mtm if hit1 else mtm
        res.append({**g, "hit1": hit1, "d1": d1, "d2": d2, "R": R - cost, "r1": r1, "r2": r2, "t": df["date"].iloc[i]})
    return res


def stats(rows: list[dict]) -> dict:
    if not rows:
        return {"n": 0}
    R = np.array([r["R"] for r in rows])
    d1 = np.array([r["d1"] for r in rows if r["d1"] is not None])
    d2 = np.array([r["d2"] for r in rows if r["d2"] is not None])
    out = {"n": int(len(R)), "win1": _f(np.mean([r["hit1"] for r in rows]) * 100, 1), "win2": _f(np.mean([r["d2"] is not None for r in rows]) * 100, 1),
           "avgR": _f(R.mean(), 3), "medR": _f(np.median(R), 3), "pf": _f(R[R > 0].sum() / max(1e-9, -R[R < 0].sum()), 2)}
    # kiểm tra ngoài mẫu đơn giản: 2 năm gần nhất so với trước đó (lợi thế phải còn ở giai đoạn gần đây)
    if rows and rows[0].get("t") is not None:
        cut = max(r["t"] for r in rows) - pd.Timedelta(days=730)
        rec = [r["R"] for r in rows if r["t"] >= cut]
        old = [r["R"] for r in rows if r["t"] < cut]
        if len(rec) >= 30:
            out["avgR_2y"] = _f(np.mean(rec), 3)
            out["n_2y"] = len(rec)
        if len(old) >= 30:
            out["avgR_old"] = _f(np.mean(old), 3)
    if len(d1):
        out.update({"d1": _f(np.median(d1), 1), "d1_lo": _f(np.percentile(d1, 25), 1), "d1_hi": _f(np.percentile(d1, 75), 1)})
    if len(d2):
        out.update({"d2": _f(np.median(d2), 1), "d2_lo": _f(np.percentile(d2, 25), 1), "d2_hi": _f(np.percentile(d2, 75), 1)})
    return out


def regime_of(df: pd.DataFrame, btc_reg: pd.Series | None) -> np.ndarray:
    if btc_reg is None:
        return np.ones(len(df))
    return btc_reg.reindex(pd.to_datetime(df["date"]).dt.normalize()).ffill().fillna(1).values


class Book:
    """Gom kết quả kiểm chứng toàn bộ coin: theo (khung, setup, BTC trên/dưới MA200) và theo từng coin."""

    def __init__(self):
        self.pool: dict[tuple, list] = {}
        self.coin: dict[tuple, list] = {}

    def add(self, key: str, tf: str, df: pd.DataFrame, res: list[dict], reg: np.ndarray):
        for r in res:
            rg = "up" if reg[r["i"]] > 0 else "down"
            self.pool.setdefault((tf, r["setup"], rg), []).append(r)
            self.pool.setdefault((tf, r["setup"], "all"), []).append(r)
            if r.get("mf"):
                self.pool.setdefault((tf, r["setup"], rg + ("_mf+" if r["mf"] > 0 else "_mf-")), []).append(r)
            self.coin.setdefault((key, tf, r["setup"]), []).append(r)

    def table(self) -> dict:
        if getattr(self, "_t", None) is not None:
            return self._t
        out = {}
        for (tf, st, rg), rows in self.pool.items():
            out.setdefault(tf, {}).setdefault(st, {})[rg] = stats(rows)
        self._t = out
        return out


def bar_days(tf: str) -> float:
    return 1.0 if tf == "d" else (4 / 24 if tf == "h4" else 1 / 24)


def current(key: str, tf: str, df: pd.DataFrame, book: Book, btc_up: bool, ctx: dict, sigs: list[dict] | None = None) -> list[dict]:
    """Thiết lập đang xuất hiện ở nến mới nhất (hoặc nến trước đó, khung ngày) kèm số liệu lịch sử."""
    sigs = detect(df, tf) if sigs is None else sigs
    n = len(df)
    fresh = [g for g in sigs if g["i"] >= n - (2 if tf == "d" else 3)]
    out = []
    tbl = book.table().get(tf, {})
    last = df["date"].iloc[-1]
    price = float(df["close"].iloc[-1])
    for g in fresh:
        st = g["setup"]
        rg = "up" if btc_up else "down"
        P = tbl.get(st, {}).get(rg) or tbl.get(st, {}).get("all") or {}
        if g.get("mf"):                                # thống kê riêng khi dòng tiền chủ động cùng / ngược chiều lệnh
            Pm = tbl.get(st, {}).get(rg + ("_mf+" if g["mf"] > 0 else "_mf-")) or {}
            if Pm.get("n", 0) >= 100:
                P = {**Pm, "mf_bucket": "cùng chiều" if g["mf"] > 0 else "ngược chiều"}
        C = stats(book.coin.get((key, tf, st), []))
        # giá đã chạy khỏi điểm vào? dùng giá hiện tại làm điểm vào thực tế
        e = price
        s, t1, t2 = g["s"], g["t1"], g["t2"]
        sd = g["side"]
        if (sd == 1 and not (s < e < t1)) or (sd == -1 and not (s > e > t1)):
            continue
        risk = abs(e - s)
        bd = bar_days(tf)
        exp_t1 = last + timedelta(days=(P.get("d1") or 0) * bd) if P.get("d1") else None
        exp_t2 = last + timedelta(days=(P.get("d2") or 0) * bd) if P.get("d2") else None
        exp = (P.get("avgR") or 0) * 0.6 + ((C.get("avgR") or 0) * 0.4 if C.get("n", 0) >= 6 else (P.get("avgR") or 0) * 0.4)
        score = exp * 100
        notes = []
        flow = ctx.get("flow") or {}
        fs = flow.get("score")
        if fs is not None:
            score += fs / 5 * sd
            if fs * sd > 20:
                notes.append("Dòng tiền ủng hộ")
            elif fs * sd < -20:
                notes.append("Dòng tiền ngược chiều")
        zones = ctx.get("zones") or []
        near_t1 = [z for z in zones if z["n"] >= 2 and abs(z["p"] - t1) / price < 0.01]
        near_s = [z for z in zones if z["n"] >= 2 and ((sd == 1 and s < z["p"] < e) or (sd == -1 and e < z["p"] < s))]
        if near_s:
            score += 5
            notes.append(f"Có vùng hợp lưu {near_s[0]['n']} mức đỡ giữa điểm vào và cắt lỗ ({', '.join(near_s[0]['src'][:3])})")
        if near_t1:
            notes.append(f"Mục tiêu 1 trùng vùng {', '.join(near_t1[0]['src'][:3])}")
        crowd = ctx.get("crowd") or []
        if sd == 1 and "long_crowded" in crowd:
            score -= 10
            notes.append("Long đang quá đông trên futures")
        if sd == -1 and "short_crowded" in crowd:
            score -= 10
            notes.append("Short đang quá đông – dễ bị ép")
        if sd == -1 and not ctx.get("perp"):
            continue                                  # không có perp → không Short được
        if (sd == 1 and not btc_up) or (sd == -1 and btc_up):
            notes.append("Ngược xu hướng BTC (MA200)")
        conf = "Cao" if (P.get("n", 0) >= 150 and (P.get("win1") or 0) >= 55 and (P.get("avgR") or 0) >= 0.15) else \
            ("Trung bình" if (P.get("n", 0) >= 60 and (P.get("avgR") or 0) > 0.03) else "Thấp")
        out.append({"k": key, "tf": tf, "setup": st, "name": NAMES[st], "side": "long" if sd == 1 else "short", "e": lv.sig(e), "s": lv.sig(s),
                    "t1": lv.sig(t1), "t2": lv.sig(t2), "risk_pct": _f(risk / e * 100, 2), "r1": _f(abs(t1 - e) / risk, 2), "r2": _f(abs(t2 - e) / risk, 2),
                    "t1_pct": _f((t1 / e - 1) * 100, 2), "t2_pct": _f((t2 / e - 1) * 100, 2),
                    "eta1": exp_t1.strftime("%Y-%m-%dT%H:%M") if exp_t1 is not None else None, "eta2": exp_t2.strftime("%Y-%m-%dT%H:%M") if exp_t2 is not None else None,
                    "d1": P.get("d1"), "d1_lo": P.get("d1_lo"), "d1_hi": P.get("d1_hi"), "d2": P.get("d2"), "bd": bd,
                    "win1": P.get("win1"), "win2": P.get("win2"), "avgR": P.get("avgR"), "n": P.get("n"), "coin": {k: C.get(k) for k in ("n", "win1", "avgR", "d1")},
                    "conf": conf, "score": _f(score, 1), "notes": notes, "at": last.strftime("%Y-%m-%dT%H:%M"), "mfb": P.get("mf_bucket")})
    return out
