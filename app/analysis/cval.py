"""Định giá crypto theo dòng tiền thật + áp lực nguồn cung + so với thị trường.

Không có "BCTC" như cổ phiếu nên dùng 3 lớp:
 1) Dòng tiền on-chain (DefiLlama): phí người dùng trả (fees), doanh thu giao thức (revenue), phần về tay người giữ token
    (holders revenue: mua lại/đốt/chia cho staker). P/F, P/S, P/HR tính trên cả vốn hoá lưu hành và FDV.
 2) Nguồn cung: tỉ lệ lưu hành/FDV, lịch mở khoá 30/90/365 ngày, lạm phát cung thực tế đo từ CoinGecko.
 3) Thị trường đang ngầm định gì: tăng trưởng doanh thu cần có trong 5 năm để biện minh giá hiện tại
    (chiết khấu 30%/năm – rủi ro crypto, bội số cuối kỳ 15 lần P/HR), so với nhóm cùng ngành.
Coin không có dòng tiền đo được → nhãn "Đầu cơ" (giá do kỳ vọng/câu chuyện, chỉ so được với coin cùng nhóm).
"""
from __future__ import annotations

import math
import time

import numpy as np

from .fmt import vn
import pandas as pd

DISC = 0.20       # chiết khấu/năm cho tài sản crypto (cổ phiếu tăng trưởng ~10–12%; crypto rủi ro hơn)
TERM_PHR = 15.0   # bội số P/HR khi "trưởng thành" (sau 5 năm)
YEARS = 5
MIN_REV = 1e6     # doanh thu năm tối thiểu (USD) để tính bội số

LL_GROUP = {"Dexs": "DEX", "DEX Aggregator": "DEX", "Derivatives": "Phái sinh", "Perps": "Phái sinh", "Options": "Phái sinh",
            "Lending": "Cho vay", "CDP": "Stablecoin/CDP", "Stablecoin Issuer": "Stablecoin/CDP", "Liquid Staking": "Staking",
            "Liquid Restaking": "Staking", "Restaking": "Staking", "Yield": "Lợi suất", "Yield Aggregator": "Lợi suất", "Bridge": "Cầu nối",
            "Cross Chain Bridge": "Cầu nối", "Chain": "Layer 1", "Rollup": "Layer 2", "Launchpad": "Launchpad", "RWA": "RWA",
            "Oracle": "Oracle", "Services": "Dịch vụ", "SoFi": "Mạng xã hội", "Gaming": "Game", "NFT Marketplace": "NFT", "Wallets": "Ví",
            "Prediction Market": "Dự đoán", "Telegram Bot": "Bot giao dịch", "Trading App": "Bot giao dịch", "Memes": "Meme", "Basis Trading": "Lợi suất",
            "Payments": "Thanh toán", "DePIN": "DePIN", "AI Agents": "AI", "Exchange": "Sàn tập trung"}

CG_GROUP = [("meme-token", "Meme"), ("ai-agents", "AI"), ("artificial-intelligence", "AI"), ("depin", "DePIN"), ("storage", "DePIN"), ("gaming", "Game"),
            ("real-world-assets-rwa", "RWA"), ("privacy-coins", "Riêng tư"), ("oracle", "Oracle"), ("exchange-based-tokens", "Sàn tập trung"),
            ("perpetuals", "Phái sinh"), ("decentralized-exchange", "DEX"), ("lending-borrowing", "Cho vay"), ("liquid-staking-governance-tokens", "Staking"),
            ("prediction-markets", "Dự đoán"), ("layer-2", "Layer 2"), ("zero-knowledge-zk", "Layer 2"), ("bitcoin-ecosystem", "Hệ Bitcoin"),
            ("payment-solutions", "Thanh toán"), ("layer-1", "Layer 1"), ("decentralized-finance-defi", "DeFi khác"), ("infrastructure", "Hạ tầng")]
