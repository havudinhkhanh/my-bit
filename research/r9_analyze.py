"""Phân tích vòng 9 (research_out/round9.json.gz): lệnh Bắt râu sập đang lỗ – giữ đủ 60 phút (như bot), cắt lỗ sớm ở -X, hay cắt rồi ĐẢO CHIỀU?
Chi phí (bps, giống vòng 6–8): vào chờ 2 (maker) / vào ngay 15 (taker + trượt); thoát hết giờ 18; thoát cắt lỗ 28 (trượt lúc giá chạy mạnh);
lệnh đảo chiều vào bằng lệnh thị trường 15. Nến chạm mức cắt nhưng đã mở vượt mức → thoát ở giá mở (trượt qua mức).
Bảng theo 2 nhóm: TẤT CẢ lệnh khớp (sàn thử: 3 kiểu) và cách tài khoản thật vốn nhỏ đang vào (mua ngay nếu đủ điều kiện, không thì chờ 1,5×).
Chạy: python research/r9_analyze.py <round9.json.gz>"""
import gzip
import json
import sys

import numpy as np
import pandas as pd

P = sys.argv[1] if len(sys.argv) > 1 else "research_out/round9.json.gz"
ev = json.load(gzip.open(P, "rt"))
IN_M, IN_T, OUT_T, OUT_S, CAT, H = 2.0, 15.0, 18.0, 28.0, 3500, 60
T = np.array([e["T"] for e in ev]); DAYS = (T.max() - T.min()) / 1440
rows = []
for e in ev:
    for D, x in e["p"].items():
        rows.append(dict(T=e["T"], s=e["s"], side=e["side"], R=e["R"], D=D, pol=(D == "0.0") or (D == "1.5" and "0.0" not in e["p"]),
                         o=np.array(x["o"]), b=np.array(x["b"]), w=np.array(x["w"])))
X = pd.DataFrame(rows)
X["ts"] = pd.to_datetime(X["T"] * 60, unit="s", utc=True)
X["half"] = X.ts.dt.year.astype(str) + np.where(X.ts.dt.month <= 6, "H1", "H2")
print(f"{len(ev)} cú sốc qua bộ lọc · {len(X)} lệnh khớp · {DAYS:.0f} ngày · tài khoản thật vốn nhỏ: {int(X.pol.sum())} lệnh ({X.pol.sum() / DAYS:.2f}/ngày)")


def rev_pnl(entry, y):
    """lệnh ngược chiều mở ở mức entry (bps theo chiều cũ), giá sau đó ở y (bps theo chiều cũ) → bps theo chiều lệnh ngược"""
    return (entry - y) / (1 + entry / 1e4)


def sim(r, X_, mode, rv=None):
    """X_: mức cắt (bps lỗ, None = như bot). mode: 'hold' | 'stop' | 'rev'. rv: (giữ phút, cắt lỗ lệnh ngược bps, chốt lời bps hoặc None)"""
    o, b, w = r.o, r.b, r.w; cin = IN_T if r.D == "0.0" else IN_M
    for k in range(H):
        if w[k] <= -CAT:
            return -CAT - cin - OUT_S, "cat"
        if X_ is not None and w[k] <= -X_:
            ex = min(-X_, o[k])                 # mở đã vượt mức cắt → thoát ở giá mở
            base = ex - cin - OUT_S
            if mode == "stop":
                return base, "stop"
            hold, st, tp = rv
            # lệnh ngược mở ngay ở ex (lệnh thị trường); từ phút k+1 tới k+hold
            for j in range(k + 1, min(len(o), k + 1 + hold)):
                adv_r, fav_r = rev_pnl(ex, b[j]), rev_pnl(ex, w[j])       # chiều cũ tốt nhất = lệnh ngược xấu nhất
                if st is not None and adv_r <= -st:
                    return base + min(-st, rev_pnl(ex, o[j])) - IN_T - OUT_S, "rev-stop"
                if tp is not None and fav_r >= tp:
                    return base + tp - IN_T - 5.0, "rev-tp"
            j = min(len(o) - 1, k + hold)
            return base + rev_pnl(ex, o[j]) - IN_T - OUT_T, "rev-time"
    return o[H] - cin - OUT_T, "time"


