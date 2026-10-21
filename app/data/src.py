"""Nguồn dữ liệu crypto chạy được từ máy chủ GitHub (đã dò ở probe.py).

- Binance spot: cổng dữ liệu công khai data-api.binance.vision (api.binance.com chặn máy chủ ở Mỹ).
- Binance futures: API bị chặn → kho lưu trữ data.binance.vision (funding, OI, long/short theo ngày; trễ ~1 ngày).
- Futures trực tiếp: Bitget (funding + OI toàn bộ hợp đồng 1 lần gọi), OKX (OI, long/short, taker), Gate, Hyperliquid.
- CoinGecko: vốn hoá, FDV, cung; DefiLlama: phí/doanh thu thật, TVL, lịch mở khoá (bộ dữ liệu công khai).
- CoinMetrics community: MVRV BTC; alternative.me: chỉ số Sợ hãi & Tham lam; Deribit: DVOL.
"""
from __future__ import annotations

import io
import logging
import random
import threading
import time
import zipfile

import pandas as pd
import requests

log = logging.getLogger("src")
UA = {"User-Agent": "Mozilla/5.0 (my-bit data bot)", "Accept": "application/json"}
_S = requests.Session()
_S.headers.update(UA)
_lock = threading.Lock()
_last: dict[str, float] = {}
GAP = {"coingecko": 13.0, "okx": 0.12, "llama": 0.2, "bv": 0.03, "bitget": 0.1}   # giây tối thiểu giữa 2 lần gọi cùng nguồn


class FetchError(Exception):
    pass


def _wait(src: str):
    g = GAP.get(src, 0.05)
    with _lock:
        t = time.time()
        w = _last.get(src, 0) + g - t
        _last[src] = max(t, _last.get(src, 0) + g)
    if w > 0:
        time.sleep(w)


def get(url: str, src: str = "x", params: dict | None = None, timeout: int = 30, tries: int = 3, raw: bool = False, method: str = "GET", body=None):
    err = None
    for k in range(tries):
        _wait(src)
        try:
            r = _S.request(method, url, params=params, json=body, timeout=timeout)
            if r.status_code == 429 or r.status_code >= 500:
                err = f"HTTP {r.status_code}"
                time.sleep((2 ** k) * (8 if src == "coingecko" else 1.5) + random.random())
                continue
            if r.status_code != 200:
                raise FetchError(f"{url}: HTTP {r.status_code} {r.text[:150]}")
            return r.content if raw else r.json()
        except (requests.RequestException, ValueError) as e:
            err = str(e)
            time.sleep(1.5 * (k + 1))
    raise FetchError(f"{url}: {err}")


# ----------------------------------------------------------------- Binance spot (vision)
BV = "https://data-api.binance.vision/api/v3/"


def bv_spot_symbols() -> pd.DataFrame:
    j = get(BV + "exchangeInfo", "bv", params={"permissions": "SPOT"}, timeout=60)
    rows = [{"pair": s["symbol"], "base": s["baseAsset"], "quote": s["quoteAsset"]} for s in j.get("symbols", [])
            if s.get("status") == "TRADING" and s.get("quoteAsset") == "USDT"]
    return pd.DataFrame(rows)