CAT2LAB = dict(CG_GROUP)
# coin lớn: gán tay để không bị danh mục phụ của CoinGecko kéo sai nhóm
GROUP_FIX = {"bitcoin": "Layer 1", "ethereum": "Layer 1", "solana": "Layer 1", "cardano": "Layer 1", "avalanche-2": "Layer 1", "tron": "Layer 1",
             "binancecoin": "Sàn tập trung", "ripple": "Thanh toán", "stellar": "Thanh toán", "litecoin": "Thanh toán", "bitcoin-cash": "Thanh toán",
             "chainlink": "Oracle", "hyperliquid": "Phái sinh", "uniswap": "DEX", "aave": "Cho vay", "ondo-finance": "RWA", "monero": "Riêng tư", "zcash": "Riêng tư",
             "dogecoin": "Meme", "shiba-inu": "Meme", "pepe": "Meme", "bittensor": "AI", "render-token": "DePIN", "filecoin": "DePIN", "ethena": "Lợi suất",
             "lido-dao": "Staking", "pendle": "Lợi suất", "arbitrum": "Layer 2", "optimism": "Layer 2", "mantle": "Layer 2", "polygon-ecosystem-token": "Layer 2",
             "stacks": "Hệ Bitcoin", "sui": "Layer 1", "aptos": "Layer 1", "near": "Layer 1", "the-open-network": "Layer 1", "polkadot": "Layer 1", "cosmos": "Layer 1",
             "internet-computer": "Layer 1", "hedera-hashgraph": "Layer 1", "algorand": "Layer 1", "kaspa": "Layer 1", "ethereum-classic": "Layer 1"}


def _f(x, nd=4):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return None if (math.isnan(x) or math.isinf(x)) else round(x, nd)


# ------------------------------------------------------------------ dòng tiền
def cashflows(prot: pd.DataFrame, parents: pd.DataFrame, fees: pd.DataFrame, chains: pd.DataFrame) -> pd.DataFrame:
    """Gộp phí/doanh thu theo token (gecko_id). Giao thức con (Uniswap v2, v3…) cộng về giao thức mẹ."""
    if fees is None or fees.empty:
        return pd.DataFrame()
    gid = {}
    if prot is not None and not prot.empty:
        for r in prot.to_dict("records"):
            if r.get("gecko_id"):
                gid[str(r.get("id"))] = r["gecko_id"]
    pgid = {}
    if parents is not None and not parents.empty:
        for r in parents.to_dict("records"):
            if r.get("gecko_id"):
                pgid[str(r.get("id"))] = r["gecko_id"]
    chain_gid = {}
    if chains is not None and not chains.empty:
        for r in chains.to_dict("records"):
            if r.get("gecko_id"):
                chain_gid[str(r.get("name", "")).lower()] = r["gecko_id"]
    f = fees.copy()
    owner_g, owner_n = [], []
    for r in f.to_dict("records"):
        par = r.get("parentProtocol")
        g = None
        if isinstance(par, str) and par:
            g = pgid.get(par)
        if not g:
            g = gid.get(str(r.get("defillamaId")))
        if not g and str(r.get("category")) in ("Chain", "Rollup"):
            g = chain_gid.get(str(r.get("name", "")).lower())
        owner_g.append(g)
        owner_n.append(r.get("name"))
    f["gecko_id"] = owner_g
    f = f[f["gecko_id"].notna()]
    num = [c for c in f.columns if c.startswith(("fees_", "rev_", "hrev_"))]
    for c in num:
        f[c] = pd.to_numeric(f[c], errors="coerce")
    agg = {c: "sum" for c in num if "change" not in c}
    f = f.sort_values("fees_total30d", ascending=False, na_position="last") if "fees_total30d" in f else f
    out = f.groupby("gecko_id", sort=False).agg({**agg, "category": "first", "name": "first"})
    # tốc độ tăng: tính lại từ tổng (không cộng % thay đổi)
    for col in ("fees", "rev", "hrev"):
        if f"{col}_total30d" in out and f"{col}_total1y" in out:
            out[f"{col}_vs1y"] = (out[f"{col}_total30d"] * 365 / 30) / out[f"{col}_total1y"].replace(0, np.nan) - 1
    out["n_parts"] = f.groupby("gecko_id").size()
    return out.reset_index()


def _ann(r: dict, col: str) -> float | None:
    v30 = r.get(f"{col}_total30d")
    v1y = r.get(f"{col}_total1y")
    vals = []
    if v30 is not None and v30 == v30 and v30 > 0:
        vals.append(v30 * 365 / 30)
    if v1y is not None and v1y == v1y and v1y > 0:
        vals.append(v1y)
    if not vals:
        return None
    # trọng số: 60% nhịp 30 ngày gần nhất (năm hoá), 40% 12 tháng – bớt nhiễu đột biến 1 tháng
    return vals[0] * 0.6 + vals[1] * 0.4 if len(vals) == 2 else vals[0]


