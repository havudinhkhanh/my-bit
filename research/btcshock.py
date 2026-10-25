"""Khi BTC có cú sốc 1 phút, các coin khác có CHẠY TIẾP theo hướng cú sốc (→ nên thoát ngay các lệnh đang ngược hướng) hay BẬT LẠI (→ nên giữ)?
Dữ liệu dài nhất có thể: nến 1 phút Binance futures từ 01/2024 tới nay, các coin khối lượng lớn có đủ lịch sử.
Đo: sau nến sốc của BTC (|lợi suất| ≥ Z lần độ lệch chuẩn 60 phút và ≥ R bps), giá coin đi tiếp bao nhiêu bps theo hướng cú sốc,
từ giá ĐÓNG nến sốc (bot thấy cú sốc trong vòng vài giây – dùng giá đóng nến là thận trọng) tới giá mở nến sau H phút.
Thoát sớm hay muộn đều phải trả phí thoát → lợi ích của "thoát ngay" = phần chạy tiếp − trượt giá thêm lúc thị trường đang sốc (~5 bps).
Chạy: python research/btcshock.py"""
import concurrent.futures as cf
import datetime as dt
import math
import os
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("RS_LOG", "btcshock.log")
os.environ.setdefault("RS_NOCACHE", "1")
import events as E  # noqa: E402

log = E.log
START = os.environ.get("RS_START", "2024-01")
NCOIN = int(os.environ.get("RS_NSYM", "60"))
HS = (1, 3, 5, 10, 15)
SLIP = 5.0


def months_from(start):
    y, m = map(int, start.split("-")); out = []
    while (y, m) < (E.TODAY.year, E.TODAY.month):
        out.append(f"{y:04d}-{m:02d}"); m += 1
        if m > 12:
            y += 1; m = 1
    return out


def load(sym, months, days):
    L = [E.fetch(sym, "monthly", m) for m in months] + [E.fetch(sym, "daily", d) for d in days]
    L = [d for d in L if d is not None and len(d)]
    if not L:
        return None
    d = pd.concat(L).drop_duplicates("t").set_index("t").sort_index()
    return d[["o", "c"]].astype(np.float32)


