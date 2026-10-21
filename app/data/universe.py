"""Danh sách coin phân tích: khớp CoinGecko (vốn hoá, cung) với các sàn (Binance spot, futures Bitget/OKX/Gate/Hyperliquid).

Khớp theo ký hiệu + kiểm tra giá (lệch < 20%) để tránh nhầm 2 coin trùng ký hiệu; hợp đồng dạng 1000PEPE / kPEPE được quy đổi.
Loại stablecoin, token bọc (wrapped), token staking thanh khoản, vàng token hoá… (không có ý nghĩa giao dịch xu hướng).
"""
from __future__ import annotations

import re

import numpy as np
import pandas as pd

STABLE = {"USDT", "USDC", "DAI", "FDUSD", "TUSD", "USDE", "USDS", "PYUSD", "USDD", "FRAX", "LUSD", "GUSD", "USDP", "BUSD", "EURC", "EURT", "USD1",
          "USDX", "SUSDE", "SUSDS", "USD0", "USDY", "RLUSD", "USDTB", "USDB", "CRVUSD", "GHO", "DOLA", "MIM", "USDF", "USDG", "BFUSD", "AUSD", "USR",
          "FXUSD", "USDL", "EUSD", "SDAI", "SFRAX", "BUIDL", "USTB", "OUSG", "USYC", "USDM", "USDA", "AEUR", "EURI", "XSGD", "BRZ", "TRYB", "USDQ",
          "USDO", "FRXUSD", "USDN", "SRUSD", "SYRUPUSDC", "YUSD", "USX", "DEUSD", "HONEY", "AVUSD", "USDZ", "USDH", "LISUSD", "MUSD", "RUSD", "PUSD"}
GOLD = {"PAXG", "XAUT", "KAU", "XAUM", "CGO"}
WRAP_NAME = re.compile(r"\b(wrapped|bridged|staked|liquid staked|restaked|binance-peg|stake|lido|coinbase wrapped|savings|vault|tokenized|bitcoin on|"
                       r"ether\.fi|rocket pool eth|mantle staked|jito staked|marinade|kelp|renzo|swell|stader|frax ether|midas|ondo us|backed|xstock|bstock)\b", re.I)
WRAP_SYM = {"WBTC", "WETH", "STETH", "WSTETH", "WEETH", "EETH", "CBBTC", "CBETH", "RETH", "METH", "BETH", "WBETH", "JITOSOL", "MSOL", "BNSOL", "JUPSOL",
            "SOLVBTC", "LBTC", "TBTC", "BTCB", "FBTC", "EZETH", "RSETH", "OSETH", "SWETH", "ETHX", "SFRXETH", "WBNB", "WTRX", "WAVAX", "WMATIC",
            "WHYPE", "KHYPE", "STHYPE", "WSOL", "CLBTC", "UNIBTC", "PUMPBTC", "ENZOBTC", "XSOLVBTC", "BBTC", "OBTC", "STKAAVE", "WEMIX$", "SAVAX",
            "STS", "WS", "STBTC", "LSETH", "PZETH", "RSWETH", "AGETH", "WEETHS", "TETH", "SUPEROETHB", "WOETH", "SUSDA", "SUSDX", "XAUTUSDT"}
PREFIX = [("1000000", 1e6), ("100000", 1e5), ("10000", 1e4), ("1000", 1e3), ("1M", 1e6), ("k", 1e3)]


def is_excluded(sym: str, name: str, price: float | None = None) -> str | None:
    s = (sym or "").upper()
    if s in STABLE or (price and 0.97 < price < 1.03 and re.search(r"usd|dollar|stable", name or "", re.I)):
        return "stable"
    if s in GOLD or re.search(r"\bgold\b", name or "", re.I):
        return "gold"
    if s in WRAP_SYM or WRAP_NAME.search(name or ""):
        return "wrapped"
    return None


def split_mult(base: str) -> tuple[str, float]:
    for p, m in PREFIX:
        if base.startswith(p) and len(base) > len(p) + 1 and (p != "k" or base[1:].isupper()):
            return base[len(p):], m
    return base, 1.0


