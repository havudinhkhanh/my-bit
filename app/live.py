"""Lượt nhanh (15 phút/lần): giá + futures mới nhất, quét lại cơ hội giao dịch khung 4h/ngày, cảnh báo danh mục.
Kết quả ghi vào Cloudflare KV ("intraday") – trang web đọc qua /api/intraday, không cần đăng lại cả trang."""
from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone

import pandas as pd
import requests

from .analysis import derivs, ideas, levels, regime
from .data import store, update

log = logging.getLogger("live")


def _kv_put(key: str, obj) -> bool:
    acc, tok, ns = os.environ.get("CF_ACCOUNT_ID"), os.environ.get("CF_API_TOKEN"), os.environ.get("CF_KV_NAMESPACE_ID")
    if not (acc and tok and ns):
        return False
    url = f"https://api.cloudflare.com/client/v4/accounts/{acc}/storage/kv/namespaces/{ns}/values/{key}"
    try:
        r = requests.put(url, headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
                         data=json.dumps(obj, ensure_ascii=False, default=str, allow_nan=False).encode("utf-8"), timeout=30)
        return r.ok
    except Exception as e:  # noqa: BLE001
        log.warning("Không ghi được KV %s: %s", key, e)
        return False


class _Book(ideas.Book):
    def __init__(self, table: dict):
        super().__init__()
        self._t = table


def _px(tf, key):
    p = store.path(f"px/{tf}") / f"{key}.parquet"
    if not p.exists():
        return None
    d = pd.read_parquet(p)
    d["date"] = pd.to_datetime(d["date"])
    return d.drop_duplicates("date").sort_values("date").reset_index(drop=True)


def run(notify: bool = False) -> dict:
    t0 = time.time()
    update.futures_snapshot()
    update.prices_daily()
    update.prices_intraday()
    try:
        update.news()
    except Exception as e:  # noqa: BLE001
        log.warning("news: %s", e)
    uni = update._uni()
    now = store.read("fut_now")
    hist = store.read("fut_hist")
    if not hist.empty:
        hist["ts"] = pd.to_datetime(hist["ts"])
    try:
        table = json.loads(store.path("ideas_stats.json").read_text())
    except (OSError, ValueError):
        table = {}
    book = _Book(table)
    btc = _px("d", "BTC")
    btc_up = bool(btc is not None and regime.regime_series(btc).iloc[-1] > 0)
    prices, fut, items = {}, {}, []
    for r in uni.to_dict("records"):
        if not update._ok(r):
            continue
        k = r["key"]
        d = _px("d", k)
        h1 = _px("h1", k)
        h4 = _px("h4", k)
        p = None
        if h1 is not None and len(h1):
            p = float(h1["close"].iloc[-1])
            r24 = (p / float(h1["close"].iloc[-25]) - 1) * 100 if len(h1) > 25 else None
        elif d is not None and len(d) > 1:
            p = float(d["close"].iloc[-1])
            r24 = (p / float(d["close"].iloc[-2]) - 1) * 100
        else:
            continue
        prices[k] = [levels.sig(p), round(r24, 2) if r24 is not None else None]
        fm = json.loads(r.get("fut") or "{}")
        vl = derivs.venues(fm, now)
        oi = sum(v.get("oi_usd") or 0 for v in vl)
        w = [(v["f8"], v.get("oi_usd") or 0) for v in vl if v.get("f8") is not None]
        f8 = (sum(a * b for a, b in w) / sum(b for _, b in w)) if w and sum(b for _, b in w) > 0 else None
        if vl:
            fut[k] = [round(f8, 5) if f8 is not None else None, round(oi), derivs.oi_change(fm, hist, 24)]
        liquid = oi >= 2e6 or (d is not None and len(d) and float(d.get("qvol", d["volume"] * d["close"]).iloc[-2:].mean()) >= 2e6)
        if not liquid or not table:
            continue
        for tf, dd in (("d", d), ("h4", h4)):
            if dd is None or len(dd) < 150:
                continue
            lvx = levels.analyze(dd, 1.0 if tf == "d" else 4 / 24)
            fl = levels.money_flow(dd, None, f8)
            ctx = {"flow": fl, "zones": lvx.get("zones"), "crowd": [], "perp": bool(vl)}
            for x in ideas.current(k, tf, dd, book, btc_up, ctx):
                st = (table.get(tf, {}).get(x["setup"], {}).get("up" if btc_up else "down")) or {}
                x["avgR_2y"] = st.get("avgR_2y")
                x["edge"] = bool((x.get("avgR") or 0) >= 0.05 and (x.get("n") or 0) >= 100 and (st.get("avgR_2y") is None or st["avgR_2y"] > 0))
                items.append(x)
    items.sort(key=lambda x: (x["edge"], x["score"] or -99), reverse=True)
    out = {"ok": True, "at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "btc_up": btc_up, "prices": prices, "fut": fut, "ideas": items[:150],
           "sec": round(time.time() - t0, 1)}
    ok = _kv_put("intraday", out)
    store.path("live_last.json").write_text(json.dumps({k: v for k, v in out.items() if k not in ("prices", "fut")}, ensure_ascii=False, default=str)[:200000],
                                            encoding="utf-8")
    if notify:
        try:
            from . import notify as nt
            from . import users
            be = users.backend()
            us = users.load(be) if be else None
            if us:
                cfg = users.config(be)
                rows = {}
                try:
                    cj = json.loads(store.path("last_rows.json").read_text())
                except (OSError, ValueError):
                    cj = {}
                for k, (p, _) in prices.items():
                    rows[k] = {**(cj.get(k) or {}), "p": p}
                rows["_light"] = cj.get("_light")
                for u in us:
                    pf = (u.get("data") or {}).get("portfolio") or {}
                    rst = nt.track(be, u, pf, lambda k: (rows.get(k) or {}).get("p"))
                    it = nt.items_for(pf, rows, {}, None, rst)
                    users.deliver(be, cfg, u, it, "MyBit – cảnh báo")
        except Exception as e:  # noqa: BLE001
            log.warning("notify live: %s", e)
    log.info("Lượt nhanh: %d coin, %d cơ hội (%d có lợi thế), KV=%s, %.0fs", len(prices), len(items), sum(x["edge"] for x in items), ok, time.time() - t0)
    return out