def main():
    months = months_from(START)
    cur = f"{E.TODAY.year:04d}-{E.TODAY.month:02d}"
    days = [(dt.date(E.TODAY.year, E.TODAY.month, 1) + dt.timedelta(days=k)).isoformat() for k in range((E.TODAY - dt.date(E.TODAY.year, E.TODAY.month, 1)).days)]
    syms = E.list_symbols()
    # chọn coin: khối lượng lớn hiện nay VÀ có dữ liệu từ tháng đầu
    probe_day = (E.TODAY - dt.timedelta(days=3)).isoformat()
    with cf.ThreadPoolExecutor(48) as ex:
        dd = dict(zip(syms, ex.map(lambda s: E.fetch(s, "daily", probe_day), syms)))
    vol = sorted(((s, float(d.qv.sum())) for s, d in dd.items() if d is not None and len(d) > 1000), key=lambda x: -x[1])
    with cf.ThreadPoolExecutor(48) as ex:
        has0 = dict(zip([s for s, _ in vol[:200]], ex.map(lambda s: E.get(f"{E.BASE}/monthly/klines/{s}/1m/{s}-1m-{months[0]}.zip") is not None, [s for s, _ in vol[:200]])))
    pick = ["BTCUSDT"] + [s for s, _ in vol if has0.get(s) and s != "BTCUSDT"][:NCOIN]
    log(f"{len(months)} tháng ({months[0]} → {months[-1]}) + {len(days)} ngày tháng này · {len(pick)} mã có đủ lịch sử")
    t0 = time.time()
    with cf.ThreadPoolExecutor(16) as ex:
        data = dict(zip(pick, ex.map(lambda s: load(s, months, days), pick)))
    data = {s: d for s, d in data.items() if d is not None}
    log(f"Tải xong {len(data)} mã trong {time.time() - t0:.0f}s")
    tmin = int(data["BTCUSDT"].index.min()); tmax = max(int(d.index.max()) for d in data.values())
    T = np.arange(tmin, tmax + 1); n = len(T)
    def arr(s, col):
        return data[s][col].reindex(T).ffill().values.astype(np.float64)
    bc = arr("BTCUSDT", "c")
    rb = np.diff(np.log(bc), prepend=np.log(bc[0]))
    sdb = pd.Series(rb).rolling(60, min_periods=40).std().shift(1).values
    yr = np.array([dt.datetime.fromtimestamp(t * 60, dt.timezone.utc).year for t in T[::1440]]).repeat(1440)[:n]
    alts = [s for s in data if s != "BTCUSDT"]
    AC = {s: arr(s, "c") for s in alts}; AO = {s: arr(s, "o") for s in alts}
    AR = {s: np.diff(np.log(AC[s]), prepend=np.log(AC[s][0])) for s in alts}
    # tương quan 1 ngày trước với BTC (chỉ dữ liệu trước) – chỉ xét coin đi cùng BTC (ρ ≥ 0,3): đó là các lệnh bị cú sốc BTC đe doạ
    RHO = {s: pd.Series(AR[s]).rolling(1440, min_periods=600).corr(pd.Series(rb)).shift(1).values for s in alts}
    rows = []
    for Z in (3, 4, 6):
        for R in (20, 40, 80):
            ev = np.flatnonzero((np.abs(rb) >= Z * sdb) & (np.abs(rb) * 1e4 >= R) & np.isfinite(sdb))
            ev = E.dedupe(ev, 30); ev = ev[ev + 1 + max(HS) < n]
            if len(ev) < 20:
                continue
            for H in HS:
                per_ev, per_alt, yrs = [], [], []
                for i in ev:
                    d = np.sign(rb[i]); xs = []
                    for s in alts:
                        if not (RHO[s][i] >= 0.3):
                            continue
                        c0 = AC[s][i]; x1 = AO[s][i + 1 + H]
                        if not (c0 > 0 and x1 > 0):
                            continue
                        xs.append(d * (x1 / c0 - 1) * 1e4)      # chạy tiếp theo hướng cú sốc (+) hay bật lại (−)
                    if xs:
                        per_ev.append(np.mean(xs)); per_alt += xs; yrs.append(yr[i])
                pe = np.array(per_ev); pa = np.array(per_alt); yy = np.array(yrs)
                t = float(pe.mean() / (pe.std(ddof=1) / math.sqrt(len(pe)))) if len(pe) > 2 and pe.std(ddof=1) > 0 else 0.0
                by_y = {int(y): round(float(pe[yy == y].mean()), 1) for y in np.unique(yy)}
                # BTC cũng chạy tiếp?
                bt = np.array([np.sign(rb[i]) * (np.exp(np.sum(rb[i + 1:i + 1 + H + 1])) - 1) * 1e4 for i in ev])
                rows.append(dict(Z=Z, R=R, H=H, events=len(pe), per_month=round(len(pe) / max(1, n / 43200), 1), cont=round(float(pe.mean()), 2), med=round(float(np.median(pe)), 2),
                                 pos=round(float((pe > 0).mean() * 100), 1), t=round(t, 2), by_year=by_y, alt_med=round(float(np.median(pa)), 2), btc_cont=round(float(bt.mean()), 2),
                                 benefit=round(float(pe.mean()) - SLIP, 2)))
                x = rows[-1]
                log(f"  BTC sốc z≥{Z} & ≥{R}bps · {x['events']} lần ({x['per_month']}/tháng) · sau {H}p: coin chạy tiếp TB {x['cont']:+.1f} bps (trung vị {x['med']:+.1f}, {x['pos']:.0f}% lần dương, t={x['t']}) · "
                    f"BTC tự chạy tiếp {x['btc_cont']:+.1f} · lợi ích thoát ngay ≈ {x['benefit']:+.1f} bps · theo năm {x['by_year']}")
    import json
    json.dump(rows, open(os.path.join(E.OUT, "btcshock.json"), "w"), ensure_ascii=False, default=float)


if __name__ == "__main__":
    t0 = time.time(); main(); log(f"xong {time.time() - t0:.0f}s")
