"""Các cặp coin "chạy với nhau": tương quan, coin chạy theo BTC/ETH có độ trễ, và giao dịch cặp (chênh lệch giá quay về trung bình).

1) Ma trận tương quan lợi nhuận ngày (90 ngày) của nhóm coin thanh khoản lớn.
2) Dẫn – theo (lead–lag) trên nến 1 giờ: coin nào phản ứng TRỄ sau BTC/ETH bao nhiêu giờ; "chưa bắt kịp" = BTC vừa chạy mà coin
   chưa chạy tương xứng (theo beta) → cơ hội đuổi theo.
3) Giao dịch cặp: chênh lệch log giá A − β·log giá B; khi z-score lệch ≥ 2 độ lệch chuẩn → kỳ vọng quay về (Long rẻ / Short đắt).
   Có kiểm chứng 2 năm: số lần, tỉ lệ quay về, lãi trung bình, thời gian bán rã.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd


def _f(x, nd=3):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return None if (math.isnan(x) or math.isinf(x)) else round(x, nd)


def closes(px: dict[str, pd.DataFrame], keys: list[str], days: int) -> pd.DataFrame:
    cols = {}
    for k in keys:
        d = px.get(k)
        if d is None or len(d) < days * 0.8:
            continue
        s = d.set_index(pd.to_datetime(d["date"]).dt.normalize())["close"].astype(float)
        cols[k] = s[~s.index.duplicated(keep="last")].tail(days + 5)
    return pd.DataFrame(cols).dropna(how="all")


def corr_matrix(px, keys, days=90) -> dict:
    df = closes(px, keys, days)
    r = np.log(df).diff().tail(days)
    r = r.loc[:, r.notna().sum() >= days * 0.8]
    if r.shape[1] < 3:
        return {}
    c = r.corr()
    order = c["BTC"].sort_values(ascending=False).index.tolist() if "BTC" in c else c.columns.tolist()
    c = c.loc[order, order]
    # cặp tương quan cao nhất / thấp nhất (ngoài BTC)
    pairs = []
    ks = c.columns.tolist()
    for i in range(len(ks)):
        for j in range(i + 1, len(ks)):
            pairs.append((ks[i], ks[j], float(c.iloc[i, j])))
    pairs.sort(key=lambda t: -t[2])
    vol = r.std() * math.sqrt(365) * 100
    return {"keys": ks, "m": [[_f(x, 2) for x in row] for row in c.values], "top": [[a, b, _f(v, 2)] for a, b, v in pairs[:15]],
            "low": [[a, b, _f(v, 2)] for a, b, v in sorted(pairs, key=lambda t: t[2])[:10]], "vol": {k: _f(v, 1) for k, v in vol.items()}, "days": days}


def lead_lag(h1: dict[str, pd.DataFrame], leaders=("BTC", "ETH"), max_lag=6) -> list[dict]:
    """Tương quan lợi nhuận 1h của coin với BTC/ETH trễ 0..6 giờ (≈ 20 ngày dữ liệu)."""
    out = []
    base = {}
    for L in leaders:
        d = h1.get(L)
        if d is not None and len(d) > 200:
            base[L] = np.log(d.set_index("date")["close"].astype(float)).diff()
    if not base:
        return out
    for k, d in h1.items():
        if k in leaders or d is None or len(d) < 200:
            continue
        rc = np.log(d.set_index("date")["close"].astype(float)).diff()
        for L, rb in base.items():
            j = pd.concat([rc, rb], axis=1, keys=["c", "b"]).dropna().tail(480)
            if len(j) < 150:
                continue
            c0 = j["c"].corr(j["b"])
            lags = {lag: j["c"].corr(j["b"].shift(lag)) for lag in range(1, max_lag + 1)}
            best = max(lags, key=lambda x: lags[x] if lags[x] == lags[x] else -9)
            cov = np.cov(j["c"], j["b"])
            beta = cov[0, 1] / cov[1, 1] if cov[1, 1] > 0 else None
            # chưa bắt kịp: BTC 3 giờ qua so với coin (theo beta)
            mv_b = float(j["b"].tail(3).sum() * 100)
            mv_c = float(j["c"].tail(3).sum() * 100)
            gap = (beta or 0) * mv_b - mv_c
            out.append({"k": k, "lead": L, "c0": _f(c0, 2), "beta": _f(beta, 2), "lag": best, "clag": _f(lags[best], 3), "mv_lead3h": _f(mv_b, 2), "mv3h": _f(mv_c, 2),
                        "gap": _f(gap, 2)})
    return out


def _half_life(s: pd.Series) -> float | None:
    s = s.dropna()
    if len(s) < 30:
        return None
    y, x = s.diff().dropna(), s.shift(1).dropna().loc[s.diff().dropna().index]
    if x.var() == 0:
        return None
    b = np.polyfit(x.values, y.values, 1)[0]
    return float(-math.log(2) / b) if b < 0 else None


def pair_trades(px, keys, days=365, corr_min=0.8, z_in=2.0, z_out=0.5, z_stop=3.5, max_pairs=40) -> list[dict]:
    df = closes(px, keys, days + 400)
    lg = np.log(df)
    r = lg.diff().tail(180)
    r = r.loc[:, r.notna().sum() >= 150]
    if r.shape[1] < 3:
        return []
    c = r.corr()
    cands = []
    ks = c.columns.tolist()
    for i in range(len(ks)):
        for j in range(i + 1, len(ks)):
            if c.iloc[i, j] >= corr_min:
                cands.append((ks[i], ks[j], float(c.iloc[i, j])))
    cands.sort(key=lambda t: -t[2])
    out = []
    for a, b, cr in cands[:150]:
        j = lg[[a, b]].dropna()
        if len(j) < 300:
            continue
        # beta trên 180 ngày gần nhất (log giá)
        jj = j.tail(180)
        beta = float(np.polyfit(jj[b].values, jj[a].values, 1)[0])
        if not (0.2 < beta < 5):
            continue
        sp = j[a] - beta * j[b]
        mu, sd = sp.rolling(60).mean(), sp.rolling(60).std()
        z = (sp - mu) / sd
        zn = float(z.iloc[-1]) if z.notna().iloc[-1] else None
        if zn is None:
            continue
        hl = _half_life(sp.tail(180))
        # kiểm chứng 2 năm: vào khi |z| ≥ z_in, ra khi |z| ≤ z_out, cắt khi |z| ≥ z_stop hoặc 30 ngày
        zz, sv = z.tail(730).values, sp.tail(730).values
        trades = []
        k = 0
        while k < len(zz) - 1:
            if abs(zz[k]) >= z_in and abs(zz[k]) < z_stop:
                side = -1 if zz[k] > 0 else 1            # z cao → bán chênh lệch (Short A / Long B)
                e = sv[k]
                for m in range(k + 1, min(len(zz), k + 31)):
                    if abs(zz[m]) <= z_out or abs(zz[m]) >= z_stop or m == min(len(zz), k + 31) - 1:
                        ret = side * (sv[m] - e) * 100 - 0.4          # % (xấp xỉ, đã trừ phí 4 chân)
                        trades.append((ret, m - k, abs(zz[m]) <= z_out))
                        k = m
                        break
            k += 1
        if len(trades) < 3:
            continue
        rets = np.array([t[0] for t in trades])
        win = float(np.mean([t[2] for t in trades]) * 100)
        item = {"a": a, "b": b, "corr": _f(cr, 2), "beta": _f(beta, 3), "z": _f(zn, 2), "hl": _f(hl, 1), "n": len(trades), "win": _f(win, 0),
                "avg": _f(rets.mean(), 2), "days": _f(np.median([t[1] for t in trades]), 0),
                "side": ("Short " + a + " / Long " + b) if zn > 0 else ("Long " + a + " / Short " + b),
                "series": [[d.strftime("%Y-%m-%d"), _f(v, 2)] for d, v in zip(z.index[-180:], z.values[-180:])]}
        item["ok"] = bool(abs(zn) >= z_in and abs(zn) < z_stop and win >= 60 and rets.mean() > 0 and (hl or 99) <= 30)
        out.append(item)
        if len(out) >= max_pairs * 3:
            break
    out.sort(key=lambda x: (-int(x["ok"]), -abs(x["z"] or 0)))
    return out[:max_pairs]


def rel_strength(px, keys, btc: pd.DataFrame) -> list[dict]:
    """Sức mạnh tương đối so với BTC: 7 / 30 / 90 ngày (tỉ số giá coin/BTC)."""
    b = btc.set_index(pd.to_datetime(btc["date"]).dt.normalize())["close"]
    out = []
    for k in keys:
        d = px.get(k)
        if d is None or len(d) < 95 or k == "BTC":
            continue
        s = d.set_index(pd.to_datetime(d["date"]).dt.normalize())["close"]
        rt = (s / b.reindex(s.index)).dropna()
        if len(rt) < 95:
            continue
        out.append({"k": k, **{f"rs{n}": _f((rt.iloc[-1] / rt.iloc[-n - 1] - 1) * 100, 1) for n in (7, 30, 90)},
                    "sp": [_f(x / rt.iloc[-90], 3) for x in rt.tail(90)]})
    return out