def bv_tickers() -> pd.DataFrame:
    j = get(BV + "ticker/24hr", "bv", timeout=60)
    df = pd.DataFrame(j)
    for c in ("lastPrice", "priceChangePercent", "quoteVolume", "highPrice", "lowPrice"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    return df[df["symbol"].str.endswith("USDT")]


def bv_klines(pair: str, interval: str = "1d", start_ms: int | None = None, limit: int = 1000) -> pd.DataFrame:
    p = {"symbol": pair, "interval": interval, "limit": limit}
    if start_ms:
        p["startTime"] = int(start_ms)
    j = get(BV + "klines", "bv", params=p)
    if not j:
        return pd.DataFrame()
    df = pd.DataFrame(j, columns=["t", "open", "high", "low", "close", "volume", "T", "qv", "n", "tb", "tq", "_"])
    out = pd.DataFrame({"date": pd.to_datetime(df["t"], unit="ms"), "open": df["open"].astype(float), "high": df["high"].astype(float),
                        "low": df["low"].astype(float), "close": df["close"].astype(float), "volume": df["volume"].astype(float),
                        "qvol": df["qv"].astype(float), "taker_buy_q": df["tq"].astype(float)})
    return out


def bv_klines_all(pair: str, interval: str = "1d", start_ms: int | None = None, max_pages: int = 4) -> pd.DataFrame:
    frames, st = [], start_ms or 1500000000000
    for _ in range(max_pages):
        df = bv_klines(pair, interval, st)
        if df.empty:
            break
        frames.append(df)
        if len(df) < 1000:
            break
        st = int(df["date"].iloc[-1].value // 10 ** 6) + 1
    return pd.concat(frames, ignore_index=True).drop_duplicates("date") if frames else pd.DataFrame()


# ----------------------------------------------------------------- Binance futures – kho lưu trữ
DV = "https://data.binance.vision/data/futures/um/"


def _zip_csv(url: str) -> pd.DataFrame | None:
    try:
        b = get(url, "bv", raw=True, tries=1, timeout=30)
    except FetchError:
        return None
    try:
        with zipfile.ZipFile(io.BytesIO(b)) as z:
            with z.open(z.namelist()[0]) as f:
                return pd.read_csv(f)
    except Exception:  # noqa: BLE001
        return None


def bv_um_metrics(pair: str, day: str) -> pd.DataFrame | None:
    """OI, long/short (tài khoản, top trader), taker buy/sell – mỗi 5 phút của 1 ngày."""
    return _zip_csv(f"{DV}daily/metrics/{pair}/{pair}-metrics-{day}.zip")


def bv_um_funding_month(pair: str, ym: str) -> pd.DataFrame | None:
    return _zip_csv(f"{DV}monthly/fundingRate/{pair}/{pair}-fundingRate-{ym}.zip")


def bv_um_symbols() -> list[str]:
    """Danh sách hợp đồng USDT-M có dữ liệu lưu trữ (liệt kê thư mục S3)."""
    out, marker = [], ""
    base = "https://s3-ap-northeast-1.amazonaws.com/data.binance.vision"
    for _ in range(20):
        p = {"delimiter": "/", "prefix": "data/futures/um/daily/metrics/"}
        if marker:
            p["marker"] = marker
        b = get(base, "bv", params=p, raw=True, timeout=40)
        txt = b.decode("utf-8", "replace")
        import re
        pre = re.findall(r"<Prefix>data/futures/um/daily/metrics/([A-Z0-9]+)/</Prefix>", txt)
        out += pre
        if "<IsTruncated>true</IsTruncated>" not in txt or not pre:
            break
        marker = f"data/futures/um/daily/metrics/{pre[-1]}/"
    return sorted(set(out))


# ----------------------------------------------------------------- futures trực tiếp
def bitget_tickers() -> pd.DataFrame:
    j = get("https://api.bitget.com/api/v2/mix/market/tickers", "bitget", params={"productType": "USDT-FUTURES"})
    df = pd.DataFrame(j.get("data") or [])
    if df.empty:
        return df
    for c in ("lastPr", "fundingRate", "holdingAmount", "usdtVolume", "indexPrice", "markPrice", "change24h", "openUtc"):
        if c in df:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


def okx_swaps() -> pd.DataFrame:
    t = get("https://www.okx.com/api/v5/market/tickers", "okx", params={"instType": "SWAP"}).get("data") or []
    o = get("https://www.okx.com/api/v5/public/open-interest", "okx", params={"instType": "SWAP"}).get("data") or []
    df = pd.DataFrame(t)
    if df.empty:
        return df
    df = df[df["instId"].str.endswith("-USDT-SWAP")].copy()
    oi = pd.DataFrame(o)
    if not oi.empty:
        oi = oi[["instId", "oiCcy", "oiUsd"]] if "oiUsd" in oi else oi[["instId", "oiCcy"]]
        df = df.merge(oi, on="instId", how="left")
    for c in ("last", "vol24h", "volCcy24h", "oiCcy", "oiUsd", "open24h"):
        if c in df:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    df["base"] = df["instId"].str.split("-").str[0]
    return df


def okx_lsr(ccy: str, period: str = "1D") -> pd.DataFrame:
    j = get("https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio", "okx", params={"ccy": ccy, "period": period}).get("data") or []
    return pd.DataFrame([{"date": pd.to_datetime(int(a), unit="ms"), "lsr": float(b)} for a, b in j])


def okx_oi_vol(ccy: str, period: str = "1D") -> pd.DataFrame:
    j = get("https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-volume", "okx", params={"ccy": ccy, "period": period}).get("data") or []
    return pd.DataFrame([{"date": pd.to_datetime(int(a), unit="ms"), "oi_usd": float(b), "vol_usd": float(c)} for a, b, c in j])


def okx_taker(ccy: str, period: str = "1D") -> pd.DataFrame:
    j = get("https://www.okx.com/api/v5/rubik/stat/taker-volume", "okx", params={"ccy": ccy, "instType": "CONTRACTS", "period": period}).get("data") or []
    return pd.DataFrame([{"date": pd.to_datetime(int(a), unit="ms"), "sell": float(b), "buy": float(c)} for a, b, c in j])


def okx_funding_hist(inst: str, n: int = 100) -> pd.DataFrame:
    j = get("https://www.okx.com/api/v5/public/funding-rate-history", "okx", params={"instId": inst, "limit": n}).get("data") or []
    return pd.DataFrame([{"time": pd.to_datetime(int(x["fundingTime"]), unit="ms"), "rate": float(x["realizedRate"] or x["fundingRate"])} for x in j])


def gate_tickers() -> pd.DataFrame:
    j = get("https://api.gateio.ws/api/v4/futures/usdt/tickers", "gate")
    df = pd.DataFrame(j)
    for c in ("last", "funding_rate", "total_size", "volume_24h_quote", "mark_price", "index_price"):
        if c in df:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    if not df.empty:
        df["base"] = df["contract"].str.replace("_USDT", "", regex=False)
    return df


def hl_meta() -> pd.DataFrame:
    j = get("https://api.hyperliquid.xyz/info", "hl", method="POST", body={"type": "metaAndAssetCtxs"})
    uni, ctx = j[0]["universe"], j[1]
    rows = []
    for u, c in zip(uni, ctx):
        rows.append({"base": u["name"], "max_lev": u.get("maxLeverage"), "funding": float(c.get("funding") or 0), "oi": float(c.get("openInterest") or 0),
                     "mark": float(c.get("markPx") or 0), "oracle": float(c.get("oraclePx") or 0), "premium": float(c.get("premium") or 0) if c.get("premium") else None,
                     "vol24": float(c.get("dayNtlVlm") or 0)})
    return pd.DataFrame(rows)


def deribit_dvol(cur: str = "BTC", days: int = 400) -> pd.DataFrame:
    end = int(time.time() * 1000)
    j = get("https://www.deribit.com/api/v2/public/get_volatility_index_data", "deribit",
            params={"currency": cur, "start_timestamp": end - days * 86400000, "end_timestamp": end, "resolution": 86400})
    d = (j.get("result") or {}).get("data") or []
    return pd.DataFrame([{"date": pd.to_datetime(x[0], unit="ms"), "dvol": x[4]} for x in d])


# ----------------------------------------------------------------- cơ bản
CG = "https://api.coingecko.com/api/v3/"


def cg_markets(pages: int = 2) -> pd.DataFrame:
    rows = []
    for p in range(1, pages + 1):
        rows += get(CG + "coins/markets", "coingecko", params={"vs_currency": "usd", "order": "market_cap_desc", "per_page": 250, "page": p,
                                                            "price_change_percentage": "1h,24h,7d,30d,1y"}, timeout=40)
    return pd.DataFrame(rows)


def cg_categories() -> pd.DataFrame:
    return pd.DataFrame(get(CG + "coins/categories", "coingecko", timeout=40))


def cg_chart(cid: str, days: int = 400) -> pd.DataFrame:
    j = get(CG + f"coins/{cid}/market_chart", "coingecko", params={"vs_currency": "usd", "days": days, "interval": "daily"}, timeout=40)
    p, m = pd.DataFrame(j.get("prices") or [], columns=["t", "price"]), pd.DataFrame(j.get("market_caps") or [], columns=["t", "mcap"])
    df = p.merge(m, on="t", how="inner")
    df["date"] = pd.to_datetime(df["t"], unit="ms").dt.normalize()
    df["supply"] = df["mcap"] / df["price"]
    return df[["date", "price", "mcap", "supply"]].drop_duplicates("date", keep="last")


LL = "https://api.llama.fi/"


def ll_protocols() -> pd.DataFrame:
    j = get(LL + "lite/protocols2", "llama", timeout=90)
    prot = pd.DataFrame(j.get("protocols") or [])
    par = pd.DataFrame(j.get("parentProtocols") or [])
    return prot, par


def ll_overview(data_type: str = "dailyFees") -> pd.DataFrame:
    j = get(LL + "overview/fees", "llama", params={"excludeTotalDataChart": "true", "excludeTotalDataChartBreakdown": "true", "dataType": data_type}, timeout=90)
    return pd.DataFrame(j.get("protocols") or [])


def ll_chains() -> pd.DataFrame:
    return pd.DataFrame(get(LL + "v2/chains", "llama", timeout=60))


def ll_emission_list() -> list[str]:
    return list(get("https://defillama-datasets.llama.fi/emissionsProtocolsList", "llama", timeout=60) or [])


def ll_emission(name: str) -> dict:
    return get(f"https://defillama-datasets.llama.fi/emissions/{name}", "llama", timeout=90)


def cm_btc_mvrv() -> pd.DataFrame:
    rows, url, p = [], "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics", {
        "assets": "btc", "metrics": "CapMVRVCur,PriceUSD", "frequency": "1d", "start_time": "2012-01-01", "page_size": 10000}
    for _ in range(3):
        j = get(url, "cm", params=p, timeout=60)
        rows += j.get("data") or []
        nxt = j.get("next_page_url")
        if not nxt:
            break
        url, p = nxt, None
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    df["date"] = pd.to_datetime(df["time"]).dt.tz_localize(None).dt.normalize()
    df["mvrv"] = pd.to_numeric(df["CapMVRVCur"], errors="coerce")
    df["price"] = pd.to_numeric(df["PriceUSD"], errors="coerce")
    return df[["date", "mvrv", "price"]]


def fng_all() -> pd.DataFrame:
    j = get("https://api.alternative.me/fng/", "fng", params={"limit": 0})
    df = pd.DataFrame(j.get("data") or [])
    df["date"] = pd.to_datetime(df["timestamp"].astype(int), unit="s").dt.normalize()
    df["fng"] = df["value"].astype(int)
    return df[["date", "fng", "value_classification"]].sort_values("date")


def stable_mcap() -> pd.DataFrame:
    j = get("https://stablecoins.llama.fi/stablecoincharts/all", "llama", timeout=60)
    return pd.DataFrame([{"date": pd.to_datetime(int(x["date"]), unit="s"), "stable": (x.get("totalCirculatingUSD") or {}).get("peggedUSD")} for x in j])


def bitget_contracts() -> pd.DataFrame:
    j = get("https://api.bitget.com/api/v2/mix/market/contracts", "bitget", params={"productType": "USDT-FUTURES"}, timeout=40)
    df = pd.DataFrame(j.get("data") or [])
    for c in ("fundInterval", "maxLever", "minLever"):
        if c in df:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


def bitget_funding_hist(sym: str, n: int = 100) -> pd.DataFrame:
    j = get("https://api.bitget.com/api/v2/mix/market/history-fund-rate", "bitget",
            params={"symbol": sym, "productType": "USDT-FUTURES", "pageSize": n}).get("data") or []
    return pd.DataFrame([{"time": pd.to_datetime(int(x["fundingTime"]), unit="ms"), "rate": float(x["fundingRate"])} for x in j])


def _gate_c(j, base) -> pd.DataFrame:
    rows = []
    for x in j or []:
        if isinstance(x, dict):       # futures: {t,o,h,l,c,v,sum}
            rows.append({"date": pd.to_datetime(int(x["t"]), unit="s"), "open": float(x["o"]), "high": float(x["h"]), "low": float(x["l"]),
                         "close": float(x["c"]), "volume": float(x.get("v") or 0), "qvol": float(x.get("sum") or 0)})
        else:                         # spot: [t, quote_vol, close, high, low, open, base_vol, closed]
            rows.append({"date": pd.to_datetime(int(x[0]), unit="s"), "open": float(x[5]), "high": float(x[3]), "low": float(x[4]),
                         "close": float(x[2]), "volume": float(x[6]), "qvol": float(x[1])})
    return pd.DataFrame(rows)


GATE_IV = {"1d": "1d", "4h": "4h", "1h": "1h"}


def gate_spot_candles(base: str, interval: str = "1d", limit: int = 1000) -> pd.DataFrame:
    j = get("https://api.gateio.ws/api/v4/spot/candlesticks", "gate", params={"currency_pair": f"{base}_USDT", "interval": GATE_IV[interval], "limit": limit})
    return _gate_c(j, base)


def gate_fut_candles(contract: str, interval: str = "1d", limit: int = 1000) -> pd.DataFrame:
    j = get("https://api.gateio.ws/api/v4/futures/usdt/candlesticks", "gate", params={"contract": contract, "interval": GATE_IV[interval], "limit": limit})
    return _gate_c(j, contract)


def hl_candles(coin: str, interval: str = "1d", days: int = 1500) -> pd.DataFrame:
    end = int(time.time() * 1000)
    j = get("https://api.hyperliquid.xyz/info", "hl", method="POST",
            body={"type": "candleSnapshot", "req": {"coin": coin, "interval": interval, "startTime": end - days * 86400000, "endTime": end}})
    return pd.DataFrame([{"date": pd.to_datetime(int(x["t"]), unit="ms"), "open": float(x["o"]), "high": float(x["h"]), "low": float(x["l"]),
                          "close": float(x["c"]), "volume": float(x["v"]), "qvol": float(x["v"]) * float(x["c"])} for x in j or []])


def hl_funding_hist(coin: str, days: int = 30) -> pd.DataFrame:
    st = int(time.time() * 1000) - days * 86400000
    j = get("https://api.hyperliquid.xyz/info", "hl", method="POST", body={"type": "fundingHistory", "coin": coin, "startTime": st})
    return pd.DataFrame([{"time": pd.to_datetime(int(x["time"]), unit="ms"), "rate": float(x["fundingRate"])} for x in j or []])


def binance_announcements(catalog: int, n: int = 20) -> list[dict]:
    j = get("https://www.binance.com/bapi/composite/v1/public/cms/article/list/query", "bapi",
            params={"type": 1, "catalogId": catalog, "pageNo": 1, "pageSize": n})
    out = []
    for c in (j.get("data") or {}).get("catalogs") or []:
        for a in c.get("articles") or []:
            out.append({"title": a.get("title"), "time": pd.to_datetime(int(a.get("releaseDate") or 0), unit="ms"), "code": a.get("code"), "cat": c.get("catalogName")})
    return out


def gate_contracts() -> pd.DataFrame:
    return pd.DataFrame(get("https://api.gateio.ws/api/v4/futures/usdt/contracts", "gate", timeout=60))
