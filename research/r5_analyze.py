"""Phân tích dữ liệu vòng 5 (research_out/round5.json.gz). Tìm quy tắc trên 2025 (mẫu học), kiểm lại trên 2026 (ngoài mẫu).
Chạy: python research/r5_analyze.py <đường dẫn round5.json.gz>"""
import gzip
import json
import sys
import datetime as dt

import numpy as np
import pandas as pd

P = sys.argv[1] if len(sys.argv) > 1 else "research_out/round5.json.gz"
E = json.load(gzip.open(P, "rt"))
rows = []
for e in E:
    r = e.pop("res"); e.update(r); rows.append(e)
d = pd.DataFrame(rows)
d["ts"] = pd.to_datetime(d["T"] * 60, unit="s", utc=True)
d["half"] = d.ts.dt.year.astype(str) + np.where(d.ts.dt.month <= 6, "H1", "H2")
d["is"] = d.ts.dt.year == 2025
d["hour"] = d.ts.dt.hour
print(f"{len(d)} cú sốc · {d.ts.min():%Y-%m-%d} → {d.ts.max():%Y-%m-%d} · theo nửa năm: {d.half.value_counts().sort_index().to_dict()}")
BOT = (d.prior6 == 0) & (d.r4h > -1000)
print(f"Bộ lọc hiện tại giữ {BOT.sum()} ({BOT.mean() * 100:.0f}%)")


def ev(df, a="t1.5|60", b="t2.0|60"):
    """lợi nhuận mỗi cú sốc (bps trên toàn bộ vốn dành cho cú sốc, chia đôi 2 mức) – mức không khớp = 0"""
    return (df[a].fillna(0) + df[b].fillna(0)) / 2


def tr(df, cols):
    """từng lệnh (mỗi mức khớp là 1 lệnh)"""
    return pd.concat([df[c].dropna() for c in cols])


def line(name, df, a="t1.5|60", b="t2.0|60", per=True):
    x = tr(df, [a, b]); e = ev(df, a, b)
    s = f"{name:<46} lệnh {len(x):>6} · TB {x.mean():+7.1f} bps · thắng {(x > 0).mean() * 100:4.1f}% · /cú sốc {e.mean():+6.1f} · tổng {e.sum() / 1e4:+7.1f}×vốn"
    if per:
        g = df.groupby("half").apply(lambda q: tr(q, [a, b]).mean(), include_groups=False)
        s += " | " + " ".join(f"{k}:{v:+.0f}" for k, v in g.items())
    print(s)


B = d[BOT]
print("\n== 1. Chuẩn: bot hiện tại (1,5× & 2×, giữ 60 phút)")
line("Không lọc", d); line("Có lọc (hiện tại)", B)
print("\n== 2. Chiều lệnh (có lọc)")
line("Long – bắt cú sập", B[B.side > 0]); line("Short – bán cú vọt", B[B.side < 0])
print("\n== 3. Độ sâu lệnh chờ (có lọc, giữ 60p, từng mức riêng)")
for D in (1.0, 1.5, 2.0, 2.5, 3.0):
    x = B[f"t{D}|60"]; f = x.notna().mean()
    g = B.groupby("half")[f"t{D}|60"].mean()
    print(f"  {D}×: khớp {f * 100:4.1f}% · TB {x.mean():+6.1f} · thắng {(x > 0).mean() * 100:4.1f}% · /cú sốc {x.fillna(0).mean():+6.1f} | " + " ".join(f"{k}:{v:+.0f}" for k, v in g.items()))
for a, b in ((1.0, 1.5), (1.0, 2.0), (1.5, 2.0), (1.5, 2.5), (2.0, 2.5), (2.0, 3.0), (1.5, 3.0)):
    line(f"  cặp {a}× + {b}×", B, f"t{a}|60", f"t{b}|60")
print("\n== 4. Thời gian giữ (có lọc, 1,5× & 2×)")
for H in (15, 30, 60, 120, 240):
    line(f"  giữ {H} phút", B, f"t1.5|{H}", f"t2.0|{H}")
print("\n== 5. Chốt lời bằng lệnh chờ (có lọc)")
for F in ("0.33", "0.5", "1.0", "p0"):
    for H in (60, 120, 240):
        line(f"  chốt khi hồi {F} – tối đa {H}p", B, f"p1.5|{F}|{H}", f"p2.0|{F}|{H}")
print("\n== 6. Thoát sớm khi đang lỗ (có lọc)")
for a, H in ((15, 60), (15, 120), (30, 60), (30, 120)):
    line(f"  lỗ sau {a}p thì ra, lời giữ tới {H}p", B, f"e1.5|{a}|{H}", f"e2.0|{a}|{H}")
print("\n== 7. Cắt lỗ cứng (ước lượng từ mức lỗ tạm lớn nhất 60p; thoát taker + trượt 20 bps)")
for X in (5, 10, 15, 20, 25, 35):
    tmp = B.copy()
    for D in (1.5, 2.0):
        m = tmp[f"mae{D}"] <= -X * 100
        tmp.loc[m, f"t{D}|60"] = -X * 100 - 2 - 5 - 3 - 20
    line(f"  cắt lỗ {X}%", tmp)


def buckets(col, qs=(0, .2, .4, .6, .8, 1), df=B, a="t1.5|60", b="t2.0|60", edges=None):
    x = df[[col, a, b, "half", "is"]].dropna(subset=[col])
    cut = pd.cut(x[col], edges, include_lowest=True) if edges is not None else pd.qcut(x[col], list(qs), duplicates="drop")
    print(f"\n-- theo {col}")
    for k, q in x.groupby(cut, observed=True):
        t = tr(q, [a, b]); g = q.groupby("half").apply(lambda z: tr(z, [a, b]).mean(), include_groups=False)
        print(f"  {str(k):<22} n {len(t):>5} · TB {t.mean():+6.1f} · thắng {(t > 0).mean() * 100:4.1f}% | " + " ".join(f"{h}:{v:+.0f}" for h, v in g.items()))


print("\n== 8. Đặc trưng (có lọc, 1,5× & 2× giữ 60p) – nhóm theo ngũ phân vị")
for col in ("R", "z", "vx", "wick", "r15", "r4h", "r24", "ext", "vol1d", "q24", "qs", "age", "prior24", "btc1", "btc60", "btc240", "breadth"):
    buckets(col)
buckets("hour", edges=[-0.1, 3, 7, 11, 15, 19, 23])
buckets("f1.5", edges=[0, 1, 2, 4, 8, 15])
B.to_pickle("r5_B.pkl"); d.to_pickle("r5_all.pkl")