def pv(cf: float, g: float, disc: float = DISC, term: float = TERM_PHR, years: int = YEARS) -> float:
    """Giá trị hiện tại: dòng tiền 5 năm tăng g/năm + giá trị cuối kỳ (bội số term × dòng tiền năm thứ 5)."""
    v = sum(cf * (1 + g) ** t / (1 + disc) ** t for t in range(1, years + 1))
    return v + cf * (1 + g) ** years * term / (1 + disc) ** years


def implied_growth(mcap: float, hr: float, disc: float = DISC, term: float = TERM_PHR, years: int = YEARS) -> float | None:
    """Tăng trưởng/năm (5 năm) mà dòng tiền về tay người giữ token cần đạt để giá hiện tại là hợp lý (giải ngược bằng chia đôi)."""
    if not mcap or not hr or hr <= 0:
        return None
    lo, hi = -0.9, 5.0
    if pv(hr, hi, disc, term, years) < mcap:
        return hi
    for _ in range(80):
        mid = (lo + hi) / 2
        if pv(hr, mid, disc, term, years) < mcap:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


# ------------------------------------------------------------------ nguồn cung
def unlock_stats(em: dict, circ: float | None, price: float | None, now: float | None = None) -> dict:
    now = now or time.time()
    s = em.get("series") or []
    if len(s) < 2:
        return {}
    t = np.array([p[0] for p in s], dtype=float)
    v = np.array([p[1] for p in s], dtype=float)
    cur = float(np.interp(now, t, v))
    out = {"unlocked_now": cur, "max_sched": float(v.max())}
    for d in (30, 90, 365):
        fut = float(np.interp(now + d * 86400, t, v))
        add = max(0.0, fut - cur)
        out[f"u{d}"] = add
        if circ:
            out[f"u{d}_pct"] = add / circ * 100
        if price:
            out[f"u{d}_usd"] = add * price
    if v.max() > 0:
        out["sched_done_pct"] = cur / v.max() * 100
    ev = [e for e in (em.get("events") or []) if e.get("t", 0) >= now - 86400]
    big = []
    for e in ev:
        amt = e.get("amt") or 0
        if amt and circ:
            e = {**e, "pct": amt / circ * 100}
        big.append(e)
    big.sort(key=lambda e: e["t"])
    out["next"] = [{"t": e["t"], "desc": e.get("desc"), "cat": e.get("cat"), "pct": _f(e.get("pct"), 2), "usd": _f((e.get("amt") or 0) * (price or 0), 0)}
                   for e in big if (e.get("pct") or 0) >= 0.1][:6]
    return out


def inflation(sup: pd.DataFrame) -> dict:
    """Lạm phát cung thực tế (tăng lượng lưu hành) – đo từ lịch sử vốn hoá/giá CoinGecko."""
    if sup is None or len(sup) < 40:
        return {}
    s = sup.dropna(subset=["supply"]).set_index("date")["supply"]
    s = s[s > 0]
    if len(s) < 40:
        return {}
    last = s.iloc[-7:].median()
    out = {}
    for d in (30, 90, 365):
        if len(s) > d:
            prev = s.iloc[-d - 7: -d].median() if len(s) > d + 7 else s.iloc[0]
            if prev > 0:
                out[f"infl{d}"] = ((last / prev) ** (365 / d) - 1) * 100
    return out


