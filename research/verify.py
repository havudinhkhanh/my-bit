"""KIỂM CHỨNG HẰNG TUẦN các kiểu chơi của bot (Jason 26/11/2026): "cột Kiểm chứng hiện 5–6 cột, cột phải là gần nhất; mỗi lần chạy thì ghi lại;
mỗi tuần chạy kiểm chứng 1 tuần; luôn theo tâm thế KHÔNG biết giá sẽ thế nào; bấm vào thì thấy cấu hình, các mã đã chạy".

Mỗi thứ Hai (verify.yml) chạy lại TUẦN VỪA XONG (thứ Hai 00:00 UTC → thứ Hai kế) cho từng kiểu chơi, bằng ĐÚNG luật & tham số chuẩn đang nằm trong mã
tại lúc chạy, trên dữ liệu thật của Binance (data.binance.vision), đã trừ phí + trượt (+ funding khi có). Mọi quyết định vào lệnh chỉ dùng số liệu có
TRƯỚC thời điểm đó (nến đã đóng, vào ở giá mở nến kế). Kết quả ghi thêm 1 cột vào site/verify.json – cột đã ghi thì KHÔNG tính lại (trừ ô còn thiếu dữ liệu).
  🪝 hook  – Bắt râu sập: nến 1 PHÚT, mọi mã (mô hình của research/round22.py, luật 'cur' = luật bot đang chạy)
  🔗 ou · 📉 rsi2 · 💸 fund · 📦 orb – nến 1 GIỜ / 4 GIỜ (hàm của research/quant6a.py, tham số = QP trong worker/quant.js)
  🚀 pump · 🆕 list – nến NGÀY / giờ, giữ 7 / 14 ngày (lệnh ĐÓNG trong tuần)
  ⚡ sec, 〰️ vwap, 🌊 liq – cần sổ lệnh / nến 5 phút + OI: chưa có ở bản này (ô để trống, ghi rõ lý do)
Lệnh được tính vào tuần mà nó ĐÓNG. Lần đầu: VERIFY_WEEKS=6 để chạy bù 6 tuần (đánh dấu bf – chạy bù bằng tham số hiện tại).
Chạy: python research/verify.py"""
import concurrent.futures as cf
import datetime as dt
import json
import os
import subprocess
import sys
import traceback

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
NOW = dt.datetime.now(dt.timezone.utc); TODAY = NOW.date()
NW = int(os.environ.get("VERIFY_WEEKS", "1"))
MON = TODAY - dt.timedelta(days=TODAY.weekday())      # thứ Hai tuần này (UTC) = hết tuần vừa xong
WEEKS = [(MON - dt.timedelta(days=7 * (k + 1)), MON - dt.timedelta(days=7 * k)) for k in range(NW)][::-1]      # cũ → mới
W0 = WEEKS[0][0]
_m = lambda d: f"{d.year:04d}-{d.month:02d}"  # noqa: E731
_back = lambda d, n: (pd.Timestamp(d) - pd.DateOffset(months=n)).date()  # noqa: E731
os.environ.setdefault("RS_LOG", "verify.log"); os.environ.setdefault("RS_NOCACHE", "1")
os.environ["LAB_START"] = _m(_back(W0, 7))      # nến 1 giờ: 7 tháng trước tuần đầu (EMA200 khung 4 giờ, funding 90 ngày, chọn cặp 30 ngày)
os.environ["RS_START"] = _m(W0 - dt.timedelta(days=3))      # nến 1 phút (Bắt râu sập): từ tháng chứa tuần đầu
import events as E  # noqa: E402
import lab as L  # noqa: E402

