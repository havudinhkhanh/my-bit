"""Vòng 4 – vì sao Bắt râu sập thua ngày 27/10 (Q, BULLA bắt 2–3 lần trong vài giờ, coin rơi tiếp −20…−30%)?
Kiểm tra trên TOÀN BỘ mã futures USDT của Binance từ 01/2025 tới nay (khối lượng đúng thời điểm) các bộ lọc:
  - coin vừa có cú sốc khác trong 6 / 24 giờ (đang "vỡ" – bán tháo / bơm xả nối tiếp)
  - xu hướng 4 giờ / 24 giờ cùng chiều cú sốc (bắt dao rơi trong xu hướng giảm)
  - coin đã giảm xa đỉnh 24 giờ / tăng xa đáy 24 giờ
  - lần bắt trước trên cùng coin vừa thua
  - coin mới niêm yết (< 30 ngày)
Cấu hình như bot: sốc ≥ 300 bps & z ≥ 4 & khối lượng ≥ 3×, 2 lệnh chờ sâu thêm 1,5× và 2× cú sốc, chờ 15 phút, giữ 60 phút.
Chạy: python research/round4.py"""
import concurrent.futures as cf
import datetime as dt
import json
import math
import os
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("RS_LOG", "round4.log")
os.environ.setdefault("RS_NOCACHE", "1")
import events as E  # noqa: E402

log = E.log
START = os.environ.get("RS_START", "2025-01")
MAKER, FEE, EXIT_SLIP, THROUGH, STOP_SLIP = 2.0, 5.0, 10.0, 5.0, 20.0
DS, W, H, STOPS = (1.5, 2.0), 15, 60, (0, 35)


def months_from(start):
    y, m = map(int, start.split("-")); out = []
    while (y, m) < (E.TODAY.year, E.TODAY.month):
        out.append(f"{y:04d}-{m:02d}"); m += 1
        if m > 12:
            y += 1; m = 1
    return out


MONTHS = months_from(START)
DAYS = [(dt.date(E.TODAY.year, E.TODAY.month, 1) + dt.timedelta(days=k)).isoformat() for k in range((E.TODAY - dt.date(E.TODAY.year, E.TODAY.month, 1)).days)]


def load(s):
    L = [E.fetch(s, "monthly", m) for m in MONTHS] + [E.fetch(s, "daily", d) for d in DAYS]
    L = [d for d in L if d is not None and len(d)]
    if not L:
        return None
    d = pd.concat(L).drop_duplicates("t").sort_values("t").set_index("t")
    return d.reindex(np.arange(int(d.index.min()), int(d.index.max()) + 1))


