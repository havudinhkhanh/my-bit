"""Mức funding lúc có cú sốc có giúp CHỌN lệnh Bắt râu sập không (không chỉ là chi phí)?
Ý tưởng: funding cho biết phe nào đang đông. Long sau cú sập mà funding đang âm sâu (phe Short đông, trả phí) → dễ bị ép ngược lên (tốt cho Long)?
Hay funding âm sâu = coin đang bị bán khống mạnh vì có lý do → sập tiếp (xấu)?
Dùng tỉ lệ funding ĐÃ CHỐT gần nhất TRƯỚC cú sốc (không nhìn trước). crowd = −side × funding (bps/kỳ): > 0 = phe ngược lệnh mình đang đông & trả phí.
Lệnh: cấu hình bot (lọc 6 giờ + dao rơi, chờ ≤ 8 phút, giữ 60 phút); 'new' = thêm khối lượng ≥ 8× và bỏ xả sau bơm.
Chạy: python research/funding6.py"""
import concurrent.futures as cf
import gzip
import json
import os
import sys
import urllib.request

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("RS_LOG", "funding6.log")
import events as E  # noqa: E402
from funding5 import SRC, fund_month  # noqa: E402

log = E.log
W, H = 8, 60


def load():
    b = open(SRC, "rb").read() if os.path.exists(SRC) else urllib.request.urlopen(SRC, timeout=120).read()
    rows = []
    for e in json.loads(gzip.decompress(b)):
        r = e.pop("res")
        if not (e["prior6"] == 0 and e["r4h"] > -1000):
            continue
        new = (e.get("vx") or 0) >= 8 and e["r15"] <= 100
        for D in (1.5, 2.0):
            f = r.get(f"f{D}")
            if f is None or f > W:
                continue
            rows.append(dict(s=e["s"], T=e["T"], side=e["side"], new=new, t_in=e["T"] + f, t_out=e["T"] + f + 1 + H, net=r[f"t{D}|{H}"]))
    return pd.DataFrame(rows)


if __name__ == "__main__":
    d = load()
    d["ts"] = pd.to_datetime(d["T"] * 60, unit="s", utc=True); d["m"] = d.ts.dt.strftime("%Y-%m")
    d["half"] = d.ts.dt.year.astype(str) + np.where(d.ts.dt.month <= 6, "H1", "H2")
    cur = f"{E.TODAY.year:04d}-{E.TODAY.month:02d}"
    need = set()
    for s, m in zip(d.s, d.m):
        if m == cur:
            continue
        need.add((s, m)); y, mo = map(int, m.split("-")); pm = f"{y - (mo == 1):04d}-{12 if mo == 1 else mo - 1:02d}"; need.add((s, pm))   # tháng trước để có kỳ chốt ngay trước cú sốc đầu tháng
    jobs = sorted(need)
    with cf.ThreadPoolExecutor(48) as ex:
        res = dict(zip(jobs, ex.map(lambda j: fund_month(*j), jobs)))
    FR = {}
    for (s, m), v in res.items():
        if v is not None:
            FR.setdefault(s, []).append(v)
    FR = {s: pd.concat(L).drop_duplicates("T").sort_values("T") for s, L in FR.items()}
    prev, fund = [], []
    for r in d.itertuples(index=False):
        F = FR.get(r.s)
        if F is None or not len(F):
            prev.append(np.nan); fund.append(np.nan); continue
        Ts = F["T"].values; i = np.searchsorted(Ts, r.T, "left") - 1
        if i < 0 or r.T - Ts[i] > 8 * 60 + 5:
            prev.append(np.nan); fund.append(np.nan); continue
        prev.append(float(F.f.values[i]))
        x = F[(F["T"] > r.t_in) & (F["T"] <= r.t_out)]; fund.append(float(-r.side * x.f.sum() * 1e4))
    d["fr"] = prev; d["fund"] = fund
    k = d.dropna(subset=["fr"]).copy()
    k["crowd"] = -k.side * k.fr * 1e4; k["tot"] = k.net + k.fund
    log(f"{len(k)}/{len(d)} lệnh có funding đã chốt trước cú sốc")
    log(f"phân bố funding trước cú sốc (bps/kỳ): {k.fr.mul(1e4).quantile([.01, .05, .25, .5, .75, .95, .99]).round(2).to_dict()}")
    edges = [-1e9, -30, -5, -0.5, 0.5, 5, 30, 1e9]
    lab = ["phe mình đông, trả >0,3%", "phe mình đông 0,05–0,3%", "phe mình đông nhẹ", "trung tính (~0,01%)", "phe kia đông nhẹ", "phe kia đông 0,05–0,3%", "phe kia đông, trả >0,3%"]
    for name, q in (("Tất cả (lọc hiện có, chờ ≤ 8p)", k), ("Cấu hình mới (khối lượng ≥ 8×, bỏ xả sau bơm)", k[k.new])):
        log(f"\n== {name}: {len(q)} lệnh · TB {q.tot.mean():+.1f} bps (đã gồm funding) · thắng {(q.tot > 0).mean() * 100:.1f}%")
        for side, sn in ((0, "cả 2 chiều"), (1, "Long"), (-1, "Short")):
            z = q if side == 0 else q[q.side == side]
            log(f"  -- {sn} ({len(z)} lệnh)")
            c = pd.cut(z.crowd, edges, labels=lab)
            for L_, g in z.groupby(c, observed=True):
                hh = g.groupby("half").tot.mean()
                log(f"     {L_:<28} n {len(g):>5} · TB {g.tot.mean():+7.1f} · thắng {(g.tot > 0).mean() * 100:4.1f}% · funding TB {g.fund.mean():+6.1f} | " + " ".join(f"{h}:{v:+.0f}({(g.half == h).sum()})" for h, v in hh.items()))
    log("xong")