# ------------------------------------------------------------------ BTC: chu kỳ on-chain
def btc_cycle(mvrv: pd.DataFrame, px: pd.DataFrame) -> dict:
    """MVRV, giá vốn trung bình toàn mạng (realized price), Mayer multiple, mô hình luỹ thừa (power-law) dài hạn."""
    out = {}
    if mvrv is not None and not mvrv.empty:
        m = mvrv.dropna(subset=["mvrv"]).sort_values("date")
        cur = float(m["mvrv"].iloc[-1])
        hist = m["mvrv"]
        out["mvrv"] = cur
        out["mvrv_pctl"] = float((hist < cur).mean() * 100)
        out["mvrv_pctl_4y"] = float((hist.tail(1460) < cur).mean() * 100)
        p = float(m["price"].iloc[-1]) if "price" in m else None
        if p:
            out["realized_price"] = p / cur
        q = hist.quantile([0.05, 0.25, 0.5, 0.75, 0.95])
        out["mvrv_q"] = {str(k): float(v) for k, v in q.items()}
        out["mvrv_series"] = [[d.strftime("%Y-%m-%d"), round(float(v), 3), round(float(pp), 2)] for d, v, pp in
                              zip(m["date"].iloc[::3], m["mvrv"].iloc[::3], m["price"].iloc[::3])]
        # lợi nhuận 1 năm sau theo vùng MVRV (lịch sử từ 2014)
        mm = m.set_index("date")
        fwd = mm["price"].shift(-365) / mm["price"] - 1
        bins = [0, 1, 1.5, 2, 2.5, 3, 99]
        lab = ["<1", "1–1,5", "1,5–2", "2–2,5", "2,5–3", ">3"]
        z = pd.cut(mm["mvrv"], bins, labels=lab)
        tab = []
        for b in lab:
            sel = fwd[(z == b)].dropna()
            if len(sel) >= 20:
                tab.append({"zone": b, "n": int(len(sel)), "med1y": float(sel.median() * 100), "win": float((sel > 0).mean() * 100)})
        out["mvrv_fwd"] = tab
        out["mvrv_zone"] = next((lab[i] for i in range(len(bins) - 1) if bins[i] <= cur < bins[i + 1]), None)
    if px is not None and len(px) > 200:
        c = px.set_index("date")["close"]
        ma200 = c.rolling(200).mean()
        out["mayer"] = float(c.iloc[-1] / ma200.iloc[-1])
        mh = (c / ma200).dropna()
        out["mayer_pctl"] = float((mh < out["mayer"]).mean() * 100)
    # power-law: log10(giá) = a + b·log10(số ngày từ khối genesis 03/01/2009)
    src = None
    if mvrv is not None and not mvrv.empty and "price" in mvrv:
        src = mvrv.dropna(subset=["price"]).set_index("date")["price"]
    if src is not None and len(src) > 1000:
        days = (src.index - pd.Timestamp("2009-01-03")).days.values.astype(float)
        x, y = np.log10(days), np.log10(src.values.astype(float))
        b, a = np.polyfit(x, y, 1)
        res = y - (a + b * x)
        lo, hi = np.quantile(res, [0.05, 0.95])
        d_now = (pd.Timestamp.utcnow().tz_localize(None) - pd.Timestamp("2009-01-03")).days
        fair = 10 ** (a + b * math.log10(d_now))
        last = float(src.iloc[-1])
        out["pl"] = {"a": a, "b": b, "fair": fair, "lo": fair * 10 ** lo, "hi": fair * 10 ** hi,
                     "pos": float((math.log10(last) - math.log10(fair) - lo) / (hi - lo) * 100),
                     "fair_1y": 10 ** (a + b * math.log10(d_now + 365))}
    return out


