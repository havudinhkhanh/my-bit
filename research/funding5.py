"""Phí funding ảnh hưởng thế nào tới Bắt râu sập? (cấu hình vòng 5: chờ ≤ 8 phút, khối lượng ≥ 8×, bỏ "xả sau bơm", lọc 6 giờ + dao rơi)
Lấy các lệnh của vòng 5 (research_out/round5.json.gz trên nhánh status), ghép với lịch sử funding THẬT của từng mã (data.binance.vision, tháng 01/2025 → tháng trước;
tháng hiện tại thử thêm API Binance) và cộng/trừ funding cho mỗi lần giữ lệnh vắt qua giờ chốt funding:
  Long trả funding khi tỉ lệ > 0 (nhận khi < 0), Short ngược lại. Tính trên giá trị lệnh (bps) – sàn thu theo giá đánh dấu, chênh không đáng kể.
Chạy: python research/funding5.py"""
import concurrent.futures as cf
import gzip
import io
import json
import os
import sys
import urllib.request
import zipfile

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("RS_LOG", "funding5.log")
import events as E  # noqa: E402

log = E.log
SRC = os.environ.get("RS_R5", os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "round5.json.gz"))      # kết quả vòng 5 lưu trong repo (nhánh status bị ghi đè mỗi lần chạy)
W, H = 8, 60


def load_events():
    b = open(SRC, "rb").read() if os.path.exists(SRC) else urllib.request.urlopen(SRC, timeout=120).read()
    ev = json.loads(gzip.decompress(b))
    rows = []
    for e in ev:
        r = e.pop("res")
        if not (e["prior6"] == 0 and e["r4h"] > -1000 and (e.get("vx") or 0) >= 8 and e["r15"] <= 100):
            continue
        for D in (1.5, 2.0):
            f = r.get(f"f{D}")
            if f is None or f > W:
                continue
            rows.append(dict(s=e["s"], T=e["T"], side=e["side"], D=D, t_in=e["T"] + f, t_out=e["T"] + f + 1 + H, net=r[f"t{D}|{H}"], R=e["R"]))
    return pd.DataFrame(rows)


