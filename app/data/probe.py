"""Dò nguồn dữ liệu crypto chạy được từ máy chủ GitHub (Mỹ): python -m app.data.probe → probe_out/report.json"""
from __future__ import annotations

import json
import time
from pathlib import Path

import requests

OUT = Path("probe_out")
UA = {"User-Agent": "Mozilla/5.0 (my-bit probe)"}
R: dict = {}

GET = {
    "cm_mvrv": "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=CapMVRVCur&frequency=1d&page_size=3",
    "cm_multi": "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc,eth&metrics=CapMVRVCur,CapMrktCurUSD,AdrActCnt,SplyCur,TxCnt,FeeTotUSD,PriceUSD&frequency=1d&page_size=3",
    "cm_long": "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=CapMVRVCur,PriceUSD&frequency=1d&start_time=2014-01-01&page_size=10000",
    "cm_sol": "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=sol&metrics=CapMVRVCur,SplyCur,AdrActCnt&frequency=1d&page_size=3",
    "cm_assets": "https://community-api.coinmetrics.io/v4/catalog-v2/asset-metrics?pretty=true&page_size=3",
    "llama_ds_arb": "https://defillama-datasets.llama.fi/emissions/arbitrum",
    "llama_ds_arb2": "https://defillama-datasets.llama.fi/emissions/arbitrum.json",
    "llama_ds_list": "https://defillama-datasets.llama.fi/emissionsProtocolsList",
    "llama_summary_fees": "https://api.llama.fi/summary/fees/uniswap?dataType=dailyFees",
    "llama_prices": "https://coins.llama.fi/prices/current/coingecko:ethereum,coingecko:bitcoin",
    "llama_unlock_page": "https://defillama.com/api/emissions/arbitrum",
    "cg_chart": "https://api.coingecko.com/api/v3/coins/arbitrum/market_chart?vs_currency=usd&days=365&interval=daily",
    "cg_chart2": "https://api.coingecko.com/api/v3/coins/solana/market_chart?vs_currency=usd&days=365&interval=daily",
    "cg_markets_p2": "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=2",
    "cg_cat_market": "https://api.coingecko.com/api/v3/coins/categories",
    "bv_ticker_all": "https://data-api.binance.vision/api/v3/ticker/24hr",
    "bv_klines_2017": "https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=1500000000000&limit=1000",
    "bv_um_klines_zip": "https://data.binance.vision/data/futures/um/daily/klines/BTCUSDT/1d/BTCUSDT-1d-2026-10-18.zip",
    "bv_um_metrics_zip": "https://data.binance.vision/data/futures/um/daily/metrics/ETHUSDT/ETHUSDT-metrics-2026-10-19.zip",
    "bv_um_list": "https://s3-ap-northeast-1.amazonaws.com/data.binance.vision?delimiter=/&prefix=data/futures/um/daily/metrics/",
    "okx_funding_hist": "https://www.okx.com/api/v5/public/funding-rate-history?instId=BTC-USDT-SWAP&limit=100",
    "okx_inst": "https://www.okx.com/api/v5/public/instruments?instType=SWAP",
    "okx_oi_hist": "https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-volume?ccy=BTC&period=1D",
    "okx_taker": "https://www.okx.com/api/v5/rubik/stat/taker-volume?ccy=BTC&instType=CONTRACTS&period=1D",
    "okx_liq": "https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&uly=BTC-USDT&state=filled&limit=5",
    "bitget_funding_hist": "https://api.bitget.com/api/v2/mix/market/history-fund-rate?symbol=BTCUSDT&productType=USDT-FUTURES&pageSize=5",
    "gate_tickers": "https://api.gateio.ws/api/v4/futures/usdt/tickers",
    "fng_all": "https://api.alternative.me/fng/?limit=0",
    "stable_mcap": "https://stablecoins.llama.fi/stablecoincharts/all",
    "llama_dex_vol": "https://api.llama.fi/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true",
    "etf_flows_farside": "https://farside.co.uk/bitcoin-etf-flow-all-data/",
    "binance_ann": "https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&catalogId=48&pageNo=1&pageSize=5",
}
POST = {
    "hl_funding_hist": ("https://api.hyperliquid.xyz/info", {"type": "fundingHistory", "coin": "BTC", "startTime": 1759000000000}),
    "hyperliquid_meta": ("https://api.hyperliquid.xyz/info", {"type": "metaAndAssetCtxs"}),
    "hyperliquid_candles": ("https://api.hyperliquid.xyz/info", {"type": "candleSnapshot", "req": {"coin": "BTC", "interval": "1d", "startTime": 1759000000000, "endTime": 1760900000000}}),
}


def _rec(name, r, t0):
    body = r.content[:600]
    try:
        txt = body.decode("utf-8", "replace")
    except Exception:  # noqa: BLE001
        txt = str(body)
    R[name] = {"status": r.status_code, "sec": round(time.time() - t0, 2), "bytes": len(r.content), "head": txt[:500],
               "ctype": r.headers.get("content-type")}


def run():
    OUT.mkdir(exist_ok=True)
    for k, u in GET.items():
        t0 = time.time()
        try:
            _rec(k, requests.get(u, headers=UA, timeout=25), t0)
        except Exception as e:  # noqa: BLE001
            R[k] = {"error": f"{type(e).__name__}: {e}"[:300]}
        print(k, R[k].get("status", R[k].get("error")), R[k].get("bytes"), flush=True)
    for k, (u, body) in POST.items():
        t0 = time.time()
        try:
            _rec(k, requests.post(u, json=body, headers=UA, timeout=25), t0)
        except Exception as e:  # noqa: BLE001
            R[k] = {"error": f"{type(e).__name__}: {e}"[:300]}
        print(k, R[k].get("status", R[k].get("error")), R[k].get("bytes"), flush=True)
    (OUT / "report.json").write_text(json.dumps(R, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    run()
