"""Vòng 10 – CÁC PHƯƠNG PHÁP KHÁC (ngoài Bắt râu sập) mà dân trade crypto hay dùng – kiểm chứng trên dữ liệu thật Binance USDⓈ-M futures,
nến 1 GIỜ từ 01/2022 tới tháng trước (đủ thị trường gấu 2022, đi ngang 2023, bò 2024–25, 2026), TOÀN BỘ mã (kể cả mã đã huỷ niêm yết → không thiên lệch sống sót).
Mỗi phương pháp xuất danh sách lệnh (đã có giá vào/ra, lời lỗ lớn nhất trong lúc giữ); phí & funding tính ở bước phân tích (research/r10_analyze.py).
  S1  Short coin vừa BƠM mạnh (≥ +25% trong 24 giờ, khối lượng 24h ≥ 10 triệu USD) – vào ở giá mở 00:00 UTC, giữ 1 / 3 / 7 ngày, cắt lỗ +15% / +30% / không
  S2  Short coin MỚI NIÊM YẾT futures – vào sau 1 ngày / 3 ngày, giữ 7 / 14 / 30 ngày, cắt lỗ +30% / +50% / không
  S3  Theo xu hướng (Donchian / "Turtle") trên 12 coin lớn, nến ngày – vượt đỉnh 20 ngày mua, thủng đáy 10 ngày thoát (và chiều Short), cắt lỗ 2 ATR;
      bản 55/20 ngày; bản chỉ Long khi giá trên trung bình 200 ngày
  S5  Funding CỰC ĐOAN ngược đám đông – funding ≤ −0,1%/kỳ → Long, ≥ +0,1%/kỳ → Short (và ngưỡng ±0,05 / ±0,2%), giữ 1 / 3 ngày
  S6  Ăn funding trung tính (giữ spot + short perp) – lưu chuỗi funding đã chốt để tính lợi suất theo tháng
  S7  Động lượng chéo – mỗi thứ Hai 00:00 UTC xếp hạng lợi suất 28 ngày, coin khối lượng lớn; lưu ảnh chụp tuần để mua top / bán đáy ở bước phân tích
Chạy: research.yml script=round10.py nsym=1200"""
import concurrent.futures as cf
import datetime as dt
import gzip
import io
import json
import os
import sys
import time
import zipfile

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("RS_LOG", "round10.log")
import events as E  # noqa: E402

log = E.log
START = os.environ.get("RS_START", "2022-01")
MAJ = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "LTCUSDT", "TRXUSDT", "DOTUSDT"]
LIST_FROM = None   # giờ đầu tiên có dữ liệu chung (mã có nến đầu tiên sau mốc này + 30 ngày = mã mới niêm yết)


def months():
    y, m = map(int, START.split("-")); out = []
    last = dt.date(E.TODAY.year, E.TODAY.month, 1) - dt.timedelta(days=1)
    while (y, m) <= (last.year, last.month):
        out.append(f"{y:04d}-{m:02d}"); m += 1
        if m > 12:
            y, m = y + 1, 1
    return out


MONTHS = months()


def fetch1h(s, m):
    path = os.path.join(E.CACHE, f"{s}_1h_{m}.pkl")
    if os.path.exists(path):
        return pd.read_pickle(path)
    b = E.get(f"{E.BASE}/monthly/klines/{s}/1h/{s}-1h-{m}.zip")
    df = E.parse(b) if b else None
    if df is not None:
        os.makedirs(E.CACHE, exist_ok=True); df.to_pickle(path)
    return df


def load1h(s):
    L = [fetch1h(s, m) for m in MONTHS]
    L = [d for d in L if d is not None and len(d)]
    if not L:
        return None
    d = pd.concat(L).drop_duplicates("t").sort_values("t")
    d["H"] = d.t // 60
    d = d.set_index("H")
    return d.reindex(np.arange(int(d.index.min()), int(d.index.max()) + 1))


