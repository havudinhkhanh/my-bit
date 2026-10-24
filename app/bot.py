"""Bot giao dịch tự động (giai đoạn 1: chạy trên SÀN THỬ của MyBit – tiền giả, giá thật).

Mỗi lượt 15 phút trên máy chủ, với từng người dùng đã bật bot:
  1. quản lý lệnh đang mở theo nến 1 giờ kể từ lần kiểm tra trước: cắt lỗ, chốt 50% ở MT1 + dời cắt lỗ về hoà vốn,
     chốt phần còn lại ở MT2, cắt theo thời gian; trừ phí, trượt giá và funding futures (mỗi 8 giờ);
  2. mỗi ngày (giờ Việt Nam) viết "báo cáo nghiên cứu": thị trường, nhóm ngành đã chọn, ứng viên tốt nhất, kế hoạch;
  3. tìm thiết lập mới khớp cấu hình (phong cách, cách chơi, chiều, nhóm/coin, bộ lọc chất lượng), tính khối lượng theo
     % rủi ro, chọn spot hay futures, đòn bẩy trong trần hệ thống (risk.lev_cap) và trần của anh, rồi vào lệnh;
  4. dừng mở lệnh khi lỗ trong ngày vượt mức; TẠM DỪNG bot khi sụt quá mức tối đa so với đỉnh.

Cấu hình người dùng ở khoá "bot" (trang web ghi), trạng thái ở khoá "botstate" (chỉ máy chủ ghi).
Lệnh thật trên Binance (giai đoạn 2) sẽ đi qua cùng giao diện Broker với khoá API riêng của bot.
"""
from __future__ import annotations

import json
import logging
import math
import re
from datetime import datetime, timedelta, timezone

from .analysis import risk

log = logging.getLogger("bot")

FEE = {"spot": 0.001, "fut": 0.0005}
SLIP = 0.0005
FAMILY = {"trend": {"pullback_up", "pullback_dn", "breakout_up", "breakout_dn"},
          "reversal": {"smc_sweep_up", "smc_sweep_dn", "oversold_up", "overbought_dn"},
          "smc": {"smc_ob_up", "smc_ob_dn", "smc_sweep_up", "smc_sweep_dn"}}
PRESETS = {
    "safe": {"risk": 0.5, "max_pos": 5, "max_lev": 2, "min_win": 45, "min_avgR": 0.15, "daily_stop": 2, "max_dd": 10, "max_heat": 3, "max_sector": 2, "max_gross": 1.0, "cash_min": 30},
    "bal": {"risk": 1.0, "max_pos": 10, "max_lev": 3, "min_win": 40, "min_avgR": 0.1, "daily_stop": 3, "max_dd": 15, "max_heat": 5, "max_sector": 3, "max_gross": 1.5, "cash_min": 20},
    "aggr": {"risk": 1.5, "max_pos": 15, "max_lev": 5, "min_win": 35, "min_avgR": 0.05, "daily_stop": 5, "max_dd": 25, "max_heat": 8, "max_sector": 4, "max_gross": 2.5, "cash_min": 10},
}
DEFAULT = {"enabled": False, "mode": "paper", "name": "Bot của tôi", "capital": 1000.0, "preset": "bal",
           "target_month": 5.0, "protect": True, "tf": "both", "play": ["trend", "reversal", "smc"], "sides": "both",
           "spot": True, "fut": True, "sectors": [], "coins": [], "exclude": [], "sector_lead": False, "htf_align": False,
           "edge_only": True, "tp1_part": 50, "be_after_tp1": True, "time_stop": True, "streak_cut": True, "eq_ma": True, "use_model": True, **PRESETS["bal"]}
HARD = {"risk": (0.1, 2.0), "max_pos": (1, 20), "max_lev": (1, 5), "min_win": (0, 80), "min_avgR": (0.0, 1.0),
        "daily_stop": (0.5, 10), "max_dd": (3, 50), "capital": (50, 1e7), "target_month": (0, 100), "tp1_part": (0, 100),
        "max_heat": (1, 15), "max_sector": (1, 10), "max_gross": (0.5, 5), "cash_min": (0, 80)}


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _iso(t: datetime) -> str:
    return t.isoformat(timespec="seconds")


def _vn_day(t: datetime) -> str:
    return (t + timedelta(hours=7)).strftime("%Y-%m-%d")


def norm(c: dict | None) -> dict:
    c = {**DEFAULT, **(c or {})}
    for k, (lo, hi) in HARD.items():
        try:
            c[k] = min(hi, max(lo, float(c[k])))
        except (TypeError, ValueError):
            c[k] = DEFAULT[k]
    c["max_pos"], c["max_lev"] = int(c["max_pos"]), int(c["max_lev"])
    c["play"] = [p for p in (c.get("play") or []) if p in FAMILY] or ["trend", "reversal", "smc"]
    for k in ("sectors", "coins", "exclude"):
        c[k] = [str(x).upper() if k != "sectors" else str(x) for x in (c.get(k) or [])][:60]
    c["mode"] = "paper"            # giai đoạn 1: chỉ sàn thử
    return c


def new_state(cap: float, now: datetime) -> dict:
    return {"v": 1, "start": cap, "cash": cap, "pos": [], "hist": [], "log": [], "eq": [[_iso(now), round(cap, 2)]], "peak": cap,
            "day": {"d": _vn_day(now), "eq0": cap}, "month": {"m": _vn_day(now)[:7], "eq0": cap}, "paused": None,
            "research": None, "seq": 1, "created": _iso(now), "reset_seen": None, "close_seen": None, "last": None}


