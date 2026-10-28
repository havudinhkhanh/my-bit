"""Vòng 6 – CÁCH THOÁT LỆNH cho Bắt râu sập (sau lệnh BEAT 28/10: đã lời +2% rồi hết 60 phút đóng lỗ −2,6%).
Toàn bộ mã futures USDT Binance từ 01/2025, khối lượng đúng thời điểm. Lấy đúng cú sốc bot đang bắt:
  ≥ 300 bps/1 phút, z ≥ 4, khối lượng ≥ 8× trung vị, khối lượng 24h ≥ 2 triệu USD, không có cú sốc khác 6 giờ trước,
  15 phút trước không chạy cùng hướng lệnh > 1%, 4 giờ trước không ngược hướng lệnh > 10% ("dao rơi").
2 lệnh chờ ở 1,5× và 2× độ lớn cú sốc, chờ 8 phút (phải xuyên qua 5 bps mới tính khớp). Mỗi mức là 1 lệnh.
So sánh cách thoát (trong 1 nến: giả định giá đi XẤU trước rồi mới đi TỐT – thận trọng):
  - giữ cố định 30/60/90/120 phút (hiện tại 60)
  - chốt lời bằng lệnh chờ khi lời ≥ X bps, không thì hết 60 phút
  - dời cắt lỗ về hoà vốn khi đã lời ≥ Y bps
  - cắt lỗ đuổi theo giá: khi đã lời ≥ A, đóng nếu trả lại G bps (hoặc một nửa phần lời) từ đỉnh lời
Phí: vào maker 2 · thoát theo giờ taker 5 + 3 + trượt 10 · cắt lỗ (stop) taker 5 + 3 + trượt 20 · chốt lời maker 2 + 3.
Chạy: python research/round6.py"""
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
os.environ.setdefault("RS_LOG", "round6.log")
os.environ.setdefault("RS_NOCACHE", "1")
import events as E  # noqa: E402

log = E.log
START = os.environ.get("RS_START", "2025-01")
IN_M, OUT_T, OUT_S, OUT_P, THR = 2.0, 18.0, 28.0, 5.0, 5.0
DS, W, HMAX, CAT = (1.5, 2.0), 8, 120, 3500.0


def months_from(start):
    y, m = map(int, start.split("-")); out = []
    while (y, m) < (E.TODAY.year, E.TODAY.month):
        out.append(f"{y:04d}-{m:02d}"); m += 1
        if m > 12:
            y += 1; m = 1
    return out


MONTHS = months_from(START)
DAYS = [(dt.date(E.TODAY.year, E.TODAY.month, 1) + dt.timedelta(days=k)).isoformat() for k in range((E.TODAY - dt.date(E.TODAY.year, E.TODAY.month, 1)).days)]

# (tên, loại, tham số)
RULES = [("giữ 30p", "T", 30), ("giữ 60p (hiện tại)", "T", 60), ("giữ 90p", "T", 90), ("giữ 120p", "T", 120)]
RULES += [(f"chốt lời {x} bps", "P", x) for x in (100, 150, 200, 300, 400, 600, 1000)]
RULES += [("chốt khi về giá đóng nến sốc", "C", 1.0), ("chốt khi hồi 1/2 về giá nến sốc", "C", 0.5)]
RULES += [(f"hoà vốn khi lời ≥ {y}", "B", y) for y in (100, 150, 200, 300, 500)]
RULES += [(f"đuổi: lời ≥ {a} thì trả lại tối đa {g if g else '½'}", "R", (a, g)) for a in (150, 200, 300, 500) for g in (0, 100, 200, 300) if not g or g < a]
RULES += [("hoà vốn ≥200 + chốt 600", "BP", (200, 600)), ("hoà vốn ≥150 + chốt 400", "BP", (150, 400)), ("đuổi ≥300 trả ½ + giữ tối đa 120p", "R120", (300, 0))]