def build(cg: pd.DataFrame, spot: pd.DataFrame, futs: dict[str, pd.DataFrame], cfg: dict) -> pd.DataFrame:
    """cg: coins/markets; spot: Binance USDT pairs (base, pair) + giá; futs: {sàn: DataFrame(base, price, vol_usd, oi_usd, ...)}"""
    cg = cg.copy()
    cg["sym"] = cg["symbol"].str.upper()
    cg["excl"] = [is_excluded(s, n, p) for s, n, p in zip(cg["sym"], cg["name"], cg["current_price"])]
    cg = cg.sort_values("market_cap", ascending=False, na_position="last")
    # ứng viên cho mỗi ký hiệu (có thể trùng) – chọn theo giá khớp
    by_sym: dict[str, list[dict]] = {}
    for r in cg.to_dict("records"):
        by_sym.setdefault(r["sym"], []).append(r)

    def match(base: str, price: float | None) -> dict | None:
        b, m = split_mult(base)
        cands = by_sym.get(base) or by_sym.get(b) or []
        if base in by_sym:
            m = 1.0
            b = base
        best = None
        for c in cands:
            cp = c.get("current_price")
            if not cp or not price:
                best = best or c
                continue
            if abs(price / m / cp - 1) < 0.2:
                return {**c, "_mult": m}
        return {**best, "_mult": m} if best and not price else None

    rows: dict[str, dict] = {}

    def row(c: dict) -> dict:
        r = rows.get(c["id"])
        if r is None:
            r = rows[c["id"]] = {"id": c["id"], "sym": c["sym"], "name": c["name"], "rank": c.get("market_cap_rank"), "excl": c.get("excl"),
                                 "spot_pair": None, "fut": {}, "why": set()}
        return r

    top = int(cfg.get("top_mcap", 300))
    for c in cg.to_dict("records"):
        if c.get("market_cap_rank") and c["market_cap_rank"] <= top:
            row(c)["why"].add("top")
    sp = spot.set_index("base")
    for base, s in sp.iterrows():
        c = match(base, s.get("price"))
        if c and (c.get("market_cap_rank") or 99999) <= int(cfg.get("binance_spot_rank_max", 1000)):
            r = row(c)
            r["spot_pair"] = s["pair"]
            r["why"].add("binance")
    vmin = float(cfg.get("fut_min_vol_usd", 1e6))
    orphans: dict[str, dict] = {}
    for ex, df in futs.items():
        if df is None or df.empty:
            continue
        for f in df.to_dict("records"):
            c = match(f["base"], f.get("price"))
            if c:
                r = row(c)
                r["fut"][ex] = {"base": f["base"], "mult": c["_mult"], "inst": f.get("inst")}
                if (f.get("vol_usd") or 0) >= vmin:
                    r["why"].add("fut")
            elif (f.get("vol_usd") or 0) >= vmin:
                b, m = split_mult(f["base"])
                o = orphans.setdefault(b, {"id": "x-" + b.lower(), "sym": b, "name": b, "rank": None, "excl": is_excluded(b, b), "spot_pair": None,
                                           "fut": {}, "why": {"fut"}})
                o["fut"][ex] = {"base": f["base"], "mult": m, "inst": f.get("inst")}
    for b, o in orphans.items():
        if not any(r["sym"] == b for r in rows.values()):
            rows[o["id"]] = o
    out = []
    for r in rows.values():
        if not r["why"]:
            continue
        r["why"] = ",".join(sorted(r["why"]))
        r["fut_ex"] = ",".join(sorted(r["fut"]))
        r["fut"] = {k: v for k, v in r["fut"].items()}
        out.append(r)
    df = pd.DataFrame(out)
    # ký hiệu hiển thị duy nhất (coin trùng ký hiệu → thêm hậu tố)
    df["rank_s"] = df["rank"].fillna(99999)
    df = df.sort_values("rank_s")
    seen: dict[str, int] = {}
    keys = []
    for s in df["sym"]:
        k = re.sub(r"[^A-Z0-9]", "", s.upper()) or "X"
        n = seen.get(k, 0)
        seen[k] = n + 1
        keys.append(k if n == 0 else f"{k}{n + 1}")
    df["key"] = keys
    return df.drop(columns=["rank_s"]).reset_index(drop=True)


