"""Smart Money Concepts (SMC / ICT) cho crypto – dùng cho hiển thị và kiểm chứng.

- Cấu trúc: đỉnh/đáy fractal (n nến mỗi bên, chỉ dùng khi đã xác nhận), BOS = phá cấu trúc cùng xu hướng, CHoCH = đổi tính chất (đảo chiều).
- Order Block (OB): nến ngược chiều cuối cùng trước cú bứt phá tạo BOS/CHoCH. Còn hiệu lực tới khi giá đóng cửa xuyên qua.
- Fair Value Gap (FVG): khoảng trống giữa nến 1 và nến 3 của cú đi mạnh – theo dõi đã lấp hay chưa.
- Thanh khoản: đỉnh/đáy bằng nhau (EQH/EQL) chưa bị quét; quét thanh khoản (sweep) = râu nến xuyên đỉnh/đáy cũ rồi đóng cửa quay lại.
- Premium / Discount: vị trí giá trong biên swing gần nhất (trên 50% = vùng đắt, dưới = vùng rẻ); OTE = 62–79% thoái lui.

Thiết lập kiểm chứng (signals):
  smc_sweep_up / _dn – quét thanh khoản đáy (đỉnh) rồi CHoCH/BOS ngược lại trong 12 nến → vào ở giá đóng cửa nến phá,
                       cắt lỗ dưới râu quét, mục tiêu = đỉnh swing kế (thanh khoản phía trên) / 3R.
  smc_ob_up / _dn    – cấu trúc tăng (giảm), giá hồi về Order Block chưa bị chạm → vào ở mép OB, cắt lỗ ngoài OB.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from . import indicators as ind


def _f(x, n=6):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return None if (math.isnan(x) or math.isinf(x)) else float(f"{x:.{n}g}")


def fractals(h: np.ndarray, l: np.ndarray, n: int):
    """[(chỉ số, giá, chỉ số xác nhận)] cho đỉnh và đáy."""
    hs, ls = [], []
    for i in range(n, len(h) - n):
        if h[i] == h[i - n:i + n + 1].max() and h[i] > h[i - 1]:
            hs.append((i, float(h[i]), i + n))
        if l[i] == l[i - n:i + n + 1].min() and l[i] < l[i - 1]:
            ls.append((i, float(l[i]), i + n))
    return hs, ls


def _walk(df: pd.DataFrame, n: int):
    """Đi từng nến, sinh sự kiện BOS/CHoCH, OB, quét thanh khoản – chỉ dùng thông tin đã có tại nến đó."""
    o, h, l, c = (df[k].values.astype(float) for k in ("open", "high", "low", "close"))
    atr = ind.atr(df, 14).bfill().values
    hs, ls = fractals(h, l, n)
    ih = il = 0
    sh = sl = None            # đỉnh / đáy swing đã xác nhận gần nhất (chưa bị phá)
    prev_sh = prev_sl = None  # đỉnh / đáy trước đó (để tìm mục tiêu)
    trend = 0
    events, obs, sweeps = [], [], []
    for i in range(len(c)):
        while ih < len(hs) and hs[ih][2] <= i:
            prev_sh, sh = (sh or prev_sh), {"i": hs[ih][0], "p": hs[ih][1], "broken": False}
            ih += 1
        while il < len(ls) and ls[il][2] <= i:
            prev_sl, sl = (sl or prev_sl), {"i": ls[il][0], "p": ls[il][1], "broken": False}
            il += 1
        # quét thanh khoản: râu xuyên, đóng cửa quay lại
        if sl and not sl["broken"] and l[i] < sl["p"] and c[i] > sl["p"]:
            sweeps.append({"i": i, "dir": 1, "level": sl["p"], "ext": float(l[i])})
        if sh and not sh["broken"] and h[i] > sh["p"] and c[i] < sh["p"]:
            sweeps.append({"i": i, "dir": -1, "level": sh["p"], "ext": float(h[i])})
        if sh and not sh["broken"] and c[i] > sh["p"]:
            typ = "BOS" if trend == 1 else "CHoCH"
            sh["broken"] = True
            trend = 1
            # OB: nến giảm cuối cùng trước cú phá (trong 15 nến)
            ob = None
            for j in range(i - 1, max(sl["i"] if sl else 0, i - 15) - 1, -1):
                if c[j] < o[j]:
                    ob = {"i": j, "lo": float(l[j]), "hi": float(max(o[j], c[j]) if (h[j] - l[j]) > 3 * atr[j] else h[j]), "dir": 1, "born": i, "mit": None, "dead": None}
                    break
            events.append({"i": i, "type": typ, "dir": 1, "level": sh["p"], "from": sh["i"], "ob": ob})
            if ob:
                obs.append(ob)
        if sl and not sl["broken"] and c[i] < sl["p"]:
            typ = "BOS" if trend == -1 else "CHoCH"
            sl["broken"] = True
            trend = -1
            ob = None
            for j in range(i - 1, max(sh["i"] if sh else 0, i - 15) - 1, -1):
                if c[j] > o[j]:
                    ob = {"i": j, "lo": float(min(o[j], c[j]) if (h[j] - l[j]) > 3 * atr[j] else l[j]), "hi": float(h[j]), "dir": -1, "born": i, "mit": None, "dead": None}
                    break
            events.append({"i": i, "type": typ, "dir": -1, "level": sl["p"], "from": sl["i"], "ob": ob})
            if ob:
                obs.append(ob)
        for ob in obs:
            if ob["dead"] is not None or i <= ob["born"]:
                continue
            if ob["dir"] == 1:
                if ob["mit"] is None and l[i] <= ob["hi"]:
                    ob["mit"] = i
                if c[i] < ob["lo"]:
                    ob["dead"] = i
            else:
                if ob["mit"] is None and h[i] >= ob["lo"]:
                    ob["mit"] = i
                if c[i] > ob["hi"]:
                    ob["dead"] = i
    return {"events": events, "obs": obs, "sweeps": sweeps, "trend": trend, "sh": sh, "sl": sl, "hs": hs, "ls": ls, "atr": atr}


def fvgs(df: pd.DataFrame, look: int = 120, min_atr: float = 0.25):
    h, l, c = df["high"].values, df["low"].values, df["close"].values
    atr = ind.atr(df, 14).bfill().values
    n = len(c)
    out = []
    for i in range(max(2, n - look), n):
        if l[i] > h[i - 2] and l[i] - h[i - 2] >= min_atr * atr[i]:
            g = {"i": i - 1, "lo": float(h[i - 2]), "hi": float(l[i]), "dir": 1}
            fill = l[i + 1:].min() if i + 1 < n else None
            g["filled"] = bool(fill is not None and fill <= g["lo"])
            g["part"] = bool(fill is not None and fill < g["hi"])
            out.append(g)
        if h[i] < l[i - 2] and l[i - 2] - h[i] >= min_atr * atr[i]:
            g = {"i": i - 1, "lo": float(h[i]), "hi": float(l[i - 2]), "dir": -1}
            fill = h[i + 1:].max() if i + 1 < n else None
            g["filled"] = bool(fill is not None and fill >= g["hi"])
            g["part"] = bool(fill is not None and fill > g["lo"])
            out.append(g)
    return out


def liquidity(hs, ls, h, l, atr_now: float, price: float):
    """Đỉnh/đáy bằng nhau chưa bị quét (nơi lệnh dừng tập trung)."""
    out = []
    for arr, kind, sgn in ((hs, "EQH", 1), (ls, "EQL", -1)):
        pts = arr[-14:]
        used = set()
        for a in range(len(pts)):
            grp = [pts[a]]
            for b in range(a + 1, len(pts)):
                if abs(pts[b][1] - pts[a][1]) <= 0.15 * atr_now and b not in used:
                    grp.append(pts[b])
                    used.add(b)
            if len(grp) >= 2:
                lvl = max(p for _, p, _ in grp) if sgn == 1 else min(p for _, p, _ in grp)
                last_i = max(i for i, _, _ in grp)
                after = h[last_i + 1:] if sgn == 1 else l[last_i + 1:]
                swept = bool(len(after) and ((after.max() > lvl) if sgn == 1 else (after.min() < lvl)))
                if not swept:
                    out.append({"kind": kind, "p": lvl, "n": len(grp), "i": last_i})
    out.sort(key=lambda x: abs(x["p"] - price))
    return out[:6]


def analyze(df: pd.DataFrame, n: int = 3) -> dict:
    """Bức tranh SMC hiện tại (để hiển thị & vẽ lên biểu đồ)."""
    if df is None or len(df) < 60:
        return {}
    d = df.reset_index(drop=True)
    W = _walk(d, n)
    t = (pd.to_datetime(d["date"]).values.astype("datetime64[s]").astype("int64")).tolist()
    price = float(d["close"].iloc[-1])
    atr = float(W["atr"][-1])
    ev = [{"t": t[e["i"]], "t0": t[e["from"]], "type": e["type"], "dir": e["dir"], "level": _f(e["level"])} for e in W["events"][-14:]]
    obs = [{"t0": t[o["i"]], "lo": _f(o["lo"]), "hi": _f(o["hi"]), "dir": o["dir"], "mit": t[o["mit"]] if o["mit"] is not None else None,
            "dead": t[o["dead"]] if o["dead"] is not None else None} for o in W["obs"] if o["dead"] is None][-8:]
    fv = [{"t0": t[g["i"]], "lo": _f(g["lo"]), "hi": _f(g["hi"]), "dir": g["dir"], "part": g["part"]} for g in fvgs(d) if not g["filled"]][-8:]
    liq = [{"kind": x["kind"], "p": _f(x["p"]), "n": x["n"], "t0": t[x["i"]]} for x in liquidity(W["hs"], W["ls"], d["high"].values, d["low"].values, atr, price)]
    sw = [{"t": t[s["i"]], "dir": s["dir"], "level": _f(s["level"]), "ext": _f(s["ext"])} for s in W["sweeps"][-6:]]
    out = {"bias": W["trend"], "events": ev, "obs": obs, "fvg": fv, "liq": liq, "sweeps": sw, "atr": _f(atr)}
    sh, sl = W["sh"], W["sl"]
    # biên swing gần nhất cho premium/discount
    hs, ls = W["hs"], W["ls"]
    if hs and ls:
        hi = max(p for _, p, _ in hs[-3:])
        lo = min(p for _, p, _ in ls[-3:])
        if hi > lo:
            pos = (price - lo) / (hi - lo) * 100
            out["pd"] = {"lo": _f(lo), "hi": _f(hi), "eq": _f((hi + lo) / 2), "pos": round(pos, 1),
                         "zone": "Premium (vùng đắt)" if pos > 55 else "Discount (vùng rẻ)" if pos < 45 else "Cân bằng",
                         "ote_long": [_f(hi - 0.79 * (hi - lo)), _f(hi - 0.62 * (hi - lo))], "ote_short": [_f(lo + 0.62 * (hi - lo)), _f(lo + 0.79 * (hi - lo))]}
    last = W["events"][-1] if W["events"] else None
    # tóm tắt
    notes = []
    if last:
        bars = len(d) - 1 - last["i"]
        notes.append(f"{last['type']} {'tăng' if last['dir'] == 1 else 'giảm'} cách đây {bars} nến tại {_f(last['level'])}")
    rs = [s for s in W["sweeps"] if s["i"] >= len(d) - 6]
    for s in rs[-2:]:
        notes.append(f"Vừa quét thanh khoản {'đáy' if s['dir'] == 1 else 'đỉnh'} {_f(s['level'])} (râu tới {_f(s['ext'])})")
    act = [o for o in obs if o["mit"] is None]
    near = sorted(act, key=lambda o: abs((o["lo"] + o["hi"]) / 2 - price))[:1]
    for o in near:
        notes.append(f"OB {'mua' if o['dir'] == 1 else 'bán'} chưa chạm: {o['lo']} – {o['hi']}")
    out["notes"] = notes
    out["sh"] = _f(sh["p"]) if sh else None
    out["sl"] = _f(sl["p"]) if sl else None
    return out


def signals(df: pd.DataFrame, n: int = 3) -> list[dict]:
    """Thiết lập SMC trong lịch sử (không nhìn trước). Định dạng giống ideas.detect."""
    d = df.reset_index(drop=True)
    if len(d) < 120:
        return []
    W = _walk(d, n)
    c, h, l = d["close"].values, d["high"].values, d["low"].values
    atr = W["atr"]
    out = []
    hs, ls = W["hs"], W["ls"]
    # 1) quét thanh khoản + phá cấu trúc ngược lại trong 12 nến
    for e in W["events"]:
        i = e["i"]
        sw = [s for s in W["sweeps"] if s["dir"] == e["dir"] and i - 12 <= s["i"] <= i]
        if not sw:
            continue
        s0 = sw[-1]
        a = atr[i]
        if e["dir"] == 1:
            stop = min(l[s0["i"]:i + 1].min(), s0["ext"]) - 0.2 * a
            ent = c[i]
            if ent - stop <= 0.3 * a or ent - stop > 6 * a:
                continue
            tgt = [p for j, p, cf in hs if cf <= i and p > ent + (ent - stop)]
            t1 = min(tgt) if tgt else ent + 2 * (ent - stop)
            out.append({"i": i, "setup": "smc_sweep_up", "side": 1, "e": float(ent), "s": float(stop), "t1": float(t1), "t2": float(max(t1 + (ent - stop), ent + 3 * (ent - stop)))})
        else:
            stop = max(h[s0["i"]:i + 1].max(), s0["ext"]) + 0.2 * a
            ent = c[i]
            if stop - ent <= 0.3 * a or stop - ent > 6 * a:
                continue
            tgt = [p for j, p, cf in ls if cf <= i and p < ent - (stop - ent)]
            t1 = max(tgt) if tgt else ent - 2 * (stop - ent)
            t2 = min(t1 - (stop - ent), ent - 3 * (stop - ent))
            if t2 > 0:
                out.append({"i": i, "setup": "smc_sweep_dn", "side": -1, "e": float(ent), "s": float(stop), "t1": float(t1), "t2": float(t2)})
    # 2) hồi về OB chưa chạm, cùng chiều cấu trúc
    for ob in W["obs"]:
        m = ob["mit"]
        if m is None or (ob["dead"] is not None and ob["dead"] <= m):
            continue
        a = atr[m]
        if ob["dir"] == 1:
            ent, stop = ob["hi"], ob["lo"] - 0.2 * a
            if ent - stop <= 0.2 * a:
                continue
            tgt = [p for j, p, cf in hs if cf <= m and p > ent + 1.5 * (ent - stop)]
            t1 = min(tgt) if tgt else ent + 2 * (ent - stop)
            out.append({"i": m, "setup": "smc_ob_up", "side": 1, "e": float(ent), "s": float(stop), "t1": float(t1), "t2": float(max(t1 + (ent - stop), ent + 3 * (ent - stop))), "fill": True})
        else:
            ent, stop = ob["lo"], ob["hi"] + 0.2 * a
            if stop - ent <= 0.2 * a:
                continue
            tgt = [p for j, p, cf in ls if cf <= m and p < ent - 1.5 * (stop - ent)]
            t1 = max(tgt) if tgt else ent - 2 * (stop - ent)
            t2 = min(t1 - (stop - ent), ent - 3 * (stop - ent))
            if t2 > 0:
                out.append({"i": m, "setup": "smc_ob_dn", "side": -1, "e": float(ent), "s": float(stop), "t1": float(t1), "t2": float(t2), "fill": True})
    return out
