"""Tải & lưu dữ liệu crypto vào data/ (chạy trên GitHub Actions; máy chủ Mỹ nên Binance API bị chặn – dùng cổng vision/kho lưu trữ).

Mỗi lượt (4 giờ/lần): danh sách coin + ảnh chụp futures + nến mới. Phần nặng (lịch sử cung, mở khoá, phí/doanh thu) chia nhỏ theo lượt.
"""
from __future__ import annotations

import gzip
import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

from .. import config
from . import src, store, universe

log = logging.getLogger("update")
REPORT: dict = {"steps": {}, "errors": []}


def _step(name):
    def deco(fn):
        def run(*a, **k):
            t = time.time()
            try:
                v = fn(*a, **k)
                REPORT["steps"][name] = {"ok": True, "sec": round(time.time() - t, 1), "info": v if isinstance(v, (int, float, str, dict)) else None}
                print(f"OK   {name} ({time.time() - t:.0f}s) {str(v)[:200] if v is not None else ''}", flush=True)
                return v
            except Exception as e:  # noqa: BLE001
                REPORT["steps"][name] = {"ok": False, "sec": round(time.time() - t, 1), "error": f"{type(e).__name__}: {e}"[:400]}
                print(f"FAIL {name}: {type(e).__name__}: {e}"[:400], flush=True)
                log.exception(name)
                return None
        return run
    return deco


def _ok(r: dict) -> bool:
    """Coin không bị loại (stablecoin/token bọc…)."""
    e = r.get("excl")
    return e is None or (isinstance(e, float) and e != e) or e == ""


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _pmap(fn, items, workers=8):
    out, errs = {}, 0
    with ThreadPoolExecutor(workers) as ex:
        futs = {ex.submit(fn, it): it for it in items}
        for f in as_completed(futs):
            try:
                out[futs[f]] = f.result()
            except Exception as e:  # noqa: BLE001
                errs += 1
                if errs <= 5:
                    REPORT["errors"].append(f"{futs[f]}: {e}"[:300])
    return out, errs


# ------------------------------------------------------------------ danh sách coin + futures
@_step("futures_snapshot")
def futures_snapshot() -> dict:
    parts = {}
    for name, fn in (("bitget", src.bitget_tickers), ("bitget_c", src.bitget_contracts), ("okx", src.okx_swaps), ("gate", src.gate_tickers),
                     ("gate_c", src.gate_contracts), ("hl", src.hl_meta)):
        try:
            parts[name] = fn()
        except Exception as e:  # noqa: BLE001
            REPORT["errors"].append(f"{name}: {e}"[:300])
            parts[name] = pd.DataFrame()
    fr = universe.fut_frames(parts["bitget"], parts["okx"], parts["gate"], parts["hl"], parts["bitget_c"], parts["gate_c"])
    # hợp đồng tương lai trên cổ phiếu / hàng hoá (TSLA, NVDA, vàng…) – không phải crypto: đánh dấu để loại
    nonc = set()
    try:
        oi = src.get("https://www.okx.com/api/v5/public/instruments", "okx", params={"instType": "SWAP"}).get("data") or []
        for x in oi:
            if str(x.get("instCategory") or x.get("category") or "1") not in ("1", "") and x.get("instId", "").endswith("-USDT-SWAP"):
                nonc.add(x["instId"].split("-")[0])
        store.path("debug").mkdir(exist_ok=True)
        store.path("debug/okx_inst_sample.json").write_text(json.dumps(oi[:3] + [x for x in oi if x.get("instId", "").startswith(("TSLA", "XAU"))][:3]), encoding="utf-8")
    except Exception as e:  # noqa: BLE001
        REPORT["errors"].append(f"okx inst: {e}"[:200])
    for name in ("bitget_c", "gate_c"):
        d = parts.get(name)
        if d is not None and not d.empty:
            store.path(f"debug/{name}_sample.json").write_text(d.head(2).to_json(orient="records") + "\n" + json.dumps(list(d.columns)), encoding="utf-8")
    bc = parts.get("bitget_c")
    if bc is not None and not bc.empty:
        for col in ("isRwa", "symbolType"):
            if col in bc:
                nonc |= set(bc.loc[bc[col].astype(str).str.upper().isin(["YES", "TRUE", "RWA", "STOCK"]), "baseCoin"].astype(str))
    gc = parts.get("gate_c")
    if gc is not None and not gc.empty:
        for col in ("market_type", "type"):
            if col in gc:
                nonc |= set(gc.loc[gc[col].astype(str).str.lower().isin(["stock", "stocks", "tradfi", "index", "commodity"]), "name"].astype(str).str.replace("_USDT", ""))
    store.path("nonc.json").write_text(json.dumps(sorted(nonc)), encoding="utf-8")
    ts = _now().replace(second=0, microsecond=0)
    rows = []
    for ex, df in fr.items():
        d = df.copy()
        d["ex"] = ex
        d["ts"] = ts
        rows.append(d)
    snap = pd.concat(rows, ignore_index=True) if rows else pd.DataFrame()
    if not snap.empty:
        for c in ("price", "vol_usd", "oi_usd", "funding", "basis", "interval_h", "max_lev"):
            if c in snap:
                snap[c] = pd.to_numeric(snap[c], errors="coerce")
        store.write("fut_now", snap)
        hist = store.read("fut_hist")
        keep = snap[["ts", "ex", "base", "price", "oi_usd", "vol_usd", "funding", "interval_h", "basis"]]
        hist = pd.concat([hist, keep], ignore_index=True) if not hist.empty else keep
        hist = hist[hist["ts"] >= ts - timedelta(days=120)].drop_duplicates(["ts", "ex", "base"], keep="last")
        store.write("fut_hist", hist)
    return {ex: len(df) for ex, df in fr.items()}