def run(name, sel, X_, mode, rv=None, SZ=0.025):
    S = X[sel].sort_values("T")
    res = [sim(r, X_, mode, rv) for r in S.itertuples()]
    v = np.array([a for a, _ in res]); why = pd.Series([b for _, b in res]).value_counts()
    eq = np.cumprod(1 + v / 1e4 * SZ); dd = (1 - eq / np.maximum.accumulate(eq)).max() * 100
    per = (pd.Series(1 + v / 1e4 * SZ).groupby(S.half.values).prod() - 1).mul(100).round(0).to_dict()
    return dict(cfg=name, n=len(v), mean=v.mean(), win=(v > 0).mean() * 100, day=v.sum() / DAYS, tot=(eq[-1] - 1) * 100, dd=dd,
                cut=int(why.get("stop", 0) + sum(why.get(k, 0) for k in ("rev-stop", "rev-tp", "rev-time"))), per=per)


fmt = lambda r: (f"{r['cfg']:<46} {r['n']:>5} lệnh · TB {r['mean']:+7.1f} bps · thắng {r['win']:4.1f}% · {r['day']:+7.1f} bps/ngày · cắt {r['cut']:>4} · "  # noqa: E731
                 f"TỔNG {r['tot']:+7.1f}% · sụt {r['dd']:5.1f}% · " + " ".join(f"{k}:{v:+.0f}%" for k, v in r["per"].items()))
XS = (300, 500, 800, 1000, 1200, 1500, 2000)
for gname, sel in (("TÀI KHOẢN THẬT VỐN NHỎ (mua ngay / chờ 1,5×)", X.pol), ("SÀN THỬ – mọi lệnh khớp", X.pol | ~X.pol)):
    print(f"\n==================== {gname}")
    print(fmt(run("Như bot: giữ 60 phút, cắt thảm hoạ 35%", sel, None, "hold")))
    print("-- cắt lỗ sớm")
    for x in XS:
        print(fmt(run(f"cắt khi lỗ {x / 100:.0f}%", sel, x, "stop")))
    print("-- cắt rồi ĐẢO CHIỀU (giữ lệnh ngược tới hết 60 phút gốc / 30 phút; cắt lỗ lệnh ngược; chốt lời)")
    for x in (500, 800, 1000, 1500):
        for hold, st, tp in ((60, None, None), (30, None, None), (60, x / 2, None), (60, None, x / 2), (30, 300, 600)):
            print(fmt(run(f"lỗ {x / 100:.0f}% → ngược, giữ {hold}p" + (f", cắt {st / 100:.1f}%" if st else "") + (f", chốt {tp / 100:.1f}%" if tp else ""), sel, x, "rev", (hold, st, tp))))
    print("-- theo độ lớn cú sốc (cắt khi lỗ 10% so với giữ)")
    for lo, hi in ((300, 350), (350, 450), (450, 700), (700, 99999)):
        s2 = sel & (X.R >= lo) & (X.R < hi)
        if s2.sum() < 30:
            continue
        a, b = run(f"  sốc {lo}-{hi} bps: giữ", s2, None, "hold"), run(f"  sốc {lo}-{hi} bps: cắt 10%", s2, 1000, "stop")
        print(fmt(a)); print(fmt(b))
    print("-- theo kiểu vào (giữ / cắt 10%)")
    for D in ("0.0", "1.25", "1.5"):
        s2 = sel & (X.D == D)
        if s2.sum() < 30:
            continue
        print(fmt(run(f"  {'mua ngay' if D == '0.0' else 'chờ ' + D + '×'}: giữ", s2, None, "hold"))); print(fmt(run(f"  {'mua ngay' if D == '0.0' else 'chờ ' + D + '×'}: cắt 10%", s2, 1000, "stop")))
# lệnh đã lỗ ≥ X% trong 60 phút: sau đó hồi lại bao nhiêu?
print("\n==================== lệnh từng lỗ ≥ X%: kết quả nếu GIỮ tới 60 phút (tài khoản thật)")
S = X[X.pol]
for x in (500, 1000, 1500):
    m = S.apply(lambda r: (r.w[:H] <= -x).any(), axis=1); E2 = S[m]
    fin = E2.apply(lambda r: r.o[H], axis=1)
    print(f"  từng lỗ ≥ {x / 100:.0f}%: {m.sum()} lệnh ({m.mean() * 100:.1f}%) · hết 60 phút: TB {fin.mean():+.0f} bps · hồi về có lời {(fin > 0).mean() * 100:.0f}% · vẫn lỗ > {x / 100:.0f}%: {(fin < -x).mean() * 100:.0f}%")
