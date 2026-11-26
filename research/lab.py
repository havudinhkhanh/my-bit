"""PHÒNG THỬ NGHIỆM PHƯƠNG PHÁP (Jason 26/11/2026): "tìm phương pháp mới mỗi 3–5 ngày, tự thêm vào tab thử nghiệm, báo tin trên web".
Máy này chạy lại theo lịch (lab.yml, 4 ngày/lần). Mỗi lần:
  1. tải nến 1 GIỜ + funding THẬT của MỌI mã futures USDT Binance (data.binance.vision, kể cả mã đã huỷ niêm yết) từ 01/2023 tới hôm qua;
  2. chạy mọi phương pháp ứng viên trong research/lab_methods.py – mỗi phương pháp trả về chuỗi lời/lỗ THEO NGÀY (% vốn, tổng vị thế ≤ 1× vốn),
     đã trừ phí taker + trượt giá (6 bps/chiều với 10 mã lớn nhất, 10 bps mã khác) và funding thật; quyết định bằng số liệu tới hết hôm trước,
     khớp ở giá MỞ CỬA ngày/nến kế tiếp (không nhìn trước);
  3. chấm theo CÙNG một bộ cổng (xem GATES) → "watch" (qua kiểm lịch sử, theo dõi tiếp trên giấy) hoặc "fail" (loại, ghi rõ lý do);
  4. THEO DÕI TIẾP: từ ngày phương pháp được thêm (added) trở đi là số liệu nó CHƯA TỪNG thấy – đủ ngày & vẫn lời → "pass" (đạt, chờ Jason quyết
     có đưa vào bot hay không), xấu đi → "drop";
  5. ghi site/lab.json (web đọc: Bot Phản Xạ › Phương pháp › Ứng viên mới) + mục tin (news) khi có phương pháp mới / đổi trạng thái.
Máy KHÔNG tự bật gì trong bot, không đặt lệnh – chỉ đo. Chạy: python research/lab.py   (thử ở máy không có mạng: python research/lab.py --synthetic)"""
import concurrent.futures as cf
import datetime as dt
import io
import json
import os
import sys
import warnings
import zipfile

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
os.environ.setdefault("RS_LOG", "lab.log")
import events as E  # noqa: E402

log = E.log
START = os.environ.get("LAB_START", "2023-01")
CACHE = os.environ.get("LAB_CACHE", "lab_cache")
SITE_JSON = os.path.join(HERE, "..", "site", "lab.json")
TODAY = dt.datetime.now(dt.timezone.utc).date()
SKIP = {"USDCUSDT", "FDUSDUSDT", "BUSDUSDT", "TUSDUSDT", "BTCDOMUSDT", "DEFIUSDT", "FOOTBALLUSDT", "BLUEBIRDUSDT", "BTCSTUSDT"}
EVAL_FROM = os.environ.get("LAB_EVAL", "2023-07-01")      # 6 tháng đầu để các chỉ báo có đủ dữ liệu
GATES = dict(sharpe=1.0, sharpe365=0.5, halves=3, min_days=300, fw_days=45, fw_sharpe=1.0, fw_fail_days=60)


# ---------------------------------------------------------------- dữ liệu
def month_list():
    y, m = map(int, START.split("-")); out = []
    while (y, m) <= (TODAY.year, TODAY.month):
        out.append(f"{y:04d}-{m:02d}"); m += 1
        if m > 12: y, m = y + 1, 1
    return out


def _k1h(url):
    b = E.get(url)
    if not b: return None
    try: d = E.parse(b)
    except Exception: return None  # noqa: BLE001
    return None if d is None or not len(d) else d