def sim(kind, prm, fav, adv, o_end, o_all, L, side, c0):
    """fav/adv: lời/lỗ tốt nhất/xấu nhất (bps) của từng nến sau nến khớp; o_end: lời/lỗ ở giá mở nến hết giờ. Trả bps ròng & lý do."""
    H = prm if kind == "T" else 120 if kind == "R120" else 60
    peak = 0.0
    tgt = None
    if kind == "C":
        px = L + prm * (c0 - L); tgt = side * (px / L - 1) * 1e4
    for k in range(H):
        a, f = adv[k], fav[k]
        if a <= -CAT:
            return -CAT - IN_M - OUT_S, "S"
        if kind in ("B", "BP"):
            y = prm if kind == "B" else prm[0]
            if peak >= y and a <= 10:
                return 10 - IN_M - OUT_S, "B"
        if kind in ("R", "R120"):
            A, G = prm
            if peak >= A:
                st = peak / 2 if not G else peak - G
                if a <= st:
                    return st - IN_M - OUT_S, "R"
        x = prm if kind == "P" else prm[1] if kind == "BP" else tgt if kind == "C" else None
        if x is not None and f >= x + THR:
            return x - IN_M - OUT_P, "P"
        peak = max(peak, f)
    return o_all[H] - IN_M - OUT_T, "T"


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
    except Exception:  # noqa: BLE001
        return []
    if d is None or len(d) < 3000:
        return []
    c = d.c.ffill().values; o = d.o.fillna(d.c.ffill()).values; h = d.h.fillna(d.c.ffill()).values; l = d.l.fillna(d.c.ffill()).values
    qv = d.qv.fillna(0).values; ok = d.c.notna().values; t0 = int(d.index[0]); n = len(d)
    r = np.diff(np.log(c), prepend=np.log(c[0]))
    sd = pd.Series(r).rolling(60, min_periods=40).std().shift(1).values
    mq = pd.Series(qv).rolling(60, min_periods=40).median().shift(1).values
    q24 = pd.Series(qv).rolling(1440, min_periods=600).sum().shift(1).values
    z = np.abs(r) / sd
    raw = np.flatnonzero((z >= 4) & (np.abs(r) * 1e4 >= 300) & (qv >= 8 * mq) & ok & (q24 >= 2e6))
    out = []
    for i in E.dedupe(raw, 30):
        if i < 1440 or i + 2 + W + HMAX >= n:
            continue
        side = -1 if r[i] > 0 else 1; c0 = c[i]; mv = abs(math.expm1(r[i]))
        prior6 = int(((raw < i) & (raw >= i - 360)).sum())
        r15 = side * (c[i - 1] / c[i - 16] - 1) * 1e4; r4h = side * (c0 / c[i - 240] - 1) * 1e4
        if prior6 or r15 > 100 or r4h <= -1000:
            continue
        rec = dict(s=s, T=int(t0 + i), side=side, R=round(float(abs(r[i]) * 1e4)), res={})
        for D in DS:
            L = c0 * (1 - side * D * mv); Lt = L * (1 - side * THR / 1e4); fill = None
            for j in range(i + 1, i + 1 + W):
                if (side > 0 and l[j] < Lt) or (side < 0 and h[j] > Lt):
                    fill = j; break
            if fill is None:
                continue
            seg_h, seg_l = h[fill + 1:fill + 1 + HMAX], l[fill + 1:fill + 1 + HMAX]
            pn = lambda px: side * (px / L - 1) * 1e4  # noqa: E731
            fav = pn(seg_h) if side > 0 else pn(seg_l)
            adv = pn(seg_l) if side > 0 else pn(seg_h)
            o_all = pn(o[fill + 1:fill + 2 + HMAX])
            res = {}
            for name, kind, prm in RULES:
                v, why = sim(kind, prm, fav, adv, None, o_all, L, side, c0)
                res[name] = (round(float(v), 1), why)
            res["_mfe60"] = round(float(max(0.0, fav[:60].max())), 0)
            rec["res"][str(D)] = res
        if rec["res"]:
            out.append(rec)
    return out


