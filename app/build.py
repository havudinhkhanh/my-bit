"""Phân tích toàn bộ coin & xuất dữ liệu cho trang web (site/data/*.json)."""
from __future__ import annotations

import json
import logging
import math
import time
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from . import config
from .analysis import cval, derivs, ideas, levels, pairs, regime, smc, strategy, technical
from .analysis import indicators as ind
from .analysis.strategy import sig6
from .data import store, universe

log = logging.getLogger("build")
OUT = config.OUT_DIR


def _f(x, nd=2):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return None if (math.isnan(x) or math.isinf(x)) else round(x, nd)


def _ok(r):
    e = r.get("excl")
    return e is None or (isinstance(e, float) and e != e) or e == ""


def _clean(o):
    if isinstance(o, float):
        return None if (math.isnan(o) or math.isinf(o)) else o
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if isinstance(o, np.floating):
        v = float(o)
        return None if (math.isnan(v) or math.isinf(v)) else v
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.bool_):
        return bool(o)
    return o


def _w(name: str, obj):
    p = OUT / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(_clean(obj), ensure_ascii=False, separators=(",", ":"), default=_dflt, allow_nan=False), encoding="utf-8")


def _dflt(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        v = float(o)
        return None if math.isnan(v) or math.isinf(v) else v
    if isinstance(o, (pd.Timestamp, datetime)):
        return o.isoformat()
    if isinstance(o, (np.bool_,)):
        return bool(o)
    return str(o)


def _px(tf: str, key: str) -> pd.DataFrame | None:
    p = store.path(f"px/{tf}") / f"{key}.parquet"
    if not p.exists():
        return None
    df = pd.read_parquet(p)
    if df.empty:
        return None
    df["date"] = pd.to_datetime(df["date"])
    return df.drop_duplicates("date").sort_values("date").reset_index(drop=True)


def _read_pq(sub: str, key: str):
    p = store.path(sub) / f"{key}.parquet"
    return pd.read_parquet(p) if p.exists() else None


def _ohlc(df: pd.DataFrame, n: int, daily: bool) -> dict:
    d = df.tail(n)
    t = d["date"].values.astype("datetime64[s]").astype("int64").tolist()
    return {"t": t, "o": [sig6(x) for x in d["open"]], "h": [sig6(x) for x in d["high"]], "l": [sig6(x) for x in d["low"]],
            "c": [sig6(x) for x in d["close"]], "v": [round(float(x or 0)) for x in d.get("qvol", d["volume"] * d["close"])]}


def _ret(c: pd.Series, n: int):
    return _f((c.iloc[-1] / c.iloc[-n - 1] - 1) * 100, 1) if len(c) > n and c.iloc[-n - 1] else None


def _unlock_files() -> dict:
    out = {}
    d = store.path("unlocks")
    if not d.exists():
        return out
    for f in d.glob("*.json"):
        try:
            j = json.loads(f.read_text(encoding="utf-8"))
        except ValueError:
            continue
        g = j.get("gecko_id") or ((j.get("token") or "").replace("coingecko:", "") if str(j.get("token") or "").startswith("coingecko:") else None)
        if g:
            j["_file"] = f.stem
            out[g] = j
    return out


UNL_CAT = {"insiders": "Đội ngũ / nhà đầu tư sớm", "privateSale": "Bán riêng (quỹ)", "publicSale": "Bán công khai", "noncirculating": "Quỹ dự trữ / hệ sinh thái",
           "farming": "Thưởng / khai thác", "airdrop": "Airdrop", "liquidity": "Thanh khoản"}


def _fmt_desc(desc: str, t: int, amt_pct) -> str:
    """Mô tả đợt mở khoá bằng tiếng Việt: hạng mục + tên quỹ (lấy từ câu mẫu tiếng Anh của DefiLlama)."""
    import re
    m = re.search(r"of (.+?) tokens", desc or "") or re.search(r"from (.+?) on", desc or "")
    who = m.group(1).strip() if m else ""
    kind = "vách (1 lần)" if "cliff" in (desc or "").lower() else "định kỳ"
    return (who + " · " if who else "") + kind


def run(notify: bool = False) -> dict:
    t0 = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    acfg = config.get("alerts", {}) or {}
    uni = store.read("universe")
    uni = uni.astype(object).where(uni.notna(), None)
    cg = store.read("cg_markets")
    cgi = cg.drop_duplicates("id").set_index("id") if not cg.empty else pd.DataFrame()
    now = store.read("fut_now")
    hist = store.read("fut_hist")
    if not hist.empty:
        hist["ts"] = pd.to_datetime(hist["ts"])
    spot = store.read("bv_spot")
    spot_px = dict(zip(spot["pair"], spot["price"])) if not spot.empty else {}
    spot_qv = dict(zip(spot["pair"], spot["qvol"])) if not spot.empty else {}
    groups = store.read("cg_groups")
    gmap = {}
    if not groups.empty:
        order = {lab: i for i, (_, lab) in enumerate(cval.CG_GROUP)}
        for r in groups.sort_values("group", key=lambda s: s.map(order)).to_dict("records"):
            gmap.setdefault(r["id"], r["group"])
    cf = cval.cashflows(store.read("ll_protocols"), store.read("ll_parents"), store.read("ll_fees"), store.read("ll_chains"))
    cfmap = {r["gecko_id"]: r for r in cf.to_dict("records")} if not cf.empty else {}
    unl_files = _unlock_files()
    news = store.read("news")
    nby = {}
    if not news.empty:
        news["time"] = pd.to_datetime(news["time"])
        news = news.sort_values("time", ascending=False)
        for k, g in news.groupby("key", sort=False):
            nby[k] = g.head(20).to_dict("records")
    bnu = store.read("bn_um")
    bn_pair = dict(zip(bnu["key"], bnu["pair"])) if not bnu.empty else {}
    btc = _px("d", "BTC")
    btc_reg = regime.regime_series(btc) if btc is not None else None
    btc_down = bool(btc_reg is not None and btc_reg.iloc[-1] < 0)
    rows, details, pxs, alerts = [], {}, {}, []
    book, fresh = ideas.Book(), {}
    h1s = {}
    tr_bt = []
    for r in uni.to_dict("records"):
        if not _ok(r):
            continue
        key = r["key"]
        df = _px("d", key)
        c = cgi.loc[r["id"]] if (not cgi.empty and r["id"] in cgi.index) else None
        fut = json.loads(r.get("fut") or "{}")
        vlist = derivs.venues(fut, now)
        price = None
        if r.get("spot_pair") and spot_px.get(r["spot_pair"]):
            price = float(spot_px[r["spot_pair"]]) / float(r.get("spot_mult") or 1)
        elif df is not None:
            price = float(df["close"].iloc[-1])
        elif vlist:
            price = vlist[0]["price"]
        elif c is not None:
            price = float(c["current_price"])
        if not price:
            continue
        if df is not None:
            pxs[key] = df
        g = lambda k: (None if c is None else c.get(k))  # noqa: E731
        circ, tot, mx = g("circulating_supply"), g("total_supply"), g("max_supply")
        cgp = g("current_price")
        mcap = (circ * price) if circ else g("market_cap")
        fdv = ((mx or tot) * price) if (mx or tot) else g("fully_diluted_valuation")
        grp = gmap.get(r["id"])
        cfr = cfmap.get(r["id"])
        if cfr and cfr.get("category"):          # có dòng tiền DefiLlama → nhóm theo hoạt động tạo doanh thu chính
            cat = cfr.get("main_cat") or cfr["category"]
            grp = cval.LL_GROUP.get(cat, grp or cat)
        em = unl_files.get(r["id"])
        unl = cval.unlock_stats(em, circ, price) if em else {}
        if unl.get("next"):
            for e in unl["next"]:
                e["desc"] = _fmt_desc(e.get("desc"), e["t"], e.get("pct"))
                e["cat"] = UNL_CAT.get(e.get("cat"), e.get("cat"))
        sup = _read_pq("supply", r["id"])
        infl = cval.inflation(sup)
        coin = {"key": key, "price": price, "mcap": mcap, "fdv": fdv, "circ": circ, "total": tot, "max": mx, "group": grp}
        val = cval.value_coin(coin, cfr, unl, infl, {})
        # ----- giá & kỹ thuật
        tech, trend, bt, hedge, rets = {}, {}, {}, {}, {}
        if df is not None and len(df) >= 30:
            cc = df["close"]
            rets = {"r1": _ret(cc, 1), "r7": _ret(cc, 7), "r30": _ret(cc, 30), "r90": _ret(cc, 90), "r365": _ret(cc, 365)}
            dfi = df.set_index("date")
            try:
                ti = ind.compute_all(dfi)
                bench = btc.set_index("date")["close"] if btc is not None and key != "BTC" else None
                tech = technical.summarize(dfi, ti, bench)
            except Exception as e:  # noqa: BLE001
                log.warning("tech %s: %s", key, e)
            trend = strategy.trend_signal(df, btc_down)
            if len(df) >= 400:
                bt = {"long": strategy.backtest_trend(dfi, None, allow_short=False),
                      "ls": strategy.backtest_trend(dfi, btc_reg, allow_short=bool(fut))}
                if bt["long"]:
                    tr_bt.append({"key": key, **{k: v for k, v in bt["long"].items() if k != "eq"}})
            hedge = strategy.hedge_stats(df, btc) if key != "BTC" else {"beta": 1.0, "corr": 1.0}
        h4, h1 = (_px("h4", key), _px("h1", key)) if fut or r.get("spot_pair") else (None, None)
        intra = strategy.intraday(h4, h1, trend.get("state")) if h4 is not None and h1 is not None else {}
        # ----- phái sinh
        oi_tot = sum(v.get("oi_usd") or 0 for v in vlist) or None
        vol_fut = sum(v.get("vol_usd") or 0 for v in vlist) or None
        w = [(v["f8"], v.get("oi_usd") or 0) for v in vlist if v.get("f8") is not None]
        f8 = (sum(a * b for a, b in w) / sum(b for _, b in w)) if w and sum(b for _, b in w) > 0 else (w[0][0] if w else None)
        fh = _read_pq("funding", key)
        fst = derivs.funding_stats(fh, f8, None)
        bnm = derivs.bnm_stats(_read_pq("bnm", key))
        oi24 = derivs.oi_change(fut, hist, 24)
        oi7 = derivs.oi_change(fut, hist, 24 * 7)
        if oi24 is None:
            oi24 = bnm.get("oi1d")
        if oi7 is None:
            oi7 = bnm.get("oi7d")
        quad = derivs.quadrant(rets.get("r7"), oi7)
        crowd = derivs.crowding(f8, fst, oi7, rets.get("r7"), bnm.get("lsr_acct"), acfg)
        has_spot = bool(r.get("spot_pair"))
        car = derivs.carry(vlist, fst, has_spot)
        max_lev = max([v.get("max_lev") or 0 for v in vlist] or [0]) or None
        ath = g("ath")
        row = {"k": key, "id": r["id"], "n": r["name"], "rk": _f(r.get("rank"), 0), "p": sig6(price), **rets,
               "mc": _f(mcap, 0), "fdv": _f(fdv, 0), "vol": _f((spot_qv.get(r.get("spot_pair")) if r.get("spot_pair") else None) or g("total_volume"), 0),
               "g": grp, "spot": has_spot, "fx": r.get("fut_ex") or "", "fl": _f(val.get("float_pct"), 1),
               "u90": _f(val.get("u90_pct"), 2), "u365": _f(val.get("u365_pct"), 1), "inf": _f(val.get("infl365") or val.get("infl90"), 1),
               "vd": val.get("verdict"), "ps": val.get("ps"), "phr": val.get("phr"), "ig": val.get("implied_g"), "rev": val.get("rev_ann"),
               "ts": trend.get("state"), "td": trend.get("days"), "tsc": tech.get("score"),
               "ath": _f((price / ath - 1) * 100, 1) if ath else None,
               "oi": _f(oi_tot, 0), "oi24": _f(oi24, 1), "oi7": _f(oi7, 1), "f8": _f(f8, 4), "fp": fst.get("pctl90"),
               "f7": fst.get("avg7d"), "lsr": bnm.get("lsr_acct"), "cr": [x["k"] for x in crowd], "car": car.get("ann7") if car else None,
               "beta": hedge.get("beta"), "ml": max_lev, "atr": trend.get("atr_pct"),
               "sp": r.get("spot_pair"), "sm": float(r.get("spot_mult") or 1), "bf": bn_pair.get(key),
               "bfm": universe.split_mult(bn_pair[key][:-4])[1] if bn_pair.get(key) else None, "new": bool(df is not None and len(df) < int(config.get("universe.min_history_days", 60)))}
        rows.append(row)
        smc_x = {tf: smc.analyze(dd, 3) for tf, dd in (("d", df), ("h4", h4), ("h1", h1)) if dd is not None and len(dd) >= 60}
        if h1 is not None:
            h1s[key] = h1
        lvd = levels.analyze(df, 1.0) if df is not None else {}
        lvh = levels.analyze(h4, 4 / 24) if h4 is not None else {}
        flow_d = levels.money_flow(df, oi7, f8) if df is not None else {}
        flow_h = levels.money_flow(h4, oi24, f8) if h4 is not None else {}
        for tf, dd in (("d", df), ("h4", h4)):
            if dd is not None and len(dd) >= 150 and ((row.get("vol") or 0) >= 2e6 or (oi_tot or 0) >= 2e6):
                dd2 = dd.reset_index(drop=True)
                sg = ideas.detect(dd2, tf)
                book.add(key, tf, dd2, ideas.simulate(dd2, sg, 60), ideas.regime_of(dd2, btc_reg))
                fresh[(key, tf)] = (dd2, sg)
        row["mf"] = flow_d.get("score")
        nl = []
        for n in nby.get(key, []):
            n = {**n, "t": n["time"].strftime("%Y-%m-%dT%H:%M"), "time": None}
            if grp == "Blockchain L1/L2" and n.get("sign", 0) < 0 and n.get("sev", 0) >= 3:
                n["sev"], n["tag"] = 1, "Sự cố trong hệ sinh thái"      # dự án trên chuỗi bị hack ≠ chuỗi bị hack
            nl.append({k2: v for k2, v in n.items() if k2 not in ("time", "key")})
        cut = (pd.Timestamp.utcnow().tz_localize(None) - pd.Timedelta(days=3)).strftime("%Y-%m-%dT%H:%M")
        row["nw"] = sum(1 for n in nl if n["t"] >= cut and n.get("sign", 0) < 0 and n.get("sev", 0) >= 3) or None
        details[key] = {"row": row, "val": val, "news": nl, "lv": {"d": lvd, "h4": lvh}, "smc": smc_x, "flow": {"d": flow_d, "h4": flow_h}, "cf": {k: (_f(v, 0) if isinstance(v, (int, float)) else v) for k, v in (cfr or {}).items()
                                                        if k in ("name", "category", "fees_total30d", "rev_total30d", "hrev_total30d", "fees_total1y",
                                                                 "rev_total1y", "hrev_total1y", "fees_total30DaysAgo", "rev_total30DaysAgo", "n_parts")},
                        "unl": {"series": [p for p in (em or {}).get("series", []) if p[0] > time.time() - 3 * 365 * 86400][::2] if em else [],
                                "cats": (em or {}).get("cats"), "file": (em or {}).get("_file"), "supply": (em or {}).get("supply")},
                        "sup": [[d.strftime("%Y-%m-%d"), sig6(s)] for d, s in zip(sup["date"], sup["supply"])][::3] if sup is not None and not sup.empty else [],
                        "tech": tech, "trend": trend, "bt": bt, "intra": intra, "hedge": hedge, "venues": vlist, "fst": fst, "bnm": bnm, "quad": quad,
                        "crowd": crowd, "carry": car, "df": df, "h4": h4, "h1": h1,
                        "cg": {k: (g(k) if not isinstance(g(k), float) or g(k) == g(k) else None) for k in
                               ("ath", "ath_date", "atl", "atl_date", "market_cap_rank", "total_volume", "circulating_supply", "total_supply", "max_supply")}}
        for x in crowd:
            if x.get("sev", 0) >= 2 and (oi_tot or 0) > 5e6:
                alerts.append({"k": key, "t": x["t"], "d": x["d"], "kind": x["k"]})
    # ----- cơ hội giao dịch (cần thống kê lịch sử của toàn bộ coin trước)
    T = book.table()
    btc_up = not btc_down
    idea_list = []
    for (key, tf), (dd2, sg) in fresh.items():
        d = details[key]
        ctx = {"flow": d["flow"].get("d" if tf == "d" else "h4"), "zones": (d["lv"].get(tf) or {}).get("zones"), "crowd": d["row"].get("cr"), "perp": bool(d["row"].get("fx"))}
        cur = ideas.current(key, tf, dd2, book, btc_up, ctx, sg)
        for x in cur:
            st_ = (T.get(tf, {}).get(x["setup"], {}).get("up" if btc_up else "down")) or {}
            x["avgR_2y"] = st_.get("avgR_2y")
            # có lợi thế: kỳ vọng dương, đủ mẫu, và còn dương ở 2 năm gần nhất (tránh lợi thế chỉ có trong quá khứ)
            x["edge"] = bool((x.get("avgR") or 0) >= 0.05 and (x.get("n") or 0) >= 100 and (st_.get("avgR_2y") is None or st_["avgR_2y"] > 0))
            x["vd"] = d["row"].get("vd")
            x["mc"] = d["row"].get("mc")
        d.setdefault("ideas", []).extend(cur)
        idea_list += cur
        d.setdefault("setup_stats", {})[tf] = {st: ideas.stats(book.coin.get((key, tf, st), [])) for st in ideas.NAMES if book.coin.get((key, tf, st))}
    idea_list.sort(key=lambda x: (x["edge"], x["score"] or -99), reverse=True)
    _w("ideas.json", {"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "btc_up": btc_up, "stats": T, "names": ideas.NAMES, "items": idea_list[:200]})
    store.path("ideas_stats.json").write_text(json.dumps(_clean(T)), encoding="utf-8")
    # ----- định giá: so với nhóm (lượt 2)
    peers = cval.peer_stats([{**d["val"], "group": d["row"]["g"]} for d in details.values()])
    for key, d in details.items():
        if d["val"].get("has_cf"):
            coin = {"key": key, "price": d["row"]["p"], "mcap": d["row"]["mc"], "fdv": d["row"]["fdv"], "circ": d["cg"].get("circulating_supply"),
                    "total": d["cg"].get("total_supply"), "max": d["cg"].get("max_supply"), "group": d["row"]["g"]}
            cfr = cfmap.get(d["row"]["id"])
            em = unl_files.get(d["row"]["id"])
            unl = cval.unlock_stats(em, coin["circ"], coin["price"]) if em else {}
            if unl.get("next"):
                for e in unl["next"]:
                    e["desc"] = _fmt_desc(e.get("desc"), e["t"], e.get("pct"))
                e["cat"] = UNL_CAT.get(e.get("cat"), e.get("cat"))
            d["val"] = cval.value_coin(coin, cfr, unl, cval.inflation(_read_pq("supply", d["row"]["id"])), peers)
            d["row"]["vd"] = d["val"]["verdict"]
    # ----- thị trường
    market = build_market(rows, details, pxs, btc, peers, alerts)
    # ----- cặp coin chạy cùng nhau
    try:
        liq = [r["k"] for r in sorted([r for r in rows if r["k"] in pxs], key=lambda r: -((r.get("vol") or 0) + (r.get("oi") or 0)))]
        P = {"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "corr": pairs.corr_matrix(pxs, liq[:40], 90),
             "lead": pairs.lead_lag(h1s), "pairs": pairs.pair_trades(pxs, liq[:70], corr_min=0.75),
             "rs": pairs.rel_strength(pxs, liq[:150], btc) if btc is not None else []}
        _w("pairs.json", P)
    except Exception as e:  # noqa: BLE001
        log.warning("pairs: %s", e)
    # ----- xuất
    for key, d in details.items():
        df, h4, h1 = d.pop("df"), d.pop("h4"), d.pop("h1")
        d["ohlc"] = {"d": _ohlc(df, 1500, True) if df is not None else None, "h4": _ohlc(h4, 600, False) if h4 is not None else None,
                     "h1": _ohlc(h1, 500, False) if h1 is not None else None}
        _w(f"c/{key}.json", d)
    store.path("last_rows.json").write_text(json.dumps({"_light": (market.get("light") or {}).get("color"),
                                                       **{r["k"]: {"ts": r.get("ts"), "td": r.get("td"), "atr": r.get("atr"), "mc": r.get("mc"), "cr": r.get("cr"), "id": r.get("id"),
                                                                   "ml": r.get("ml")} for r in rows}}), encoding="utf-8")
    _w("coins.json", {"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "rows": rows, "peers": peers,
                      "light": (market.get("light") or {}).get("color"), "btc_up": not btc_down})
    _w("market.json", market)
    _w("backtest.json", backtest_summary(tr_bt, market))
    meta = {"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "coins": len(rows), "sec": round(time.time() - t0, 1),
            "ver": str(int(time.time()))}
    _w("meta.json", meta)
    log.info("Xuất %d coin trong %.0fs", len(rows), time.time() - t0)
    if notify:
        try:
            from . import notify as nt
            nt.run(market, rows, details)
        except Exception as e:  # noqa: BLE001
            log.warning("notify: %s", e)
    return meta


def build_market(rows, details, pxs, btc, peers, alerts) -> dict:
    out = {"at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    fng = store.read("fng")
    mvrv = store.read("mvrv")
    if not fng.empty:
        fng["date"] = pd.to_datetime(fng["date"])
    if not mvrv.empty:
        mvrv["date"] = pd.to_datetime(mvrv["date"])
    tr = regime.btc_trend(btc) if btc is not None else {}
    if btc is not None:
        tr["sp"] = [sig6(x) for x in btc["close"].tail(120)]
    rank = {r["k"]: r["rk"] for r in rows if r.get("rk")}
    br = regime.breadth({k: v for k, v in pxs.items() if (rank.get(k) or 9999) <= 300})
    alt = regime.alt_season(pxs, rank, btc) if btc is not None else {}
    study = regime.fng_study(fng, btc) if (btc is not None and not fng.empty) else {}
    cyc = cval.btc_cycle(mvrv, btc)
    fng_now = float(fng["fng"].iloc[-1]) if not fng.empty else None
    # funding/OI toàn thị trường (theo OI)
    fw = [(r["f8"], r["oi"]) for r in rows if r.get("f8") is not None and r.get("oi")]
    agg_f8 = sum(a * b for a, b in fw) / sum(b for _, b in fw) if fw else None
    tot_oi = sum(r.get("oi") or 0 for r in rows)
    tot_mc = sum(r.get("mc") or 0 for r in rows)
    out.update({"btc": tr, "breadth": br, "alt": alt, "fng": {"now": fng_now, "zone": regime.fng_zone(fng_now),
                                                            "series": [[d.strftime("%Y-%m-%d"), int(v)] for d, v in zip(fng["date"].tail(400), fng["fng"].tail(400))] if not fng.empty else [],
                                                            "study": study},
                "cycle": cyc, "light": regime.light(tr, br, fng_now), "agg": {"f8": _f(agg_f8, 4), "oi": _f(tot_oi, 0), "oi_mc": _f(tot_oi / tot_mc * 100, 2) if tot_mc else None}})
    out["play"] = regime.playbook(tr, fng_now, study, cyc, agg_f8)
    # ---- bảng số liệu tổng hợp
    ex = {}
    if not fng.empty:
        fv = fng.set_index("date")["fng"]
        ex["fng_1d"], ex["fng_7d"], ex["fng_30d"] = (int(fv.iloc[-2]) if len(fv) > 1 else None, int(fv.iloc[-8]) if len(fv) > 8 else None,
                                                     int(fv.iloc[-31]) if len(fv) > 31 else None)
    eth = pxs.get("ETH")
    if eth is not None and btc is not None:
        j = pd.concat([eth.set_index("date")["close"], btc.set_index("date")["close"]], axis=1, keys=["e", "b"]).dropna()
        rr = j["e"] / j["b"]
        ex["eth"] = {"p": _f(j["e"].iloc[-1], 2), "r7": _f((j["e"].iloc[-1] / j["e"].iloc[-8] - 1) * 100, 1), "r30": _f((j["e"].iloc[-1] / j["e"].iloc[-31] - 1) * 100, 1),
                     "ethbtc": _f(rr.iloc[-1], 5), "ethbtc30": _f((rr.iloc[-1] / rr.iloc[-31] - 1) * 100, 1),
                     "ethbtc_vs200": _f((rr.iloc[-1] / rr.tail(200).mean() - 1) * 100, 1), "ethbtc_pctl": _f((rr.tail(1460) < rr.iloc[-1]).mean() * 100, 0)}
    liq = [r for r in rows if (r.get("vol") or 0) >= 1e6]
    up = sum(1 for r in liq if (r.get("r1") or 0) > 0)
    ex["adv"] = {"up": up, "down": sum(1 for r in liq if (r.get("r1") or 0) < 0), "n": len(liq),
                 "up7": sum(1 for r in liq if (r.get("r7") or 0) > 0)}
    hi = lo = 0
    for k, d in pxs.items():
        if len(d) >= 200 and any(r["k"] == k for r in liq[:400]):
            c = d["close"].tail(365)
            if c.iloc[-1] >= c.max() * 0.98:
                hi += 1
            elif c.iloc[-1] <= c.min() * 1.02:
                lo += 1
    ex["hl52"] = {"hi": hi, "lo": lo}
    oiw = [(r.get("oi24"), r.get("oi")) for r in rows if r.get("oi24") is not None and r.get("oi")]
    ex["oi24"] = _f(sum(a * b for a, b in oiw) / sum(b for _, b in oiw), 2) if oiw else None
    fs = [r["f8"] for r in rows if r.get("f8") is not None and (r.get("oi") or 0) > 5e6]
    ex["f_pos"] = _f(sum(1 for x in fs if x > 0) / len(fs) * 100, 0) if fs else None
    ex["f_med"] = _f(float(np.median(fs)), 4) if fs else None
    ex["f_hot_n"] = sum(1 for x in fs if x >= 0.05)
    ex["f_neg_n"] = sum(1 for x in fs if x < 0)
    bd = (details.get("BTC") or {}).get("bnm") or {}
    ex["btc_lsr"], ex["btc_top"], ex["btc_taker"] = bd.get("lsr_acct"), bd.get("lsr_top_pos"), bd.get("taker")
    ex["btc_f8"] = (details.get("BTC") or {}).get("row", {}).get("f8")
    ex["btc_oi"] = (details.get("BTC") or {}).get("row", {}).get("oi")
    ex["btc_oi7"] = (details.get("BTC") or {}).get("row", {}).get("oi7")
    ex["btc_mf"] = ((details.get("BTC") or {}).get("flow") or {}).get("d", {}).get("score")
    # nhóm ngành
    grp = {}
    for r in liq:
        if r.get("g"):
            grp.setdefault(r["g"], []).append(r)
    sec = []
    for gname, L in grp.items():
        if len(L) >= 3:
            med = lambda k: _f(float(np.median([x[k] for x in L if x.get(k) is not None])), 1) if any(x.get(k) is not None for x in L) else None  # noqa: E731
            best = max(L, key=lambda x: x.get("r7") or -999)
            sec.append({"g": gname, "n": len(L), "r1": med("r1"), "r7": med("r7"), "r30": med("r30"), "mc": _f(sum(x.get("mc") or 0 for x in L), 0),
                        "best": best["k"], "best7": best.get("r7"), "up": sum(1 for x in L if x.get("ts") == 1)})
    ex["sectors"] = sorted(sec, key=lambda x: -(x["r7"] or -999))
    out["ex"] = ex
    st = store.read("stable")
    if not st.empty:
        st["date"] = pd.to_datetime(st["date"])
        s = st.set_index("date")["stable"].dropna()
        out["stable"] = {"now": _f(s.iloc[-1], 0), "c30": _f((s.iloc[-1] / s.iloc[-31] - 1) * 100, 2) if len(s) > 31 else None,
                         "c90": _f((s.iloc[-1] / s.iloc[-91] - 1) * 100, 2) if len(s) > 91 else None,
                         "series": [[d.strftime("%Y-%m-%d"), _f(v / 1e9, 2)] for d, v in zip(s.index[-400:], s.values[-400:])]}
    for k in ("dvol_btc", "dvol_eth"):
        d = store.read(k)
        if not d.empty:
            v = d["dvol"].astype(float)
            out[k] = {"now": _f(v.iloc[-1], 1), "pctl": _f((v < v.iloc[-1]).mean() * 100, 0)}
    try:
        out["global"] = json.loads(store.path("cg_global.json").read_text())
    except (OSError, ValueError):
        pass
    # danh sách nổi bật
    live = [r for r in rows if (r.get("mc") or 0) > 5e7 or (r.get("oi") or 0) > 1e7]

    def top(key, n=10, rev=True, cond=lambda r: True):
        xs = [r for r in live if r.get(key) is not None and cond(r)]
        xs.sort(key=lambda r: r[key], reverse=rev)
        return [r["k"] for r in xs[:n]]

    out["lists"] = {"gain7": top("r7"), "lose7": top("r7", rev=False), "f_hot": top("f8", cond=lambda r: (r.get("oi") or 0) > 5e6 and r["f8"] > 0.02),
                    "f_cold": top("f8", rev=False, cond=lambda r: (r.get("oi") or 0) > 5e6 and r["f8"] < 0), "oi_up": top("oi7", cond=lambda r: (r.get("oi") or 0) > 5e6),
                    "carry": top("car", cond=lambda r: (r.get("oi") or 0) > 3e6 and (r.get("car") or 0) >= 15),
                    "cheap": [r["k"] for r in sorted([r for r in rows if r.get("vd") == "Rẻ" and (r.get("mc") or 0) > 5e7], key=lambda r: -(r.get("mc") or 0))[:12]],
                    "trend_new": [r["k"] for r in sorted([r for r in live if r.get("ts") == 1 and (r.get("td") or 99) <= 5], key=lambda r: -(r.get("mc") or 0))[:12]]}
    # mở khoá lớn sắp tới (14 ngày)
    ev = []
    nowt = time.time()
    for k, d in details.items():
        for e in d["val"].get("unlock_next") or []:
            if nowt <= e["t"] <= nowt + 14 * 86400 and (e.get("pct") or 0) >= 0.5:
                ev.append({"k": k, **e})
    agg = {}
    for e in ev:                                   # gộp nhiều hạng mục cùng coin cùng ngày
        k2 = (e["k"], int(e["t"] // 86400))
        a = agg.setdefault(k2, {**e, "pct": 0.0, "usd": 0.0, "cats": []})
        a["pct"] += e.get("pct") or 0
        a["usd"] += e.get("usd") or 0
        if e.get("cat") and e["cat"] not in a["cats"]:
            a["cats"].append(e["cat"])
    out["unlocks"] = sorted(agg.values(), key=lambda e: e["t"])[:30]
    out["alerts"] = alerts[:40]
    hl = []
    seen = set()
    for k, d in details.items():
        for n in d.get("news") or []:
            if n.get("sev", 0) >= 2 and n["t"] >= (pd.Timestamp.utcnow().tz_localize(None) - pd.Timedelta(hours=72)).strftime("%Y-%m-%dT%H:%M") and n["title"] not in seen:
                seen.add(n["title"])
                hl.append({"k": k, **n})
    out["news"] = sorted(hl, key=lambda n: ((n.get("sev") or 0), n["t"]), reverse=True)[:30]
    out["news"].sort(key=lambda n: n["t"], reverse=True)
    out["counts"] = {"coins": len(rows), "fut": sum(1 for r in rows if r["fx"]), "spot": sum(1 for r in rows if r["spot"]),
                     "cf": sum(1 for d in details.values() if d["val"].get("has_cf"))}
    return out


def backtest_summary(tr_bt, market) -> dict:
    df = pd.DataFrame(tr_bt)
    out = {"trend": {}, "fng": (market.get("fng") or {}).get("study"), "mvrv": (market.get("cycle") or {}).get("mvrv_fwd")}
    if not df.empty:
        for col in ("cagr", "bh_cagr", "mdd", "bh_mdd", "win", "expo"):
            out["trend"][col] = _f(df[col].median(), 1)
        out["trend"]["n"] = int(len(df))
        out["trend"]["beat"] = _f((df["cagr"] > df["bh_cagr"]).mean() * 100, 0)
        out["trend"]["dd_better"] = _f((df["mdd"] > df["bh_mdd"]).mean() * 100, 0)
        out["trend"]["rows"] = df.sort_values("cagr", ascending=False)[["key", "years", "cagr", "bh_cagr", "mdd", "bh_mdd", "trades", "win"]].to_dict("records")
    return out