# ------------------------------------------------------------------ tổng hợp từng coin
def value_coin(c: dict, cf: dict | None, unl: dict, infl: dict, peers: dict) -> dict:
    """c: dòng coin (giá, vốn hoá, FDV, cung…); cf: dòng tiền DefiLlama; peers: trung vị bội số theo nhóm."""
    mcap, fdv, price = c.get("mcap"), c.get("fdv"), c.get("price")
    circ, tot = c.get("circ"), c.get("total") or c.get("max")
    out = {"group": c.get("group")}
    if mcap and fdv and fdv > 0:
        out["float_pct"] = min(100.0, mcap / fdv * 100)
    elif circ and tot:
        out["float_pct"] = min(100.0, circ / tot * 100)
    out.update({k: _f(v, 3) for k, v in unl.items() if k not in ("next",)})
    out["unlock_next"] = unl.get("next") or []
    out.update({k: _f(v, 2) for k, v in infl.items()})
    # dòng tiền
    has_cf = False
    if cf:
        fees, rev, hr = _ann(cf, "fees"), _ann(cf, "rev"), _ann(cf, "hrev")
        out.update({"fees_ann": _f(fees, 0), "rev_ann": _f(rev, 0), "hrev_ann": _f(hr, 0), "ll_cat": cf.get("category"), "ll_name": cf.get("name"),
                    "fees_g30": _f(cf.get("fees_g30")), "rev_g30": _f(cf.get("rev_g30")), "fees_vs1y": _f(cf.get("fees_vs1y")),
                    "rev_vs1y": _f(cf.get("rev_vs1y"))})
        if rev and rev >= MIN_REV and mcap:
            has_cf = True
            out["ps"] = _f(mcap / rev, 2)
            out["ps_fdv"] = _f((fdv or mcap) / rev, 2)
            out["pf"] = _f(mcap / fees, 2) if fees else None
            if hr and hr > 0:
                out["phr"] = _f(mcap / hr, 2)
                out["phr_fdv"] = _f((fdv or mcap) / hr, 2)
                out["accrual"] = _f(hr / fees * 100, 1) if fees else None
            base_cf = hr if hr and hr >= MIN_REV / 2 else rev * 0.5      # chưa trả cho người giữ token → giả định tối đa 50% doanh thu
            out["cf_basis"] = "hrev" if hr and hr >= MIN_REV / 2 else "rev50"
            # cung pha loãng 1 năm tới
            dil = 1 + (unl.get("u365_pct") or (infl.get("infl365") or 0)) / 100
            out["dil_1y"] = _f((dil - 1) * 100, 1)
            ig = implied_growth(mcap * dil, base_cf)
            out["implied_g"] = _f(ig * 100 if ig is not None else None, 1)
            # giá trị nếu dòng tiền đứng yên (không tăng trưởng): 5 năm dòng tiền + giá trị cuối kỳ, chiết khấu 20%/năm
            fair_mcap_0 = pv(base_cf, 0.0)
            # theo trung vị nhóm (P/S)
            grp = peers.get(out.get("group")) or peers.get("_all") or {}
            l1 = out.get("group") == "Blockchain L1/L2"
            k_own, k_med = ("pf", "pf_med") if l1 else ("ps", "ps_med")
            own = (mcap / fees) if (l1 and fees) else (mcap / rev)
            out["rel_basis"] = "P/F" if l1 else "P/S"
            if grp.get(k_med):
                out["ps_grp"] = _f(grp[k_med], 2)
                out["vs_grp"] = _f(own / grp[k_med] * 100 - 100, 1)
                out["fair_grp"] = _f(price * grp[k_med] / own, 8) if price else None
            if price and mcap:
                out["fair_cf"] = _f(price * fair_mcap_0 / (mcap * dil), 8)
    out["has_cf"] = has_cf
    out["verdict"], out["why"] = verdict(out, c)
    return out