def fund_month(sym, m):
    b = E.get(f"{E.BASE}/monthly/fundingRate/{sym}/{sym}-fundingRate-{m}.zip")
    if not b:
        return None
    z = zipfile.ZipFile(io.BytesIO(b)); t = z.read(z.namelist()[0]).decode().splitlines()
    rows = [ln.split(",") for ln in t if ln and ln[0].isdigit()]
    return [(int(x[0]) // 3600000, round(float(x[-1]) * 1e6)) for x in rows] if rows else None


def path_exit(o, h, l, c, i, side, hold, sl, entry):
    """vào ở entry (giá mở nến i), giữ tối đa hold nến; cắt lỗ sl (tỉ lệ, None = không). Trả (lời %, lý do, nến thoát, lời tốt nhất %, lỗ xấu nhất %)"""
    n = len(c); j1 = min(n - 1, i + hold - 1); best = worst = 0.0
    for j in range(i, j1 + 1):
        hi, lo = h[j], l[j]
        if not (hi > 0 and lo > 0):
            continue
        fav = (hi / entry - 1) if side > 0 else (1 - lo / entry)
        adv = (lo / entry - 1) if side > 0 else (1 - hi / entry)
        if sl is not None and adv <= -sl:
            px = entry * (1 - sl) if side > 0 else entry * (1 + sl)
            if j > i:
                op = o[j]
                if side > 0 and op < px:
                    px = op
                if side < 0 and op > px:
                    px = op
            r = side * (px / entry - 1)
            return round(r * 100, 3), "SL", j, round(max(best, fav) * 100, 2), round(min(worst, adv) * 100, 2)
        best = max(best, fav); worst = min(worst, adv)
    px = c[j1] if c[j1] > 0 else entry
    return round(side * (px / entry - 1) * 100, 3), "T", j1, round(best * 100, 2), round(worst * 100, 2)


def process(s):
    try:
        d = load1h(s)
    except Exception as e:  # noqa: BLE001
        log("lỗi", s, e); return None
    if d is None or len(d) < 24 * 20:
        return None
    ok = d.c.notna().values
    c = d.c.ffill().values; o = d.o.fillna(d.c.ffill()).values; h = d.h.fillna(d.c.ffill()).values; l = d.l.fillna(d.c.ffill()).values
    qv = d.qv.fillna(0).values; H0 = int(d.index[0]); n = len(d)
    hour = (np.arange(n) + H0) % 24
    q24 = pd.Series(qv).rolling(24, min_periods=20).sum().values
    out = dict(s=s, H0=H0, n=n, s1=[], s2=[], s3=[], wk=[], vol=float(np.nanmedian(pd.Series(qv).rolling(24).sum().values[-24 * 60:])) if n > 24 * 70 else 0.0)
    # ---- S1: short coin vừa bơm ≥ 25% / 24h (đánh giá lúc 00:00 UTC), nghỉ 3 ngày sau mỗi tín hiệu
    last = -10**9
    for i in np.flatnonzero(hour == 0):
        if i < 25 or i - last < 72 or not ok[i - 1] or not ok[i - 25]:
            continue
        r24 = c[i - 1] / c[i - 25] - 1
        if r24 < 0.25 or q24[i - 1] < 10e6:
            continue
        last = i; e = o[i]; rec = dict(t=int(H0 + i), r24=round(r24 * 100, 1), q24=round(q24[i - 1] / 1e6, 1), r7=round((c[i - 1] / c[max(0, i - 169)] - 1) * 100, 1), res={})
        for hold in (24, 72, 168):
            for sl in (0.15, 0.30, None):
                if i + hold < n:
                    r = path_exit(o, h, l, c, i, -1, hold, sl, e); rec["res"][f"{hold}|{sl}"] = (r[0], r[1], int(H0 + r[2]), r[3], r[4])
        out["s1"].append(rec)
    # ---- S2: short coin mới niêm yết futures (nến đầu tiên sau mốc chung + 30 ngày)
    first = int(np.flatnonzero(ok)[0]) if ok.any() else None
    if first is not None and LIST_FROM is not None and H0 + first >= LIST_FROM + 24 * 30:
        for dly in (24, 72):
            i = first + dly
            if i + 24 * 30 >= n:
                continue
            e = o[i]; rec = dict(t=int(H0 + i), dly=dly, run=round((c[i - 1] / o[first] - 1) * 100, 1), res={})
            for hold in (24 * 7, 24 * 14, 24 * 30):
                for sl in (0.3, 0.5, None):
                    r = path_exit(o, h, l, c, i, -1, hold, sl, e); rec["res"][f"{hold}|{sl}"] = (r[0], r[1], int(H0 + r[2]), r[3], r[4])
            out["s2"].append(rec)
    # ---- S3: Donchian nến ngày trên 12 coin lớn
    if s in MAJ:
        di = np.flatnonzero(hour == 23)            # nến ngày = đóng cửa lúc 23:00–24:00 UTC
        D = pd.DataFrame({"i": di, "o": [o[max(0, k - 23)] for k in di], "h": [h[max(0, k - 23):k + 1].max() for k in di], "l": [l[max(0, k - 23):k + 1].min() for k in di], "c": c[di]})
        tr = np.maximum(D.h - D.l, np.maximum(abs(D.h - D.c.shift()), abs(D.l - D.c.shift())))
        D["atr"] = tr.rolling(20).mean(); D["sma200"] = D.c.rolling(200).mean()
        for N, X in ((20, 10), (55, 20)):
            hiN = D.h.rolling(N).max().shift(); loN = D.l.rolling(N).min().shift(); hiX = D.h.rolling(X).max().shift(); loX = D.l.rolling(X).min().shift()
            pos = 0; ent = None
            for k in range(N + 1, len(D) - 1):
                if pos == 0:
                    sd = 1 if D.c[k] > hiN[k] else -1 if D.c[k] < loN[k] else 0
                    if sd and D.atr[k] > 0:
                        ent = dict(sys=f"{N}/{X}", side=sd, k=k, e=D.o[k + 1], st=D.o[k + 1] - sd * 2 * D.atr[k], trend=int(D.c[k] > D.sma200[k]) if D.sma200[k] > 0 else None, best=0.0, worst=0.0); pos = sd
                    continue
                # đang giữ: cắt lỗ 2 ATR (trong ngày) hoặc đóng cửa thủng kênh X ngày → thoát giá mở hôm sau
                e0 = ent["e"]; ent["best"] = max(ent["best"], pos * ((D.h[k] if pos > 0 else D.l[k]) / e0 - 1)); ent["worst"] = min(ent["worst"], pos * ((D.l[k] if pos > 0 else D.h[k]) / e0 - 1))
                hit = (pos > 0 and D.l[k] <= ent["st"]) or (pos < 0 and D.h[k] >= ent["st"])
                brk = (pos > 0 and D.c[k] < loX[k]) or (pos < 0 and D.c[k] > hiX[k])
                if hit or brk:
                    px = (min(ent["st"], D.o[k]) if pos > 0 else max(ent["st"], D.o[k])) if hit else D.o[k + 1]
                    out["s3"].append(dict(sys=ent["sys"], side=pos, t=int(H0 + D.i[ent["k"]] + 1), t2=int(H0 + D.i[k] + 1), r=round(pos * (px / e0 - 1) * 100, 3), why="SL" if hit else "X",
                                          best=round(ent["best"] * 100, 2), worst=round(ent["worst"] * 100, 2), trend=ent["trend"]))
                    pos = 0
    # ---- S7: ảnh chụp mỗi thứ Hai 00:00 UTC (ngày 1/1/1970 là thứ Năm → thứ Hai = (giờ/24 + 3) % 7 == 0)
    dow = ((np.arange(n) + H0) // 24 + 3) % 7
    for i in np.flatnonzero((hour == 0) & (dow == 0)):
        if i < 24 * 28 or i + 168 >= n or not ok[i - 1]:
            continue
        seg_h, seg_l = h[i:i + 168], l[i:i + 168]
        out["wk"].append([int(H0 + i), round((c[i - 1] / c[i - 1 - 24 * 28] - 1) * 100, 2), round((c[i - 1] / c[i - 1 - 24 * 7] - 1) * 100, 2), round(float(qv[i - 168:i].sum()) / 1e6, 1),
                          round((o[i + 168] / o[i] - 1) * 100, 3), round((seg_h.max() / o[i] - 1) * 100, 2), round((seg_l.min() / o[i] - 1) * 100, 2), int((first or 0) + H0)])
    return out


def s5_for(s, F, d):
    """S5: funding cực đoan. F: [(giờ, f×1e6)], d: dữ liệu 1 giờ. Ghi mọi kỳ |f| ≥ 0,05%, nghỉ 24h mỗi chiều."""
    if d is None or not F:
        return []
    c = d.c.ffill().values; o = d.o.fillna(d.c.ffill()).values; h = d.h.fillna(d.c.ffill()).values; l = d.l.fillna(d.c.ffill()).values
    H0, n = int(d.index[0]), len(d); out = []; last = {1: -10**9, -1: -10**9}
    q24 = pd.Series(d.qv.fillna(0).values).rolling(24, min_periods=20).sum().values
    for T, f in F:
        if abs(f) < 500:
            continue
        side = 1 if f < 0 else -1; i = T - H0 + 1          # vào ở giá mở giờ kế tiếp sau kỳ chốt
        if i < 25 or i + 72 >= n or T - last[side] < 24 or not (c[i - 1] > 0) or q24[i - 1] < 5e6:
            continue
        last[side] = T; e = o[i]; rec = dict(t=int(H0 + i), f=f, q24=round(q24[i - 1] / 1e6, 1), r24=round((c[i - 1] / c[i - 25] - 1) * 100, 1), res={})
        for hold in (24, 72):
            for sl in (0.2, None):
                r = path_exit(o, h, l, c, i, side, hold, sl, e); rec["res"][f"{hold}|{sl}"] = (r[0], r[1], int(H0 + r[2]), r[3], r[4])
        out.append(dict(s=s, side=side, **rec))
    return out


if __name__ == "__main__":
    t00 = time.time()
    syms = E.list_symbols()
    log(f"{len(syms)} mã · {MONTHS[0]} → {MONTHS[-1]} · nến 1 giờ")
    # mốc niêm yết: nến đầu tiên của BTC
    b0 = load1h("BTCUSDT"); LIST_FROM = int(b0.index[0]) if b0 is not None else None
    R = []
    with cf.ThreadPoolExecutor(32) as ex:
        for k, r in enumerate(ex.map(process, syms)):
            if r:
                R.append(r)
            if k % 100 == 0:
                log(f"  … {k}/{len(syms)} mã, {sum(len(x['s1']) for x in R)} S1 · {sum(len(x['s2']) for x in R)} S2 · {sum(len(x['s3']) for x in R)} S3 · {time.time() - t00:.0f}s")
    # funding: mọi mã có S1/S2 (để trừ phí giữ lệnh) + 300 mã khối lượng lớn nhất (S5, S6)
    top = [x["s"] for x in sorted(R, key=lambda x: -x["vol"])[:300]]
    need = sorted(set(top) | {x["s"] for x in R if x["s1"] or x["s2"]} | set(MAJ))
    jobs = [(s, m) for s in need for m in MONTHS]
    log(f"tải funding {len(need)} mã × {len(MONTHS)} tháng = {len(jobs)} tệp")
    FR = {}
    with cf.ThreadPoolExecutor(64) as ex:
        for (s, m), v in zip(jobs, ex.map(lambda j: fund_month(*j), jobs)):
            if v:
                FR.setdefault(s, []).extend(v)
    FR = {s: sorted(set(v)) for s, v in FR.items()}
    log(f"funding xong {len(FR)} mã · {time.time() - t00:.0f}s")
    S5 = []
    with cf.ThreadPoolExecutor(32) as ex:
        for v in ex.map(lambda s: s5_for(s, FR.get(s), load1h(s)), top):
            S5 += v
    out = dict(months=MONTHS, list_from=LIST_FROM, maj=MAJ, top=top,
               s1=[dict(s=x["s"], **r) for x in R for r in x["s1"]], s2=[dict(s=x["s"], **r) for x in R for r in x["s2"]], s3=[dict(s=x["s"], **r) for x in R for r in x["s3"]],
               wk={x["s"]: x["wk"] for x in R if x["wk"]}, s5=S5, fr=FR)
    os.makedirs(E.OUT, exist_ok=True)
    with gzip.open(os.path.join(E.OUT, "round10.json.gz"), "wt") as f:
        json.dump(out, f, separators=(",", ":"))
    log(f"xong · S1 {len(out['s1'])} · S2 {len(out['s2'])} · S3 {len(out['s3'])} · S5 {len(S5)} · tuần {sum(len(v) for v in out['wk'].values())} · funding {len(FR)} mã · {time.time() - t00:.0f}s")
