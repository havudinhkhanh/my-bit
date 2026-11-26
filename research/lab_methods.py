"""DANH MỤC PHƯƠNG PHÁP ỨNG VIÊN của phòng thử nghiệm (research/lab.py chấm điểm – xem luật ở đầu tệp đó).

THÊM PHƯƠNG PHÁP MỚI (người hoặc lượt tìm tự động mỗi 4 ngày):
  1. viết 1 hàm  f(D) -> dict(g=…, c=…, f=…, expo=…, turn=…[, end=…, note=…, note_en=…])  – cách dễ nhất: dựng ma trận tỉ trọng W[ngày, mã]
     (giữ TRONG ngày d, chỉ dùng số liệu tới hết ngày d−1; tổng |W| ≤ 1) rồi `return _out(D, W)`;
  2. thêm 1 mục vào METHODS (id không đổi về sau – web & phần theo dõi tiếp bám theo id), ghi NGUỒN (bài nghiên cứu / bài viết) vào src;
  3. KHÔNG sửa tham số của phương pháp đã có để "cho đẹp" – muốn thử tham số khác thì thêm id mới (v2). Phương pháp đã loại vẫn giữ lại để khỏi thử lại.
Dữ liệu D (lab.py): D.O/H/L/C/Q[ngày, mã] nến ngày UTC · D.F funding cộng theo ngày · D.O6/H6/L6/C6 nến 6 giờ · D.btc_oh[ngày, giờ] giá mở từng giờ của BTC ·
  D.rank[ngày, mã] thứ hạng khối lượng 30 ngày tính tới hôm trước (0 = lớn nhất, inf = không đủ điều kiện) · D.cost phí + trượt mỗi chiều · D.wd thứ (0 = thứ Hai)."""
import numpy as np
import pandas as pd

import lab as L


def _out(D, W, **kw):
    g, c, f, expo, turn = L.pnl(D, W); return dict(g=g, c=c, f=f, expo=expo, turn=turn, W=W, **kw)