def verdict(v: dict, c: dict) -> tuple[str, list[str]]:
    why = []
    fl = v.get("float_pct")
    u365 = v.get("u365_pct")
    if fl is not None and fl < 35:
        why.append(f"Mới lưu hành {fl:.0f}% tổng cung – phần còn lại sẽ dần ra thị trường")
    if u365 is not None and u365 >= 15:
        why.append(f"Lịch mở khoá 12 tháng tới ≈ {u365:.0f}% lượng đang lưu hành")
    inf = v.get("infl365") or v.get("infl90")
    if inf is not None and inf >= 15:
        why.append(f"Cung lưu hành thực tế đang tăng ~{inf:.0f}%/năm (pha loãng)")
    if not v.get("has_cf"):
        if c.get("key") in ("BTC",):
            return "Theo chu kỳ", ["Bitcoin không có doanh thu – định giá theo MVRV, giá vốn toàn mạng và mô hình luỹ thừa (xem Thị trường)"] + why
        lab = "Đầu cơ"
        why.insert(0, "Không có dòng tiền đo được (phí/doanh thu) – giá phản ánh kỳ vọng, câu chuyện, thanh khoản")
        return lab, why
    ig = v.get("implied_g")
    g_act = v.get("rev_vs1y")
    vs = v.get("vs_grp")
    pts = 0
    if v.get("group") in ("Layer 1", "Layer 2", "Blockchain L1/L2"):
        why.insert(0, "Blockchain nền tảng: giá chủ yếu là phần bù 'tiền tệ / nền tảng' (giữ giá trị, thế chấp, trả phí gas) – phí giao dịch chỉ giải thích một phần, nên chỉ so P/F với các chuỗi khác")
        if vs is not None:
            why.append(f"P/F {'thấp hơn' if vs < 0 else 'cao hơn'} {abs(vs):.0f}% so với trung vị các blockchain" if abs(vs) < 100 else f"P/F gấp {vn(vs / 100 + 1, '.1f')} lần trung vị các blockchain")
            pts = 2 if vs <= -60 else 1 if vs <= -25 else 0 if vs <= 50 else -1 if vs <= 200 else -2
        if g_act is not None and abs(g_act) >= 0.3:
            why.append(f"Phí 30 ngày gần nhất {'cao' if g_act > 0 else 'thấp'} hơn {abs(g_act) * 100:.0f}% nhịp trung bình 12 tháng")
            pts += 0.5 if g_act > 0 else -0.5
        lab = "L1 rẻ tương đối" if pts >= 1 else "L1 ngang nhóm" if pts >= -0.5 else "L1 đắt tương đối"
        return lab, why
    if ig is not None:
        if ig <= 5:
            pts += 2
            why.append(f"Giá hiện tại chỉ cần dòng tiền tăng {ig:.0f}%/năm trong 5 năm – kỳ vọng thấp")
        elif ig <= 20:
            pts += 1
            why.append(f"Giá đang ngầm định dòng tiền tăng {ig:.0f}%/năm trong 5 năm – vừa phải với crypto")
        elif ig <= 40:
            pts -= 0.5
            why.append(f"Giá đang ngầm định dòng tiền tăng {ig:.0f}%/năm trong 5 năm – khá cao, cần tăng trưởng mạnh và bền")
        elif ig <= 70:
            pts -= 1
            why.append(f"Giá đang ngầm định dòng tiền tăng {ig:.0f}%/năm trong 5 năm – cao")
        else:
            pts -= 2
            why.append(f"Giá đòi hỏi dòng tiền tăng {ig:.0f}%/năm trong 5 năm – rất khó đạt, phần lớn là kỳ vọng")
    if vs is not None:
        if vs <= -40:
            pts += 1
            why.append(f"P/S thấp hơn {abs(vs):.0f}% so với trung vị nhóm {v.get('group') or ''}")
        elif vs >= 100:
            pts -= 1
            why.append(f"P/S cao gấp {vn(vs / 100 + 1, '.1f')} lần trung vị nhóm {v.get('group') or ''}")
    if g_act is not None:
        if g_act <= -0.3:
            pts -= 1
            why.append(f"Doanh thu 30 ngày gần nhất thấp hơn {abs(g_act) * 100:.0f}% nhịp trung bình 12 tháng")
        elif g_act >= 0.3:
            pts += 1
            why.append(f"Doanh thu 30 ngày gần nhất cao hơn {g_act * 100:.0f}% nhịp trung bình 12 tháng")
    if v.get("cf_basis") == "rev50":
        why.append("Giao thức chưa chia doanh thu cho người giữ token – tạm giả định tối đa 50% doanh thu về token")
        pts -= 0.5
    if (u365 or 0) >= 25:
        pts -= 1
    lab = "Rẻ" if pts >= 2 else "Hợp lý" if pts >= 0.5 else "Hơi đắt" if pts >= -1 else "Đắt"
    return lab, why


def peer_stats(rows: list[dict]) -> dict:
    """Trung vị P/S, P/HR theo nhóm (chỉ coin có doanh thu ≥ 1 triệu USD/năm)."""
    df = pd.DataFrame([{"group": r.get("group"), "ps": r.get("ps"), "phr": r.get("phr"), "pf": r.get("pf")} for r in rows if r.get("ps")])
    out = {}
    if df.empty:
        return out
    for g, d in list(df.groupby("group")) + [("_all", df)]:
        if len(d) >= 3:
            out[g] = {"n": int(len(d)), "ps_med": float(d["ps"].median()), "ps_q25": float(d["ps"].quantile(0.25)), "ps_q75": float(d["ps"].quantile(0.75)),
                      "phr_med": float(d["phr"].median()) if d["phr"].notna().sum() >= 3 else None,
                      "pf_med": float(d["pf"].median()) if d["pf"].notna().sum() >= 3 else None}
    return out