def fund_month(sym, m):
    b = E.get(f"{E.BASE}/monthly/fundingRate/{sym}/{sym}-fundingRate-{m}.zip")
    if not b:
        return None
    z = zipfile.ZipFile(io.BytesIO(b)); t = z.read(z.namelist()[0]).decode().splitlines()
    rows = [ln.split(",") for ln in t if ln and ln[0].isdigit()]
    return pd.DataFrame({"T": [int(x[0]) // 60000 for x in rows], "f": [float(x[-1]) for x in rows]}) if rows else None


def fund_api(sym, t0):
    try:
        u = f"https://fapi.binance.com/fapi/v1/fundingRate?symbol={sym}&startTime={t0 * 60000}&limit=1000"
        with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "mybit-research"}), timeout=30) as r:
            J = json.loads(r.read())
        return pd.DataFrame({"T": [int(x["fundingTime"]) // 60000 for x in J], "f": [float(x["fundingRate"]) for x in J]}) if J else None
    except Exception:  # noqa: BLE001
        return None


if __name__ == "__main__":
    d = load_events()
    d["ts"] = pd.to_datetime(d["T"] * 60, unit="s", utc=True); d["m"] = d.ts.dt.strftime("%Y-%m")
    cur = f"{E.TODAY.year:04d}-{E.TODAY.month:02d}"
    log(f"{len(d)} lệnh (mỗi mức khớp là 1 lệnh) · {d.s.nunique()} mã · {d.m.min()} → {d.m.max()}")
    jobs = sorted({(s, m) for s, m in zip(d.s, d.m) if m != cur})
    with cf.ThreadPoolExecutor(48) as ex:
        res = dict(zip(jobs, ex.map(lambda j: fund_month(*j), jobs)))
    cur_syms = sorted(set(d.s[d.m == cur]))
    t_cur = int(d[d.m == cur]["T"].min()) - 600 if len(cur_syms) else 0
    with cf.ThreadPoolExecutor(16) as ex:
        api = dict(zip(cur_syms, ex.map(lambda s: fund_api(s, t_cur), cur_syms)))
    log(f"funding: {sum(v is not None for v in res.values())}/{len(res)} mã-tháng từ kho dữ liệu · tháng này qua API: {sum(v is not None for v in api.values())}/{len(cur_syms)} mã")
    FR = {}
    for (s, m), v in res.items():
        if v is not None:
            FR.setdefault(s, []).append(v)
    for s, v in api.items():
        if v is not None:
            FR.setdefault(s, []).append(v)
    FR = {s: pd.concat(L).drop_duplicates("T").sort_values("T") for s, L in FR.items()}
    fb, cross, have = [], [], []
    for r in d.itertuples(index=False):
        F = FR.get(r.s)
        ok = F is not None and len(F) and F["T"].iloc[0] <= r.t_in + 60 * 8 and (F["T"].iloc[-1] >= r.t_in - 60 * 8)
        have.append(bool(ok))
        if not ok:
            fb.append(np.nan); cross.append(np.nan); continue
        x = F[(F["T"] > r.t_in) & (F["T"] <= r.t_out)]
        fb.append(float(-r.side * x.f.sum() * 1e4)); cross.append(len(x))
    d["fund"] = fb; d["cross"] = cross; d["have"] = have
    k = d[d.have]
    log(f"có dữ liệu funding cho {len(k)}/{len(d)} lệnh")
    c = k[k.cross > 0]
    log(f"\nlệnh giữ vắt qua giờ chốt funding: {len(c)} ({len(c) / len(k) * 100:.1f}%)")
    log(f"funding TB mỗi lệnh (mọi lệnh): {k.fund.mean():+.2f} bps · trung vị trong nhóm vắt qua: {c.fund.median():+.2f} · TB nhóm vắt qua: {c.fund.mean():+.2f}")
    log(f"  Long : TB {k[k.side > 0].fund.mean():+.2f} bps/lệnh · vắt qua {(k[k.side > 0].cross > 0).mean() * 100:.1f}%")
    log(f"  Short: TB {k[k.side < 0].fund.mean():+.2f} bps/lệnh · vắt qua {(k[k.side < 0].cross > 0).mean() * 100:.1f}%")
    log(f"lợi nhuận TB/lệnh: chưa tính funding {k.net.mean():+.1f} bps → đã tính {(k.net + k.fund).mean():+.1f} bps · thắng {(k.net > 0).mean() * 100:.1f}% → {((k.net + k.fund) > 0).mean() * 100:.1f}%")
    q = c.fund.quantile([0.01, 0.05, 0.5, 0.95, 0.99]).round(1).to_dict()
    log(f"phân phối funding (lệnh vắt qua): {q} · tệ nhất {c.fund.min():+.1f} · tốt nhất {c.fund.max():+.1f}")
    big = c[c.fund <= -50]
    log(f"lệnh mất ≥ 50 bps vì funding: {len(big)} ({len(big) / len(k) * 100:.2f}% số lệnh) · tổng ảnh hưởng {big.fund.sum() / len(k):+.2f} bps/lệnh")
    for r in c.nsmallest(12, "fund").itertuples():
        log(f"  {r.ts:%Y-%m-%d %H:%M} {r.s} {'Long' if r.side > 0 else 'Short'} funding {r.fund:+.1f} bps · giá {r.net:+.0f} bps")
    k = k.assign(half=k.ts.dt.year.astype(str) + np.where(k.ts.dt.month <= 6, "H1", "H2"))
    for h, g in k.groupby("half"):
        log(f"  {h}: funding TB {g.fund.mean():+.2f} bps/lệnh · lợi nhuận {g.net.mean():+.1f} → {(g.net + g.fund).mean():+.1f}")
    k.to_csv(os.path.join(E.OUT, "funding5.csv.gz"), index=False)
    log("xong")