def _say(st: dict, now: datetime, msg: str, kind: str = "info") -> None:
    st["log"] = (st.get("log") or [])[-199:] + [{"t": _iso(now), "k": kind, "m": msg}]


def _sig(x: float) -> float:
    if not x:
        return 0.0
    d = max(2, 6 - int(math.floor(math.log10(abs(x)))))
    return round(x, d)


def equity(st: dict, price) -> float:
    e = float(st.get("cash") or 0)
    for p in st.get("pos") or []:
        m = price(p["k"]) or p["e"]
        if p["mkt"] == "spot":
            e += p["q"] * m
        else:
            e += p["margin"] + p["sd"] * p["q"] * (m - p["e"])
    return e


# ------------------------------------------------------------------ sàn thử: khớp lệnh
class Paper:
    """Giao diện khớp lệnh. Giai đoạn 2 sẽ có Binance cùng các hàm open / close."""

    def open(self, st: dict, x: dict, mkt: str, q: float, px: float, lev: int, now: datetime) -> dict:
        sd = 1 if x["side"] == "long" else -1
        fill = px * (1 + sd * SLIP)
        n = q * fill
        fee = n * FEE[mkt]
        margin = n / lev if mkt == "fut" else n
        st["cash"] -= margin + fee
        p = {"id": st["seq"], "k": x["k"], "mkt": mkt, "side": x["side"], "sd": sd, "q": q, "q0": q, "e": fill, "s": x["s"], "s0": x["s"],
             "t1": x["t1"], "t2": x["t2"], "lev": lev, "margin": margin if mkt == "fut" else 0.0, "fees": fee, "fee0": fee, "fund": 0.0, "real": 0.0,
             "tf": x["tf"], "setup": x["setup"], "name": x.get("name"), "win1": x.get("win1"), "avgR": x.get("avgR"),
             "risk_usd": q * abs(fill - x["s"]), "opened": _iso(now), "chk": _iso(now), "tp1": False,
             "tmax": _iso(now + timedelta(days=(x.get("d1") or 10) * (x.get("bd") or 1) * 2.2))}
        st["seq"] += 1
        st["pos"].append(p)
        return p

    def close(self, st: dict, p: dict, q: float, px: float, why: str, now: datetime) -> float:
        fill = px * (1 - p["sd"] * SLIP)
        pnl = p["sd"] * q * (fill - p["e"])
        fee = q * fill * FEE[p["mkt"]]
        if p["mkt"] == "spot":
            st["cash"] += q * fill - fee
        else:
            part = p["margin"] * q / p["q"]
            p["margin"] -= part
            st["cash"] += part + pnl - fee
        p["q"] -= q
        p["fees"] += fee
        p["real"] += pnl - fee
        return pnl - fee


BROKER = Paper()


def _finish(st: dict, p: dict, now: datetime, why: str) -> dict:
    tot = p["real"] - p["fee0"] - p["fund"]           # lãi/lỗ sau phí mở, phí đóng (đã trừ trong real) và funding
    r = tot / p["risk_usd"] if p["risk_usd"] else None
    h = {"id": p["id"], "k": p["k"], "mkt": p["mkt"], "side": p["side"], "lev": p["lev"], "e": p["e"], "s0": p["s0"], "t1": p["t1"], "t2": p["t2"],
         "q": p["q0"], "pnl": round(tot, 2), "r": round(r, 2) if r is not None else None, "why": why, "tf": p["tf"], "setup": p["setup"],
         "name": p.get("name"), "opened": p["opened"], "closed": _iso(now)}
    st["hist"] = (st.get("hist") or [])[-299:] + [h]
    st["pos"] = [y for y in st["pos"] if y is not p]
    return h


def _bars_since(bars, since: str, opened: str):
    """Nến 1 giờ (DataFrame date/high/low/close) cần xét: chồng 1 nến với lần kiểm tra trước (nến chưa đóng lúc đó),
    và chỉ các nến BẮT ĐẦU sau lúc vào lệnh (tránh tính biến động trước khi khớp)."""
    if bars is None or not len(bars):
        return []
    dt = bars["date"]
    try:
        if getattr(dt.dt, "tz", None) is not None:
            dt = dt.dt.tz_convert(None)
    except (AttributeError, TypeError):
        pass
    t, o = datetime.fromisoformat(since), datetime.fromisoformat(opened)
    m = (dt > t - timedelta(hours=1)) & (dt >= o)
    d = bars[m.values]
    return list(zip(dt[m.values], d["high"].astype(float), d["low"].astype(float), d["close"].astype(float)))


