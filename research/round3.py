"""Vòng 3: kiểm tra kỹ phương pháp duy nhất có dấu hiệu sống sót ở vòng 2 – "đặt lệnh chờ sâu bắt râu nến sập".

Sửa các thiên lệch của vòng 2:
- Thiên lệch sống sót: vòng 2 chọn 220 mã theo khối lượng HÔM NAY (mã sập rồi chết bị loại → kết quả đẹp hơn thật).
  Vòng 3 quét TOÀN BỘ ~900 mã futures USDT, mỗi sự kiện chỉ được tính nếu khối lượng 24 giờ TRƯỚC ĐÓ đủ lớn (đúng thời điểm).
- Khớp lệnh thận trọng hơn: giá phải xuyên qua giá chờ thêm 5 bps mới tính là khớp.
- Thoát lệnh: taker + trượt giá thêm 10 bps (lúc biến động mạnh chênh lệch giãn rộng). Cắt lỗ: trượt thêm 20 bps; nếu nến khớp đã chạm mức cắt lỗ → coi như bị cắt (kịch bản xấu nhất).
- Đuôi rủi ro: báo cáo phân vị 5%, lệnh tệ nhất, ngày tệ nhất, sụt giảm tối đa khi mỗi lệnh dùng 10% vốn.
Chạy: python research/round3.py
"""
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
os.environ.setdefault("RS_LOG", "round3.log")
os.environ.setdefault("RS_CACHE", "rs_cache3")
os.environ.setdefault("RS_NOCACHE", "1")
import events as E  # noqa: E402

