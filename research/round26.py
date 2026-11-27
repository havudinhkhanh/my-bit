"""Vòng 26 – Jason (27/11/2026): thử "giữ 60 phút + ĐÓNG HẾT khi ngày lỗ X%" (đề xuất của rà soát vòng 25) và "giữ 60, chuyển sang cắt lỗ đuổi khi cả thị trường sập".
Vòng 25 chỉ lưu lời/lỗ lúc đóng → không mô phỏng được việc đóng giữa chừng. Ở đây chạy lại mọi chân theo TỪNG GIAO DỊCH THẬT (aggTrades) trên đúng các cú sốc
của vòng 25 (01/2024 → 25/11/2026, research/data/round25_ev.json.gz) và lưu ĐƯỜNG ĐI mỗi phút của từng chân:
  ts  = phút (UTC, phút thứ … từ 1970) của giá cuối mỗi phút · pn = lời/lỗ theo giá cuối phút đó (bps, chưa trừ phí – dùng để quyết định)
  ex  = lời/lỗ RÒNG nếu đóng bằng lệnh thị trường 1 giây sau cuối phút đó (bps, đã trừ phí vào + phí ra 5, chưa trừ trượt thêm)
  end = ròng nếu giữ tới hết 60 phút · cat = phút chạm cắt lỗ thảm hoạ −3.500 (theo từng giao dịch) hoặc None
Phần mô phỏng danh mục (đóng hết theo lỗ trong ngày tính cả lời/lỗ đang mở, chế độ thị trường sập, …) chạy riêng trên máy: research/r26_port.py.
Chạy: python research/round26.py  · kết quả research_out/round26.json.gz"""
import concurrent.futures as cf
import gzip
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
os.environ.setdefault("RS_LOG", "round26.log")
os.environ.setdefault("RS_NOCACHE", "1")
os.environ["R18_SRC"] = os.path.join(HERE, "data", "round25_ev.json.gz")

import numpy as np  # noqa: E402

import events as E  # noqa: E402
import round19 as R  # noqa: E402

M = R.M
log = E.log
OUT = "research_out"


