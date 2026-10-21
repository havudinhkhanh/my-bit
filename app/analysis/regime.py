"""Bức tranh thị trường crypto: xu hướng BTC, độ rộng, mùa altcoin, tâm lý (Sợ hãi & Tham lam), thanh khoản stablecoin, đòn bẩy toàn thị trường.

Phần "nên làm gì khi thị trường sợ hãi / hưng phấn" dựa trên số liệu lịch sử BTC từ 2018 (không phải cảm tính):
lợi nhuận 30/90/180 ngày sau đó theo từng vùng chỉ số, tách theo BTC đang trên hay dưới MA200.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from . import indicators as ind
from .fmt import vn

FNG_BINS = [0, 25, 45, 55, 75, 101]
FNG_LAB = ["Sợ hãi tột độ", "Sợ hãi", "Trung lập", "Tham lam", "Tham lam tột độ"]


def _f(x, nd=2):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return None if (math.isnan(x) or math.isinf(x)) else round(x, nd)


def btc_trend(btc: pd.DataFrame) -> dict:
    c = btc.set_index("date")["close"]
    ma200, ma50 = c.rolling(200).mean(), c.rolling(50).mean()
    L = float(c.iloc[-1])
    above = L > ma200.iloc[-1]
    gold = ma50.iloc[-1] > ma200.iloc[-1]
    state = "up" if above and gold else ("down" if not above and not gold else "mixed")
    # bao lâu đã ở trên/dưới MA200
    s = (c > ma200).iloc[200:]
    run = 0
    for v in s.iloc[::-1]:
        if bool(v) == bool(above):
            run += 1
        else:
            break
    ath = float(c.max())
    return {"price": L, "ma200": _f(ma200.iloc[-1], 0), "ma50": _f(ma50.iloc[-1], 0), "above200": bool(above), "golden": bool(gold), "state": state,
            "run_days": run, "dist200": _f((L / ma200.iloc[-1] - 1) * 100, 1), "r7": _f((L / c.iloc[-8] - 1) * 100, 1),
            "r30": _f((L / c.iloc[-31] - 1) * 100, 1), "r90": _f((L / c.iloc[-91] - 1) * 100, 1), "from_ath": _f((L / ath - 1) * 100, 1),
            "ath": _f(ath, 0)}


def regime_series(btc: pd.DataFrame) -> pd.Series:
    """+1 BTC trên MA200, -1 dưới (theo ngày) – dùng cho lọc Short và kiểm chứng."""
    c = btc.set_index("date")["close"]
    ma = c.rolling(200).mean()
    return pd.Series(np.where(c > ma, 1, -1), index=c.index)


def breadth(px: dict[str, pd.DataFrame], days: int = 365) -> dict:
    """% coin trên MA50 / MA200 theo thời gian (chỉ coin có ≥ 200 ngày dữ liệu tại thời điểm đó)."""
    a50, a200, n50, n200 = {}, {}, {}, {}
    for k, df in px.items():
        if len(df) < 60:
            continue
        c = df.set_index("date")["close"].tail(days + 200)
        m50, m200 = c.rolling(50).mean(), c.rolling(200).mean()
        for d, v, m in zip(c.index[-days:], c.values[-days:], m50.values[-days:]):
            if m == m:
                n50[d] = n50.get(d, 0) + 1
                a50[d] = a50.get(d, 0) + (v > m)
        for d, v, m in zip(c.index[-days:], c.values[-days:], m200.values[-days:]):
            if m == m:
                n200[d] = n200.get(d, 0) + 1
                a200[d] = a200.get(d, 0) + (v > m)
    ds = sorted(set(n200) | set(n50))
    ser = [[d.strftime("%Y-%m-%d"), _f(a50.get(d, 0) / n50[d] * 100, 1) if n50.get(d) else None,
            _f(a200.get(d, 0) / n200[d] * 100, 1) if n200.get(d) else None] for d in ds]
    last = ser[-1] if ser else [None, None, None]
    return {"above50": last[1], "above200": last[2], "n": n200.get(ds[-1], 0) if ds else 0, "series": ser[-days:]}


def alt_season(px: dict[str, pd.DataFrame], rank: dict[str, int], btc: pd.DataFrame, n_top: int = 50, days: int = 90) -> dict:
    """Mùa altcoin: % trong top 50 (bỏ BTC, stablecoin) tăng tốt hơn BTC trong 90 ngày. ≥ 75% = mùa alt, ≤ 25% = mùa BTC."""
    cb = btc.set_index("date")["close"]
    if len(cb) <= days:
        return {}
    rb = cb.iloc[-1] / cb.iloc[-days - 1] - 1
    keys = [k for k, _ in sorted(rank.items(), key=lambda t: t[1]) if k != "BTC" and k in px][:n_top]
    better, tot, rows = 0, 0, []
    for k in keys:
        c = px[k].set_index("date")["close"]
        if len(c) <= days:
            continue
        r = c.iloc[-1] / c.iloc[-days - 1] - 1
        tot += 1
        better += r > rb
        rows.append({"k": k, "r": _f(r * 100, 1)})
    return {"idx": _f(better / tot * 100, 0) if tot else None, "n": tot, "btc_r": _f(rb * 100, 1), "days": days}


def fng_study(fng: pd.DataFrame, btc: pd.DataFrame) -> dict:
    """Lợi nhuận BTC sau 30/90/180 ngày theo vùng Sợ hãi & Tham lam, tách theo BTC trên/dưới MA200."""
    c = btc.set_index("date")["close"]
    ma = c.rolling(200).mean()
    f = fng.set_index("date")["fng"].reindex(c.index).ffill()
    df = pd.DataFrame({"c": c, "ma": ma, "f": f}).dropna()
    out = {"rows": [], "since": df.index[0].strftime("%Y-%m-%d") if len(df) else None}
    for h in (30, 90, 180):
        df[f"r{h}"] = df["c"].shift(-h) / df["c"] - 1
    df["zone"] = pd.cut(df["f"], FNG_BINS, labels=FNG_LAB, right=False)
    for z in FNG_LAB:
        for reg, sel in (("all", df["zone"] == z), ("up", (df["zone"] == z) & (df["c"] > df["ma"])), ("down", (df["zone"] == z) & (df["c"] <= df["ma"]))):
            d = df[sel]
            row = {"zone": z, "reg": reg, "days": int(len(d))}
            for h in (30, 90, 180):
                s = d[f"r{h}"].dropna()
                if len(s) >= 15:
                    row[f"med{h}"] = _f(s.median() * 100, 1)
                    row[f"win{h}"] = _f((s > 0).mean() * 100, 0)
                    row[f"p10_{h}"] = _f(s.quantile(0.1) * 100, 1)
            out["rows"].append(row)
    base = {}
    for h in (30, 90, 180):
        s = df[f"r{h}"].dropna()
        base[f"med{h}"] = _f(s.median() * 100, 1)
        base[f"win{h}"] = _f((s > 0).mean() * 100, 0)
    out["base"] = base
    # chiến lược đơn giản: mua dần khi Sợ hãi tột độ (DCA), so với DCA đều
    return out


def fng_zone(v: float | None) -> str | None:
    if v is None:
        return None
    for i in range(len(FNG_LAB)):
        if FNG_BINS[i] <= v < FNG_BINS[i + 1]:
            return FNG_LAB[i]
    return None


def playbook(tr: dict, fng_now: float | None, study: dict, cyc: dict, agg_f8: float | None) -> dict:
    """Lời khuyên hành động theo bối cảnh – có dẫn số liệu lịch sử."""
    z = fng_zone(fng_now)
    reg = "up" if tr.get("above200") else "down"
    row = next((r for r in study.get("rows", []) if r["zone"] == z and r["reg"] == reg), None)
    lines = []
    head = ""
    if z in ("Sợ hãi tột độ", "Sợ hãi"):
        if reg == "up":
            head = "Sợ hãi trong xu hướng tăng – thường là cơ hội mua dần"
            lines.append("BTC vẫn trên MA200: các đợt sợ hãi trong xu hướng tăng lịch sử thường là nhịp điều chỉnh để gom.")
        else:
            head = "Sợ hãi trong xu hướng giảm – gom rất chậm, ưu tiên BTC/ETH"
            lines.append("BTC dưới MA200: sợ hãi có thể kéo dài nhiều tháng. Chia nhỏ tiền mua (DCA 4–8 lần), không dùng đòn bẩy Long.")
    elif z in ("Tham lam", "Tham lam tột độ"):
        if reg == "up":
            head = "Hưng phấn – giữ vị thế nhưng nâng điểm chốt lời, không Long đòn bẩy cao"
            lines.append("Tham lam trong xu hướng tăng có thể kéo dài; chốt lời từng phần khi funding nóng, đừng mua đuổi altcoin nhỏ.")
        else:
            head = "Tham lam khi chưa vượt MA200 – dễ là bẫy tăng"
            lines.append("Hưng phấn khi BTC còn dưới MA200 hay là hồi kỹ thuật; chốt lời nhịp hồi, hạn chế mở Long mới.")
    else:
        head = "Trung lập – theo tín hiệu xu hướng từng coin"
        lines.append("Tâm lý cân bằng: dùng tín hiệu xu hướng & định giá từng coin, không có lợi thế từ chỉ số tâm lý.")
    if row and row.get("med90") is not None:
        lines.append(f"Lịch sử từ {study.get('since', '')[:4]}: khi chỉ số ở vùng \"{z}\" và BTC {'trên' if reg == 'up' else 'dưới'} MA200 "
                     f"({row['days']} ngày), BTC 90 ngày sau tăng trung vị {row['med90']:+.0f}% (xác suất tăng {row.get('win90', 0):.0f}%), "
                     f"trường hợp xấu (10%) {row.get('p10_90', 0):+.0f}%.")
    b = study.get("base") or {}
    if b.get("med90") is not None:
        lines.append(f"So với trung bình mọi thời điểm: trung vị 90 ngày {b['med90']:+.0f}%, xác suất tăng {b.get('win90', 0):.0f}%.")
    if cyc.get("mvrv") is not None:
        mz = cyc.get("mvrv_zone")
        m = cyc["mvrv"]
        rp = cyc.get("realized_price")
        lines.append(f"MVRV BTC {vn(m, '.2f')} (vùng {mz}): giá đang gấp {vn(m, '.2f')} lần giá vốn trung bình toàn mạng"
                     + (f" (~{vn(rp, ',.0f')} USD)" if rp else "") + ". MVRV < 1 lịch sử là vùng đáy chu kỳ; > 3 là vùng đỉnh.")
    if agg_f8 is not None:
        if agg_f8 > 0.03:
            lines.append(f"Funding trung bình toàn thị trường {vn(agg_f8, '+.3f')}%/8h – đòn bẩy Long đang nóng, dễ có cú quét xuống.")
        elif agg_f8 < 0:
            lines.append(f"Funding trung bình âm ({vn(agg_f8, '+.3f')}%/8h) – phe Short chiếm ưu thế, thường xuất hiện gần đáy ngắn hạn.")
    return {"zone": z, "reg": reg, "head": head, "lines": lines, "stat": row}


def light(tr: dict, br: dict, fng: float | None) -> dict:
    pts = 0
    pts += 1 if tr.get("above200") else -1
    pts += 1 if tr.get("golden") else -1
    a200 = br.get("above200")
    if a200 is not None:
        pts += 1 if a200 >= 50 else (-1 if a200 < 30 else 0)
    col = "green" if pts >= 2 else ("red" if pts <= -2 else "yellow")
    txt = {"green": "Xu hướng tăng – được phép Long theo xu hướng", "yellow": "Chuyển tiếp – giảm quy mô, chọn lọc",
           "red": "Xu hướng giảm – ưu tiên giữ tiền / phòng hộ; Short theo xu hướng được phép"}[col]
    return {"color": col, "text": txt, "pts": pts}
