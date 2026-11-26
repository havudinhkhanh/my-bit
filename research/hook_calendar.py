"""Bắt râu sập theo LỊCH (Jason 26/11/2026: "lệnh nên đánh trong tuần, lệnh nên đánh cuối tuần cũng nên nghiên cứu"):
lệnh theo đúng bộ lọc & luật thoát bot đang chạy (round22: 'cur'), chia theo thứ, trong tuần / cuối tuần, khung giờ – giờ Việt Nam.
Mô hình nến 1 phút thổi phồng mức lời tuyệt đối (xem r23) → chỉ dùng để SO SÁNH giữa các nhóm.
Chạy: python research/hook_calendar.py [research/data/round22.json.gz]"""
import gzip, json, os, sys
import numpy as np, pandas as pd
P = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "round22.json.gz")
E = pd.DataFrame(json.load(gzip.open(P, "rt"))).sort_values(["T", "s"], kind="mergesort").reset_index(drop=True)
E["ts"] = pd.to_datetime(E["T"] * 60, unit="s", utc=True); vn = E.ts + pd.Timedelta(hours=7)
E["vnday"] = vn.dt.strftime("%Y-%m-%d"); E["wd"] = vn.dt.weekday; E["hr"] = vn.dt.hour
SZ, W, FAR = 0.075, 8, ("1.25", "1.5")
F = (E.R >= 300) & (E.z >= 4) & (E.vx >= 8) & (E.prior6 == 0) & (E.r4h > -1000) & ((E.side > 0) | (E.r15 <= 100))
def bps(r, EX="cur"):
    L = [(r.res[D], SZ / 2) for D in FAR if D in r.res and r.res[D]["f"] <= W]
    if r.side > 0 and r.r15 <= -300 and "0.0" in r.res: L.append((r.res["0.0"], 0.02))
    if not L or any(EX not in l for l, _ in L): return np.nan
    return sum(l[EX] * s for l, s in L) / sum(s for _, s in L)
X = E[F].copy(); X["b"] = [bps(r) for r in X.itertuples(index=False)]; X = X.dropna(subset=["b"]); X["yr"] = X.ts.dt.year; X["we"] = X.wd >= 5
rec = X.ts > X.ts.max() - pd.Timedelta(days=90)
print(f"# Bắt râu sập theo lịch – {len(X)} lệnh · {X.ts.min():%d/%m/%Y} → {X.ts.max():%d/%m/%Y} · TB {X.b.mean():+.0f} bps/lệnh (mô hình nến 1 phút)\n")
def tab(key, names):
    print("| Nhóm | Lệnh | TB bps | Thắng | t | 2025 | 2026 | 90 ngày gần nhất |\n|---|---|---|---|---|---|---|---|")
    for k, v in X.groupby(key, observed=True):
        f = lambda m: f"{v[m].b.mean():+.0f}" if m.any() else "—"  # noqa: E731
        print(f"| {names[k] if not isinstance(names, type(None)) else k} | {len(v)} | {v.b.mean():+.0f} | {(v.b > 0).mean() * 100:.0f}% | {v.b.mean() / (v.b.std() / np.sqrt(len(v))):.1f} | {f(v.yr == 2025)} | {f(v.yr == 2026)} | {f(rec.loc[v.index])} |")
print("## Theo thứ (giờ VN)\n"); tab("wd", ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"])
print("\n## Trong tuần / cuối tuần\n"); tab("we", {False: "Trong tuần", True: "Cuối tuần"})
X["hb"] = pd.cut(X.hr, [-1, 5, 11, 17, 23], labels=["0–6h", "6–12h", "12–18h", "18–24h"]); print("\n## Theo khung giờ (giờ VN)\n"); tab("hb", None)
def perm(flag, label):      # kiểm định hoán vị theo NGÀY (lệnh cùng ngày phụ thuộc nhau)
    d = X.assign(fl=flag).groupby("vnday").agg(b=("b", "sum"), n=("b", "size"), fl=("fl", "first")); f = d.fl.values
    stat = lambda m: d.b[m].sum() / d.n[m].sum() - d.b[~m].sum() / d.n[~m].sum()  # noqa: E731
    obs = stat(f); rng = np.random.default_rng(1); p = np.mean([abs(stat(rng.permutation(f))) >= abs(obs) for _ in range(3000)])
    print(f"- {label}: chênh {obs:+.0f} bps/lệnh · p (hoán vị theo ngày) = {p:.3f}")
print("\n## Có ý nghĩa thống kê không\n"); perm(X.we.values, "cuối tuần − trong tuần")
# khung giờ: lệnh cùng ngày khác khung → hoán vị nhãn khung theo (ngày, khung)
g = X.groupby(["vnday", "hb"], observed=True).agg(b=("b", "sum"), n=("b", "size")).reset_index(); m = (g.hb == "12–18h").values
st = lambda q: g.b[q].sum() / g.n[q].sum() - g.b[~q].sum() / g.n[~q].sum()  # noqa: E731
o = st(m); rng = np.random.default_rng(2); print(f"- khung 12–18h − các khung khác: chênh {o:+.0f} bps/lệnh · p (hoán vị theo ngày-khung) = {np.mean([abs(st(rng.permutation(m))) >= abs(o) for _ in range(3000)]):.3f}")
m = (g.hb == "0–6h").values; o = st(m); print(f"- khung 0–6h − các khung khác: chênh {o:+.0f} bps/lệnh · p = {np.mean([abs(st(rng.permutation(m))) >= abs(o) for _ in range(3000)]):.3f}")