def fut_frames(bitget: pd.DataFrame, okx: pd.DataFrame, gate: pd.DataFrame, hl: pd.DataFrame, bitget_c: pd.DataFrame | None = None,
               gate_c: pd.DataFrame | None = None) -> dict[str, pd.DataFrame]:
    """Chuẩn hoá ảnh chụp futures từng sàn. funding = mức của 1 kỳ; interval_h = độ dài kỳ (giờ)."""
    out = {}
    if bitget is not None and not bitget.empty:
        b = bitget[bitget["symbol"].str.endswith("USDT")].copy()
        b["base"] = b["symbol"].str[:-4]
        b["price"] = b["lastPr"]
        b["vol_usd"] = b["usdtVolume"]
        b["oi_usd"] = b["holdingAmount"] * b["markPrice"]
        b["funding"] = b["fundingRate"]
        b["basis"] = b["markPrice"] / b["indexPrice"] - 1
        b["inst"] = b["symbol"]
        if bitget_c is not None and not bitget_c.empty and "fundInterval" in bitget_c:
            iv = bitget_c.set_index("symbol")["fundInterval"]
            b["interval_h"] = b["symbol"].map(iv).fillna(8.0)
            if "maxLever" in bitget_c:
                b["max_lev"] = b["symbol"].map(bitget_c.set_index("symbol")["maxLever"])
        out["bitget"] = b[[c for c in ("base", "inst", "price", "vol_usd", "oi_usd", "funding", "basis", "interval_h", "max_lev") if c in b]]
    if okx is not None and not okx.empty:
        o = okx.copy()
        o["price"] = o["last"]
        o["vol_usd"] = o["volCcy24h"] * o["last"]
        o["oi_usd"] = o["oiUsd"] if "oiUsd" in o else o.get("oiCcy", np.nan) * o["last"]
        o["inst"] = o["instId"]
        out["okx"] = o[["base", "inst", "price", "vol_usd", "oi_usd"]]
    if gate is not None and not gate.empty:
        g = gate.copy()
        g["price"] = g["last"]
        g["vol_usd"] = g["volume_24h_quote"]
        qm = pd.to_numeric(g.get("quanto_multiplier"), errors="coerce") if "quanto_multiplier" in g else 1.0
        g["oi_usd"] = g["total_size"] * qm * g["mark_price"]
        g["funding"] = g["funding_rate"]
        g["basis"] = g["mark_price"] / g["index_price"] - 1
        g["inst"] = g["contract"]
        g["interval_h"] = 8.0
        if gate_c is not None and not gate_c.empty and "funding_interval" in gate_c:
            g["interval_h"] = g["contract"].map(gate_c.set_index("name")["funding_interval"].astype(float) / 3600).fillna(8.0)
        if gate_c is not None and not gate_c.empty and "leverage_max" in gate_c:
            g["max_lev"] = pd.to_numeric(g["contract"].map(gate_c.set_index("name")["leverage_max"]), errors="coerce")
        out["gate"] = g[[c for c in ("base", "inst", "price", "vol_usd", "oi_usd", "funding", "basis", "interval_h", "max_lev") if c in g]]
    if hl is not None and not hl.empty:
        h = hl.copy()
        h["price"] = h["mark"]
        h["vol_usd"] = h["vol24"]
        h["oi_usd"] = h["oi"] * h["mark"]
        h["basis"] = h["mark"] / h["oracle"] - 1
        h["inst"] = h["base"]
        h["interval_h"] = 1
        out["hl"] = h[["base", "inst", "price", "vol_usd", "oi_usd", "funding", "basis", "interval_h", "max_lev"]]
    return out
