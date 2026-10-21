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
    # Binance
    "binance_spot_ping": "https://api.binance.com/api/v3/ping",
    "binance_spot_klines": "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=3",
    "binance_vision_klines": "https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=3",
    "binance_vision_ticker": "https://data-api.binance.vision/api/v3/ticker/24hr?symbol=ETHUSDT",
    "binance_vision_exinfo": "https://data-api.binance.vision/api/v3/exchangeInfo?permissions=SPOT",
    "binance_fapi_premium": "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT",
    "binance_fapi_oi_hist": "https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=1d&limit=3",
    "binance_fapi_lsr": "https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1d&limit=3",
    "binance_fapi_klines": "https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1d&limit=3",
    "binance_fapi_exinfo": "https://fapi.binance.com/fapi/v1/exchangeInfo",
    "binance_fapi_funding": "https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=3",
    "binance_vision_zip": "https://data.binance.vision/data/futures/um/daily/metrics/BTCUSDT/BTCUSDT-metrics-2026-10-01.zip",
    "binance_vision_fund_zip": "https://data.binance.vision/data/futures/um/monthly/fundingRate/BTCUSDT/BTCUSDT-fundingRate-2026-09.zip",
    # OKX
    "okx_funding": "https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP",
    "okx_oi": "https://www.okx.com/api/v5/public/open-interest?instType=SWAP",
    "okx_candles": "https://www.okx.com/api/v5/market/history-candles?instId=BTC-USDT&bar=1D&limit=3",
    "okx_lsr": "https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=BTC&period=1D",
    "okx_tickers_swap": "https://www.okx.com/api/v5/market/tickers?instType=SWAP",
    # Bybit
    "bybit_tickers": "https://api.bybit.com/v5/market/tickers?category=linear",
    "bybit_oi": "https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1d&limit=3",
    # Bitget
    "bitget_tickers": "https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES",
    # Gate, MEXC, KuCoin
    "gate_contracts": "https://api.gateio.ws/api/v4/futures/usdt/contracts",
    "mexc_contracts": "https://contract.mexc.com/api/v1/contract/ticker",
    "kucoin_futures": "https://api-futures.kucoin.com/api/v1/contracts/active",
    # Deribit
    "deribit_index": "https://www.deribit.com/api/v2/public/get_index_price?index_name=btc_usd",
    "deribit_dvol": "https://www.deribit.com/api/v2/public/get_volatility_index_data?currency=BTC&start_timestamp=1759000000000&end_timestamp=1760900000000&resolution=86400",
    # dữ liệu cơ bản / on-chain
    "coingecko_markets": "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1",
    "coingecko_cats": "https://api.coingecko.com/api/v3/coins/categories/list",
    "coingecko_coin": "https://api.coingecko.com/api/v3/coins/ethereum?localization=false&tickers=false&community_data=false&developer_data=false",
    "coinpaprika": "https://api.coinpaprika.com/v1/tickers?limit=5",
    "llama_protocols": "https://api.llama.fi/protocols",
    "llama_fees": "https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true",
    "llama_revenue": "https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyRevenue",
    "llama_holders_rev": "https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyHoldersRevenue",
    "llama_chains": "https://api.llama.fi/v2/chains",
    "llama_emissions": "https://api.llama.fi/emissions",
    "llama_emission_one": "https://api.llama.fi/emission/arbitrum",
    "llama_unlocks_ds": "https://defillama-datasets.llama.fi/emissionsProtocolsList",
    "llama_stablecoins": "https://stablecoins.llama.fi/stablecoins?includePrices=false",
    "coinmetrics_btc": "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=CapMVRVCur,CapMrktCurUSD,CapRealUSD,AdrActCnt,TxTfrValAdjUSD&frequency=1d&page_size=3",
    "coinmetrics_catalog": "https://community-api.coinmetrics.io/v4/catalog/asset-metrics?assets=eth",
    "fng": "https://api.alternative.me/fng/?limit=3",
    "blockchain_info": "https://api.blockchain.info/charts/mvrv?timespan=30days&format=json",
    "mempool": "https://mempool.space/api/v1/fees/recommended",
    "cryptocompare": "https://min-api.cryptocompare.com/data/v2/histoday?fsym=BTC&tsym=USD&limit=3",
    "messari": "https://data.messari.io/api/v1/assets/btc/metrics",
    "tokenterminal": "https://api.tokenterminal.com/v2/projects",
    "coinglass_pub": "https://open-api.coinglass.com/public/v2/funding",
    "rss_coindesk": "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "rss_cointelegraph": "https://cointelegraph.com/rss",
    "rss_theblock": "https://www.theblock.co/rss.xml",
    "gnews": "https://news.google.com/rss/search?q=bitcoin+when:1d&hl=en-US&gl=US&ceid=US:en",
}
POST = {
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