def process(s):
    try:
        d = load(s)
    except Exception as e:  # noqa: BLE001
        return []
    if d is None or len(d) < 3000:
        return []
    c = d.c.ffill().values; o = d.o.fillna(d.c.ffill()).values; h = d.h.fillna(d.c.ffill()).values; l = d.l.fillna(d.c.ffill()).values
    qv = d.qv.fillna(0).values; ok = d.c.notna().values; t0 = int(d.index[0]); n = len(d)
    r = np.diff(np.log(c), prepend=np.log(c[0]))
    sd = pd.Series(r).rolling(60, min_periods=40).std().shift(1).values
    mq = pd.Series(qv).rolling(60, min_periods=40).median().shift(1).values
    q24 = pd.Series(qv).rolling(1440, min_periods=600).sum().shift(1).values
    hi24 = pd.Series(h).rolling(1440, min_periods=600).max().shift(1).values
    lo24 = pd.Series(l).rolling(1440, min_periods=600).min().shift(1).values
    z = np.abs(r) / sd
    m = (z >= 4) & (np.abs(r) * 1e4 >= 300) & (qv >= 3 * mq) & ok & (q24 >= 2e6)
    raw = np.flatnonzero(m)
    shocks = raw.copy()            # mọi cú sốc (để đếm cú sốc trước đó)
    out, last_res = [], []         # last_res: (thời điểm biết kết quả, lãi/lỗ) của lần bắt trước trên coin này
    for i in E.dedupe(raw, 30):
        if i < 1440 or i + 2 + W + H >= n:
            continue
        side = -1 if r[i] > 0 else 1; c0 = c[i]; mv = abs(math.expm1(r[i]))
        prior6 = int(((shocks < i) & (shocks >= i - 360)).sum()); prior24 = int(((shocks < i) & (shocks >= i - 1440)).sum())
        r4h = side * (c[i] / c[i - 240] - 1) * 1e4; r24 = side * (c[i] / c[i - 1440] - 1) * 1e4      # < 0: đang đi ngược hướng lệnh (dao rơi)
        ext = (c[i] / hi24[i] - 1) * 1e4 if side > 0 else (c[i] / lo24[i] - 1) * 1e4               # long: đã giảm bao xa từ đỉnh 24h (âm); short: tăng bao xa từ đáy (dương)
        prev = [pr for (tk, pr) in last_res if tk <= i and tk >= i - 1440]
        rec = dict(s=s, T=t0 + i, side=side, R=round(float(abs(r[i]) * 1e4), 0), z=round(float(z[i]), 1), prior6=prior6, prior24=prior24, r4h=round(float(r4h), 0), r24=round(float(r24), 0),
                   ext=round(float(ext), 0), age=round((i) / 1440, 1), prev_n=len(prev), prev_loss=int(bool(prev) and prev[-1] < 0), res={})
        evnet = 0.0; filled_any = False
        for D in DS:
            L = c0 * (1 - side * D * mv); Lt = L * (1 - side * THROUGH / 1e4); fill = None
            for j in range(i + 1, i + 1 + W):
                if (side > 0 and l[j] < Lt) or (side < 0 and h[j] > Lt):
                    fill = j; break
            if fill is None:
                continue
            for ST in STOPS:
                end = fill + 1 + H; x = o[end]; why = "T"
                if ST:
                    stop = L * (1 - side * ST / 100)
                    seg = l[fill:end] if side > 0 else h[fill:end]
                    hit = np.flatnonzero(seg <= stop) if side > 0 else np.flatnonzero(seg >= stop)
                    if hit.size:
                        x = stop * (1 - side * STOP_SLIP / 1e4); why = "S"
                net = side * (x / L - 1) * 1e4 - (MAKER + FEE + 3 + (0 if why == "S" else EXIT_SLIP))
                rec["res"][f"{D}|{ST}"] = round(float(net), 1)
                if ST == 0:
                    evnet += net / len(DS); filled_any = True
        if filled_any:
            last_res.append((i + W + H, evnet))
        out.append(rec)
    return out


def stat(xs, key):
    v = np.array([e["res"][key] for e in xs if key in e["res"]])
    if len(v) < 10:
        return None
    return dict(n=int(len(v)), mean=round(float(v.mean()), 1), med=round(float(np.median(v)), 1), win=round(float((v > 0).mean() * 100), 1), worst=round(float(v.min()), 0), p5=round(float(np.percentile(v, 5)), 0), sum=round(float(v.sum()), 0))