@_step("universe")
def build_universe() -> dict:
    ucfg = config.get("universe", {}) or {}
    cg = src.cg_markets(int(ucfg.get("cg_pages", 4)))
    store.write("cg_markets", _clean(cg.drop(columns=[c for c in ("image", "roi") if c in cg])))
    spot = src.bv_spot_symbols()
    tk = src.bv_tickers().set_index("symbol")
    spot["price"] = spot["pair"].map(tk["lastPrice"])
    spot["qvol"] = spot["pair"].map(tk["quoteVolume"])
    store.write("bv_spot", spot)
    snap = store.read("fut_now")
    futs = {ex: g for ex, g in snap.groupby("ex")} if not snap.empty else {}
    try:
        nonc = set(json.loads(store.path("nonc.json").read_text()))
    except (OSError, ValueError):
        nonc = set()
    try:
        gp = src.get("https://api.gateio.ws/api/v4/spot/currency_pairs", "gate", timeout=60)
        gate_spot = {x["base"].upper() for x in gp if x.get("quote") == "USDT" and x.get("trade_status") == "tradable"}
    except Exception as e:  # noqa: BLE001
        REPORT["errors"].append(f"gate pairs: {e}"[:200])
        gate_spot = None
    uni = universe.build(cg, spot, futs, ucfg, nonc, gate_spot)
    uni["fut"] = uni["fut"].map(lambda d: json.dumps(d))
    store.write("universe", uni)
    return {"coins": len(uni), "spot": int(uni["spot_pair"].notna().sum()), "fut": int((uni["fut_ex"] != "").sum()),
            "excl": int(uni["excl"].notna().sum()), "orphans": int(uni["id"].str.startswith("x-").sum())}


def _clean(df: pd.DataFrame) -> pd.DataFrame:
    for c in df.columns:
        if df[c].dtype == object:
            v = df[c].dropna()
            if len(v) and isinstance(v.iloc[0], (dict, list)):
                df[c] = df[c].map(lambda x: json.dumps(x) if x is not None else None)
    return df


# ------------------------------------------------------------------ giá
def _px_path(tf: str, key: str):
    p = store.path(f"px/{tf}")
    p.mkdir(parents=True, exist_ok=True)
    return p / f"{key}.parquet"


def _merge_px(old: pd.DataFrame, new: pd.DataFrame) -> pd.DataFrame:
    if old is None or old.empty:
        return new
    if new is None or new.empty:
        return old
    return pd.concat([old, new], ignore_index=True).drop_duplicates("date", keep="last").sort_values("date").reset_index(drop=True)