log = E.log
SITE_JSON = os.path.join(HERE, "..", "site", "verify.json")
HOUR = lambda d: int(dt.datetime(d.year, d.month, d.day, tzinfo=dt.timezone.utc).timestamp() // 3600)  # noqa: E731
QP_FALLBACK = {"ou": {"mode": "kal", "zin": 2.0}, "rsi2": {"tf": "H4", "side": -1, "lvl": 5, "kel": True, "ex": "sma5", "sl": None},
               "fund": {"hold": 72, "sl": None, "abs": True}, "orb": {"flt": "bb30", "tp": 1.0}}


def bot_params():
    """tham số chuẩn đang nằm trong mã bot (worker/quant.js, worker/swing.js) – đọc bằng node; không được thì dùng bản chép ở trên"""
    try:
        js = "Promise.all([import('./worker/quant.js'), import('./worker/swing.js')]).then(([q, s]) => console.log(JSON.stringify({ QP: q.QP, SW: s.SW || null })))"
        o = subprocess.run(["node", "--input-type=module", "-e", js], cwd=os.path.join(HERE, ".."), capture_output=True, text=True, timeout=60)
        j = json.loads(o.stdout.strip().splitlines()[-1]); return j["QP"], j.get("SW") or {}, "worker/quant.js"
    except Exception as e:  # noqa: BLE001
        log(f"không đọc được tham số bằng node ({e}) → dùng bản chép trong verify.py"); return QP_FALLBACK, {}, "bản chép trong verify.py"


def summarize(rows, unit, tf, cfg, note=""):
    """rows: [(mã, kết quả ròng, giờ đóng (UTC, số giờ từ 1970))] của 1 tuần → ô kiểm chứng"""
    v = np.array([r[1] for r in rows], float); by = {}
    for s, x, _ in rows:
        a = by.setdefault(s, [0, 0.0]); a[0] += 1; a[1] += float(x)
    top = sorted(by.items(), key=lambda kv: -abs(kv[1][1]))[:14]
    return dict(n=len(v), mean=round(float(v.mean()), 2) if len(v) else None, win=round(float((v > 0).mean()) * 100) if len(v) else None, sum=round(float(v.sum()), 1) if len(v) else 0.0,
                best=round(float(v.max()), 1) if len(v) else None, worst=round(float(v.min()), 1) if len(v) else None, u=unit, tf=tf, cfg=cfg, nsym=len(by),
                syms=[[s.replace("USDT", ""), a[0], round(a[1], 1)] for s, a in top], note=note)


def in_week(h, w):
    return HOUR(w[0]) <= h < HOUR(w[1])


# ---------------------------------------------------------------- nến 1 giờ của mọi mã (bộ tải của phòng thử nghiệm) → ma trận giờ × mã
def hourly():
    syms = [s for s in E.list_symbols() if s not in L.SKIP]; parts = []
    for m in L.month_list():
        p = L.load_month(m, syms, None); parts.append(p); log(f"  {m}: {len(p[0])} mã{'' if p[4] else ' (tệp ngày, mọi mã)'}")
    allS = sorted({s for p in parts for s in p[0]}); ix = {s: j for j, s in enumerate(allS)}; H0 = parts[0][3]; NH = sum(p[1]["o"].shape[0] for p in parts)
    A = {k: np.full((NH, len(allS)), np.nan, np.float32) for k in "ohlcq"}; FD = np.full((NH // 24, len(allS)), np.nan, np.float32); mh = []
    for ss, a, fd, h0, full in parts:
        o = h0 - H0; jj = [ix[s] for s in ss]; n = a["o"].shape[0]
        for k in "ohlcq": A[k][o:o + n, jj] = a[k]
        FD[o // 24:o // 24 + fd.shape[0], jj] = fd; mh.append((o, o + n))
    last = int(np.max(np.nonzero(np.isfinite(A["c"][:, ix["BTCUSDT"]]))[0])) + 1; last -= last % 24      # hết ngày cuối có đủ dữ liệu
    return allS, ix, H0, last, A, FD, mh      # A dài tới hết tháng đang chạy (phần chưa có = NaN); last = số giờ đã có dữ liệu


# ---------------------------------------------------------------- 🚀 pump · 🆕 list (giữ nhiều ngày, không cắt lỗ, giá ×2 = mất trắng phần lệnh)
def swing(allS, H0, NH, A, FD, SW):
    P = {"chg": 100, "vol": 10, "hold": 168, **(SW.get("pump") or {})}; Lp = {"hold": 336, **(SW.get("list") or {})}
    FEE = 0.0015      # mỗi chiều: taker 5 bps + trượt 10 bps (coin nhỏ, đang biến động mạnh)
    nd = NH // 24; r = lambda x: x[:nd * 24].reshape(nd, 24, -1)  # noqa: E731
    O = A["o"]; Hh = A["h"]; C = A["c"]; Cd = r(C)[:, 23]; Qd = np.nansum(r(A["q"]), 1); out = {"pump": [], "list": []}
    def trade(j, h_in, hold):
        h_out = h_in + hold
        if h_out >= NH or not np.isfinite(O[h_in, j]): return None
        e = O[h_in, j]; x = O[h_out, j]
        if not np.isfinite(x): return None
        liq = np.nanmax(Hh[h_in:h_out, j]) >= 2 * e
        fund = float(np.nansum(FD[h_in // 24:h_out // 24, j]))      # Short nhận funding dương
        return (-100.0 if liq else (-(x / e - 1) - 2 * FEE + fund) * 100), h_out
    for d in range(2, nd):
        chg = Cd[d - 1] / Cd[d - 2] - 1
        for j in np.nonzero((chg >= P["chg"] / 100) & (Qd[d - 1] >= P["vol"] * 1e6))[0]:
            t = trade(j, d * 24, int(P["hold"]))
            if t: out["pump"].append((allS[j], t[0], H0 + t[1]))
    first = np.argmax(np.isfinite(C), 0)
    for j in np.nonzero((first > 24 * 20) & np.isfinite(C).any(0))[0]:      # nến đầu tiên xuất hiện sau đầu dữ liệu ≥ 20 ngày = coin mới niêm yết
        t = trade(j, int(first[j]) + 24, int(Lp["hold"]))
        if t: out["list"].append((allS[j], t[0], H0 + t[1]))
    cfg = {"pump": {"Điều kiện": f"00:00 UTC, tăng ≥ {P['chg']}%/24h, khối lượng 24h ≥ {P['vol']} triệu USD", "Lệnh": "Short thị trường x1, không cắt lỗ", "Giữ": f"{int(P['hold']) // 24} ngày",
                    "Phí + trượt": "0,15% mỗi chiều", "Giá ×2": "mất trắng phần lệnh (−100%)", "Số lệnh cùng lúc": "không giới hạn (bot: có giới hạn)"},
           "list": {"Điều kiện": "24 giờ sau nến đầu tiên của coin mới niêm yết futures", "Lệnh": "Short thị trường x1, không cắt lỗ", "Giữ": f"{int(Lp['hold']) // 24} ngày",
                    "Phí + trượt": "0,15% mỗi chiều", "Giá ×2": "mất trắng phần lệnh (−100%)", "Số lệnh cùng lúc": "không giới hạn (bot: có giới hạn)"}}
    return out, cfg


# ---------------------------------------------------------------- 🔗 ou · 📉 rsi2 · 💸 fund · 📦 orb (hàm của quant6a, tham số của bot)
def quant(allS, ix, H0, NH, A, mh, QP):
    import quant6a as Q
    months = L.month_list(); Q.MONTHS = months; n = A["o"].shape[0]      # tới hết tháng đang chạy (chọn cặp theo tháng cần đủ khung tháng); phần chưa có dữ liệu là NaN
    assert Q.month_hours(months[0])[0] == H0, "lệch mốc giờ đầu"
    MV = {m: np.nansum(A["q"][a:min(b, NH)], 0) for m, (a, b) in zip(months, mh)}
    UNI = {}
    for k, m in enumerate(months):
        if k == 0 or mh[k][0] >= NH: continue
        v = MV[months[k - 1]]; UNI[m] = [allS[j] for j in np.argsort(-v)[:Q.TOPN] if v[j] > 0]
    keep = sorted({s for u in UNI.values() for s in u} | {"BTCUSDT"}); S = {s: i for i, s in enumerate(keep)}; jj = [ix[s] for s in keep]
    M = {f: A[k][:n, jj].copy() for f, k in (("o", "o"), ("h", "h"), ("l", "l"), ("c", "c"), ("qv", "q"))}
    RK = {m: {s: r for r, s in enumerate(u)} for m, u in UNI.items()}
    F = Q.load_funding(keep, H0, n); fund_h = int(np.max(np.nonzero(np.abs(F).sum(1) > 0)[0])) if (np.abs(F) > 0).any() else -1
    log(f"định lượng: {n} giờ × {len(keep)} mã · funding tới giờ {fund_h} / {n}")
    sl = lambda v: "None" if v in (None, 0, False) else v  # noqa: E731
    VAR = {"ou": f"{QP['ou']['mode']}|z{float(QP['ou']['zin'])}", "rsi2": f"{QP['rsi2']['tf']}|{'L' if QP['rsi2']['side'] > 0 else 'S'}|r{int(QP['rsi2']['lvl'])}|{'kel' if QP['rsi2']['kel'] else 'nokel'}|{QP['rsi2']['ex']}|sl{sl(QP['rsi2'].get('sl'))}",
           "fund": f"h{int(QP['fund']['hold'])}|sl{sl(QP['fund'].get('sl'))}|{'abs' if QP['fund'].get('abs') else 'fall'}", "orb": f"{QP['orb']['flt']}|tp{float(QP['orb']['tp'])}"}
    TF = {"ou": "nến 1 giờ", "rsi2": "nến 4 giờ" if QP["rsi2"]["tf"] == "H4" else "nến 1 giờ", "fund": "nến 1 giờ + funding", "orb": "nến ngày + 1 giờ"}
    out = {}
    for k, fn in (("ou", Q.p1_pairs), ("rsi2", Q.p2_rsi2), ("fund", Q.p3_funding), ("orb", Q.p4_orb)):
        try:
            rows = fn(H0, n, keep, S, M, UNI, RK, F); seen = sorted({r["p"] for r in rows})
            mine = [r for r in rows if r["p"] == VAR[k]]
            if not mine and VAR[k] not in seen: log(f"  {k}: không thấy biến thể {VAR[k]} – có: {seen[:12]}")
            mine = [r for r in mine if np.isfinite(r["g"]) and int(r["t2"]) <= NH]      # chỉ lệnh ĐÃ đóng bằng giá có thật
            out[k] = dict(rows=[(r["s"], r["g"] - r["c"] + r["f"], H0 + int(r["t2"])) for r in mine], var=VAR[k], tf=TF[k], fund_h=H0 + fund_h, uni=len(keep))
            log(f"  {k}: {len(mine)} lệnh của biến thể {VAR[k]} ({len(rows)} lệnh mọi biến thể)")
        except Exception as e:  # noqa: BLE001
            log(f"LỖI định lượng {k}: {e}\n{traceback.format_exc()}")
    return out


# ---------------------------------------------------------------- 🪝 Bắt râu sập (mô hình nến 1 phút của round22, luật 'cur')
def hook():
    import round22 as R22
    R22.btc5(); syms = E.list_symbols(); evs = []
    with cf.ThreadPoolExecutor(24) as ex:
        for k, (a, _b) in enumerate(ex.map(R22.process_both, syms)):
            evs += a
            if k % 150 == 0: log(f"  … 1 phút {k}/{len(syms)} mã, {len(evs)} cú sốc")
    SZ, W, FAR = 0.075, 8, ("1.25", "1.5"); rows = []
    for r in sorted(evs, key=lambda r: (r["T"], r["s"])):
        if not (r["R"] >= 300 and r["z"] >= 4 and (r["vx"] or 0) >= 8 and r["prior6"] == 0 and r["r4h"] > -1000 and (r["side"] > 0 or r["r15"] <= 100)): continue
        Lg = [(r["res"][D], SZ / 2) for D in FAR if D in r["res"] and r["res"][D]["f"] <= W]
        if r["side"] > 0 and r["r15"] <= -300 and "0.0" in r["res"]: Lg.append((r["res"]["0.0"], 0.02))
        if not Lg or any("cur" not in l for l, _ in Lg): continue
        rows.append((r["s"], sum(l["cur"] * s for l, s in Lg) / sum(s for _, s in Lg), r["T"] // 60 + 1, sum(l["cur"] / 1e4 * s for l, s in Lg) * 100))
    cfg = {"Cú sốc": "nến 1 phút ≥ 3%, mạnh ≥ 4 lần dao động 60 phút, khối lượng ≥ 8× trung vị, khối lượng 24h ≥ 2 triệu USD", "Bỏ qua": "coin có cú sốc khác trong 6 giờ · 4 giờ trước đã chạy ≥ 10% cùng chiều · Short khi 15 phút trước tăng > 1%",
           "Vào lệnh": "lệnh chờ ở 1,25× và 1,5× cú sốc, chờ ≤ 8 phút (Long: vào ngay thêm 2% vốn khi 15 phút trước đã giảm ≥ 3%)", "Thoát": "đuổi 150/100 bps · từ phút 40 còn lỗ ra ở đỉnh nhịp nảy ≥ 3% · hết 60 phút",
           "Cỡ lệnh": "7,5% vốn mỗi cú sốc", "Mô hình": "nến 1 phút – thường ĐẸP hơn khớp lệnh thật (xem vòng 23)"}
    return rows, cfg


def main():
    log(f"kiểm chứng {NW} tuần: {WEEKS[0][0]} → {WEEKS[-1][1]} (UTC) · nến 1 giờ từ {os.environ['LAB_START']} · nến 1 phút từ {os.environ['RS_START']}")
    try: prev = json.load(open(SITE_JSON))
    except Exception: prev = {}  # noqa: BLE001
    runs = {r["wk"]: r for r in prev.get("runs", [])}
    QP, SW, src = bot_params(); res = {}      # res[k] = (rows, unit, tf, cfg, note, data_end_hour)
    try:
        allS, ix, H0, NH, A, FD, mh = hourly(); log(f"nến 1 giờ: {NH} giờ × {len(allS)} mã, tới {pd.Timestamp((H0 + NH) * 3600, unit='s')}")
        try:
            o, cfg = swing(allS, H0, NH, A, FD, SW)
            for k in ("pump", "list"): res[k] = (o[k], "%", "nến giờ, giữ nhiều ngày", cfg[k], "funding của tháng đang chạy chưa có (Binance công bố theo tháng) – chưa cộng", H0 + NH)
        except Exception as e: log(f"LỖI pump/list: {e}\n{traceback.format_exc()}")  # noqa: BLE001
        try:
            for k, v in quant(allS, ix, H0, NH, A, mh, QP).items():
                cfg = {"Tham số (chuẩn trong mã bot)": ", ".join(f"{a} = {b}" for a, b in QP[k].items()), "Biến thể kiểm chứng": v["var"], "Vũ trụ": "100 coin khối lượng lớn nhất tháng trước", "Phí + trượt": "14–19 bps mỗi vòng (cặp coin: 2 chân)", "Nguồn tham số": src}
                res[k] = (v["rows"], "bps", v["tf"], cfg, "", v["fund_h"] if k == "fund" else H0 + NH)
        except Exception as e: log(f"LỖI định lượng: {e}\n{traceback.format_exc()}")  # noqa: BLE001
        del A
    except Exception as e: log(f"LỖI nến 1 giờ: {e}\n{traceback.format_exc()}")  # noqa: BLE001
    try:
        rows, cfg = hook(); res["hook"] = ([(s, b, h) for s, b, h, _ in rows], "bps", "nến 1 phút", cfg, "", HOUR(TODAY)); hk_pct = {(s, h): p for s, _, h, p in rows}
    except Exception as e: log(f"LỖI Bắt râu sập: {e}\n{traceback.format_exc()}"); hk_pct = {}  # noqa: BLE001
    NA = {"sec": "Lướt giây đọc sổ lệnh từng giây – không dựng lại được từ nến; xem kết quả sàn thử.", "vwap": "Cần nến 5 phút – sẽ thêm ở bản sau.", "liq": "Cần nến 5 phút + Open Interest – sẽ thêm ở bản sau."}
    for w in WEEKS:
        wk = str(w[0]); run = runs.get(wk) or dict(wk=wk, to=str(w[1] - dt.timedelta(days=1)), at=NOW.strftime("%Y-%m-%dT%H:%M:%SZ"), bf=(TODAY - w[1]).days >= 7, m={})
        for k, (rows, unit, tf, cfg, note, end) in res.items():
            old = run["m"].get(k)
            if old and not old.get("pend"): continue      # ô đã ghi → không tính lại
            mine = [r for r in rows if in_week(r[2], w)]; cell = summarize(mine, unit, tf, cfg, note)
            if end < HOUR(w[1]): cell["pend"] = 1; cell["note"] = (note + " · " if note else "") + "dữ liệu chưa đủ hết tuần – ô này sẽ được tính lại"
            if k == "hook": cell["acct"] = round(sum(hk_pct.get((s, h), 0) for s, _, h in mine), 2)
            run["m"][k] = cell
        for k, why in NA.items(): run["m"].setdefault(k, dict(n=None, na=why))
        run["pend"] = any(c.get("pend") for c in run["m"].values()); runs[wk] = run
        log(f"tuần {wk}: " + " · ".join(f"{k} {c['n']} lệnh {c['mean']}{c['u']}" for k, c in run["m"].items() if c.get("n")))
    out = dict(v=1, at=NOW.strftime("%Y-%m-%dT%H:%M:%SZ"), runs=[runs[k] for k in sorted(runs)][-26:])
    os.makedirs(E.OUT, exist_ok=True); json.dump(out, open(os.path.join(E.OUT, "verify.json"), "w"), ensure_ascii=False, indent=1, default=float)
    if any(r["m"] for r in out["runs"]) and res: json.dump(out, open(SITE_JSON, "w"), ensure_ascii=False, separators=(",", ":"), default=float)
    log("xong")


if __name__ == "__main__":
    main()