if __name__ == "__main__":
    t00 = time.time()
    syms = E.list_symbols()
    log(f"{len(syms)} mã · {MONTHS[0]} → {MONTHS[-1]} + {len(DAYS)} ngày tháng này")
    evs = []
    with cf.ThreadPoolExecutor(32) as ex:
        for k, out in enumerate(ex.map(process, syms)):
            evs += out
            if k % 100 == 0:
                log(f"  … {k}/{len(syms)} mã, {len(evs)} sự kiện, {time.time() - t00:.0f}s")
    log(f"{len(evs)} cú sốc đủ chuẩn · {time.time() - t00:.0f}s")
    per = lambda e: dt.datetime.fromtimestamp(e["T"] * 60, dt.timezone.utc).strftime("%Y") + ("H1" if dt.datetime.fromtimestamp(e["T"] * 60, dt.timezone.utc).month <= 6 else "H2")
    FILT = [
        ("Tất cả (bot hiện tại)", lambda e: True),
        ("Bỏ coin đã có cú sốc khác trong 6 giờ", lambda e: e["prior6"] == 0),
        ("Bỏ coin đã có ≥ 2 cú sốc trong 24 giờ", lambda e: e["prior24"] < 2),
        ("Bỏ coin đã có cú sốc trong 24 giờ", lambda e: e["prior24"] == 0),
        ("Bỏ khi lần bắt trước (24h) trên coin này thua", lambda e: not e["prev_loss"]),
        ("Bỏ dao rơi: 4 giờ qua đã đi ngược lệnh > 10%", lambda e: e["r4h"] > -1000),
        ("Bỏ dao rơi: 24 giờ qua đi ngược lệnh > 20%", lambda e: e["r24"] > -2000),
        ("Bỏ khi đã cách đỉnh/đáy 24h > 25%", lambda e: abs(e["ext"]) < 2500),
        ("Bỏ coin niêm yết < 30 ngày", lambda e: e["age"] >= 30),
        ("Kết hợp: không sốc khác 6h + không dao rơi 4h > 10%", lambda e: e["prior6"] == 0 and e["r4h"] > -1000),
        ("Kết hợp: < 2 sốc/24h + lần trước không thua + 24h ngược < 20%", lambda e: e["prior24"] < 2 and not e["prev_loss"] and e["r24"] > -2000),
    ]
    rep = {"n": len(evs), "filters": []}
    for name, f in FILT:
        xs = [e for e in evs if f(e)]
        row = {"name": name, "kept": len(xs)}
        for key in ("1.5|0", "2.0|0", "1.5|35", "2.0|35"):
            row[key] = stat(xs, key)
        row["by"] = {p: stat([e for e in xs if per(e) == p], "1.5|0") for p in sorted({per(e) for e in evs})}
        rep["filters"].append(row)
        a, b = row["1.5|0"], row["2.0|0"]
        log(f"\n• {name}: giữ {len(xs)}/{len(evs)} cú sốc")
        if a: log(f"    mức 1,5×: n={a['n']} TB {a['mean']:+} bps · trung vị {a['med']:+} · thắng {a['win']}% · tệ nhất {a['worst']} · 5% tệ {a['p5']} · tổng {a['sum']:+}")
        if b: log(f"    mức 2×  : n={b['n']} TB {b['mean']:+} bps · trung vị {b['med']:+} · thắng {b['win']}% · tệ nhất {b['worst']} · tổng {b['sum']:+}")
        log("    theo nửa năm (mức 1,5×): " + " | ".join(f"{p}: {v['mean']:+} ({v['n']})" if v else f"{p}: —" for p, v in row["by"].items()))
    # các lệnh ngày 27/10 – bộ lọc nào chặn được?
    T27 = [e for e in evs if dt.datetime.fromtimestamp(e["T"] * 60, dt.timezone.utc).strftime("%Y-%m-%d") in ("2026-10-26", "2026-10-27")]
    log(f"\nCú sốc 26–27/10 trong dữ liệu: {len(T27)}")
    for e in T27[-40:]:
        log(f"  {dt.datetime.fromtimestamp(e['T'] * 60, dt.timezone.utc).strftime('%m-%d %H:%M')} {e['s']} {'L' if e['side'] > 0 else 'S'} sốc {e['R']} · sốc khác 6h/24h {e['prior6']}/{e['prior24']} · 4h {e['r4h']:+} · 24h {e['r24']:+} · cách đỉnh/đáy {e['ext']:+} · lần trước thua {e['prev_loss']} · kết quả 1,5× {e['res'].get('1.5|0')}")
    json.dump(rep, open(os.path.join(E.OUT, "round4.json"), "w"), ensure_ascii=False, default=float)
    log(f"xong {time.time() - t00:.0f}s")