log = E.log
MAKER, FEE = 2.0, 5.0
SIZE = float(os.environ.get("RS_SIZE", "0.1"))     # phần vốn mỗi lệnh
EXIT_SLIP, STOP_SLIP, THROUGH = 10.0, 20.0, 5.0
DS = tuple(float(x) for x in os.environ.get("RS_DS", "0.5,0.75,1.0,1.5").split(","))
WS = tuple(int(x) for x in tuple(float(x) for x in os.environ.get("RS_WS", "5,15").split(",")))
HS = tuple(int(x) for x in tuple(float(x) for x in os.environ.get("RS_HS", "15,30,60,120,240").split(",")))
SLS = tuple(float(x) for x in os.environ.get("RS_SLS", "0,1.0,2.0").split(","))
RS_ = tuple(float(x) for x in os.environ.get("RS_RS", "150,200,300,500").split(","))
ZS_ = tuple(float(x) for x in os.environ.get("RS_ZS", "4,6,8").split(","))          # 0 = không cắt lỗ; k = cắt lỗ khi giá đi tiếp k × độ lớn cú sốc sau giá khớp
OOS0 = int(dt.datetime.fromisoformat(E.OOS_FROM).replace(tzinfo=dt.timezone.utc).timestamp() // 60)
BTC = {}


def load_sym(s):
    keys = [("monthly", m) for m in E.MONTHS] + [("daily", d) for d in E.days_oos()]
    L = [E.fetch(s, k, v) for k, v in keys]
    L = [d for d in L if d is not None and len(d)]
    if not L:
        return None
    d = pd.concat(L).drop_duplicates("t").sort_values("t").set_index("t")
    d = d.reindex(np.arange(int(d.index.min()), int(d.index.max()) + 1))
    return d


def process(s):
    try:
        d = load_sym(s)
    except Exception as e:  # noqa: BLE001
        return s, [], str(e)
    if d is None or len(d) < 3000:
        return s, [], None
    c = d.c.ffill(); o = d.o.fillna(c).values; h = d.h.fillna(c).values; l = d.l.fillna(c).values
    r = np.log(c).diff().values
    sd = pd.Series(r).rolling(60, min_periods=40).std().shift(1).values
    qv = d.qv.fillna(0)
    mq = qv.rolling(60, min_periods=40).median().shift(1).values
    q24 = qv.rolling(1440, min_periods=600).sum().shift(1).values
    ok = d.c.notna().values; t0 = int(d.index[0]); n = len(d)
    z = r / sd
    m = (np.abs(z) >= min(ZS_)) & (np.abs(r) * 1e4 >= min(RS_)) & (qv.values >= 3 * mq) & ok
    out = []
    half = 3.0
    for i in E.dedupe(np.flatnonzero(m), 30):
        if i + 2 + max(WS) + max(HS) >= n:
            continue
        side = -np.sign(r[i]); c0 = c.values[i]; mv = abs(math.expm1(r[i])); T = t0 + i
        bt = BTC.get("c"); b15 = None
        if bt is not None:
            k = T - BTC["t0"]
            if 15 <= k < len(bt):
                b15 = round(float((bt[k] / bt[k - 15] - 1) * 1e4), 1)
        rec = dict(s=s, T=T, z=round(float(abs(z[i])), 2), R=round(float(abs(r[i]) * 1e4), 1), q24=float(q24[i]) if np.isfinite(q24[i]) else 0.0, b15=b15, side=int(side), res={})
        for D in DS:
            L = c0 * (1 - side * D * mv); Lt = L * (1 - side * THROUGH / 1e4)
            for W in WS:
                fill = None
                for j in range(i + 1, i + 1 + W):
                    if (side > 0 and l[j] < Lt) or (side < 0 and h[j] > Lt):
                        fill = j; break
                if fill is None:
                    continue
                for SL in SLS:
                    stop = L * (1 - side * SL * mv) if SL else None
                    for H in HS:
                        end = fill + 1 + H; x = o[end]; why = "T"
                        if stop is not None:
                            seg_l, seg_h = l[fill:end], h[fill:end]
                            hit = np.flatnonzero(seg_l <= stop) if side > 0 else np.flatnonzero(seg_h >= stop)
                            if hit.size:
                                x = stop * (1 - side * STOP_SLIP / 1e4); why = "S"
                        net = side * (x / L - 1) * 1e4 - (MAKER + FEE + half + (0 if why == "S" else EXIT_SLIP))
                        rec["res"][f"{D}|{W}|{SL:g}|{H}"] = round(float(net), 1)
        out.append(rec)
    return s, out, None


def agg(evs, key, oos):
    v = [(e["T"], e["res"][key]) for e in evs if key in e["res"] and ((e["T"] >= OOS0) == oos)]
    if len(v) < 5:
        return dict(n=len(v))
    a = np.array([x[1] for x in v]); days = pd.Series(a, index=[x[0] // 1440 for x in v]).groupby(level=0).sum()
    ndays = (max(x[0] for x in v) - min(x[0] for x in v)) / 1440 + 1
    # mỗi lệnh dùng 10% vốn → lãi/lỗ ngày (%) = tổng bps × 10% / 100
    dret = days * SIZE / 100
    eq = np.cumprod(1 + dret.values / 100); dd = float((1 - eq / np.maximum.accumulate(eq)).max() * 100)
    return dict(n=len(a), per_day=round(len(a) / ndays, 2), mean=round(float(a.mean()), 1), med=round(float(np.median(a)), 1), win=round(float((a > 0).mean() * 100), 1),
                p5=round(float(np.percentile(a, 5)), 1), worst=round(float(a.min()), 1), day_pct=round(float(dret.sum() / ndays), 3), worst_day_pct=round(float(dret.min()), 2), maxdd_pct=round(dd, 2))


if __name__ == "__main__":
    syms = E.list_symbols()
    log("Toàn bộ mã futures USDT:", len(syms))
    b = load_sym("BTCUSDT"); BTC.update(c=b.c.ffill().values, t0=int(b.index[0]))
    t0 = time.time(); evs = []; errs = 0
    with cf.ThreadPoolExecutor(32) as ex:
        for k, (s, out, err) in enumerate(ex.map(process, syms)):
            evs += out; errs += bool(err)
            if k % 100 == 0:
                log(f"  … {k}/{len(syms)} mã, {len(evs)} sự kiện, {time.time() - t0:.0f}s")
    log(f"Xong {len(syms)} mã trong {time.time() - t0:.0f}s · {len(evs)} cú sốc ≥ 150 bps/1 phút (z ≥ 4, khối lượng ≥ 3×) · lỗi {errs}")
    rep = {"n_events": len(evs), "grid": []}
    for VOL in (2e6, 10e6, 50e6):
        for Z in ZS_:
            for R in RS_:
                E_ = [e for e in evs if e["q24"] >= VOL and e["z"] >= Z and e["R"] >= R]
                if len(E_) < 30:
                    continue
                for D in DS:
                    for W in WS:
                        for SL in SLS:
                            for H in HS:
                                key = f"{D}|{W}|{SL:g}|{H}"
                                IS = agg(E_, key, False)
                                if IS.get("n", 0) < 60:
                                    continue
                                rep["grid"].append(dict(VOL=VOL, Z=Z, R=R, D=D, W=W, SL=SL, H=H, IS=IS, OOS=agg(E_, key, True)))
    G = rep["grid"]
    log(f"\nĐã thử {len(G)} tổ hợp. 15 tổ hợp tốt nhất theo lãi ròng TB trong mẫu (IS: tháng 7–9), kèm kết quả ngoài mẫu (OOS: tháng 10):")
    G.sort(key=lambda x: -x["IS"]["mean"])
    for x in G[:15]:
        log(f"  vol≥{x['VOL'] / 1e6:.0f}tr z≥{x['Z']} sốc≥{x['R']} sâu {x['D']}× chờ {x['W']}p cắt lỗ {x['SL'] or 'không'} giữ {x['H']}p\n     IS  {x['IS']}\n     OOS {x['OOS']}")
    log("\nTừng tháng (5 tổ hợp đầu) – lãi ròng TB bps / số lệnh:")
    for x in G[:5]:
        key = f"{x['D']}|{x['W']}|{x['SL']:g}|{x['H']}"
        xs = [e for e in evs if e["q24"] >= x["VOL"] and e["z"] >= x["Z"] and e["R"] >= x["R"] and key in e["res"]]
        mo = {}
        for e in xs:
            mo.setdefault(dt.datetime.fromtimestamp(e["T"] * 60, dt.timezone.utc).strftime("%Y-%m"), []).append(e["res"][key])
        log(f"  z≥{x['Z']} sốc≥{x['R']} sâu {x['D']}× chờ {x['W']}p cắt lỗ {x['SL'] or 'không'} giữ {x['H']}p: " + " | ".join(f"{k}: {np.mean(v):.0f} ({len(v)})" for k, v in sorted(mo.items())))
    log("\nĐộ bền: tỉ lệ tổ hợp (đủ ≥ 30 lệnh OOS) có lãi ròng TB OOS > 0, theo từng tham số:")
    okG = [x for x in G if x["OOS"].get("n", 0) >= 30]
    for p, vals in (("D", DS), ("SL", SLS), ("H", HS), ("R", RS_), ("Z", ZS_), ("VOL", (2e6, 10e6, 50e6))):
        row = []
        for v in vals:
            xs = [x for x in okG if x[p] == v]
            if xs:
                row.append(f"{v}: {sum(x['OOS']['mean'] > 0 for x in xs)}/{len(xs)} · TB {np.mean([x['OOS']['mean'] for x in xs]):.0f} bps")
        log(f"  {p}: " + " | ".join(row))
    # theo bối cảnh BTC 15 phút cho 1 cấu hình tiêu biểu
    if G:
        b = G[0]; key = f"{b['D']}|{b['W']}|{b['SL']:g}|{b['H']}"
        E_ = [e for e in evs if e["q24"] >= b["VOL"] and e["z"] >= b["Z"] and e["R"] >= b["R"] and key in e["res"]]
        for lab, f in (("BTC 15p giảm > 1%", lambda e: e["b15"] is not None and e["b15"] < -100), ("BTC bình thường", lambda e: e["b15"] is not None and abs(e["b15"]) <= 100), ("BTC 15p tăng > 1%", lambda e: e["b15"] is not None and e["b15"] > 100)):
            xs = [e for e in E_ if f(e)]
            if xs:
                a = np.array([e["res"][key] for e in xs]); log(f"  {lab}: n={len(a)} TB {a.mean():.0f} bps · trung vị {np.median(a):.0f} · thắng {(a > 0).mean() * 100:.0f}%")
        rep["best_events"] = [dict(s=e["s"], T=e["T"], z=e["z"], R=e["R"], side=e["side"], net=e["res"][key]) for e in E_][-400:]
    json.dump(rep, open(os.path.join(E.OUT, "round3.json"), "w"), ensure_ascii=False, default=float)
