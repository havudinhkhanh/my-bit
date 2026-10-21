"""Nhóm ngành crypto: giải thích nhóm làm gì / kiếm tiền từ đâu, chỉ số giá nhóm, sức mạnh so với BTC, luân chuyển dòng tiền, việc nên làm."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

# what = nhóm này là gì · product = sản phẩm / dịch vụ · money = dòng tiền đến từ đâu, token được hưởng gì · drivers = điều làm giá chạy · risks = rủi ro chính
INFO = {
    "Layer 1": {"what": "Blockchain nền tảng độc lập (Bitcoin, Ethereum, Solana…): tự vận hành mạng, tự bảo mật bằng thợ đào / người staking.",
                "product": "Bán 'không gian khối' – xử lý giao dịch chuyển tiền, chạy hợp đồng thông minh, làm nền cho DeFi, stablecoin, game, meme.",
                "money": "Người dùng trả phí gas bằng token của chuỗi; một phần bị đốt (giảm cung), phần còn lại trả cho validator. Token còn dùng để staking và làm tài sản thế chấp.",
                "drivers": "Số người dùng & giao dịch, lượng stablecoin và TVL trên chuỗi, ứng dụng mới hút người dùng, quỹ ETF, xu hướng chung của BTC.",
                "risks": "Cạnh tranh rất mạnh giữa các chuỗi, lạm phát token từ phần thưởng staking, mở khoá cho quỹ đầu tư, sự cố ngừng mạng."},
    "Layer 2": {"what": "Mạng mở rộng chạy trên Ethereum (Arbitrum, Optimism, Base…): gom giao dịch rẻ và nhanh rồi ghi kết quả về Ethereum để thừa hưởng bảo mật.",
                "product": "Giao dịch phí thấp cho DeFi, game, ví; bộ công cụ cho các công ty tự dựng chuỗi riêng (superchain, orbit).",
                "money": "Đơn vị vận hành (sequencer) thu phí người dùng trừ chi phí ghi dữ liệu lên Ethereum. Phần lớn token L2 chỉ là token quản trị – chưa được chia doanh thu.",
                "drivers": "Hoạt động trên mạng, airdrop/ưu đãi, nâng cấp Ethereum giảm phí, đề xuất chia phí cho người nắm token.",
                "risks": "Lượng mở khoá token rất lớn, token không hưởng dòng tiền, cạnh tranh gay gắt giữa các L2, phụ thuộc giá ETH."},
    "Meme": {"what": "Token cộng đồng theo hình tượng / trò đùa (DOGE, PEPE, BONK…) – không có sản phẩm hay doanh thu.",
             "product": "Không có sản phẩm; giá trị là sự chú ý, cộng đồng và văn hoá mạng.",
             "money": "Không có dòng tiền. Lãi/lỗ hoàn toàn từ người mua sau trả giá cao hơn người mua trước.",
             "drivers": "Mạng xã hội, người nổi tiếng, niêm yết sàn lớn, mùa altcoin, dòng tiền đầu cơ nhỏ lẻ (funding tăng mạnh).",
             "risks": "Biến động cực lớn (−50% trong vài ngày là bình thường), thanh khoản biến mất nhanh, cá mập xả hàng."},
    "AI": {"what": "Dự án gắn với trí tuệ nhân tạo: mạng huấn luyện / suy luận mô hình phân tán (Bittensor), AI agent tự giao dịch, dữ liệu cho AI, GPU thuê.",
           "product": "Sức mạnh tính toán, mô hình AI, agent tự động, chợ dữ liệu.",
           "money": "Người dùng trả phí dùng tính toán / dịch vụ; token thưởng cho người đóng góp GPU / mô hình (thường lạm phát cao).",
           "drivers": "Tin tức ngành AI (Nvidia, OpenAI…), câu chuyện 'AI agent', người dùng thực tế, niêm yết sàn.",
           "risks": "Phần lớn dự án chưa có doanh thu thật, định giá theo câu chuyện, cạnh tranh với AI tập trung (rẻ & tốt hơn)."},
    "DePIN": {"what": "Hạ tầng vật lý phi tập trung: lưu trữ (Filecoin, Arweave), GPU / render (Render), mạng không dây (Helium), bản đồ, cảm biến.",
              "product": "Dịch vụ thật như ổ cứng, GPU, sóng di động – do hàng nghìn người góp thiết bị thay vì một công ty.",
              "money": "Khách hàng trả phí dùng dịch vụ (thường mua & đốt token); người góp thiết bị nhận token thưởng.",
              "drivers": "Doanh thu từ khách thật, nhu cầu GPU cho AI, hợp tác doanh nghiệp.",
              "risks": "Token thưởng gây lạm phát lớn hơn doanh thu, cạnh tranh với AWS / Google, nhu cầu thật còn nhỏ."},
    "Sàn tập trung": {"what": "Token của sàn giao dịch (BNB, OKB, BGB…).",
                      "product": "Giảm phí giao dịch, quyền tham gia launchpool / phát hành token mới, nhiên liệu cho chuỗi của sàn.",
                      "money": "Sàn dùng một phần lợi nhuận để mua lại và đốt token định kỳ.",
                      "drivers": "Khối lượng giao dịch toàn thị trường (thị trường sôi động → sàn lãi lớn → mua lại nhiều), sự kiện launchpool.",
                      "risks": "Pháp lý với sàn, sự cố an toàn tài sản người dùng (như FTX)."},
    "DEX": {"what": "Sàn giao dịch phi tập trung chạy bằng hợp đồng thông minh (Uniswap, PancakeSwap, Jupiter, Raydium…).",
            "product": "Hoán đổi token trực tiếp từ ví, không cần đăng ký; nơi coin mới / meme giao dịch đầu tiên.",
            "money": "Phí mỗi lần hoán đổi (0,01–1%) trả cho người cung cấp thanh khoản; một số DEX trích phần cho người nắm token / mua lại token.",
            "drivers": "Khối lượng giao dịch on-chain (mùa meme), bật 'công tắc phí' chia lợi nhuận cho token.",
            "risks": "Cạnh tranh phí, khối lượng giảm mạnh khi thị trường nguội, pháp lý."},
    "Phái sinh": {"what": "Sàn hợp đồng tương lai / quyền chọn phi tập trung (Hyperliquid, dYdX, GMX, Aster…).",
                  "product": "Giao dịch đòn bẩy (perp) ngay trên chuỗi, không cần sàn tập trung.",
                  "money": "Phí giao dịch và phí thanh lý – dự án mạnh dùng phần lớn để mua lại token (Hyperliquid mua lại hàng ngày).",
                  "drivers": "Khối lượng perp, thị phần so với Binance, chương trình mua lại.",
                  "risks": "Rủi ro hợp đồng / thao túng giá oracle, cạnh tranh, pháp lý với giao dịch đòn bẩy."},
    "Cho vay": {"what": "Ngân hàng phi tập trung (Aave, Compound, Morpho, Kamino…): gửi tiền lấy lãi, thế chấp coin để vay.",
                "product": "Vay / cho vay stablecoin và coin, thế chấp tự động, thanh lý tự động.",
                "money": "Chênh lệch lãi suất giữa người vay và người gửi (phí dự trữ) + phí thanh lý; một số dự án mua lại token.",
                "drivers": "Nhu cầu vay đòn bẩy khi thị trường tăng, TVL, lãi suất stablecoin.",
                "risks": "Nợ xấu khi giá sập nhanh, lỗi hợp đồng, cạnh tranh lãi suất."},
    "Staking": {"what": "Staking thanh khoản / restaking (Lido, Ether.fi, Jito…): giúp người dùng stake ETH/SOL mà vẫn có token để dùng tiếp.",
                "product": "Token đại diện (stETH, eETH, JitoSOL) sinh lãi staking, dùng được trong DeFi.",
                "money": "Trích 5–10% phần thưởng staking của người dùng.",
                "drivers": "Giá ETH/SOL, tổng lượng stake, sản phẩm mới (restaking).",
                "risks": "Phụ thuộc giá tài sản gốc, rủi ro phạt validator (slashing), tập trung hoá."},
    "Lợi suất": {"what": "Sản phẩm tạo / tách / tối ưu lợi suất (Pendle, Ethena, Yearn…).",
                 "product": "Đô la tổng hợp có lãi (Ethena USDe từ chênh lệch funding), mua bán lợi suất tương lai (Pendle).",
                 "money": "Phí trên lợi suất tạo ra; với Ethena phụ thuộc funding dương trên thị trường futures.",
                 "drivers": "Funding cao (thị trường tăng, đòn bẩy nhiều), TVL, tích hợp sàn lớn.",
                 "risks": "Funding âm kéo dài làm lợi suất biến mất, rủi ro mất neo, lỗi hợp đồng."},
    "Stablecoin/CDP": {"what": "Phát hành stablecoin thế chấp bằng crypto (Sky/Maker…).", "product": "Đô la phi tập trung (DAI/USDS) cho vay thế chấp.",
                       "money": "Lãi người vay trả + lãi từ trái phiếu chính phủ Mỹ nắm giữ; dùng để mua lại token.", "drivers": "Cung stablecoin, lãi suất USD.",
                       "risks": "Mất neo, quản trị tập trung, cạnh tranh USDT/USDC."},
    "RWA": {"what": "Tài sản thực được token hoá (Ondo, Centrifuge, Plume…): trái phiếu chính phủ Mỹ, tín dụng, cổ phiếu, bất động sản lên blockchain.",
            "product": "Quỹ trái phiếu / tín dụng token hoá, hạ tầng phát hành tài sản thực.",
            "money": "Phí quản lý trên tài sản (0,15–1%/năm) – thường token quản trị chưa được chia trực tiếp.",
            "drivers": "Định chế lớn tham gia (BlackRock, Franklin), tổng tài sản token hoá tăng, pháp lý rõ ràng.",
            "risks": "Doanh thu nhỏ so với vốn hoá, phụ thuộc pháp lý, token không gắn với tài sản."},
    "Oracle": {"what": "Cung cấp dữ liệu ngoài đời (giá, kết quả) cho hợp đồng thông minh (Chainlink, Pyth…).", "product": "Nguồn giá cho DeFi, dữ liệu cho ngân hàng / RWA, cầu nối CCIP.",
               "money": "Phí dữ liệu từ dự án và doanh nghiệp; một phần đưa vào quỹ dự trữ mua token.", "drivers": "Tích hợp với ngân hàng / RWA, tăng trưởng DeFi.",
               "risks": "Doanh thu thực còn nhỏ so với vốn hoá, lượng token nhóm phát triển bán ra."},
    "Cầu nối": {"what": "Chuyển tài sản giữa các blockchain (LayerZero, Wormhole…).", "product": "Hạ tầng nhắn tin / chuyển token đa chuỗi.",
                "money": "Phí mỗi lần chuyển.", "drivers": "Số chuỗi & ứng dụng tích hợp, airdrop.", "risks": "Là mục tiêu hack lớn nhất của crypto; mở khoá token."},
    "Game": {"what": "Game và thế giới ảo trên blockchain (Axie, Sandbox, Immutable…).", "product": "Game có vật phẩm / nhân vật là token, chợ NFT trong game.",
             "money": "Bán vật phẩm, phí giao dịch trên chợ trong game.", "drivers": "Số người chơi thật, game mới ra mắt, mùa altcoin.",
             "risks": "Người chơi rời bỏ nhanh, token lạm phát, phần lớn game không có lãi."},
    "Riêng tư": {"what": "Coin giao dịch ẩn danh (Monero, Zcash…).", "product": "Chuyển tiền không lộ người gửi / người nhận / số tiền.",
                 "money": "Phí giao dịch trả thợ đào.", "drivers": "Nhu cầu quyền riêng tư, tin tức giám sát tài chính.", "risks": "Bị sàn huỷ niêm yết theo yêu cầu pháp lý."},
    "Thanh toán": {"what": "Mạng chuyên chuyển tiền / thanh toán (XRP, Stellar, Litecoin, Bitcoin Cash…).", "product": "Chuyển tiền xuyên biên giới nhanh và rẻ, thanh toán bằng crypto.",
                   "money": "Phí giao dịch rất nhỏ – giá trị chủ yếu từ vai trò 'tiền tệ' và câu chuyện hợp tác ngân hàng.", "drivers": "Tin pháp lý (vụ SEC – XRP), quỹ ETF, hợp tác ngân hàng.",
                   "risks": "Ứng dụng thật khiêm tốn, cạnh tranh với stablecoin."},
    "Hệ Bitcoin": {"what": "Ứng dụng xây quanh Bitcoin (Stacks, Ordinals/Runes, BTC staking…).", "product": "Hợp đồng thông minh, token, DeFi dùng BTC.",
                   "money": "Phí giao dịch trên các lớp mở rộng.", "drivers": "Giá BTC, phong trào Ordinals/Runes.", "risks": "Hoạt động thật nhỏ, câu chuyện đi trước sản phẩm."},
    "Dự đoán": {"what": "Thị trường dự đoán (đặt cược kết quả sự kiện).", "product": "Cược bầu cử, thể thao, tin tức.", "money": "Phí giao dịch.",
                "drivers": "Sự kiện lớn (bầu cử).", "risks": "Pháp lý cờ bạc."},
    "Hạ tầng": {"what": "Dịch vụ nền cho nhà phát triển (lập chỉ mục dữ liệu, ví, RPC, danh tính…).", "product": "Công cụ để ứng dụng blockchain chạy.",
                "money": "Phí dịch vụ trả bằng token.", "drivers": "Số ứng dụng và lượng truy vấn.", "risks": "Dễ bị thay thế, doanh thu nhỏ."},
    "DeFi khác": {"what": "Các ứng dụng tài chính phi tập trung khác (quản lý tài sản, bảo hiểm, ví, launchpad…).", "product": "Đa dạng.",
                  "money": "Phí sử dụng giao thức.", "drivers": "TVL & khối lượng DeFi chung.", "risks": "Thanh khoản thấp, lỗi hợp đồng."},
    "Khác": {"what": "Coin chưa phân loại được vào nhóm nào.", "product": "—", "money": "—", "drivers": "—", "risks": "Xem từng coin."},
}
ALIAS = {"Launchpad": "DeFi khác", "Dịch vụ": "Hạ tầng", "Interface": "DeFi khác", "Token Locker": "DeFi khác", "NFT": "Game", "CeDeFi": "DeFi khác",
         "Mạng xã hội": "DeFi khác", "Ví": "Hạ tầng", "Bot giao dịch": "DEX", "Blockchain L1/L2": "Layer 1"}


def norm(g: str | None) -> str:
    g = g or "Khác"
    g = ALIAS.get(g, g)
    return g if g in INFO else "DeFi khác"


def _f(x, nd=2):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(x) or math.isinf(x) else round(x, nd)


def _close(d: pd.DataFrame) -> pd.Series:
    s = d.set_index(pd.to_datetime(d["date"]).dt.normalize())["close"].astype(float)
    return s[~s.index.duplicated(keep="last")]


def _vol(d: pd.DataFrame) -> pd.Series:
    q = d["qvol"] if "qvol" in d else d["volume"] * d["close"]
    s = pd.Series(q.astype(float).values, index=pd.to_datetime(d["date"]).dt.normalize())
    return s[~s.index.duplicated(keep="last")]


def build(rows: list[dict], pxs: dict, btc: pd.DataFrame | None, ideas: list[dict], details: dict) -> dict:
    # bỏ token gần như không biến động (quỹ tín dụng / stablecoin lạ token hoá) – không phải thứ để giao dịch
    def flat(r):
        d = pxs.get(r["k"])
        if d is None or len(d) < 30:
            return False
        return float(d["close"].astype(float).pct_change().tail(90).std()) < 0.008
    by = {}
    for r in rows:
        if flat(r) or not (r.get("spot") or r.get("fx")):        # chỉ coin giao dịch được (Binance spot / sàn futures)
            continue
        by.setdefault(norm(r.get("g")), []).append(r)
    bs = _close(btc).tail(400) if btc is not None else None
    tot_v7 = tot_v30 = 0.0
    tmp = []
    for g, L in by.items():
        L = sorted(L, key=lambda r: -(r.get("mc") or 0))
        mem = [r for r in L if r["k"] in pxs and (r.get("vol") or 0) >= 5e5 and (r.get("spot") or r.get("fx"))][:40]
        idx = eq = None
        v7 = v30 = 0.0
        if mem:
            px = pd.DataFrame({r["k"]: _close(pxs[r["k"]]).tail(400) for r in mem})
            ret = px.pct_change().clip(-0.6, 1.5)
            w = pd.Series({r["k"]: (r.get("mc") or 0) for r in mem})
            w = w / w.sum() if w.sum() > 0 else pd.Series(1 / len(mem), index=w.index)
            avail = ret.notna()
            ww = avail.mul(w, axis=1)
            cw = (ret.fillna(0).mul(w, axis=1).sum(axis=1) / ww.sum(axis=1).replace(0, np.nan)).fillna(0)
            ew = ret.mean(axis=1).fillna(0)
            idx = (1 + cw).cumprod().tail(366)
            eq = (1 + ew).cumprod().tail(366)
            idx, eq = idx / idx.iloc[0] * 100, eq / eq.iloc[0] * 100
            vv = pd.DataFrame({r["k"]: _vol(pxs[r["k"]]).tail(41) for r in mem}).sum(axis=1).iloc[:-1]      # bỏ ngày đang chạy dở
            if len(vv) >= 31:
                v7, v30 = float(vv.tail(7).mean()), float(vv.tail(30).mean())
        tot_v7 += v7
        tot_v30 += v30
        tmp.append((g, L, mem, idx, eq, v7, v30))
    out = []
    for g, L, mem, idx, eq, v7, v30 in tmp:
        def ch(s, n):
            return _f((s.iloc[-1] / s.iloc[-n - 1] - 1) * 100, 1) if s is not None and len(s) > n else None
        rs = {}
        series = []
        if idx is not None and bs is not None:
            b = bs.reindex(idx.index).ffill()
            ratio = idx / (b / b.iloc[0] * 100)
            rs = {"rs7": ch(ratio, 7), "rs30": ch(ratio, 30), "rs90": ch(ratio, 90)}
            # luân chuyển: sức mạnh 30 ngày so BTC (trục ngang) & đà thay đổi 7 ngày (trục dọc)
            r30 = ratio.pct_change(30) * 100
            rs["mom"] = _f(r30.iloc[-1] - r30.iloc[-8], 1) if len(r30.dropna()) > 8 else None
            rs["trail"] = [[_f(r30.iloc[-1 - k], 1), _f(r30.iloc[-1 - k] - r30.iloc[-8 - k], 1)] for k in (21, 14, 7, 0) if len(r30.dropna()) > 8 + k]
            bn = b / b.iloc[0] * 100
            series = [[d.strftime("%Y-%m-%d"), _f(a, 2), _f(e, 2), _f(c, 2)] for d, a, e, c in zip(idx.index, idx.values, eq.values, bn.values)]
        ma50 = idx.rolling(50).mean().iloc[-1] if idx is not None and len(idx) >= 50 else None
        oi = sum(r.get("oi") or 0 for r in L)
        fw = [(r.get("f8"), r.get("oi") or 0) for r in L if r.get("f8") is not None and (r.get("oi") or 0) > 0]
        f8 = sum(a * b for a, b in fw) / sum(b for _, b in fw) if fw and sum(b for _, b in fw) > 0 else None
        oi7 = [(r.get("oi7"), r.get("oi") or 0) for r in L if r.get("oi7") is not None and (r.get("oi") or 0) > 0]
        oi7w = sum(a * b for a, b in oi7) / sum(b for _, b in oi7) if oi7 and sum(b for _, b in oi7) > 0 else None
        ps = [r["ps"] for r in L if r.get("ps")]
        rev = sum(((details.get(r["k"]) or {}).get("cf") or {}).get("rev_total30d") or 0 for r in L)
        fees = sum(((details.get(r["k"]) or {}).get("cf") or {}).get("fees_total30d") or 0 for r in L)
        liq = [r for r in L if (r.get("vol") or 0) >= 1e6]
        up = sum(1 for r in liq if r.get("ts") == 1)
        dn = sum(1 for r in liq if r.get("ts") == -1)
        idl = [x for x in ideas if norm((details.get(x["k"]) or {}).get("row", {}).get("g")) == g and x.get("edge")]
        share7 = v7 / tot_v7 * 100 if tot_v7 else None
        share30 = v30 / tot_v30 * 100 if tot_v30 else None
        rr = lambda k: sorted([r for r in liq if r.get(k) is not None], key=lambda r: -r[k])  # noqa: E731
        s = {"g": g, "info": INFO[g], "n": len(L), "n_liq": len(liq), "mc": _f(sum(r.get("mc") or 0 for r in L), 0), "vol": _f(sum(r.get("vol") or 0 for r in L), 0),
             "r1": _f(np.median([r["r1"] for r in liq if r.get("r1") is not None]), 2) if liq else None,
             "r7": ch(idx, 7), "r30": ch(idx, 30), "r90": ch(idx, 90), "r365": ch(idx, 365), "eq30": ch(eq, 30), "eq90": ch(eq, 90),
             **rs, "above50": bool(idx.iloc[-1] > ma50) if ma50 is not None else None, "dd": _f((idx.iloc[-1] / idx.max() - 1) * 100, 1) if idx is not None else None,
             "up": up, "dn": dn, "breadth": _f(up / len(liq) * 100, 0) if liq else None, "oi": _f(oi, 0), "oi7": _f(oi7w, 1), "f8": _f(f8, 4),
             "ps_med": _f(np.median(ps), 1) if ps else None, "rev30": _f(rev, 0), "fees30": _f(fees, 0),
             "v7": _f(v7, 0), "vshare7": _f(share7, 2), "vshare30": _f(share30, 2), "vflow": _f((v7 / v30 - 1) * 100, 0) if v30 else None,
             "ideas_long": sum(1 for x in idl if x["side"] == "long"), "ideas_short": sum(1 for x in idl if x["side"] == "short"),
             "ideas": [{k: x.get(k) for k in ("k", "side", "tf", "name", "win1", "avgR", "t1_pct", "e")} for x in idl[:8]],
             "top": [r["k"] for r in L[:12]], "best7": [[r["k"], r["r7"]] for r in rr("r7")[:5]], "worst7": [[r["k"], r["r7"]] for r in rr("r7")[::-1][:5]],
             "best30": [[r["k"], r["r30"]] for r in rr("r30")[:5]], "members": [r["k"] for r in L], "series": series}
        s["action"] = advice(s)
        out.append(s)
    out.sort(key=lambda s: -(s["mc"] or 0))
    return {"sectors": out}


def advice(s: dict) -> dict:
    """Việc nên làm với nhóm – quy tắc đơn giản theo sức mạnh so BTC, đà, độ rộng, đòn bẩy."""
    rs30, mom, br, f8, vf = s.get("rs30"), s.get("mom"), s.get("breadth"), s.get("f8"), s.get("vflow")
    lines = []
    if rs30 is None:
        return {"q": None, "head": "Chưa đủ dữ liệu", "lines": []}
    q = ("Dẫn dắt" if mom >= 0 else "Suy yếu") if rs30 >= 0 else ("Cải thiện" if (mom or 0) >= 0 else "Tụt hậu")
    if q == "Dẫn dắt":
        head = "Nhóm đang mạnh hơn BTC và còn tăng tốc – ưu tiên Long coin dẫn đầu nhóm khi hồi về hỗ trợ"
    elif q == "Suy yếu":
        head = "Nhóm từng mạnh nhưng đang hụt hơi – chốt lời dần, không mở mới; chờ hồi xong mới tính"
    elif q == "Cải thiện":
        head = "Nhóm yếu hơn BTC nhưng đang cải thiện – theo dõi, vào nhỏ khi coin lớn trong nhóm phá cấu trúc tăng"
    else:
        head = "Nhóm yếu hơn BTC và vẫn đang yếu đi – tránh Long; nếu đánh thì Short coin yếu nhất khi hồi lên kháng cự (chỉ futures)"
    lines.append(f"So với BTC: 30 ngày {rs30:+.1f}%, đà 7 ngày {mom:+.1f} điểm → góc phần tư '{q}'")
    if br is not None:
        lines.append(f"{br:.0f}% coin thanh khoản trong nhóm đang xu hướng tăng" + (" – lan toả rộng" if br >= 60 else " – chỉ vài coin kéo" if br < 35 else ""))
    if vf is not None:
        lines.append(f"Khối lượng 7 ngày {'cao' if vf >= 0 else 'thấp'} hơn trung bình 30 ngày {abs(vf):.0f}%" + (" → tiền đang đổ vào" if vf >= 25 else " → tiền đang rút ra" if vf <= -25 else ""))
    if f8 is not None:
        if f8 >= 0.03:
            lines.append(f"Funding trung bình {f8:+.4f}%/8h – phe Long đang đông, dễ có cú rũ trước khi đi tiếp")
        elif f8 < 0:
            lines.append(f"Funding âm {f8:+.4f}%/8h – phe Short đông, nếu nhóm tăng dễ bị ép Short (squeeze)")
    if s.get("ideas_long") or s.get("ideas_short"):
        lines.append(f"Đang có {s.get('ideas_long', 0)} cơ hội Long và {s.get('ideas_short', 0)} cơ hội Short có lợi thế lịch sử trong nhóm")
    return {"q": q, "head": head, "lines": lines}