def summary(evs):
    rows = []
    for e in evs:
        ts = dt.datetime.fromtimestamp(e["T"] * 60, dt.timezone.utc)
        half = f"{ts.year}{'H1' if ts.month <= 6 else 'H2'}"
        for D, res in e["res"].items():
            rows.append(dict(half=half, month=ts.strftime("%Y-%m"), side=e["side"], D=D, mfe=res["_mfe60"], **{k: v[0] for k, v in res.items() if not k.startswith("_")}, **{"w|" + k: v[1] for k, v in res.items() if not k.startswith("_")}))
    d = pd.DataFrame(rows)
    base = "giữ 60p (hiện tại)"
    halves = sorted(d.half.unique())
    log(f"\n{len(evs)} cú sốc qua bộ lọc của bot · {len(d)} lệnh (mỗi mức khớp = 1 lệnh) · {d.month.min()} → {d.month.max()} · theo nửa năm: {d.half.value_counts().sort_index().to_dict()}")
    b = d[base]
    turn = d[(d.mfe >= 200) & (b < 0)]
    log(f"Như lệnh BEAT (đã lời ≥ 2% trong 60 phút nhưng đóng lỗ khi hết giờ): {len(turn)} lệnh = {len(turn) / len(d) * 100:.1f}% số lệnh · lỗ TB khi đóng {turn[base].mean():+.0f} bps")
    log(f"Lệnh từng lời ≥ 2%: {(d.mfe >= 200).mean() * 100:.0f}% · từng lời ≥ 1%: {(d.mfe >= 100).mean() * 100:.0f}%")
    rep = []
    for name, _, _ in RULES:
        x = d[name]; dx = x - b
        per = {hf: round(float(x[d.half == hf].mean()), 1) for hf in halves}
        dper = {hf: round(float(dx[d.half == hf].mean()), 1) for hf in halves}
        mo = d.groupby("month")[name].mean(); mob = d.groupby("month")[base].mean()
        why = d["w|" + name].value_counts(normalize=True).mul(100).round(0).to_dict()
        rep.append(dict(rule=name, n=len(x), mean=round(float(x.mean()), 1), med=round(float(x.median()), 1), win=round(float((x > 0).mean() * 100), 1),
                        p5=round(float(np.percentile(x, 5)), 1), worst=round(float(x.min()), 1), d_mean=round(float(dx.mean()), 1), per=per, d_per=dper,
                        months_better=f"{int((mo > mob + 0.05).sum())}/{len(mo)}", all_halves_better=all(v > 0 for v in dper.values()), why=why,
                        long=round(float(x[d.side > 0].mean()), 1), short=round(float(x[d.side < 0].mean()), 1)))
    log("\nCách thoát · TB bps/lệnh · trung vị · thắng% · 5% xấu nhất · so với hiện tại · từng nửa năm (so với hiện tại) · tháng tốt hơn · Long/Short · cách đóng (%)")
    for x in sorted(rep, key=lambda q: -q["mean"]):
        mark = "★" if x["all_halves_better"] and x["d_mean"] > 0 else " "
        log(f"{mark} {x['rule']:<40} {x['mean']:+7.1f} · {x['med']:+6.1f} · {x['win']:4.1f}% · {x['p5']:+7.0f} · Δ {x['d_mean']:+6.1f} · "
            + " ".join(f"{k}:{v:+.0f}({x['d_per'][k]:+.0f})" for k, v in x["per"].items()) + f" · {x['months_better']} · L{x['long']:+.0f}/S{x['short']:+.0f} · {x['why']}")
    json.dump(dict(n_events=len(evs), n_trades=len(d), rules=rep), open(os.path.join(E.OUT, "round6.json"), "w"), ensure_ascii=False, indent=1, default=float)


if __name__ == "__main__":
    t00 = time.time()
    syms = E.list_symbols()
    log(f"{len(syms)} mã · {MONTHS[0]} → {MONTHS[-1]} + {len(DAYS)} ngày tháng này")
    evs = []
    with cf.ThreadPoolExecutor(32) as ex:
        for k, out in enumerate(ex.map(process, syms)):
            evs += out
            if k % 100 == 0:
                log(f"  … {k}/{len(syms)} mã, {len(evs)} cú sốc, {time.time() - t00:.0f}s")
    summary(evs)
    log(f"xong {time.time() - t00:.0f}s")