def manage(st: dict, cfg: dict, price, bars_of, f8_of, now: datetime, events: list) -> None:
    for p in list(st.get("pos") or []):
        bars = _bars_since(bars_of(p["k"]), p["chk"], p["opened"])
        done = False
        for _, hi, lo, _c in bars:
            L = p["sd"] > 0
            hit_s = lo <= p["s"] if L else hi >= p["s"]
            hit_1 = (hi >= p["t1"] if L else lo <= p["t1"]) and not p["tp1"]
            hit_2 = hi >= p["t2"] if L else lo <= p["t2"]
            if hit_s:                         # thận trọng: chạm cả cắt lỗ và mục tiêu trong cùng nến → tính cắt lỗ
                _close(st, p, p["q"], p["s"], "SL" if not p["tp1"] else "BE", now, events)
                done = True
                break
            if hit_1:
                part = p["q"] * cfg["tp1_part"] / 100
                if part > 0 and part < p["q"] * 0.999:
                    BROKER.close(st, p, part, p["t1"], "TP1", now)
                    p["tp1"] = True
                    if cfg["be_after_tp1"]:
                        p["s"] = p["e"]
                    events.append(("tp1", p, None))
                    _say(st, now, f"{p['k']}: chạm MT1 {_sig(p['t1'])} – chốt {cfg['tp1_part']:.0f}%, dời cắt lỗ về hoà vốn", "tp")
                else:
                    _close(st, p, p["q"], p["t1"], "TP1", now, events)
                    done = True
                    break
            if hit_2:
                _close(st, p, p["q"], p["t2"], "TP2", now, events)
                done = True
                break
        if done:
            continue
        # funding futures: mỗi mốc 00/08/16 UTC đi qua
        if p["mkt"] == "fut":
            f8 = f8_of(p["k"])
            if f8 is not None:
                last = datetime.fromisoformat(p["chk"])
                n8 = int(now.timestamp() // 28800) - int(last.timestamp() // 28800)
                if n8 > 0:
                    m = price(p["k"]) or p["e"]
                    pay = p["sd"] * p["q"] * m * f8 / 100 * n8
                    p["fund"] += pay
                    st["cash"] -= pay
        # thanh lý (isolated) – phòng trường hợp cắt lỗ xa hơn giá thanh lý
        if p["mkt"] == "fut":
            m = price(p["k"])
            if m and p["margin"] + p["sd"] * p["q"] * (m - p["e"]) <= p["q"] * m * 0.005:
                _close(st, p, p["q"], m, "LIQ", now, events)
                continue
        if cfg["time_stop"] and not p["tp1"] and now >= datetime.fromisoformat(p["tmax"]):
            m = price(p["k"])
            if m:
                _close(st, p, p["q"], m, "TIME", now, events)
                continue
        p["chk"] = _iso(now)


def _close(st, p, q, px, why, now, events):
    BROKER.close(st, p, q, px, why, now)
    h = _finish(st, p, now, why)
    events.append(("close", p, h))
    lab = {"SL": "dính cắt lỗ", "BE": "về hoà vốn sau MT1", "TP1": "chạm MT1", "TP2": "chạm MT2", "TIME": "hết thời gian kỳ vọng", "LIQ": "bị thanh lý",
           "MANUAL": "anh yêu cầu đóng", "PAUSE": "bot tạm dừng"}.get(why, why)
    _say(st, now, f"Đóng {p['k']} ({'Long' if p['sd'] > 0 else 'Short'} {p['mkt']}) – {lab}: {'+' if h['pnl'] >= 0 else ''}{h['pnl']:.2f} USDT"
         + (f" ({h['r']:+.2f}R)" if h['r'] is not None else ""), "win" if h["pnl"] >= 0 else "loss")


# ------------------------------------------------------------------ chọn lệnh mới
def _fam_ok(cfg, setup):
    return any(setup in FAMILY[f] for f in cfg["play"])


def candidates(cfg: dict, items: list, rows: dict, sectors: dict, fut: dict, btc_up: bool) -> tuple[list, dict]:
    why = {}
    out = []

    def skip(r):
        why[r] = why.get(r, 0) + 1

    for x in items:
        k, r = x["k"], rows.get(x["k"]) or {}
        if cfg["tf"] != "both" and x["tf"] != cfg["tf"]:
            skip("khác phong cách"); continue
        if not _fam_ok(cfg, x["setup"]):
            skip("khác cách chơi"); continue
        if cfg["sides"] == "long" and x["side"] != "long" or cfg["sides"] == "short" and x["side"] != "short":
            skip("khác chiều"); continue
        if cfg["edge_only"] and not x.get("edge"):
            skip("không có lợi thế lịch sử"); continue
        if (x.get("win1") or 0) < cfg["min_win"] or (x.get("avgR") or 0) < cfg["min_avgR"]:
            skip("dưới ngưỡng chất lượng"); continue
        if cfg["htf_align"] and x.get("htf") != "h+":
            skip("khung lớn không cùng chiều"); continue
        if cfg["use_model"] and x.get("play") == "avoid":
            skip("mô hình riêng của mã: tránh thiết lập này"); continue
        if cfg["use_model"] and x.get("pm") is not None and x["pm"] < cfg["min_win"]:
            skip("mô hình học máy: xác suất thấp"); continue
        if k in cfg["exclude"]:
            skip("coin bị loại"); continue
        g = r.get("g")
        in_scope = (not cfg["sectors"] and not cfg["coins"]) or (g in cfg["sectors"]) or (k in cfg["coins"])
        if not in_scope:
            skip("ngoài phạm vi nhóm/coin"); continue
        if cfg["sector_lead"] and g:
            q = (sectors.get(g) or {}).get("q")
            if x["side"] == "long" and q not in ("Dẫn dắt", "Cải thiện") or x["side"] == "short" and q not in ("Tụt hậu", "Suy yếu"):
                skip("nhóm ngành không thuận"); continue
        has_spot, has_fut = bool(r.get("spot")), k in fut
        mkt = None
        if x["side"] == "long" and cfg["spot"] and has_spot:
            mkt = "spot"
        elif cfg["fut"] and has_fut:
            mkt = "fut"
        if not mkt:
            skip("không có thị trường phù hợp (spot/futures)"); continue
        out.append({**x, "_mkt": mkt, "_g": g})
    def ev(x):              # kỳ vọng theo R: ưu tiên xác suất của mô hình học máy (nếu có), rồi tới thống kê
        p = (x.get("pm") if cfg["use_model"] and x.get("pm") is not None else x.get("win1") or 0) / 100
        return p * (x.get("r1") or 1.5) - (1 - p) + (0.1 if x.get("play") == "prefer" else 0)
    out.sort(key=lambda x: (ev(x), x.get("score") or 0), reverse=True)
    return out, why


def _live_ok(x: dict, p: float) -> tuple[bool, str]:
    sd = 1 if x["side"] == "long" else -1
    if sd * (p - x["s"]) <= 0:
        return False, "giá đã qua cắt lỗ"
    if sd * (p - x["t1"]) >= 0:
        return False, "giá đã tới MT1"
    rr = abs(x["t1"] - p) / abs(p - x["s"])
    if rr < 1.2:
        return False, f"giá đã chạy (R:R còn {rr:.1f})"
    return True, f"R:R {rr:.1f}"


def entries(st, cfg, cands, rows, light, price, now, events, risk_mult=1.0):
    eq = equity(st, price)
    held = {p["k"] for p in st["pos"]}
    used = set(st.get("used") or [])
    cool = {h["k"] for h in (st.get("hist") or []) if h["pnl"] < 0 and now - datetime.fromisoformat(h["closed"]) < timedelta(hours=24)}
    for x in cands:
        if len(st["pos"]) >= cfg["max_pos"]:
            break
        sig = f"{x['k']}|{x['setup']}|{x['tf']}|{x.get('at')}"
        if x["k"] in held or sig in used or x["k"] in cool:
            continue
        if cfg["use_model"] and (x.get("play") == "avoid" or (x.get("pm") is not None and x["pm"] < cfg["min_win"])):
            continue
        p = price(x["k"])
        if not p:
            continue
        ok, txt = _live_ok(x, p)
        if not ok:
            continue
        risk_pct = cfg["risk"] * risk_mult
        heat = sum(q["risk_usd"] for q in st["pos"] if not (q["tp1"] and q["s"] == q["e"])) / eq * 100
        if heat + risk_pct > cfg["max_heat"] + 1e-9:
            continue
        g = x.get("_g")
        if g and sum(1 for q in st["pos"] if q.get("g") == g) >= cfg["max_sector"]:
            continue
        gross = sum(q["q"] * (price(q["k"]) or q["e"]) for q in st["pos"]) / eq
        free = st["cash"] - eq * cfg["cash_min"] / 100
        r = {**(rows.get(x["k"]) or {}), "k": x["k"]}
        stop_pct = abs(p - x["s"]) / p * 100
        q = eq * risk_pct / 100 / abs(p - x["s"])
        n = min(q * p, max(0.0, (cfg["max_gross"] - gross) * eq))
        mkt = x["_mkt"]
        dd = max(0.0, (1 - eq / st["peak"]) * 100) if st.get("peak") else 0.0
        if mkt == "spot":
            n = min(n, eq * 0.3, free * 0.98)
            lev = 1
        else:
            cap = min(cfg["max_lev"], risk.lev_cap(r, x["side"], x["tf"], stop_pct, light, dd))
            n = min(n, eq * 0.25 * cap)
            lev = max(1, min(cap, math.ceil(n / max(1e-9, eq * 0.25))))
            if n / lev > free * 0.98:
                n = max(0.0, free * 0.98 * lev)
        q = n / p
        if n < 10:
            continue
        pos = BROKER.open(st, x, mkt, q, p, lev, now)
        pos["g"] = g
        held.add(x["k"])
        st["used"] = (st.get("used") or [])[-299:] + [sig]
        events.append(("open", pos, None))
        _say(st, now, f"Vào {'Long' if x['side'] == 'long' else 'Short'} {x['k']} ({'spot' if mkt == 'spot' else f'futures x{lev}'}) ở {_sig(pos['e'])} · "
             f"cắt lỗ {_sig(x['s'])} · MT1 {_sig(x['t1'])} · MT2 {_sig(x['t2'])} · rủi ro {pos['risk_usd']:.2f} USDT – {x.get('name')} "
             f"({'ngày' if x['tf'] == 'd' else '4h'}, xác suất {x.get('win1')}%, lãi TB {x.get('avgR')}R, {txt})", "open")


# ------------------------------------------------------------------ báo cáo nghiên cứu hằng ngày
def research(cfg, cands, why, sectors, rows, light, btc_up, st, eq, now) -> dict:
    L = {"green": "Xanh", "yellow": "Vàng", "red": "Đỏ"}.get(light or "", "—")
    lines = [f"Thị trường: đèn {L}, BTC {'trên' if btc_up else 'dưới'} MA200 → "
             + ("ưu tiên Long theo xu hướng." if light == "green" else "giảm khối lượng, chỉ lệnh có lợi thế rõ." if light == "yellow" else "phòng thủ, ưu tiên Short có lợi thế / đứng ngoài.")]
    scope = cfg["sectors"] or sorted({(rows.get(k) or {}).get("g") for k in cfg["coins"] if (rows.get(k) or {}).get("g")})
    sec_lines = []
    for g in (scope or [])[:8]:
        s = sectors.get(g) or {}
        if s:
            sec_lines.append({"g": g, "q": s.get("q"), "r30": s.get("r30"), "rs30": s.get("rs30"), "top": (s.get("best7") or [])[:3], "head": s.get("head")})
    if not scope:
        lead = [g for g, s in sectors.items() if s.get("q") == "Dẫn dắt"][:4]
        if lead:
            lines.append("Nhóm đang dẫn dắt: " + ", ".join(lead) + ".")
    picks = [{"k": x["k"], "side": x["side"], "tf": x["tf"], "mkt": x["_mkt"], "name": x.get("name"), "e": x["e"], "s": x["s"], "t1": x["t1"], "t2": x["t2"],
              "win1": x.get("win1"), "avgR": x.get("avgR"), "g": x.get("_g")} for x in cands[:8]]
    if picks:
        lines.append(f"{len(cands)} thiết lập khớp cấu hình; tốt nhất: " + ", ".join(f"{p['k']} {'Long' if p['side'] == 'long' else 'Short'}" for p in picks[:4]) + ".")
    else:
        lines.append("Không có thiết lập nào khớp cấu hình hôm nay – bot đứng ngoài (không vào cũng là quyết định đúng).")
    top_skip = sorted(why.items(), key=lambda kv: -kv[1])[:3]
    if top_skip:
        lines.append("Bị loại nhiều nhất vì: " + "; ".join(f"{k} ({v})" for k, v in top_skip) + ".")
    mret = (eq / st["month"]["eq0"] - 1) * 100 if st["month"]["eq0"] else 0
    need = cfg["target_month"] - mret
    exp_trade = cfg["risk"] * (sum(p["avgR"] or 0 for p in picks) / len(picks) if picks else 0.15)
    lines.append(f"Tháng này: {mret:+.2f}% / mục tiêu {cfg['target_month']:.1f}%"
                 + (f" – cần thêm {need:.1f}% ≈ {math.ceil(need / exp_trade) if exp_trade > 0 else '∞'} lệnh như kỳ vọng hiện tại ({exp_trade:.2f}%/lệnh)." if need > 0 else " – đã đạt, bot giảm một nửa rủi ro để giữ lãi." if cfg["protect"] else " – đã đạt."))
    return {"d": _vn_day(now), "at": _iso(now), "lines": lines, "sectors": sec_lines, "picks": picks, "light": light, "btc_up": btc_up}


# ------------------------------------------------------------------ một lượt cho một người dùng
def step(cfg_raw: dict, st: dict | None, items, rows, sectors, fut, prices, bars_of, light, btc_up, now: datetime | None = None) -> tuple[dict, list]:
    cfg = norm(cfg_raw)
    now = now or _now()
    events: list = []
    price = lambda k: (prices.get(k) or [None])[0]  # noqa: E731
    f8_of = lambda k: (fut.get(k) or [None])[0]  # noqa: E731
    if not st or (cfg_raw or {}).get("reset_at") and (cfg_raw or {}).get("reset_at") != (st or {}).get("reset_seen"):
        st = new_state(cfg["capital"], now)
        st["reset_seen"] = (cfg_raw or {}).get("reset_at")
        _say(st, now, f"Khởi tạo tài khoản bot trên sàn thử: {cfg['capital']:.0f} USDT")
    # 1) quản lý lệnh đang mở
    manage(st, cfg, price, bars_of, f8_of, now, events)
    # 2) anh yêu cầu đóng hết
    ca = (cfg_raw or {}).get("close_all_at")
    if ca and ca != st.get("close_seen"):
        for p in list(st["pos"]):
            m = price(p["k"]) or p["e"]
            _close(st, p, p["q"], m, "MANUAL", now, events)
        st["close_seen"] = ca
    eq = equity(st, price)
    st["peak"] = max(float(st.get("peak") or eq), eq)
    day = _vn_day(now)
    if st["day"]["d"] != day:
        st["day"] = {"d": day, "eq0": eq}
    if st["month"]["m"] != day[:7]:
        st["month"] = {"m": day[:7], "eq0": eq}
    dd = (1 - eq / st["peak"]) * 100 if st["peak"] else 0
    day_pct = (eq / st["day"]["eq0"] - 1) * 100 if st["day"]["eq0"] else 0
    mon_pct = (eq / st["month"]["eq0"] - 1) * 100 if st["month"]["eq0"] else 0
    # 3) tạm dừng khi sụt quá mức
    if dd >= cfg["max_dd"] and not st.get("paused"):
        st["paused"] = {"at": _iso(now), "why": f"sụt {dd:.1f}% so với đỉnh (giới hạn {cfg['max_dd']:.0f}%)"}
        _say(st, now, f"⛔ Bot TẠM DỪNG: {st['paused']['why']}. Lệnh đang mở vẫn giữ cắt lỗ; bấm 'Chạy lại' để tiếp tục.", "stop")
        events.append(("pause", None, st["paused"]))
    if (cfg_raw or {}).get("resume_at") and (cfg_raw or {}).get("resume_at") != st.get("resume_seen"):
        st["resume_seen"] = cfg_raw["resume_at"]
        if st.get("paused"):
            st["paused"] = None
            st["peak"] = eq
            _say(st, now, "Anh cho bot chạy lại – đỉnh tài sản được đặt lại theo hiện tại.")
    cands, why = candidates(cfg, items, rows, sectors, fut, btc_up)
    # 4) báo cáo ngày
    if not st.get("research") or st["research"].get("d") != day:
        st["research"] = research(cfg, cands, why, sectors, rows, light, btc_up, st, eq, now)
        events.append(("research", None, st["research"]))
    st["research"]["n_cands"] = len(cands)
    st["research"]["skip"] = why
    # 5) lệnh mới
    halt = None
    if not cfg["enabled"]:
        halt = "bot đang tắt"
    elif st.get("paused"):
        halt = "bot tạm dừng"
    elif day_pct <= -cfg["daily_stop"]:
        halt = f"lỗ {day_pct:.1f}% hôm nay (giới hạn {cfg['daily_stop']:.1f}%)"
    mult = 0.5 if (cfg["protect"] and mon_pct >= cfg["target_month"] > 0) else 1.0
    last3 = (st.get("hist") or [])[-3:]
    if cfg["streak_cut"] and len(last3) == 3 and all(h["pnl"] < 0 for h in last3) and now - datetime.fromisoformat(last3[-1]["closed"]) < timedelta(hours=24):
        mult *= 0.5
    eqs = [q[1] for q in (st.get("eq") or [])[-20:]]
    if cfg["eq_ma"] and len(eqs) >= 20 and eq < sum(eqs) / len(eqs):
        mult *= 0.5
    if not halt:
        entries(st, cfg, cands, rows, light, price, now, events, mult)
    eq = equity(st, price)
    h = st.get("eq") or []
    if not h or (now - datetime.fromisoformat(h[-1][0])).total_seconds() >= 3000:
        h.append([_iso(now), round(eq, 2)])
    st["eq"] = h[-2500:]
    hist = st.get("hist") or []
    wins = [x for x in hist if x["pnl"] > 0]
    st["stats"] = {"eq": round(eq, 2), "ret": round((eq / st["start"] - 1) * 100, 2), "dd": round(dd, 2), "day_pct": round(day_pct, 2), "mon_pct": round(mon_pct, 2),
                   "n": len(hist), "win": round(len(wins) / len(hist) * 100, 1) if hist else None,
                   "avgR": round(sum(x["r"] or 0 for x in hist) / len(hist), 2) if hist else None, "halt": halt, "risk_mult": mult,
                   "open_risk": round(sum(p["risk_usd"] for p in st["pos"] if not p["tp1"]), 2)}
    st["last"] = _iso(now)
    return st, events


def notes(events: list, u: dict) -> list[dict]:
    out = []
    for kind, p, h in events:
        if kind == "open":
            out.append({"key": f"bot:open:{p['id']}:{p['opened']}", "kind": "bot", "sev": 2, "sym": p["k"], "url": "#/bot",
                        "title": f"🤖 Bot vào {'Long' if p['sd'] > 0 else 'Short'} {p['k']} ({'spot' if p['mkt'] == 'spot' else 'futures x' + str(p['lev'])})",
                        "body": f"Giá {_sig(p['e'])} · cắt lỗ {_sig(p['s'])} · MT1 {_sig(p['t1'])} · rủi ro {p['risk_usd']:.2f} USDT (sàn thử)"})
        elif kind == "close":
            out.append({"key": f"bot:close:{h['id']}:{h['closed']}", "kind": "bot", "sev": 2, "sym": h["k"], "url": "#/bot",
                        "title": f"🤖 Bot đóng {h['k']}: {'+' if h['pnl'] >= 0 else ''}{h['pnl']:.2f} USDT" + (f" ({h['r']:+.2f}R)" if h['r'] is not None else ""),
                        "body": f"Lý do: {h['why']} · vào {_sig(h['e'])} (sàn thử)"})
        elif kind == "pause":
            out.append({"key": f"bot:pause:{h['at']}", "kind": "bot", "sev": 3, "url": "#/bot", "title": "⛔ Bot tạm dừng", "body": h["why"]})
        elif kind == "research":
            out.append({"key": f"bot:research:{h['d']}", "kind": "bot", "sev": 1, "url": "#/bot", "title": "🤖 Báo cáo nghiên cứu hôm nay của bot",
                        "body": " ".join(h["lines"])[:600]})
    return out


def make_plan(cfg_raw: dict, st: dict | None, items, rows, sectors, fut, prices, light, btc_up, now: datetime | None = None) -> dict:
    """Kế hoạch cho bộ khớp lệnh chạy mỗi phút (Cloudflare Worker): ứng viên đã lọc + trần đòn bẩy, funding, nguồn giá, báo cáo ngày."""
    cfg = norm(cfg_raw)
    now = now or _now()
    cands, why = candidates(cfg, items, rows, sectors, fut, btc_up)
    price = lambda k: (prices.get(k) or [None])[0]  # noqa: E731
    out = []
    for x in cands[:30]:
        r = {**(rows.get(x["k"]) or {}), "k": x["k"]}
        p = price(x["k"]) or x["e"]
        sp = abs(p - x["s"]) / p * 100 if p else None
        c = {k: x.get(k) for k in ("k", "tf", "setup", "name", "side", "e", "s", "t1", "t2", "d1", "bd", "win1", "avgR", "at", "htf", "pm", "play", "coin_n", "coin_win", "coin_R", "m_best")} \
            | {"mkt": x["_mkt"], "g": x.get("_g"), "cap": risk.lev_cap(r, x["side"], x["tf"], sp, light, 0.0)}
        if cfg["use_model"] and x.get("m_best"):        # mục tiêu đã tối ưu theo lịch sử riêng của mã
            sd, rk = (1 if x["side"] == "long" else -1), abs(x["e"] - x["s"])
            c["t1_0"], c["t1"] = x["t1"], x["e"] + sd * x["m_best"] * rk
            c["t2"] = x["e"] + sd * max(2 * x["m_best"], abs(x["t2"] - x["e"]) / rk) * rk
        out.append(c)
    keys = {x["k"] for x in out} | {p["k"] for p in (st or {}).get("pos") or []}
    meta = {}
    for k in keys:
        r = rows.get(k) or {}
        meta[k] = {"sp": r.get("sp"), "sm": r.get("sm") or 1, "bf": r.get("bf"), "bfm": r.get("bfm") or 1, "okx": "okx" in str(r.get("fx") or ""), "fx": r.get("fx"), "p": price(k)}
    st0 = st or new_state(cfg["capital"], now)
    eq = equity(st0, price)
    res = research(cfg, cands, why, sectors, rows, light, btc_up, st0, eq, now)
    res["n_cands"], res["skip"] = len(cands), why
    return {"at": _iso(now), "light": light, "btc_up": btc_up, "cands": out, "f8": {k: (fut.get(k) or [None])[0] for k in keys}, "meta": meta, "research": res}


def bots_of(c) -> list:
    if isinstance(c, dict) and isinstance(c.get("bots"), list):
        return c["bots"][:6]
    return [{"id": "b1", **c}] if isinstance(c, dict) and "enabled" in c else []


def states_of(s) -> dict:
    if isinstance(s, dict) and isinstance(s.get("bots"), dict):
        return s["bots"]
    return {"b1": s} if isinstance(s, dict) and s.get("cash") is not None else {}


def run_all(be, us: list, items, rows, sectors, fut, prices, bars_of, light, btc_up, deliver, cfg_d1: dict | None = None) -> int:
    """Lượt 15 phút cho MỌI bot của mọi người dùng. Nếu bộ khớp lệnh mỗi phút (Worker) đang chạy → chỉ viết kế hoạch + gửi thông báo
    đẩy/email cho sự kiện Worker ghi. Nếu Worker chưa chạy (hoặc ngừng > 5 phút) → tự chạy cả vòng như trước (dự phòng)."""
    from . import users
    hb = (cfg_d1 or {}).get("bot_hb")
    try:
        worker = bool(hb) and (_now() - datetime.fromisoformat(hb.replace("Z", "")[:19])).total_seconds() < 300
    except ValueError:
        worker = False
    log.info("Bot: bộ khớp lệnh mỗi phút %s (nhịp tim %s)", "ĐANG CHẠY" if worker else "chưa chạy – lượt 15 phút tự xử lý", hb or "chưa có")
    if (cfg_d1 or {}).get("bot_px"):
        log.info("Bot: nguồn giá lần gần nhất %s", str(cfg_d1["bot_px"])[:600])
    try:     # tình trạng bot giám sát (Worker ghi mỗi phút) – để kiểm tra từ log
        rs, _ = be.q("SELECT updated_at, length(value) AS n, json_extract(value, '$.think.head') AS head, json_array_length(json_extract(value, '$.lessons')) AS nl, "
                     "json_array_length(json_extract(value, '$.watch')) AS nw, json_extract(value, '$.eng.pace') AS pace, json_extract(value, '$.eng.acct') AS acct, "
                     "json_extract(value, '$.eng.idx') AS idx, json_extract(value, '$.mc.p_x') AS px FROM user_data WHERE key = 'supstate'", [])
        for r in rs or []:
            log.info("Bot giám sát: cập nhật %s · %s byte · %s bài học đã xét · %s đang theo dõi · %s", r.get("updated_at"), r.get("n"), r.get("nl"), r.get("nw"), (r.get("head") or "")[:200])
            log.info("Cỗ máy vốn: chỉ số %s · trạng thái %s · cỡ lệnh chung ×%s · P(×2) %s", r.get("idx"), r.get("pace"), r.get("acct"), r.get("px"))
    except Exception as e:  # noqa: BLE001
        log.info("Bot giám sát: chưa đọc được (%s)", e)
    try:     # tình trạng bot lướt giây (Durable Object ghi mỗi ~10 giây)
        rs, _ = be.q("SELECT updated_at, json_extract(value, '$.enabled') AS en, json_extract(value, '$.feeds') AS src, json_extract(value, '$.cnt') AS ws, "
                     "json_extract(value, '$.bn') AS lm, json_extract(value, '$.eq') AS eq, json_extract(value, '$.stats.n') AS n, json_extract(value, '$.stats.net') AS net, "
                     "json_extract(value, '$.stats.fees') AS fees, json_extract(value, '$.diag') AS diag FROM user_data WHERE key = 'scalpstate'", [])
        for r in rs or []:
            log.info("Bot lướt giây: cập nhật %s · bật %s · luồng %s · mỗi giây %s · Binance %s · tài sản %s · %s lệnh · ròng %s · phí %s · chẩn đoán %s", r.get("updated_at"), r.get("en"), r.get("src"),
                     r.get("ws"), r.get("lm"), r.get("eq"), r.get("n"), r.get("net"), r.get("fees"), str(r.get("diag") or "")[:400])
        rs, _ = be.q("SELECT value FROM user_data WHERE key = 'scalpping'", [])
        for r in rs or []:
            log.info("Bot lướt giây – lần đánh thức gần nhất: %s", str(r.get("value"))[:800])
        rs, _ = be.q("SELECT json_extract(value, '$.why') AS why, json_extract(value, '$.sh.all') AS sha, json_extract(value, '$.sh.best') AS shb, json_extract(value, '$.sh.open') AS sho, "
                     "json_extract(value, '$.cfg.mode') AS mode, json_extract(value, '$.cfg.hmax') AS hmax, json_extract(value, '$.cfg.sh_min') AS shmin, json_extract(value, '$.pause') AS pause, json_extract(value, '$.sys') AS sys, "
                     "json_extract(value, '$.log') AS lg FROM user_data WHERE key = 'scalpstate'", [])
        for r in rs or []:
            log.info("Bot lướt giây – cài đặt: cách khớp %s · giữ tối đa %s · lệnh ảo tối thiểu %s · tạm dừng %s · máy %s", r.get("mode"), r.get("hmax"), r.get("shmin"), str(r.get("pause"))[:200], str(r.get("sys"))[:200])
            log.info("Bot lướt giây – vì sao: %s", str(r.get("why"))[:900])
            log.info("Bot lướt giây – lệnh ảo đang chạy %s · tổng: %s", r.get("sho"), str(r.get("sha"))[:1500])
            log.info("Bot lướt giây – lệnh ảo tốt nhất: %s", str(r.get("shb"))[:1500])
            try:
                for l in (json.loads(r.get("lg") or "[]"))[-8:]:
                    log.info("Bot lướt giây – nhật ký: %s %s", l.get("t"), str(l.get("m"))[:300])
            except Exception:  # noqa: BLE001
                pass
        # kiểm tra: kỳ vọng lúc vào lệnh so với thực tế, theo mốc giữ / lý do thoát / loại thị trường
        rs, _ = be.q("SELECT json_extract(value, '$.trades') AS tr FROM user_data WHERE key = 'scalpstate'", [])
        for r in rs or []:
            T = json.loads(r.get("tr") or "[]")
            if not T:
                continue
            def agg(xs):
                n = len(xs)
                f = lambda k: round(sum((t.get(k) or 0) for t in xs) / n, 2)
                return f"{n} lệnh: kỳ vọng {f('exp')} · gộp thực {f('gross')} · phí {f('fee')} · ròng {f('net')} bps · thắng {round(sum(1 for t in xs if (t.get('net') or 0) > 0) / n * 100)}% · giữ TB {f('hold')}s"
            log.info("Bot lướt giây – kiểm tra %s", agg(T))
            for key in ("why", "h", "t", "g", "how"):
                G = {}
                for t in T:
                    G.setdefault(str(t.get(key)), []).append(t)
                log.info("Bot lướt giây – theo %s: %s", key, " | ".join(f"{k}: {agg(v)}" for k, v in sorted(G.items())))
            top = {}
            for t in T:
                top.setdefault(t.get("k"), []).append(t.get("net") or 0)
            log.info("Bot lướt giây – coin vào nhiều nhất: %s", ", ".join(f"{k} {len(v)} lệnh ròng {round(sum(v), 1)} bps" for k, v in sorted(top.items(), key=lambda x: -len(x[1]))[:10]))
    except Exception as e:  # noqa: BLE001
        log.info("Bot lướt giây: chưa đọc được (%s)", e)
    n = 0
    for u in us:
        d = u.get("data") or {}
        B = bots_of(d.get("bot"))
        if not B or ("bot" not in u.get("features", set()) and u.get("role") != "admin"):
            continue
        S = states_of(d.get("botstate"))
        if not any(b.get("enabled") or S.get(b.get("id")) for b in B):
            continue
        try:
            plans, out, evs = {}, dict(S), []
            for b in B:
                bid = b.get("id") or "b1"
                st = S.get(bid)
                if not (b.get("enabled") or st):
                    continue
                if not worker:
                    st, ev = step(b, st, items, rows, sectors, fut, prices, bars_of, light, btc_up)
                    out[bid] = st
                    for x in notes(ev, u):
                        x["key"] = f"bot:{bid}:{x['key'][4:]}"
                        if len(B) > 1:
                            x["title"] = re.sub(r"^(🤖|⛔) (Bot )?", lambda m: f"{m.group(1)} {b.get('name') or bid}: ", x["title"])
                        evs.append(x)
                plans[bid] = make_plan(b, st, items, rows, sectors, fut, prices, light, btc_up)
            if not worker:
                users.save(be, u["id"], "botstate", {"v": 2, "bots": out})
                if evs:
                    deliver(u, evs)
            old = d.get("botplan") or {}
            pl = {"v": 2, "at": _iso(_now()), "bots": plans, "pushed_at": old.get("pushed_at") or _iso(_now()) + ".000Z"}
            if worker:       # đẩy / email cho thông báo bot mà Worker vừa ghi vào chuông
                rs, _ = be.q("SELECT key, kind, sev, title, body, url, sym, created_at FROM notifications WHERE user_id = ? AND kind IN ('bot', 'botw', 'scalp') AND created_at > ? ORDER BY created_at",
                             [u["id"], pl["pushed_at"]])
                if rs:
                    cfgx = users.config(be)
                    site = cfgx.get("site_url") or ""
                    old = [x for x in rs if x["kind"] == "bot"]          # "botw"/"scalp" đã được Cloudflare đẩy ngay → ở đây chỉ còn gửi email
                    if old:
                        users.send_push(be, cfgx, u, old, site)
                    users.send_email(cfgx, u, [{**x, "kind": "bot"} for x in rs], "MyBit – bot giao dịch", site)
                    pl["pushed_at"] = rs[-1]["created_at"]
            users.save(be, u["id"], "botplan", pl)
            n += len(plans)
        except Exception as e:  # noqa: BLE001
            log.warning("bot %s: %s", u.get("email"), e)
    return n