def _ls(D, sig, reb, top=40, q=5):
    """Mua nhóm điểm cao nhất, bán khống nhóm thấp nhất (mỗi bên 50% vốn, chia đều) trong `top` mã khối lượng lớn; đổi danh mục vào ngày reb[d] = True."""
    W = np.zeros((D.nd, D.S)); w = np.zeros(D.S)
    for d in range(1, D.nd):
        if reb[d]:
            s = np.where((D.rank[d] < top) & np.isfinite(sig[d]), sig[d], np.nan); ok = np.nonzero(np.isfinite(s))[0]
            if len(ok) >= 2 * q:
                k = max(1, len(ok) // q); o = ok[np.argsort(s[ok])]; w = np.zeros(D.S); w[o[-k:]] = 0.5 / k; w[o[:k]] = -0.5 / k
        w = np.where(np.isfinite(D.O[d]), w, 0.0); W[d] = w
    return W


def xmom14(D):
    C = pd.DataFrame(D.C); sig = (C.shift(1) / C.shift(15) - 1).values      # lợi suất 14 ngày tính tới hôm trước
    return _out(D, _ls(D, sig, D.wd == 0))


def xrev1(D):
    C = pd.DataFrame(D.C); sig = -(C.shift(1) / C.shift(2) - 1).values      # hôm qua giảm mạnh nhất → mua, tăng mạnh nhất → bán
    return _out(D, _ls(D, sig, np.ones(D.nd, bool)))


def xcarry(D):
    F = pd.DataFrame(D.F); sig = -F.rolling(7, min_periods=5).mean().shift(1).values      # funding 7 ngày thấp nhất → mua (được trả phí), cao nhất → bán
    end = D.fund_until + 1
    return _out(D, _ls(D, sig, D.wd == 0), end=end, note="Funding chỉ có theo tệp tháng → số liệu tới hết tháng trước.", note_en="Funding data is monthly → figures run to the end of last month.")


def dcens(D):
    """Bám xu hướng kiểu "Catching Crypto Trends": tổ hợp 9 kênh Donchian, chỉ Long, cỡ lệnh theo độ biến động (mục tiêu 25%/năm mỗi mã), 20 mã lớn nhất."""
    C = pd.DataFrame(D.C); ens = np.zeros((D.nd, D.S)); LB = (5, 10, 20, 30, 60, 90, 150, 250, 360)
    for n in LB:
        up = C.rolling(n, min_periods=n).max().shift(1).values; lo = C.rolling(n, min_periods=n).min().shift(1).values; mid = (up + lo) / 2
        pos = np.zeros(D.S, bool); stop = np.full(D.S, np.nan)
        for d in range(D.nd):
            c = D.C[d]; ex = pos & (c < stop); pos &= ~ex
            en = ~pos & np.isfinite(up[d]) & (c >= up[d]); pos |= en; stop = np.where(en, mid[d], stop)
            stop = np.where(pos, np.fmax(stop, mid[d]), np.nan); ens[d] += pos
    ens /= len(LB)
    vol = (C.pct_change().rolling(60, min_periods=30).std() * np.sqrt(365)).values
    w = ens * np.minimum(1.0, 0.25 / vol) / 20; W = np.zeros((D.nd, D.S))
    W[1:] = np.where((D.rank[1:] < 20) & np.isfinite(w[:-1]), w[:-1], 0.0)      # tín hiệu hết hôm trước → giữ hôm nay
    return _out(D, W)


def trend6h(D):
    """Bản rút gọn của "AdaptiveTrend" (arXiv 2602.11708): nến 6 giờ, đà L nến > ngưỡng → Long, thoát bằng cắt lỗ đuổi α × ATR; mỗi tháng chọn lại tham số
    tốt nhất của tháng TRƯỚC cho từng mã và chỉ đánh mã có Sharpe tháng trước ≥ 1,3. 15 mã khối lượng lớn nhất, mỗi mã 1/15 vốn, chỉ Long."""
    nb = D.nd * 4; top = D.rank < 15; use = np.nonzero(top.any(0))[0]; O, H, Lo, C = (x[:, use].astype(float) for x in (D.O6, D.H6, D.L6, D.C6))
    pc = np.vstack([C[:1], C[:-1]]); tr = np.fmax(H - Lo, np.fmax(np.abs(H - pc), np.abs(Lo - pc))); atr = pd.DataFrame(tr).rolling(14, min_periods=14).mean().values
    nxt = np.vstack([O[1:], C[-1:]]); nxt = np.where(np.isnan(nxt), C, nxt); R = np.nan_to_num(nxt / O - 1)
    P = []; prm = [(Lb, th, a) for Lb in (8, 20, 40) for th in (0.03, 0.06, 0.10) for a in (2.0, 3.0, 4.0)]
    for Lb, th, a in prm:
        mom = C / np.vstack([np.full((Lb, C.shape[1]), np.nan), C[:-Lb]]) - 1; pos = np.zeros(C.shape[1], bool); stop = np.full(C.shape[1], np.nan); X = np.zeros(C.shape, bool)
        for b in range(nb - 1):
            ex = pos & (C[b] < stop); pos &= ~ex; ns = C[b] - a * atr[b]
            en = ~pos & (mom[b] > th) & np.isfinite(ns); pos |= en; stop = np.where(en, ns, np.where(pos, np.fmax(stop, ns), np.nan)); X[b + 1] = pos
        P.append(X)
    mon = (D.dates.year * 12 + D.dates.month).values; mb = np.repeat(mon, 4); W6 = np.zeros((nb, D.S))
    for m in np.unique(mon)[1:]:
        cur = np.nonzero(mb == m)[0]; prv = np.nonzero(mb == m - 1)[0]; d0 = cur[0] // 4
        for j, s in enumerate(use):
            if not top[d0, s]: continue
            best, bs = None, -1e9
            for k, X in enumerate(P):
                r = X[prv, j] * R[prv, j]; tot = r.sum()
                if tot > bs: bs, best = tot, (k, r)
            r = best[1]; sd = r.std()
            if sd > 0 and r.mean() / sd * np.sqrt(4 * 365) >= 1.3: W6[cur, s] = P[best[0]][cur, j] / 15
    R6 = np.zeros((nb, D.S)); R6[:, use] = R; cost6 = np.repeat(D.cost, 4, 0); F6 = np.repeat(np.nan_to_num(D.F) / 4, 4, 0)
    dW = np.abs(np.diff(W6, axis=0, prepend=np.zeros((1, D.S)))); day = lambda x: x.reshape(D.nd, 4).sum(1)  # noqa: E731
    return dict(g=day((W6 * R6).sum(1)), c=day((dW * cost6).sum(1)), f=day(-(W6 * F6).sum(1)), expo=np.abs(W6).sum(1).reshape(D.nd, 4).mean(1), turn=day(dW.sum(1)))


def seas2123(D):
    """Mùa vụ trong ngày (Quantpedia): mua BTC 21:00 UTC, bán 23:00 UTC mỗi ngày (04:00 → 06:00 giờ VN), toàn bộ vốn, lệnh thị trường."""
    o = D.btc_oh; g = np.nan_to_num(o[:, 23] / o[:, 21] - 1); c = np.full(D.nd, 2 * 0.0006)
    return dict(g=g, c=c, f=np.zeros(D.nd), expo=np.full(D.nd, 2 / 24), turn=np.full(D.nd, 2.0),
                note=f"Trước phí: {g[D.ev0:].mean() * 100:+.3f}%/ngày; phí 2 chiều 0,12%/ngày.", note_en=f"Before costs: {g[D.ev0:].mean() * 100:+.3f}%/day; round-trip cost 0.12%/day.")


def _tradfi(D):
    """Mã KHÔNG phải crypto (cổ phiếu, ETF, vàng, dầu… Binance niêm yết dạng futures USDT từ 2026): cuối tuần thị trường gốc đóng cửa nên khối lượng & biên độ
    thứ Bảy–Chủ nhật rất thấp. Là đặc tính cố định của mã (loại tài sản), không phải tín hiệu giao dịch. (Bản gốc + danh sách soát bằng mắt: research/lab_diag.py)"""
    we = D.wd >= 5; ok = np.isfinite(D.C) & np.isfinite(D.O); q = np.where(ok, np.nan_to_num(D.Q), 0.0); a = np.where(ok, np.abs(D.R), np.nan)
    vs = q[we].sum(0) / np.maximum(q.sum(0), 1e-9); n = ok.sum(0)
    with np.errstate(all="ignore"): rr = np.nanmean(a[we], 0) / np.nanmean(a[~we], 0)
    return (n >= 28) & (vs < 0.12) & (rr < 0.45)


def xmomr(D):
    """Bản BỀN của "mạnh mua – yếu bán" – đăng ký trước, KHÔNG dò tham số (rà soát độc lập 26/11/2026 đề xuất, xem lab_log.md):
    · chỉ coin (bỏ hợp đồng cổ phiếu / hàng hoá) · điểm = trung bình thứ hạng lợi suất 7, 14 và 28 ngày (không chọn riêng 14) · vốn chia 7 phần, mỗi phần đổi danh mục
    1 thứ khác nhau (hết may rủi chọn thứ) · tỉ trọng nghịch với biến động 30 ngày · mỗi mã tối đa 5% vốn."""
    tf = _tradfi(D); q = pd.DataFrame(D.Q).where(np.isfinite(D.C)); v30 = q.rolling(30, min_periods=20).mean().shift(1).values
    el = D.elig & ~tf; rk = np.argsort(np.argsort(-np.where(el, v30, -1), 1), 1).astype(float); rk[~el] = np.inf
    C = pd.DataFrame(D.C); U = rk < 40
    R3 = [(C.shift(1) / C.shift(lb + 1) - 1).where(U).rank(axis=1, pct=True) for lb in (7, 14, 28)]
    sig = ((R3[0] + R3[1] + R3[2]) / 3).values      # thiếu 1 trong 3 → NaN → không xét
    vol = (C / C.shift(1) - 1).rolling(30, min_periods=14).std().shift(1).values; iv = np.where(np.isfinite(vol), 1 / np.maximum(vol, 0.01), 1 / 0.08)
    W = np.zeros((D.nd, D.S))
    for k in range(7):
        w = np.zeros(D.S)
        for d in range(1, D.nd):
            if D.wd[d] == k:
                ok = np.nonzero(np.isfinite(sig[d]))[0]
                if len(ok) >= 10:
                    n = max(1, len(ok) // 5); o = ok[np.argsort(sig[d][ok])]; hi, lo = o[-n:], o[:n]; w = np.zeros(D.S)
                    w[hi] = 0.5 * iv[d, hi] / iv[d, hi].sum(); w[lo] = -0.5 * iv[d, lo] / iv[d, lo].sum()
            w = np.where(np.isfinite(D.O[d]), w, 0.0); W[d] += w / 7
    return _out(D, np.clip(W, -0.05, 0.05))


def _basket(D, n=10):
    """Rổ n coin khối lượng lớn nhất, chia đều (tổng 1× vốn) – dùng cho các phép thử theo LỊCH (thứ trong tuần, cuối tuần)."""
    return np.where(D.rank < n, 1.0 / n, 0.0)


def wkend(D):
    return _out(D, _basket(D) * np.isin(D.wd, (5, 6))[:, None])      # chỉ giữ thứ Bảy + Chủ nhật (mở cửa 00:00 UTC thứ Bảy → 00:00 UTC thứ Hai)


def wkday(D):
    return _out(D, _basket(D) * (D.wd < 5)[:, None])      # chỉ giữ thứ Hai → thứ Sáu


def dowwf(D):
    """Thứ trong tuần, KHÔNG biết trước: đầu mỗi tháng xem 365 ngày vừa qua, thứ nào rổ coin tăng rõ (t ≥ 2) thì tháng này Long vào thứ đó, giảm rõ (t ≤ −2) thì Short."""
    B = _basket(D); b = (B * D.R).sum(1); mon = (D.dates.year * 12 + D.dates.month).values; pick = np.zeros(7); cur = None; W = np.zeros((D.nd, D.S))
    for d in range(D.nd):
        if mon[d] != cur:
            cur = mon[d]; pick = np.zeros(7); a = max(0, d - 365)
            if d - a >= 200:
                for w in range(7):
                    x = b[a:d][D.wd[a:d] == w]
                    if len(x) >= 25 and x.std() > 0:
                        t = x.mean() / x.std() * np.sqrt(len(x)); pick[w] = 1.0 if t >= 2 else -1.0 if t <= -2 else 0.0
        W[d] = B[d] * pick[D.wd[d]]
    return _out(D, W)


SRC = dict(coa=dict(t="Cryptocurrency as an Investable Asset Class: Coming of Age (arXiv 2510.14435)", u="https://arxiv.org/abs/2510.14435"),
           at=dict(t="Systematic Trend-Following with Adaptive Portfolio Construction (arXiv 2602.11708)", u="https://arxiv.org/abs/2602.11708"),
           cct=dict(t="Catching Crypto Trends – Zarattini, Pagani, Barbon", u="https://abarbon.com/papers/catching-crypto-trends"),
           qp=dict(t="Quantpedia – Are There Seasonal Intraday or Overnight Anomalies in Bitcoin?", u="https://quantpedia.com/are-there-seasonal-intraday-or-overnight-anomalies-in-bitcoin/"),
           fpf=dict(t="Fundamentals of Perpetual Futures (arXiv 2212.06888)", u="https://arxiv.org/abs/2212.06888"),
           sb=dict(t="Quantpedia – The Seasonality of Bitcoin", u="https://quantpedia.com/the-seasonality-of-bitcoin/"),
           ny=dict(t="NYDIG – The Temporalities of Bitcoin Returns", u="https://nydig.com/research/the-temporalities-of-bitcoin-returns"),
           kr=dict(t="Keyrock – What 16,000+ Token Unlocks Teach Us", u="https://keyrock.com/from-locked-to-liquidity-what-16000-token-unlocks-teach-us/"))

METHODS = [
    dict(id="trend6h", fn=trend6h, name="Bám xu hướng nến 6 giờ (tự chọn tham số mỗi tháng)", name_en="6-hour trend following (monthly re-tuned)", hold="giữ vài ngày · chỉ Long", hold_en="holds days · long only",
         desc="15 coin lớn nhất. Giá tăng đủ mạnh trong 2–10 ngày thì mua, thoát bằng cắt lỗ đuổi theo biên độ dao động. Đầu mỗi tháng chọn lại bộ số tốt nhất của tháng trước cho từng coin và chỉ đánh coin vừa có tháng tốt.",
         desc_en="Top 15 coins. Buy when price has risen enough over 2–10 days, exit on an ATR trailing stop. Each month re-pick last month's best settings per coin and only trade coins that just had a good month.", src=[SRC["at"]]),
    dict(id="dcens", fn=dcens, name="Bám xu hướng nhiều khung (9 kênh Donchian)", name_en="Multi-horizon trend (9 Donchian channels)", hold="giữ vài tuần · chỉ Long", hold_en="holds weeks · long only",
         desc="20 coin lớn nhất. Giá vượt đỉnh 5 … 360 ngày thì mua từng phần, mỗi kênh tự thoát khi giá thủng đường giữa kênh. Coin càng biến động thì lệnh càng nhỏ.",
         desc_en="Top 20 coins. Scale in as price breaks 5…360-day highs; each channel exits below its mid-line. More volatile coins get smaller size.", src=[SRC["cct"]]),
    dict(id="xmomr", fn=xmomr, name="Mạnh mua – yếu bán, bản bền (chỉ coin, chia 7 phần)", name_en="Cross-sectional momentum, robust version (crypto only, 7 tranches)", hold="mỗi ngày đổi 1/7 danh mục · Long + Short", hold_en="1/7 rebalanced daily · long + short",
         desc="Trong 40 coin lớn (bỏ hợp đồng cổ phiếu, vàng, dầu): mua nhóm mạnh nhất và bán khống nhóm yếu nhất theo điểm gộp 7, 14 và 28 ngày. Vốn chia 7 phần đổi vào 7 thứ khác nhau, coin càng giật thì lệnh càng nhỏ, mỗi coin tối đa 5% vốn. Luật được chốt trước khi chấm, không chỉnh cho đẹp.",
         desc_en="Among the top 40 coins (stock, gold and oil contracts excluded): long the strongest and short the weakest by a blended 7/14/28-day score. Capital is split into 7 tranches rebalanced on different weekdays, jumpier coins get smaller size, max 5% per coin. Rules fixed before scoring.", src=[SRC["coa"]]),
    dict(id="xmom14", fn=xmom14, name="Mạnh mua – yếu bán, 2 tuần", name_en="2-week cross-sectional momentum", hold="đổi danh mục mỗi thứ Hai · Long + Short", hold_en="rebalanced Mondays · long + short",
         desc="Trong 40 mã khối lượng lớn nhất (từ 2026 gồm cả hợp đồng cổ phiếu, vàng, dầu trên Binance): mua 8 mã tăng mạnh nhất 14 ngày qua, bán khống 8 mã yếu nhất, hai bên bằng tiền nhau nên ít phụ thuộc thị trường lên hay xuống.",
         desc_en="Among the 40 most-traded contracts (since 2026 this includes stock, gold and oil contracts on Binance): long the 8 strongest over 14 days, short the 8 weakest, equal money each side.", src=[SRC["coa"]],
         warn="Rà soát độc lập 26/11/2026: con số này phần lớn là may. Cùng luật nhưng đổi danh mục vào thứ khác thì 12 tháng qua chỉ từ −42% tới +66% (thứ Hai: +167%); 5 mã đóng góp 65% tổng lời; bỏ 20 ngày tốt nhất là hết lời. Kỳ vọng hợp lý chỉ khoảng +10–20%/năm ở 1× vốn, sụt 25–45%. Xem bản bền (xmomr).",
         warn_en="Independent review 26 Nov 2026: this number is mostly luck. The same rule rebalanced on other weekdays made −42% to +66% over the last 12 months (Monday: +167%); 5 symbols are 65% of the profit; without the 20 best days nothing is left. A fair expectation is about +10–20%/yr at 1×, with 25–45% drawdowns. See the robust version (xmomr)."),
    dict(id="xcarry", fn=xcarry, name="Ăn chênh funding giữa các coin", name_en="Cross-sectional funding carry", hold="đổi danh mục mỗi thứ Hai · Long + Short", hold_en="rebalanced Mondays · long + short",
         desc="Trong 40 coin lớn: mua 8 coin funding thấp nhất (được trả phí), bán khống 8 coin funding cao nhất (cũng được trả phí). Lời = phí nhận được ± chênh giá hai nhóm.",
         desc_en="Among the top 40 coins: long the 8 lowest-funding coins and short the 8 highest – both sides collect funding. P&L = funding received ± the price spread.", src=[SRC["fpf"]]),
    dict(id="xrev1", fn=xrev1, name="Đảo chiều 1 ngày giữa các coin", name_en="1-day cross-sectional reversal", hold="đổi danh mục mỗi ngày · Long + Short", hold_en="rebalanced daily · long + short",
         desc="Trong 40 coin lớn: mua 8 coin giảm mạnh nhất hôm qua, bán khống 8 coin tăng mạnh nhất, giữ 1 ngày.",
         desc_en="Among the top 40 coins: long yesterday's 8 biggest losers, short the 8 biggest winners, hold one day.", src=[SRC["coa"]]),
    dict(id="wkend", fn=wkend, name="Chỉ đánh cuối tuần (thứ Bảy + Chủ nhật)", name_en="Weekends only (Sat + Sun)", hold="giữ 2 ngày mỗi tuần · chỉ Long", hold_en="holds 2 days a week · long only",
         desc="Giữ rổ 10 coin lớn nhất chỉ trong thứ Bảy và Chủ nhật, các ngày khác đứng ngoài. Để xem cuối tuần có khác trong tuần không.",
         desc_en="Hold the 10 largest coins only on Saturday and Sunday, flat otherwise – tests whether weekends differ from weekdays.", src=[SRC["sb"], SRC["ny"]]),
    dict(id="wkday", fn=wkday, name="Chỉ đánh trong tuần (thứ Hai → thứ Sáu)", name_en="Weekdays only (Mon → Fri)", hold="giữ 5 ngày mỗi tuần · chỉ Long", hold_en="holds 5 days a week · long only",
         desc="Giữ rổ 10 coin lớn nhất từ thứ Hai tới thứ Sáu, nghỉ cuối tuần. Cặp so sánh với phương pháp chỉ đánh cuối tuần.",
         desc_en="Hold the 10 largest coins Monday to Friday, flat on weekends – the mirror test of the weekend-only method.", src=[SRC["sb"], SRC["ny"]]),
    dict(id="dowwf", fn=dowwf, name="Thứ tốt / thứ xấu trong tuần (tự chọn lại mỗi tháng)", name_en="Good / bad weekdays (re-picked monthly)", hold="giữ 1 ngày · Long + Short", hold_en="holds 1 day · long + short",
         desc="Đầu mỗi tháng nhìn 365 ngày vừa qua: thứ nào rổ 10 coin lớn tăng rõ thì tháng này mua vào thứ đó, thứ nào giảm rõ thì bán khống. Chỉ dùng số liệu đã có tại lúc chọn.",
         desc_en="Each month look back 365 days: go long on weekdays where the top-10 basket clearly rose, short where it clearly fell. Uses only data available at pick time.", src=[SRC["sb"], SRC["ny"]]),
    dict(id="seas2123", fn=seas2123, name="BTC khung giờ 04:00–06:00 sáng (giờ VN)", name_en="BTC 21:00–23:00 UTC window", hold="giữ 2 giờ mỗi ngày · chỉ Long", hold_en="holds 2 hours daily · long only",
         desc="Mua BTC lúc 04:00 sáng và bán lúc 06:00 sáng giờ Việt Nam, ngày nào cũng làm. Nghiên cứu cũ (2015–2022) thấy BTC hay tăng ở khung giờ này.",
         desc_en="Buy BTC at 21:00 UTC and sell at 23:00 UTC every day. Older research (2015–2022) found BTC tends to rise in this window.", src=[SRC["qp"]]),
]

# Ý tưởng có nguồn nhưng CHƯA kiểm được (thiếu dữ liệu) – lượt tìm tự động xem ở đây trước để khỏi trùng, có dữ liệu thì chuyển thành hàm ở trên
QUEUE = [
    dict(name="Bán khống trước ngày mở khoá token lớn", name_en="Short ahead of large token unlocks", why="Cần lịch mở khoá QUÁ KHỨ theo từng coin (ngày, % nguồn cung, ai nhận) – web mới có lịch sắp tới.",
         why_en="Needs historical unlock calendars per coin (date, % of supply, recipient) – the site only has upcoming ones.", src=[SRC["kr"]]),
    dict(name="Đánh ngược tỉ lệ Long/Short của số đông", name_en="Fade the crowd's long/short ratio", why="Dữ liệu tỉ lệ Long/Short 5 phút của Binance chỉ có ~16 tháng; chưa tìm được nghiên cứu độc lập có số liệu sau phí.",
         why_en="Binance long/short ratio data covers only ~16 months; no independent after-cost study found yet.", src=[]),
]