def _fund(sym, m):
    b = E.get(f"{E.BASE}/monthly/fundingRate/{sym}/{sym}-fundingRate-{m}.zip")
    if not b: return None
    try:
        z = zipfile.ZipFile(io.BytesIO(b)); t = z.read(z.namelist()[0]).decode().splitlines()
        rows = [ln.split(",") for ln in t if ln and ln[0].isdigit()]
        return [(int(x[0]) // 86400000, float(x[-1])) for x in rows] or None
    except Exception: return None  # noqa: BLE001


def _mat(frames, h0, nh):
    """frames: {mã: DataFrame nến 1 giờ} → ma trận (giờ × mã) O/H/L/C/Q float32"""
    syms = sorted(frames); A = {k: np.full((nh, len(syms)), np.nan, np.float32) for k in "ohlcq"}
    for j, s in enumerate(syms):
        d = frames[s]; i = (d.t.values // 60 - h0).astype(int); ok = (i >= 0) & (i < nh)
        for k, col in zip("ohlcq", ("o", "h", "l", "c", "qv")): A[k][i[ok], j] = d[col].values[ok]
    return syms, A


def load_month(m, syms, top=None):
    """1 tháng: tệp tháng của mọi mã (tháng đã đóng – lưu đệm vĩnh viễn) hoặc tệp ngày của nhóm mã lớn (tháng đang chạy / chưa có tệp tháng)."""
    y, mo = map(int, m.split("-")); d0 = dt.date(y, mo, 1); d1 = dt.date(y + (mo == 12), mo % 12 + 1, 1)
    h0 = int(dt.datetime(y, mo, 1, tzinfo=dt.timezone.utc).timestamp() // 3600); nh = (d1 - d0).days * 24
    path = os.path.join(CACHE, f"h_{m}.npz")
    if os.path.exists(path):
        z = np.load(path, allow_pickle=True); return list(z["syms"]), {k: z[k] for k in "ohlcq"}, z["fd"], h0, True
    full = d1 <= TODAY and E.get(f"{E.BASE}/monthly/klines/BTCUSDT/1h/BTCUSDT-1h-{m}.zip") is not None
    with cf.ThreadPoolExecutor(48) as ex:
        if full:
            fr = dict(zip(syms, ex.map(lambda s: _k1h(f"{E.BASE}/monthly/klines/{s}/1h/{s}-1h-{m}.zip"), syms)))
            fu = dict(zip(syms, ex.map(lambda s: _fund(s, m), syms)))
        else:
            days = [d0 + dt.timedelta(days=i) for i in range((min(d1, TODAY) - d0).days)]      # tới hết hôm qua
            use = top or syms
            def one(s):
                L = [x for x in (_k1h(f"{E.BASE}/daily/klines/{s}/1h/{s}-1h-{d}.zip") for d in days) if x is not None]
                return pd.concat(L) if L else None
            fr = dict(zip(use, ex.map(one, use))); fu = {}
    fr = {s: d for s, d in fr.items() if d is not None}
    ss, A = _mat(fr, h0, nh); nd = nh // 24; fd = np.full((nd, len(ss)), np.nan, np.float32)
    for j, s in enumerate(ss):
        if fu.get(s):
            acc = np.zeros(nd); hit = np.zeros(nd, bool)
            for day, r in fu[s]:
                i = day - h0 // 24
                if 0 <= i < nd: acc[i] += r; hit[i] = True
            # mã có tệp funding của tháng: ngày không có kỳ chốt = 0 (chỉ trong khoảng mã có giao dịch)
            fd[:, j] = np.where(hit, acc, 0.0)
    if full and len(ss) > 50:
        os.makedirs(CACHE, exist_ok=True); np.savez_compressed(path, syms=np.array(ss, dtype=object), fd=fd, **A)
    return ss, A, fd, h0, full


class Data:
    pass


def build(parts):
    """parts: [(syms, A, fd, h0, full)] theo tháng → Data: ma trận NGÀY, nến 6 GIỜ, giờ của BTC"""
    allS = sorted({s for p in parts for s in p[0]}); ix = {s: j for j, s in enumerate(allS)}
    H0 = parts[0][3]; NH = sum(p[1]["o"].shape[0] for p in parts); S = len(allS)
    A = {k: np.full((NH, S), np.nan, np.float32) for k in "ohlcq"}; F = np.full((NH // 24, S), np.nan, np.float32); fund_until = None
    for ss, a, fd, h0, full in parts:
        o = h0 - H0; jj = [ix[s] for s in ss]; n = a["o"].shape[0]
        for k in "ohlcq": A[k][o:o + n, jj] = a[k]
        F[o // 24:o // 24 + fd.shape[0], jj] = fd
        if np.isfinite(fd).any(): fund_until = o // 24 + fd.shape[0] - 1
    # cắt tới ngày cuối có dữ liệu BTC đủ 24 giờ
    b = ix["BTCUSDT"]; okd = np.isfinite(A["c"][:, b]).reshape(-1, 24).all(1); nd = int(np.max(np.nonzero(okd)[0])) + 1
    for k in "ohlcq": A[k] = A[k][:nd * 24]
    F = F[:nd]
    D = Data(); D.syms = allS; D.ix = ix; D.S = S; D.nd = nd; D.day0 = H0 // 24
    D.dates = pd.to_datetime((D.day0 + np.arange(nd)) * 86400, unit="s"); D.wd = (D.day0 + np.arange(nd) + 3) % 7      # 0 = thứ Hai
    r = lambda x, n: x.reshape(nd * 24 // n, n, S)  # noqa: E731
    def agg(n):
        o = r(A["o"], n)[:, 0]; c = r(A["c"], n)[:, -1].copy()
        for k in range(n - 2, -1, -1): c = np.where(np.isnan(c), r(A["c"], n)[:, k], c)      # mã ngừng giữa chừng: lấy giá đóng cuối còn có
        return o, np.nanmax(r(A["h"], n), 1), np.nanmin(r(A["l"], n), 1), c, np.nansum(r(A["q"], n), 1)
    D.O, D.H, D.L, D.C, D.Q = agg(24); D.O6, D.H6, D.L6, D.C6, _ = agg(6)
    D.F = F; D.fund_until = fund_until if fund_until is not None else -1
    D.btc_oh = A["o"][:, b].reshape(nd, 24).astype(np.float64)
    finish(D); return D


def finish(D):
    nd, S = D.nd, D.S
    nxt = np.vstack([D.O[1:], D.C[-1:]])      # ngày cuối: chưa có giá mở hôm sau → giá đóng
    nxt = np.where(np.isnan(nxt), D.C, nxt)      # mã ngừng giao dịch: giá đóng cuối
    D.R = np.nan_to_num(nxt / D.O - 1, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float64)      # lời từ mở cửa hôm nay tới mở cửa hôm sau
    q = pd.DataFrame(D.Q).where(np.isfinite(D.C)); v30 = q.rolling(30, min_periods=20).mean().shift(1).values      # khối lượng 30 ngày TÍNH TỚI HÔM TRƯỚC
    age = np.isfinite(D.C).cumsum(0); age = np.vstack([np.zeros((1, S)), age[:-1]])
    skip = np.array([s in SKIP for s in D.syms])
    D.elig = np.isfinite(v30) & (age >= 30) & np.isfinite(D.O) & ~skip
    D.rank = np.argsort(np.argsort(-np.where(D.elig, v30, -1), 1), 1).astype(float); D.rank[~D.elig] = np.inf
    D.cost = np.where(D.rank < 10, 0.0006, 0.0010)      # phí taker 5 bps + trượt 1 bps (10 mã lớn nhất) / 5 bps (mã khác), mỗi chiều
    D.ev0 = int(np.searchsorted(D.dates.values, np.datetime64(EVAL_FROM)))


def synthetic(nd=900, S=60, seed=3):
    rng = np.random.default_rng(seed); D = Data(); D.syms = ["BTCUSDT", "ETHUSDT"] + [f"C{i}USDT" for i in range(S - 2)]; D.ix = {s: j for j, s in enumerate(D.syms)}
    D.S, D.nd, D.day0 = S, nd, 19358; D.dates = pd.to_datetime((D.day0 + np.arange(nd)) * 86400, unit="s"); D.wd = (D.day0 + np.arange(nd) + 3) % 7
    mk = rng.normal(0, 0.005, (nd * 24, 1)); r = mk + rng.normal(0, 0.008, (nd * 24, S)) - (0.005 ** 2 + 0.008 ** 2) / 2; c = (100 * np.exp(np.cumsum(r, 0))).astype(np.float32)
    o = np.vstack([c[:1], c[:-1]]); h = np.maximum(o, c) * 1.002; l = np.minimum(o, c) * 0.998; q = (rng.lognormal(15, 1, (1, S)) * rng.lognormal(0, .3, (nd * 24, S))).astype(np.float32)
    c[: 200 * 24, 5] = np.nan; o[: 200 * 24, 5] = np.nan      # 1 mã niêm yết muộn
    rs = lambda x, n: x.reshape(nd * 24 // n, n, S)  # noqa: E731
    D.O, D.H, D.L, D.C, D.Q = rs(o, 24)[:, 0], rs(h, 24).max(1), rs(l, 24).min(1), rs(c, 24)[:, -1], np.nansum(rs(q, 24), 1)
    D.O6, D.H6, D.L6, D.C6 = rs(o, 6)[:, 0], rs(h, 6).max(1), rs(l, 6).min(1), rs(c, 6)[:, -1]
    D.F = rng.normal(0.0001, 0.0003, (nd, S)).astype(np.float32); D.fund_until = nd - 20; D.F[nd - 19:] = np.nan
    D.btc_oh = o[:, 0].reshape(nd, 24).astype(np.float64); finish(D); D.ev0 = 200; return D


# ---------------------------------------------------------------- khung chấm điểm chung
def pnl(D, W):
    """W[ngày, mã] = tỉ trọng giữ TRONG ngày đó (quyết định bằng số liệu tới hết hôm trước, vào ở giá mở cửa). → (gộp, phí, funding) theo ngày"""
    W = np.nan_to_num(W); g = (W * D.R).sum(1)
    c = (np.abs(np.diff(W, axis=0, prepend=np.zeros((1, D.S)))) * D.cost).sum(1)
    f = -(W * np.nan_to_num(D.F)).sum(1)
    return g, c, f, np.abs(W).sum(1), np.abs(np.diff(W, axis=0, prepend=np.zeros((1, D.S)))).sum(1)


def _dd(x):
    eq = np.cumprod(1 + x); pk = np.maximum.accumulate(np.maximum(eq, 1)); return float((1 - eq / pk).max()) if len(x) else 0.0


def stats(x, dates):
    x = np.asarray(x, float); n = len(x)
    if n < 5: return dict(days=n)
    m, sd = x.mean(), x.std(ddof=1) or 1e-12; s = pd.Series(x, index=dates)
    rng = np.random.default_rng(7); wk = [x[i:i + 7] for i in range(0, n, 7)]      # bootstrap theo khối 7 ngày
    bs = np.array([np.concatenate([wk[i] for i in rng.integers(0, len(wk), len(wk))]).mean() for _ in range(1000)])
    yr = {str(y): round(float((1 + v).prod() - 1) * 100, 1) for y, v in s.groupby(s.index.year)}
    hf = {f"{y}H{h}": round(float((1 + v).prod() - 1) * 100, 1) for (y, h), v in s.groupby([s.index.year, (s.index.month > 6) + 1])}
    top5 = np.sort(x)[:-5].mean() if n > 30 else m
    return dict(days=n, day=round(m * 100, 4), yr=round(m * 365 * 100, 1), vol=round(sd * np.sqrt(365) * 100, 1), sharpe=round(m / sd * np.sqrt(365), 2),
                dd=round(_dd(x) * 100, 1), win=round(float((x > 0).mean()) * 100, 1), act=round(float((x != 0).mean()) * 100, 1), worst=round(float(x.min()) * 100, 2), best=round(float(x.max()) * 100, 2),
                t=round(m / sd * np.sqrt(n), 2), p=round(float((bs > 0).mean()), 3), no5=round(top5 * 100, 4), by=yr, half=hf,
                d30=round(float((1 + x[-30:]).prod() - 1) * 100, 2), d90=round(float((1 + x[-90:]).prod() - 1) * 100, 2), d365=round(float((1 + x[-365:]).prod() - 1) * 100, 1),
                s365=round(x[-365:].mean() / (x[-365:].std(ddof=1) or 1e-12) * np.sqrt(365), 2))


def judge(st, st15):
    """Cổng kiểm lịch sử – giống nhau cho MỌI phương pháp. Trả về danh sách lý do trượt (rỗng = qua)."""
    G = GATES; why = []
    if st.get("days", 0) < G["min_days"]: return [("Chưa đủ dữ liệu", "Not enough data")]
    if st["sharpe"] < G["sharpe"]: why.append((f"Lời chưa đủ đều: Sharpe {st['sharpe']} < {G['sharpe']}", f"Sharpe {st['sharpe']} < {G['sharpe']}"))
    if st["d365"] <= 0 or st["s365"] < G["sharpe365"]: why.append((f"12 tháng gần nhất yếu: {st['d365']:+.1f}%, Sharpe {st['s365']}", f"Last 12 months weak: {st['d365']:+.1f}%, Sharpe {st['s365']}"))
    h = list(st["half"].values())[-4:]
    if sum(v > 0 for v in h) < min(G["halves"], len(h)): why.append((f"Không bền: chỉ {sum(v > 0 for v in h)}/{len(h)} nửa năm gần nhất có lời", f"Unstable: only {sum(v > 0 for v in h)}/{len(h)} recent half-years positive"))
    if st["no5"] <= 0: why.append(("Lời nhờ vài ngày may: bỏ 5 ngày tốt nhất thì lỗ", "Luck-driven: negative without the 5 best days"))
    if st15["day"] <= 0: why.append(("Mỏng: phí + trượt tăng 50% là hết lời", "Too thin: gone if costs rise 50%"))
    return why


def lev_for(x, target):
    """Muốn trung bình `target`%/ngày thì phải nhân vị thế lên bao nhiêu lần, và khi đó sụt tối đa bao nhiêu (≥ 100% = cháy tài khoản)."""
    m = x.mean() * 100
    if m <= 0: return None
    k = target / m; y = x * k
    return dict(lev=round(k, 1), dd=None if (y <= -1).any() else round(_dd(y) * 100, 1))


def evaluate(D, M, prev):
    out = M["fn"](D); g, c, f = (np.asarray(out[k], float) for k in ("g", "c", "f"))
    end = out.get("end", D.nd); sl = slice(D.ev0, end); net = (g - c + f)[sl]; dates = D.dates[sl]
    st = stats(net, dates); st15 = stats((g - 1.5 * c + f)[sl], dates); why = judge(st, st15)
    added = (prev or {}).get("added") or str(TODAY); a0 = int(np.searchsorted(dates.values, np.datetime64(added)))
    fwx = net[a0:]; fw = dict(days=len(fwx), sum=round(float((1 + fwx).prod() - 1) * 100, 2) if len(fwx) else 0.0,
                              sharpe=round(fwx.mean() / (fwx.std(ddof=1) or 1e-12) * np.sqrt(365), 2) if len(fwx) > 5 else None, dd=round(_dd(fwx) * 100, 1) if len(fwx) else 0.0)
    G = GATES; was = (prev or {}).get("status")
    if why and was not in ("watch", "pass"): status = "fail"
    elif fw["days"] >= G["fw_days"] and fw["sum"] > 0 and (fw["sharpe"] or 0) >= G["fw_sharpe"] and not why: status = "pass"
    elif fw["days"] >= 30 and (fw["dd"] > 1.5 * max(st["dd"], 3) or (fw["days"] >= G["fw_fail_days"] and fw["sum"] <= 0)): status = "drop"
    elif was == "drop": status = "drop"
    else: status = "watch"
    if status == "drop" and not why: why = [(f"Theo dõi {fw['days']} ngày: {fw['sum']:+.1f}%, sụt {fw['dd']}% – xấu hơn lịch sử", f"Forward {fw['days']} days: {fw['sum']:+.1f}%, drawdown {fw['dd']}% – worse than history")]
    eqw = np.cumprod(1 + net)[::7]; eq = [round(float(v), 4) for v in eqw[-160:]]
    info = {k: M[k] for k in ("id", "name", "name_en", "desc", "desc_en", "hold", "hold_en", "src")}
    info.update(added=added, status=status, why=[w[0] for w in why], why_en=[w[1] for w in why], bt=st, bt15=dict(day=st15["day"], sharpe=st15["sharpe"]), fw=fw, eq=eq,
                eq_from=str(dates[max(0, len(net) - 160 * 7)].date()), to=str(dates[-1].date()), expo=round(float(np.mean(out["expo"][sl])) * 100), turn=round(float(np.mean(out["turn"][sl])) * 100, 1),
                cost=round(float(c[sl].mean()) * 100, 4), fund=round(float(f[sl].mean()) * 100, 4), gross=round(float(g[sl].mean()) * 100, 4),
                lev05=lev_for(net, 0.5), note=out.get("note", ""), note_en=out.get("note_en", ""))
    return info


NEWS = {"new_watch": ("🔬 Phương pháp mới qua kiểm lịch sử: {n} – bắt đầu theo dõi trên giấy", "🔬 New method passed the history check: {n} – now paper-tracking"),
        "new_fail": ("🔬 Đã thử phương pháp mới: {n} – không đạt, loại", "🔬 Tested a new method: {n} – rejected"),
        "pass": ("✅ {n} đạt sau khi theo dõi trên giấy – chờ anh quyết định", "✅ {n} passed paper-tracking – awaiting your decision"),
        "drop": ("⚠️ {n} xấu đi khi theo dõi – đã loại", "⚠️ {n} deteriorated in tracking – dropped"),
        "watch": ("🔬 {n} quay lại diện theo dõi", "🔬 {n} is back on the watch list"), "fail": ("🔬 {n} không còn đạt kiểm lịch sử – loại", "🔬 {n} no longer passes – rejected")}


def main():
    import lab_methods as LM
    syn = "--synthetic" in sys.argv
    if syn: D = synthetic()
    else:
        syms = [s for s in E.list_symbols() if s not in SKIP]; log(f"{len(syms)} mã futures USDT · {START} → {TODAY}")
        parts, top = [], None
        for m in month_list():
            p = load_month(m, syms, top)
            if p[4]:      # tháng đầy đủ → nhóm 160 mã khối lượng lớn nhất của tháng đó dùng cho các tháng chưa có tệp tháng
                v = np.nansum(p[1]["q"], 0); top = [p[0][j] for j in np.argsort(-v)[:160]]
            log(f"  {m}: {len(p[0])} mã{'' if p[4] else ' (tệp ngày)'}"); parts.append(p)
        D = build(parts)
    log(f"dữ liệu: {D.nd} ngày × {D.S} mã · {D.dates[0].date()} → {D.dates[-1].date()} · funding tới {D.dates[max(D.fund_until, 0)].date()}")
    try: prev = json.load(open(SITE_JSON))
    except Exception: prev = {}  # noqa: BLE001
    pm = {m["id"]: m for m in prev.get("methods", [])}; news = list(prev.get("news", [])); res = []
    for M in LM.METHODS:
        try: r = evaluate(D, M, pm.get(M["id"]))
        except Exception as e:  # noqa: BLE001
            import traceback; log(f"LỖI {M['id']}: {e}\n{traceback.format_exc()}")
            if M["id"] in pm: res.append(pm[M["id"]])
            continue
        was = pm.get(M["id"], {}).get("status"); k = None
        if was is None: k = "new_watch" if r["status"] in ("watch", "pass") else "new_fail"
        elif was != r["status"]: k = r["status"]
        if k and not syn: news.append(dict(at=str(TODAY), id=M["id"], kind=k, t=NEWS[k][0].format(n=M["name"]), te=NEWS[k][1].format(n=M["name_en"])))
        b = r["bt"]; log(f"{M['id']:10s} {r['status']:6s} ngày {b.get('day')}% · năm {b.get('yr')}% · Sharpe {b.get('sharpe')} · sụt {b.get('dd')}% · 365 ngày {b.get('d365')}% · theo năm {b.get('by')} · {'; '.join(r['why'])}")
        res.append(r)
    order = {"pass": 0, "watch": 1, "drop": 2, "fail": 3}; res.sort(key=lambda r: (order.get(r["status"], 9), -(r["bt"].get("sharpe") or -9)))
    out = dict(v=1, at=dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), start=EVAL_FROM, to=str(D.dates[-1].date()), gates=GATES, methods=res, queue=LM.QUEUE, news=news[-40:])
    os.makedirs(E.OUT, exist_ok=True); json.dump(out, open(os.path.join(E.OUT, "lab.json"), "w"), ensure_ascii=False, indent=1)
    if not syn: json.dump(out, open(SITE_JSON, "w"), ensure_ascii=False, separators=(",", ":"))
    log(f"xong: {sum(r['status'] == 'watch' for r in res)} theo dõi · {sum(r['status'] == 'pass' for r in res)} đạt · {sum(r['status'] in ('fail', 'drop') for r in res)} loại")


if __name__ == "__main__":
    main()