IV_MS = {"1d": 86400000, "4h": 14400000, "1h": 3600000}
TF_DIR = {"1d": "d", "4h": "h4", "1h": "h1"}


def _fetch_px(r: dict, iv: str) -> int:
    p = _px_path(TF_DIR[iv], r["key"])
    old = pd.read_parquet(p) if p.exists() else pd.DataFrame()
    start = None
    if not old.empty:
        start = int(pd.Timestamp(old["date"].iloc[-1]).value // 10 ** 6)
    elif iv != "1d":
        start = int(time.time() * 1000) - 1000 * IV_MS[iv]
    new = pd.DataFrame()
    srcname = None
    if r.get("spot_pair"):
        new = src.bv_klines_all(r["spot_pair"], iv, start, max_pages=4 if iv == "1d" else 1)
        srcname = "binance"
    if not r.get("spot_pair") or (new.empty and old.empty):
        fut = json.loads(r.get("fut") or "{}")
        for fn, arg in ((src.gate_spot_candles, r["sym"]), (src.gate_fut_candles, (fut.get("gate") or {}).get("inst")),
                        (src.hl_candles, (fut.get("hl") or {}).get("inst"))):
            if not arg:
                continue
            try:
                new = fn(arg, iv) if fn is not src.hl_candles else fn(arg, iv, 1500 if iv == "1d" else (170 if iv == "4h" else 42))
            except src.FetchError:
                new = pd.DataFrame()
            if not new.empty:
                srcname = {"gate_spot_candles": "gate", "gate_fut_candles": "gate_fut", "hl_candles": "hl"}[fn.__name__]
                m = (fut.get("gate") or {}).get("mult", 1) if fn is src.gate_fut_candles else ((fut.get("hl") or {}).get("mult", 1) if fn is src.hl_candles else 1)
                if m and m != 1:
                    for c in ("open", "high", "low", "close"):
                        new[c] = new[c] / m
                    new["volume"] = new["volume"] * m
                break
    if new.empty:
        return 0
    df = _merge_px(old, new)
    if iv != "1d":
        df = df.tail(1500)
    df.to_parquet(p, index=False)
    return len(new) if srcname else 0


@_step("prices_daily")
def prices_daily() -> dict:
    uni = store.read("universe")
    rows = [r for r in uni.to_dict("records") if _ok(r)]
    res, errs = _pmap(lambda key: _fetch_px(next(x for x in rows if x["key"] == key), "1d"), [r["key"] for r in rows], workers=8)
    got = sum(1 for v in res.values() if v)
    return {"coins": len(rows), "updated": got, "errors": errs}


@_step("prices_intraday")
def prices_intraday() -> dict:
    uni = store.read("universe")
    snap = store.read("fut_now")
    n = int(config.get("prices.intraday_top", 150))
    rows = [r for r in uni.to_dict("records") if _ok(r)]
    oi = _oi_by_key(uni, snap)
    rows.sort(key=lambda r: -(oi.get(r["key"], 0) or 0) - (1e15 if r["key"] in ("BTC", "ETH") else 0))
    pick = rows[:n]
    by = {r["key"]: r for r in pick}
    out = {}
    for iv in ("4h", "1h"):
        res, errs = _pmap(lambda k, iv=iv: _fetch_px(by[k], iv), list(by), workers=8)
        out[iv] = {"updated": sum(1 for v in res.values() if v), "errors": errs}
    return out


def _oi_by_key(uni: pd.DataFrame, snap: pd.DataFrame) -> dict:
    if snap.empty:
        return {}
    tot = snap.groupby(["ex", "base"])["oi_usd"].sum()
    out = {}
    for r in uni.to_dict("records"):
        fut = json.loads(r.get("fut") or "{}")
        out[r["key"]] = sum(float(tot.get((ex, v["base"]), 0) or 0) for ex, v in fut.items())
    return out


# ------------------------------------------------------------------ funding / OI lịch sử
@_step("funding_hist")
def funding_hist() -> dict:
    """Lịch sử funding (Bitget – phủ nhiều hợp đồng nhất; thiếu thì Hyperliquid)."""
    uni = store.read("universe")
    m = store.meta().get("funding_at", {})
    now = time.time()
    todo = []
    for r in uni.to_dict("records"):
        if not _ok(r):
            continue
        fut = json.loads(r.get("fut") or "{}")
        if not fut:
            continue
        if now - m.get(r["key"], 0) < 7 * 3600:
            continue
        todo.append((r["key"], fut))

    def one(item):
        key, fut = item
        p = store.path("funding")
        p.mkdir(exist_ok=True)
        f = p / f"{key}.parquet"
        old = pd.read_parquet(f) if f.exists() else pd.DataFrame()
        if "bitget" in fut:
            new = src.bitget_funding_hist(fut["bitget"]["inst"], 100)
            new["ex"] = "bitget"
        elif "hl" in fut:
            new = src.hl_funding_hist(fut["hl"]["inst"], 30 if old.empty else 3)
            new["ex"] = "hl"
        else:
            return 0
        if new.empty:
            return 0
        df = pd.concat([old, new], ignore_index=True).drop_duplicates(["time", "ex"], keep="last").sort_values("time")
        df = df[df["time"] >= df["time"].max() - pd.Timedelta(days=400)]
        df.to_parquet(f, index=False)
        return len(new)

    keys = [k for k, _ in todo]
    res, errs = _pmap(lambda k: one(next(t for t in todo if t[0] == k)), keys, workers=6)
    meta = store.meta()
    fa = meta.get("funding_at", {})
    for k, v in res.items():
        fa[k] = now
    meta["funding_at"] = fa
    store.save_meta(meta)
    return {"todo": len(todo), "ok": sum(1 for v in res.values() if v), "errors": errs}


@_step("binance_metrics")
def binance_metrics() -> dict:
    """OI, tỉ lệ long/short, taker buy/sell của Binance USDT-M theo ngày (kho lưu trữ – trễ 1 ngày)."""
    uni = store.read("universe")
    try:
        um = set(src.bv_um_symbols())
    except Exception as e:  # noqa: BLE001
        REPORT["errors"].append(f"um list: {e}"[:200])
        um = set()
    snap = store.read("fut_now")
    oi = _oi_by_key(uni, snap)
    cands = []
    for r in uni.to_dict("records"):
        if not _ok(r):
            continue
        for pre in ("", "1000", "1000000", "10000"):
            pair = f"{pre}{r['sym']}USDT"
            if pair in um:
                cands.append((r["key"], pair))
                break
    store.write("bn_um", pd.DataFrame(cands, columns=["key", "pair"]))
    cands.sort(key=lambda t: -(oi.get(t[0], 0) or 0) - (1e15 if t[0] in ("BTC", "ETH") else 0))
    cands = cands[: int(config.get("prices.binance_metrics_top", 120))]
    back = int(config.get("prices.binance_metrics_backfill", 45))
    today = _now().date()
    jobs = []
    for key, pair in cands:
        f = store.path("bnm") / f"{key}.parquet"
        have = set()
        if f.exists():
            have = set(pd.read_parquet(f, columns=["date"])["date"].dt.date)
        for d in range(1, back + 1):
            day = today - timedelta(days=d)
            if day not in have:
                jobs.append((key, pair, day))
    store.path("bnm").mkdir(exist_ok=True)

    def one(job):
        key, pair, day = job
        df = src.bv_um_metrics(pair, day.isoformat())
        if df is None or df.empty:
            return None
        for c in ("sum_open_interest_value", "count_toptrader_long_short_ratio", "sum_toptrader_long_short_ratio", "count_long_short_ratio",
                  "sum_taker_long_short_vol_ratio"):
            if c in df:
                df[c] = pd.to_numeric(df[c], errors="coerce")
        L = df.iloc[-1]
        return {"date": pd.Timestamp(day), "oi_usd": L.get("sum_open_interest_value"), "lsr_acct": L.get("count_long_short_ratio"),
                "lsr_top_acct": L.get("count_toptrader_long_short_ratio"), "lsr_top_pos": L.get("sum_toptrader_long_short_ratio"),
                "taker_ratio": df["sum_taker_long_short_vol_ratio"].mean() if "sum_taker_long_short_vol_ratio" in df else None,
                "oi_min": df["sum_open_interest_value"].min(), "oi_max": df["sum_open_interest_value"].max()}

    res, errs = _pmap(one, jobs, workers=12)
    by: dict[str, list] = {}
    for (key, _, _), v in res.items():
        if v:
            by.setdefault(key, []).append(v)
    for key, rows in by.items():
        f = store.path("bnm") / f"{key}.parquet"
        old = pd.read_parquet(f) if f.exists() else pd.DataFrame()
        df = pd.concat([old, pd.DataFrame(rows)], ignore_index=True).drop_duplicates("date", keep="last").sort_values("date")
        df.tail(400).to_parquet(f, index=False)
    return {"pairs": len(cands), "jobs": len(jobs), "got": sum(1 for v in res.values() if v), "errors": errs}


# ------------------------------------------------------------------ cơ bản
@_step("defillama")
def defillama() -> dict:
    if store.age_days("defillama") < 0.9:
        return "skip (đã cập nhật trong ngày)"
    prot, par = src.ll_protocols()
    keep = [c for c in ("defillamaId", "id", "name", "symbol", "category", "chains", "tvl", "geckoId", "gecko_id", "parentProtocol", "mcap", "slug",
                        "listedAt", "change_7d") if c in prot]
    p = prot[keep].copy()
    if "geckoId" in p and "gecko_id" not in p:
        p = p.rename(columns={"geckoId": "gecko_id"})
    store.path("debug").mkdir(exist_ok=True)
    store.path("debug/ll_protocol_cols.json").write_text(json.dumps({"prot": list(prot.columns), "par": list(par.columns)}), encoding="utf-8")
    p["chains"] = p["chains"].map(lambda x: ",".join(x) if isinstance(x, list) else x) if "chains" in p else None
    store.write("ll_protocols", _clean(p))
    if not par.empty:
        store.write("ll_parents", _clean(par[[c for c in ("id", "name", "gecko_id", "chains", "symbol") if c in par]].copy()))
    frames = {}
    for dt, col in (("dailyFees", "fees"), ("dailyRevenue", "rev"), ("dailyHoldersRevenue", "hrev")):
        try:
            o = src.ll_overview(dt)
        except Exception as e:  # noqa: BLE001
            REPORT["errors"].append(f"ll {dt}: {e}"[:200])
            continue
        cols = [c for c in ("defillamaId", "name", "category", "parentProtocol", "total24h", "total7d", "total30d", "total1y", "totalAllTime",
                            "average1y", "total7DaysAgo", "total30DaysAgo", "change_7dover7d", "change_30dover30d", "slug", "protocolType") if c in o]
        frames[col] = o[cols].copy()
    if frames:
        base = None
        for col, f in frames.items():
            f = f.rename(columns={c: f"{col}_{c}" for c in f.columns if c.startswith("total") or c.startswith("change") or c == "average1y"})
            base = f if base is None else base.merge(f[[c for c in f.columns if c.startswith(col + "_")] + ["defillamaId"]], on="defillamaId", how="outer")
        store.write("ll_fees", _clean(base))
    ch = src.ll_chains()
    store.write("ll_chains", _clean(ch))
    try:
        st = src.stable_mcap()
        store.write("stable", st)
    except Exception as e:  # noqa: BLE001
        REPORT["errors"].append(f"stable: {e}"[:200])
    store.touch("defillama")
    return {"protocols": len(p), "fees": len(frames.get("fees", [])), "chains": len(ch)}


@_step("unlocks")
def unlocks() -> dict:
    """Lịch mở khoá token (DefiLlama emissions datasets). Lưu bản rút gọn: chuỗi lượng đã mở khoá theo ngày + sự kiện sắp tới."""
    names = src.ll_emission_list()
    m = store.meta().get("unlock_at", {})
    names.sort(key=lambda n: m.get(n, 0))
    todo = [n for n in names if time.time() - m.get(n, 0) > 6 * 86400][: int(config.get("fundamentals.unlock_refresh_per_run", 80))]
    d = store.path("unlocks")
    d.mkdir(exist_ok=True)
    sample = {}

    def one(n):
        j = src.ll_emission(n)
        if len(sample) < 3:
            sample[n] = _shape(j)
        s = summarize_emission(j)
        (d / f"{n}.json").write_text(json.dumps(s, default=str), encoding="utf-8")
        return bool(s.get("series"))

    res, errs = _pmap(one, todo, workers=4)
    meta = store.meta()
    ua = meta.get("unlock_at", {})
    for n in res:
        ua[n] = time.time()
    meta["unlock_at"] = ua
    store.save_meta(meta)
    store.path("debug").mkdir(exist_ok=True)
    if sample:
        store.path("debug/unlock_sample.json").write_text(json.dumps(sample, default=str)[:200000], encoding="utf-8")
    return {"list": len(names), "todo": len(todo), "ok": sum(1 for v in res.values() if v), "errors": errs}


def _shape(x, depth=0):
    """Cấu trúc rút gọn của JSON (để kiểm tra định dạng)."""
    if depth > 4:
        return "…"
    if isinstance(x, dict):
        return {k: _shape(v, depth + 1) for k, v in list(x.items())[:25]}
    if isinstance(x, list):
        return [_shape(x[0], depth + 1), f"len={len(x)}"] if x else []
    return x if not isinstance(x, str) else x[:120]


def summarize_emission(j: dict) -> dict:
    meta = j.get("metadata") or {}
    out = {"name": j.get("name"), "gecko_id": j.get("gecko_id") or (meta.get("token") or "").replace("coingecko:", "") or None,
           "token": meta.get("token"), "sources": (meta.get("sources") or [])[:3], "supply": j.get("supplyMetrics")}
    # tổng lượng mở khoá theo thời gian (cộng các hạng mục)
    tot: dict[int, float] = {}
    cats: dict[str, dict[int, float]] = {}
    dd = (j.get("documentedData") or {}).get("data") or j.get("data") or []
    for sec in dd:
        lab = sec.get("label") or "?"
        for p in sec.get("data") or []:
            t = int(p.get("timestamp") or 0)
            u = float(p.get("unlocked") or 0)
            tot[t] = tot.get(t, 0) + u
            cats.setdefault(lab, {})[t] = u
    if tot:
        ts = sorted(tot)
        # rút gọn: mỗi 7 ngày 1 điểm + giữ điểm cuối
        keep, last = [], -1e18
        for t in ts:
            if t - last >= 7 * 86400 or t == ts[-1]:
                keep.append(t)
                last = t
        out["series"] = [[t, round(tot[t], 2)] for t in keep]
        now = time.time()
        out["cats"] = {k: [[t, round(v.get(t, 0), 2)] for t in keep if abs(t - now) < 3 * 365 * 86400][::4] for k, v in list(cats.items())[:12]}
    ev = []
    for e in (meta.get("events") or j.get("events") or []):
        t = int(e.get("timestamp") or 0)
        if t < time.time() - 30 * 86400:
            continue
        n = e.get("noOfTokens") or []
        amt = sum(float(x) for x in n if isinstance(x, (int, float))) if isinstance(n, list) else float(n or 0)
        ev.append({"t": t, "desc": (e.get("description") or "")[:200], "cat": e.get("category"), "type": e.get("unlockType"), "amt": amt})
    out["events"] = sorted(ev, key=lambda x: x["t"])[:60]
    return out


@_step("supply_hist")
def supply_hist() -> dict:
    """Lịch sử vốn hoá / nguồn cung lưu hành 1 năm (CoinGecko) → lạm phát cung thực tế. Xoay vòng vì giới hạn tần suất."""
    uni = store.read("universe")
    ids = [r["id"] for r in uni.sort_values("rank").to_dict("records") if not r["id"].startswith("x-") and _ok(r) and (r.get("rank") or 9999) <= 400]
    m = store.meta().get("supply_at", {})
    ids.sort(key=lambda i: m.get(i, 0))
    todo = [i for i in ids if time.time() - m.get(i, 0) > 5 * 86400][: int(config.get("fundamentals.supply_refresh_per_run", 40))]
    d = store.path("supply")
    d.mkdir(exist_ok=True)
    ok = 0
    t0 = time.time()
    for cid in todo:
        if time.time() - t0 > 600:
            break
        try:
            df = src.cg_chart(cid, 365)
            if not df.empty:
                df.to_parquet(d / f"{cid}.parquet", index=False)
                ok += 1
            m[cid] = time.time()
        except src.FetchError as e:
            REPORT["errors"].append(f"cg {cid}: {e}"[:200])
            if "429" in str(e):
                break
    meta = store.meta()
    meta["supply_at"] = m
    store.save_meta(meta)
    return {"todo": len(todo), "ok": ok, "have": len(list(d.glob("*.parquet")))}


@_step("cg_groups")
def cg_groups() -> dict:
    """Coin thuộc nhóm nào (Meme, AI, L1…): CoinGecko lọc theo danh mục, 1 lượt/danh mục/ngày."""
    if store.age_days("cg_groups") < 0.95 and store.path("cg_groups.parquet").exists():
        return "skip"
    from ..analysis.cval import CG_GROUP
    rows = []
    for cat, lab in CG_GROUP:
        try:
            j = src.get(src.CG + "coins/markets", "coingecko", params={"vs_currency": "usd", "category": cat, "order": "market_cap_desc", "per_page": 250, "page": 1})
            rows += [{"id": x["id"], "cat": cat, "group": lab} for x in j]
        except src.FetchError as e:
            REPORT["errors"].append(f"cg cat {cat}: {e}"[:200])
    if rows:
        store.write("cg_groups", pd.DataFrame(rows))
        store.touch("cg_groups")
    return {"rows": len(rows)}


@_step("cg_global")
def cg_global() -> dict:
    j = src.get(src.CG + "global", "coingecko").get("data") or {}
    keep = {"total_mcap": (j.get("total_market_cap") or {}).get("usd"), "total_vol": (j.get("total_volume") or {}).get("usd"),
            "dom": j.get("market_cap_percentage"), "mcap_chg_24h": j.get("market_cap_change_percentage_24h_usd"), "at": _now().isoformat()}
    hist = store.read("cg_global")
    row = pd.DataFrame([{"ts": _now(), "total_mcap": keep["total_mcap"], "total_vol": keep["total_vol"],
                         "btc_dom": (keep["dom"] or {}).get("btc"), "eth_dom": (keep["dom"] or {}).get("eth")}])
    hist = pd.concat([hist, row], ignore_index=True) if not hist.empty else row
    store.write("cg_global", hist.tail(3000))
    store.path("cg_global.json").write_text(json.dumps(keep, default=str), encoding="utf-8")
    return {"dom_btc": (keep["dom"] or {}).get("btc")}


@_step("macro")
def macro() -> dict:
    out = {}
    for name, fn, age in (("fng", src.fng_all, 0.2), ("mvrv", src.cm_btc_mvrv, 0.5), ("dvol_btc", lambda: src.deribit_dvol("BTC"), 0.15),
                          ("dvol_eth", lambda: src.deribit_dvol("ETH"), 0.15), ("cg_cats", src.cg_categories, 0.9)):
        if store.age_days(name) < age and store.path(f"{name}.parquet").exists():
            out[name] = "skip"
            continue
        try:
            df = fn()
            if name == "cg_cats":
                df = df.drop(columns=[c for c in ("content", "top_3_coins", "top_3_coins_id") if c in df], errors="ignore")
            store.write(name, _clean(df))
            store.touch(name)
            out[name] = len(df)
        except Exception as e:  # noqa: BLE001
            out[name] = f"ERR {e}"[:120]
    return out


def run(full: bool = True) -> dict:
    REPORT["at"] = _now().isoformat()
    futures_snapshot()
    build_universe()
    macro()
    cg_global()
    prices_daily()
    prices_intraday()
    funding_hist()
    binance_metrics()
    if full:
        defillama()
        cg_groups()
        unlocks()
        supply_hist()
    store.path("debug").mkdir(exist_ok=True)
    store.path("update_report.json").write_text(json.dumps(REPORT, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    return REPORT