def legrun(tt, sp, side, T, L, market=False):
    p = np.abs(sp); tp = ((T + 1) * 60 + M.LAT_IN) * 1000; k0 = int(np.searchsorted(tt, tp))
    if k0 >= len(tt):
        return None
    if market:
        k = k0; pin = p[k0]; fin = 5.0
    else:
        kend = int(np.searchsorted(tt, (T + 1 + M.W) * 60 * 1000))
        if kend <= k0:
            return None
        x = side * (p[k0:kend] / L - 1) * 1e4; hit = np.flatnonzero(x < -1e-9)
        if not len(hit):
            return None
        k = k0 + int(hit[0])
        pin, fin = (p[k0], 5.0) if k == k0 else (L, R.R6.IN_M)
    tf = int(tt[k]); tend = tf + int(M.HOLD * 1000)
    kH = int(np.searchsorted(tt, tend)); pr = side * (p[k + 1:kH + 1] / pin - 1) * 1e4
    cat = np.flatnonzero(pr <= -R.R6.CAT); tcat = int(tt[k + 1 + int(cat[0])]) if len(cat) else None
    st, sx = R.mk_series(tt, sp, tf)["m1"]
    a, b = int(np.searchsorted(st, tf, "right")), int(np.searchsorted(st, tend))
    ts_, pn = st[a:b], side * (sx[a:b] / pin - 1) * 1e4
    ke = np.minimum(np.searchsorted(tt, ts_ + M.LAT_OUT * 1000), len(tt) - 1)
    ex = side * (p[ke] / pin - 1) * 1e4 - fin - 5.0
    kz = min(int(np.searchsorted(tt, tend + M.LAT_OUT * 1000)), len(tt) - 1)
    end = float(side * (p[kz] / pin - 1) * 1e4 - fin - 5.0)
    return dict(tf=tf, f=int(tf // 60000 - T), mk=market, ts=[int(x // 60000) for x in ts_], pn=[round(float(x), 1) for x in pn],
                ex=[round(float(x), 1) for x in ex], end=round(end, 1), cat=(tcat // 60000 if tcat is not None else None))


def per_symbol(job):
    s, evs = job
    try:
        wins = [((T + 1) * 60 * 1000, (T + 2 + M.W + 62) * 60 * 1000) for _, T, _, _, _ in evs]
        days = sorted({M.utc(m) for a, b in wins for m in (a // 60000, b // 60000)})
        TT, PP = [], []
        for d in days:
            x = M.agg_file(s, d, [w for w in wins if M.utc(w[0] // 60000) == d or M.utc(w[1] // 60000) == d])
            if x is None:
                return s, {}, f"thiếu aggTrades {d}"
            TT.append(x[0]); PP.append(x[1])
        tt = np.concatenate(TT); pp = np.concatenate(PP); o = np.argsort(tt, kind="stable"); tt, pp = tt[o], pp[o]
        out = {}
        for k, T, side, r15, Ls in evs:
            a, b = (T + 1) * 60 * 1000, (T + 2 + M.W + 62) * 60 * 1000
            i0, i1 = np.searchsorted(tt, a), np.searchsorted(tt, b, "right"); t_, p_ = tt[i0:i1], pp[i0:i1]
            Rr = {}
            for D, L in Ls.items():
                v = legrun(t_, p_, side, T, L)
                if v:
                    Rr[D] = v
            if side > 0 and r15 <= -300:
                v = legrun(t_, p_, side, T, None, market=True)
                if v:
                    Rr["0.0"] = v
            out[k] = Rr
        return s, out, ""
    except Exception as e:  # noqa: BLE001
        return s, {}, f"lỗi {type(e).__name__}: {str(e)[:120]}"


if __name__ == "__main__":
    t00 = time.time(); os.makedirs(OUT, exist_ok=True)
    B, ALLD = M.load_events(); B = B.sort_values(["T", "s"], kind="mergesort").reset_index(drop=True); B["k"] = np.arange(len(B))
    recs = B.to_dict("records")
    log(f"{len(B)} cú sốc qua lọc · dựng lại giá đặt từ nến…")
    with cf.ThreadPoolExecutor(48) as ex:
        P = {p["k"]: p for p in ex.map(M.prep, recs) if p}
    M.kday.cache_clear()
    jobs = {}
    for r in recs:
        p = P.get(r["k"])
        if p and p["need"]:
            jobs.setdefault(r["s"], []).append((r["k"], int(r["T"]), int(r["side"]), r["r15"], p["L"]))
    log(f"cần aggTrades {sum(len(v) for v in jobs.values())} cú sốc / {len(jobs)} mã · {time.time() - t00:.0f}s")
    TR = {}; miss = []
    with cf.ProcessPoolExecutor(int(os.environ.get("R19_PROC", "8"))) as ex:
        for j, (s, out, err) in enumerate(ex.map(per_symbol, sorted(jobs.items(), key=lambda x: -len(x[1])))):
            TR.update(out); miss += [f"{s}: {err}"] if err else []
            if j % 100 == 0:
                log(f"  … {j}/{len(jobs)} mã · {len(TR)} cú sốc · {time.time() - t00:.0f}s")
    sh = {str(r["k"]): dict(s=r["s"], T=int(r["T"]), side=int(r["side"]), r15=r["r15"], grp=bool(r["grp"]), d=r["vnday"]) for r in recs}
    with gzip.open(os.path.join(OUT, "round26.json.gz"), "wt") as f:
        json.dump(dict(sh=sh, tr={str(k): v for k, v in TR.items()}, miss=miss, days=list(ALLD)), f, default=float)
    log(f"xong: {len(TR)} cú sốc có chân · thiếu {len(miss)} mã · {time.time() - t00:.0f}s")
